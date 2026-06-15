from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


MODEL_MAX_TOKENS = {
    "yandexgpt-5-lite/latest": 32768,
    "gpt-oss-20b/latest": 131072,
    "deepseek-v4-flash/latest": 393216,
}


class TokenUsage(BaseModel):
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_chat_tokens: int | None = Field(default=None, ge=0)
    estimated: bool = False


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    tokens: TokenUsage | None = None


class StoredChatMessage(ChatMessage):
    ordinal: int = Field(ge=1)


class TraceMessage(ChatMessage):
    ordinal: int = Field(ge=1)


class SummaryTrace(BaseModel):
    previous_summary: str = ""
    new_summary: str = ""
    covered_until_ordinal: int = Field(ge=0)
    summarized_messages: list[TraceMessage]


class AgentRunTrace(BaseModel):
    id: str
    created_at: str
    user_message_ordinal: int = Field(ge=1)
    assistant_message_ordinal: int | None = Field(default=None, ge=1)
    context_mode: Literal["full", "compressed"]
    context_window: int | None = Field(default=None, ge=1)
    prompt_summary: str = ""
    prompt_messages: list[TraceMessage]
    summary: SummaryTrace | None = None


class AgentParameters(BaseModel):
    model: str
    temperature: float | None = Field(default=1, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    top_k: int | None = Field(default=None, ge=1)
    max_output_tokens: int | None = Field(default=1024, ge=1, le=393216)
    context_window: int | None = Field(default=20, ge=1, le=200)
    context_mode: Literal["full", "compressed"] = "full"
    summary_window: int = Field(default=10, ge=1, le=100)

    @model_validator(mode="after")
    def validate_model_token_limit(self) -> "AgentParameters":
        if self.max_output_tokens is None:
            return self

        model_limit = MODEL_MAX_TOKENS.get(self.model)
        if model_limit is None or self.max_output_tokens <= model_limit:
            return self

        raise ValueError(f"max_output_tokens exceeds limit for model {self.model}: {model_limit}")


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


class AgentRunTracesResponse(BaseModel):
    traces: list[AgentRunTrace]


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
    max_tokens: int
    token_hint: str


class ModelsResponse(BaseModel):
    models: list[AiModel]
    default_model: str
