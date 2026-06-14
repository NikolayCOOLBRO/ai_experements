import math
import os
from collections.abc import Generator
from typing import Literal

from fastapi import HTTPException
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from schemas import Agent, ChatMessage


StreamChunk = tuple[Literal["delta", "done", "error"], dict[str, object]]


OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://host.docker.internal:1234/v1").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "local-key")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "yandexgpt-5-lite/latest")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
YANDEX_CLOUD_FOLDER = os.getenv("YANDEX_CLOUD_FOLDER", "")

AVAILABLE_MODELS = [
    {
        "id": "yandexgpt-5-lite/latest",
        "label": "YandexGPT 5 Lite",
        "max_tokens": 32768,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
    {
        "id": "gpt-oss-20b/latest",
        "label": "GPT OSS 20B",
        "max_tokens": 131072,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
    {
        "id": "deepseek-v4-flash/latest",
        "label": "DeepSeek V4 Flash",
        "max_tokens": 393216,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
]
AVAILABLE_MODEL_IDS = {model["id"] for model in AVAILABLE_MODELS}
DEFAULT_MODEL = OPENAI_MODEL if OPENAI_MODEL in AVAILABLE_MODEL_IDS else AVAILABLE_MODELS[0]["id"]

client_options = {
    "api_key": OPENAI_API_KEY,
    "base_url": OPENAI_BASE_URL,
    "timeout": 60,
}
if OPENAI_PROJECT:
    client_options["project"] = OPENAI_PROJECT

client = OpenAI(**client_options)


def resolve_model(model: str) -> str:
    if model not in AVAILABLE_MODEL_IDS:
        raise HTTPException(status_code=400, detail="Unknown AI model")

    if not YANDEX_CLOUD_FOLDER:
        raise HTTPException(status_code=500, detail="YANDEX_CLOUD_FOLDER is not configured")

    return f"gpt://{YANDEX_CLOUD_FOLDER}/{model}"


def sse_event(event: str, data: object) -> str:
    import json

    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def limited_memory(agent: Agent, memory: list[ChatMessage]) -> list[ChatMessage]:
    context_window = agent.parameters.context_window
    if context_window is None:
        return memory
    return memory[-context_window:]


def build_agent_input(agent: Agent, memory: list[ChatMessage]) -> str:
    history = "\n".join(f"{message.role}: {message.content}" for message in limited_memory(agent, memory))
    return f"""Ты агент: {agent.name}

Контекст агента:
{agent.context}

Планирование:
{agent.planning}

Инструкции:
- Используй контекст агента как назначение и границы ответственности.
- Используй планирование как внутренний порядок работы.
- Не показывай внутренние шаги, если пользователь явно не просит.
- Отвечай на русском языке, если пользователь не попросил другой язык.

Диалог:
{history}"""


def estimate_tokens(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return max(1, math.ceil(len(stripped) / 4))


def usage_from_response(response: object) -> dict[str, object] | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None

    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    if input_tokens is None and output_tokens is None:
        return None

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated": False,
    }


def build_request_body(agent: Agent, memory: list[ChatMessage]) -> dict[str, object]:
    parameters = agent.parameters
    request_body: dict[str, object] = {
        "model": resolve_model(parameters.model),
        "input": build_agent_input(agent, memory),
    }

    if parameters.max_output_tokens is not None:
        request_body["max_output_tokens"] = parameters.max_output_tokens
    if parameters.temperature is not None:
        request_body["temperature"] = parameters.temperature
    if parameters.top_p is not None:
        request_body["top_p"] = parameters.top_p

    return request_body


def stream_agent_response(agent: Agent, memory: list[ChatMessage]) -> Generator[StreamChunk, None, None]:
    try:
        with client.responses.create(**build_request_body(agent, memory), stream=True) as stream:
            for event in stream:
                if event.type == "response.output_text.delta":
                    yield "delta", {"text": event.delta}
                elif event.type == "response.completed":
                    yield "done", {"usage": usage_from_response(event.response)}
                elif event.type == "response.error":
                    yield "error", {"message": event.error.message}
    except APIStatusError as exc:
        yield "error", {"message": exc.message, "status": exc.status_code}
    except (APIConnectionError, APITimeoutError) as exc:
        yield "error", {"message": f"LLM request failed: {exc}"}
    except Exception as exc:
        yield "error", {"message": f"Unexpected LLM error: {exc}"}
