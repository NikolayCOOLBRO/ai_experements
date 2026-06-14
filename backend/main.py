from collections.abc import Generator

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agent_store import AgentStore
from llm import AVAILABLE_MODELS, DEFAULT_MODEL, sse_event, stream_agent_response
from schemas import (
    Agent,
    AgentCreate,
    AgentMemoryResponse,
    AgentRunRequest,
    AgentsResponse,
    AiModel,
    ChatMessage,
    ModelsResponse,
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


@app.get("/api/agents/{agent_id}/memory", response_model=AgentMemoryResponse)
def get_agent_memory(agent_id: str) -> AgentMemoryResponse:
    memory = store.get_memory(agent_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentMemoryResponse(messages=memory)


@app.delete("/api/agents/{agent_id}/memory", status_code=204)
def clear_agent_memory(agent_id: str) -> Response:
    if not store.clear_memory(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    return Response(status_code=204)


@app.post("/api/agents/{agent_id}/run/stream")
def run_agent_stream(agent_id: str, payload: AgentRunRequest) -> StreamingResponse:
    agent = store.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    user_message = ChatMessage(role="user", content=payload.message)
    store.append_memory(agent_id, user_message)

    def stream_events() -> Generator[str, None, None]:
        assistant_content = ""
        current_memory = store.get_memory(agent_id) or [user_message]

        for event, data in stream_agent_response(agent, current_memory):
            if event == "delta":
                assistant_content += str(data.get("text", ""))
            yield sse_event(event, data)

        if assistant_content.strip():
            store.append_memory(agent_id, ChatMessage(role="assistant", content=assistant_content.strip()))

    return StreamingResponse(stream_events(), media_type="text/event-stream")
