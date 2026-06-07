import os
import json
import logging
from collections.abc import Generator
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from pydantic import BaseModel, Field, field_validator


OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://host.docker.internal:1234/v1").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "local-key")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "yandexgpt-5-lite/latest")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
YANDEX_CLOUD_FOLDER = os.getenv("YANDEX_CLOUD_FOLDER", "")

logger = logging.getLogger("uvicorn.error")

ResponseFormat = Literal["free", "json", "md-list", "md-table"]

RESPONSE_FORMAT_PROMPTS: dict[ResponseFormat, str] = {
    "free": "",
    "json": "Ответь валидным JSON. Не используй Markdown-обертку и поясняющий текст вне JSON.",
    "md-list": "Ответь только в Markdown заголовками и списками.",
    "md-table": "Ответь только формате Markdown-таблицы.",
}

AVAILABLE_MODELS = [
    {"id": "yandexgpt-5-lite/latest", "label": "YandexGPT 5 Lite"},
    {"id": "gpt-oss-20b/latest", "label": "GPT OSS 20B"},
    {"id": "deepseek-v4-flash/latest", "label": "DeepSeek V4 Flash"},
]
AVAILABLE_MODEL_IDS = {model["id"] for model in AVAILABLE_MODELS}
DEFAULT_MODEL = OPENAI_MODEL if OPENAI_MODEL in AVAILABLE_MODEL_IDS else AVAILABLE_MODELS[0]["id"]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None
    response_format: ResponseFormat = "free"
    max_output_tokens: int | None = Field(default=None, ge=1, le=32000)
    temperature: float | None = Field(default=None, ge=0, le=2)
    stop: list[str] | None = Field(default=None, max_length=4)

    @field_validator("stop")
    @classmethod
    def validate_stop(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        stop_sequences = [sequence for sequence in value if sequence]
        return stop_sequences or None


class ChatResponse(BaseModel):
    message: ChatMessage


class AiModel(BaseModel):
    id: str
    label: str


class ModelsResponse(BaseModel):
    models: list[AiModel]
    default_model: str


client_options = {
    "api_key": OPENAI_API_KEY,
    "base_url": OPENAI_BASE_URL,
    "timeout": 60,
}
if OPENAI_PROJECT:
    client_options["project"] = OPENAI_PROJECT

client = OpenAI(**client_options)

app = FastAPI(title="Simple AI Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    return ModelsResponse(
        models=[AiModel(**model) for model in AVAILABLE_MODELS],
        default_model=DEFAULT_MODEL,
    )


def format_messages(messages: list[ChatMessage]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in messages)


def apply_response_format_prompt(input_text: str, response_format: ResponseFormat) -> str:
    prompt = RESPONSE_FORMAT_PROMPTS[response_format]
    if not prompt:
        return input_text

    return f"{prompt}\n\nЗапрос пользователя:\n{input_text}"


def resolve_model(model: str | None) -> str:
    selected_model = model or DEFAULT_MODEL
    if selected_model not in AVAILABLE_MODEL_IDS:
        raise HTTPException(status_code=400, detail="Unknown AI model")

    if not YANDEX_CLOUD_FOLDER:
        raise HTTPException(status_code=500, detail="YANDEX_CLOUD_FOLDER is not configured")

    return f"gpt://{YANDEX_CLOUD_FOLDER}/{selected_model}"


def build_request_body(payload: ChatRequest) -> dict[str, object]:
    input_text = apply_response_format_prompt(format_messages(payload.messages), payload.response_format)
    request_body: dict[str, object] = {
        "model": resolve_model(payload.model),
        "input": input_text,
    }

    if payload.max_output_tokens is not None:
        request_body["max_output_tokens"] = payload.max_output_tokens

    if payload.temperature is not None:
        request_body["temperature"] = payload.temperature

    return request_body


def log_frontend_payload(payload: ChatRequest) -> None:
    logger.info("Frontend chat payload: %s", json.dumps(payload.model_dump(), ensure_ascii=False))


def sse_event(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def apply_stop_sequences(content: str, stop_sequences: list[str] | None) -> str:
    if not stop_sequences:
        return content

    stop_indexes = [content.find(sequence) for sequence in stop_sequences]
    matching_indexes = [index for index in stop_indexes if index >= 0]
    if not matching_indexes:
        return content

    return content[: min(matching_indexes)]


def approximate_token_limit(max_output_tokens: int | None) -> int | None:
    if max_output_tokens is None:
        return None

    # Safety fallback for providers that ignore max_output_tokens; exact tokenization is model-specific.
    return max_output_tokens * 4


def apply_output_limit(content: str, max_output_tokens: int | None) -> str:
    limit = approximate_token_limit(max_output_tokens)
    if limit is None:
        return content

    return content[:limit]


def stream_text_with_stop(delta: str, pending: str, stop_sequences: list[str] | None) -> tuple[str, str, bool]:
    pending += delta
    if not stop_sequences:
        return pending, "", False

    stop_indexes = [pending.find(sequence) for sequence in stop_sequences]
    matching_indexes = [index for index in stop_indexes if index >= 0]
    if matching_indexes:
        stop_index = min(matching_indexes)
        return pending[:stop_index], "", True

    max_stop_length = max(len(sequence) for sequence in stop_sequences)
    keep_length = max_stop_length - 1
    if keep_length <= 0 or len(pending) <= keep_length:
        return "", pending, False

    return pending[:-keep_length], pending[-keep_length:], False


def trim_stream_text(text: str, emitted_length: int, max_output_tokens: int | None) -> tuple[str, int, bool]:
    limit = approximate_token_limit(max_output_tokens)
    if limit is None:
        return text, emitted_length + len(text), False

    remaining = limit - emitted_length
    if remaining <= 0:
        return "", emitted_length, True

    trimmed_text = text[:remaining]
    next_emitted_length = emitted_length + len(trimmed_text)
    return trimmed_text, next_emitted_length, next_emitted_length >= limit


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    log_frontend_payload(payload)
    request_body = build_request_body(payload)

    try:
        response = client.responses.create(**request_body)
    except APIStatusError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except (APIConnectionError, APITimeoutError) as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM error: {exc}") from exc

    content = apply_output_limit(apply_stop_sequences(response.output_text, payload.stop), payload.max_output_tokens)
    if not content:
        raise HTTPException(status_code=502, detail="LLM returned empty response")

    return ChatResponse(message=ChatMessage(role="assistant", content=content))


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest) -> StreamingResponse:
    log_frontend_payload(payload)

    def stream_events() -> Generator[str, None, None]:
        request_body = build_request_body(payload)
        pending = ""
        emitted_length = 0

        try:
            with client.responses.create(**request_body, stream=True) as stream:
                for event in stream:
                    if event.type == "response.output_text.delta":
                        text, pending, should_stop = stream_text_with_stop(event.delta, pending, payload.stop)
                        if text:
                            text, emitted_length, should_limit = trim_stream_text(text, emitted_length, payload.max_output_tokens)
                            if text:
                                yield sse_event("delta", {"text": text})
                            if should_limit:
                                yield sse_event("done", {})
                                break
                        if should_stop:
                            yield sse_event("done", {})
                            break
                    elif event.type == "response.completed":
                        if pending:
                            pending, emitted_length, should_limit = trim_stream_text(pending, emitted_length, payload.max_output_tokens)
                            if pending:
                                yield sse_event("delta", {"text": pending})
                            if should_limit:
                                yield sse_event("done", {})
                                break
                        yield sse_event("done", {})
                    elif event.type == "response.error":
                        yield sse_event("error", {"message": event.error.message})
        except APIStatusError as exc:
            yield sse_event("error", {"message": exc.message, "status": exc.status_code})
        except (APIConnectionError, APITimeoutError) as exc:
            yield sse_event("error", {"message": f"LLM request failed: {exc}"})
        except Exception as exc:
            yield sse_event("error", {"message": f"Unexpected LLM error: {exc}"})

    return StreamingResponse(stream_events(), media_type="text/event-stream")
