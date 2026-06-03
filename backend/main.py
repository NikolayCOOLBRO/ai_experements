import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from pydantic import BaseModel, Field


OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://host.docker.internal:1234/v1").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "local-key")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "local-model")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
OPENAI_PROMPT_ID = os.getenv("OPENAI_PROMPT_ID")


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    message: ChatMessage


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


def format_messages(messages: list[ChatMessage]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in messages)


def latest_user_input(messages: list[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return messages[-1].content


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    request_body: dict[str, object]
    if OPENAI_PROMPT_ID:
        request_body = {
            "prompt": {"id": OPENAI_PROMPT_ID},
            "input": latest_user_input(payload.messages),
        }
    else:
        request_body = {
            "model": OPENAI_MODEL,
            "input": format_messages(payload.messages),
        }

    try:
        response = client.responses.create(**request_body)
    except APIStatusError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except (APIConnectionError, APITimeoutError) as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM error: {exc}") from exc

    content = response.output_text
    if not content:
        raise HTTPException(status_code=502, detail="LLM returned empty response")

    return ChatResponse(message=ChatMessage(role="assistant", content=content))
