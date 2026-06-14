from collections.abc import Generator

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agent_store import AgentStore
from llm import AVAILABLE_MODELS, DEFAULT_MODEL, build_agent_input, estimate_tokens, sse_event, stream_agent_response
from schemas import (
    Agent,
    AgentCreate,
    AgentRunRequest,
    AgentsResponse,
    AiModel,
    Chat,
    ChatCreate,
    ChatMessagesResponse,
    ChatMessage,
    ChatsResponse,
    ModelsResponse,
    TokenUsage,
)


app = FastAPI(title="Agent Workspace")
store = AgentStore()

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


@app.get("/api/agents", response_model=AgentsResponse)
def list_agents() -> AgentsResponse:
    return AgentsResponse(agents=store.list_agents())


@app.post("/api/agents", response_model=Agent, status_code=201)
def create_agent(payload: AgentCreate) -> Agent:
    return store.create_agent(payload)


@app.get("/api/agents/{agent_id}", response_model=Agent)
def get_agent(agent_id: str) -> Agent:
    agent = store.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@app.put("/api/agents/{agent_id}", response_model=Agent)
def update_agent(agent_id: str, payload: AgentCreate) -> Agent:
    agent = store.update_agent(agent_id, payload)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@app.delete("/api/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str) -> Response:
    if not store.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    return Response(status_code=204)


@app.get("/api/agents/{agent_id}/chats", response_model=ChatsResponse)
def list_chats(agent_id: str) -> ChatsResponse:
    chats = store.list_chats(agent_id)
    if chats is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return ChatsResponse(chats=chats)


@app.post("/api/agents/{agent_id}/chats", response_model=Chat, status_code=201)
def create_chat(agent_id: str, payload: ChatCreate) -> Chat:
    chat = store.create_chat(agent_id, payload)
    if chat is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return chat


@app.get("/api/agents/{agent_id}/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
def get_chat_messages(agent_id: str, chat_id: str) -> ChatMessagesResponse:
    messages = store.get_messages(agent_id, chat_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return ChatMessagesResponse(messages=messages)


@app.delete("/api/agents/{agent_id}/chats/{chat_id}", status_code=204)
def delete_chat(agent_id: str, chat_id: str) -> Response:
    if not store.delete_chat(agent_id, chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    return Response(status_code=204)


@app.post("/api/agents/{agent_id}/chats/{chat_id}/run/stream")
def run_agent_stream(agent_id: str, chat_id: str, payload: AgentRunRequest) -> StreamingResponse:
    agent = store.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    user_message = ChatMessage(role="user", content=payload.message)
    if not store.append_message(agent_id, chat_id, user_message):
        raise HTTPException(status_code=404, detail="Chat not found")

    def stream_events() -> Generator[str, None, None]:
        assistant_content = ""
        current_memory = store.get_messages(agent_id, chat_id) or [user_message]
        final_usage: TokenUsage | None = None

        for event, data in stream_agent_response(agent, current_memory):
            if event == "delta":
                assistant_content += str(data.get("text", ""))
            if event == "done":
                usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
                input_tokens = usage.get("input_tokens")
                output_tokens = usage.get("output_tokens")
                estimated = bool(usage.get("estimated", False))

                if not isinstance(input_tokens, int):
                    input_tokens = estimate_tokens(build_agent_input(agent, current_memory))
                    estimated = True
                if not isinstance(output_tokens, int):
                    output_tokens = estimate_tokens(assistant_content)
                    estimated = True

                final_usage = TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens, estimated=estimated)
                store.update_last_user_message_tokens(
                    agent_id,
                    chat_id,
                    TokenUsage(input_tokens=input_tokens, estimated=estimated),
                )
                total_before_assistant = store.sum_chat_tokens(agent_id, chat_id) or 0
                final_usage.total_chat_tokens = total_before_assistant + output_tokens
                data = {"usage": final_usage.model_dump()}
            yield sse_event(event, data)

        if assistant_content.strip():
            store.append_message(agent_id, chat_id, ChatMessage(role="assistant", content=assistant_content.strip(), tokens=final_usage))

    return StreamingResponse(stream_events(), media_type="text/event-stream")
