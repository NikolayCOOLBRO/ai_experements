from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class AgentParameters(BaseModel):
    model: str
    temperature: float | None = Field(default=1, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    top_k: int | None = Field(default=None, ge=1)
    max_output_tokens: int | None = Field(default=1024, ge=1, le=32000)
    context_window: int | None = Field(default=20, ge=1, le=200)


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    context: str = Field(min_length=1, max_length=8000)
    planning: str = Field(min_length=1, max_length=8000)
    parameters: AgentParameters

    @field_validator("name", "context", "planning")
    @classmethod
    def strip_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped


class Agent(AgentCreate):
    id: str


class AgentsResponse(BaseModel):
    agents: list[Agent]


class AgentMemoryResponse(BaseModel):
    messages: list[ChatMessage]


class ChatCreate(BaseModel):
    title: str = Field(default="Новый чат", min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Title cannot be empty")
        return stripped


class Chat(BaseModel):
    id: str
    agent_id: str
    title: str
    created_at: str
    updated_at: str


class ChatsResponse(BaseModel):
    chats: list[Chat]


class ChatMessagesResponse(BaseModel):
    messages: list[ChatMessage]


class AgentRunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=16000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Message cannot be empty")
        return stripped


class AiModel(BaseModel):
    id: str
    label: str


class ModelsResponse(BaseModel):
    models: list[AiModel]
    default_model: str
