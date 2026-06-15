from collections.abc import Generator

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agent_store import AgentStore
from llm import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    build_agent_input,
    estimate_tokens,
    extract_chat_facts,
    messages_to_summarize,
    select_context,
    sse_event,
    stream_agent_response,
    summarize_chat_history,
)
from schemas import (
    Agent,
    AgentCreate,
    BranchCreate,
    AgentRunTracesResponse,
    AgentRunRequest,
    AgentsResponse,
    AiModel,
    Chat,
    ChatCreate,
    ChatMessagesResponse,
    ChatMessage,
    ChatsResponse,
    Checkpoint,
    CheckpointCreate,
    CheckpointsResponse,
    ModelsResponse,
    SummaryTrace,
    TokenUsage,
    TraceMessage,
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


@app.get("/api/agents/{agent_id}/checkpoints", response_model=CheckpointsResponse)
def list_checkpoints(agent_id: str) -> CheckpointsResponse:
    checkpoints = store.list_checkpoints(agent_id)
    if checkpoints is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return CheckpointsResponse(checkpoints=checkpoints)


@app.post("/api/agents/{agent_id}/chats/{chat_id}/checkpoints", response_model=Checkpoint, status_code=201)
def create_checkpoint(agent_id: str, chat_id: str, payload: CheckpointCreate) -> Checkpoint:
    agent = store.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    checkpoint = store.create_checkpoint(agent, chat_id, payload)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Chat not found or empty")
    return checkpoint


@app.post("/api/agents/{agent_id}/checkpoints/{checkpoint_id}/branches", response_model=Chat, status_code=201)
def create_branch(agent_id: str, checkpoint_id: str, payload: BranchCreate) -> Chat:
    chat = store.create_branch_from_checkpoint(agent_id, checkpoint_id, payload)
    if chat is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return chat


@app.get("/api/agents/{agent_id}/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
def get_chat_messages(agent_id: str, chat_id: str) -> ChatMessagesResponse:
    messages = store.get_messages(agent_id, chat_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return ChatMessagesResponse(messages=messages)


@app.get("/api/agents/{agent_id}/chats/{chat_id}/traces", response_model=AgentRunTracesResponse)
def get_chat_traces(agent_id: str, chat_id: str) -> AgentRunTracesResponse:
    traces = store.list_run_traces(agent_id, chat_id)
    if traces is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return AgentRunTracesResponse(traces=traces)


@app.delete("/api/agents/{agent_id}/chats/{chat_id}", status_code=204)
def delete_chat(agent_id: str, chat_id: str) -> Response:
    if not store.delete_chat(agent_id, chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    return Response(status_code=204)


@app.post("/api/agents/{agent_id}/chats/{chat_id}/run/stream")
def run_agent_stream(agent_id: str, chat_id: str, payload: AgentRunRequest) -> StreamingResponse:
    agent = store.get_chat_runtime_agent(agent_id, chat_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Chat or agent not found")

    user_message = ChatMessage(role="user", content=payload.message)
    if not store.append_message(agent_id, chat_id, user_message):
        raise HTTPException(status_code=404, detail="Chat not found")

    def stream_events() -> Generator[str, None, None]:
        assistant_content = ""
        current_memory = store.get_stored_messages(agent_id, chat_id) or []
        user_message_ordinal = current_memory[-1].ordinal if current_memory else 1
        summary = ""
        summary_state = store.get_chat_summary(agent_id, chat_id)
        if summary_state is not None:
            summary, covered_until_ordinal = summary_state
        else:
            covered_until_ordinal = 0
        previous_summary = summary
        summary_trace: SummaryTrace | None = None

        if agent.parameters.context_mode == "compressed":
            summary_batch = messages_to_summarize(agent, current_memory, covered_until_ordinal)
            if summary_batch:
                try:
                    summary = summarize_chat_history(agent, summary, summary_batch)
                    store.upsert_chat_summary(agent_id, chat_id, summary, summary_batch[-1].ordinal)
                    summary_trace = SummaryTrace(
                        previous_summary=previous_summary,
                        new_summary=summary,
                        covered_until_ordinal=summary_batch[-1].ordinal,
                        summarized_messages=[
                            TraceMessage(
                                ordinal=message.ordinal,
                                role=message.role,
                                content=message.content,
                                tokens=message.tokens,
                            )
                            for message in summary_batch
                        ],
                    )
                except Exception as exc:
                    yield sse_event("error", {"message": f"Failed to summarize chat history: {exc}"})
                    return

        prompt_facts = []
        if agent.parameters.context_mode == "sticky_facts":
            current_facts = store.list_chat_facts(agent_id, chat_id) or []
            fact_window = current_memory[-(agent.parameters.summary_window or 10):]
            try:
                updated_facts = extract_chat_facts(agent, current_facts, fact_window)
                if updated_facts:
                    store.upsert_chat_facts(agent_id, chat_id, updated_facts)
                prompt_facts = store.list_chat_facts(agent_id, chat_id) or []
            except Exception as exc:
                yield sse_event("error", {"message": f"Failed to update sticky facts: {exc}"})
                return

        prompt_memory, prompt_summary = select_context(agent, current_memory or [user_message], summary)
        trace_id = store.create_run_trace(
            agent_id,
            chat_id,
            user_message_ordinal,
            agent.parameters.context_mode,
            agent.parameters.context_window,
            prompt_summary,
            prompt_facts,
            prompt_memory,
            summary_trace,
        )
        final_usage: TokenUsage | None = None

        for event, data in stream_agent_response(agent, prompt_memory, prompt_summary, prompt_facts):
            if event == "delta":
                assistant_content += str(data.get("text", ""))
            if event == "done":
                usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
                input_tokens = usage.get("input_tokens")
                output_tokens = usage.get("output_tokens")
                estimated = bool(usage.get("estimated", False))

                if not isinstance(input_tokens, int):
                    input_tokens = estimate_tokens(build_agent_input(agent, prompt_memory, prompt_summary, prompt_facts))
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
            assistant_message_ordinal = store.get_last_message_ordinal(agent_id, chat_id, "assistant")
            if trace_id is not None and assistant_message_ordinal is not None:
                store.update_run_trace_assistant_ordinal(trace_id, assistant_message_ordinal)

    return StreamingResponse(stream_events(), media_type="text/event-stream")
