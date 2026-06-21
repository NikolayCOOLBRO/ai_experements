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
    AgentRunTracesResponse,
    AgentRunRequest,
    AgentsResponse,
    AiModel,
    BranchCreate,
    Chat,
    ChatCreate,
    ChatMessagesResponse,
    ChatMessage,
    ChatsResponse,
    Checkpoint,
    CheckpointCreate,
    CheckpointsResponse,
    LongTermMemoryResponse,
    LongTermMemoryUpsert,
    MemoryWritesResponse,
    ModelsResponse,
    SummaryTrace,
    TokenUsage,
    TraceMessage,
    WorkingMemoryResponse,
    WorkingMemoryUpsert,
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


@app.get("/api/agents/{agent_id}/chats/{chat_id}/memory/short-term", response_model=ChatMessagesResponse)
def get_short_term_memory(agent_id: str, chat_id: str) -> ChatMessagesResponse:
    messages = store.get_messages(agent_id, chat_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return ChatMessagesResponse(messages=messages)


@app.get("/api/agents/{agent_id}/chats/{chat_id}/memory/working", response_model=WorkingMemoryResponse)
def get_working_memory(agent_id: str, chat_id: str, key: str | None = None, tag: str | None = None, task_tag: str | None = None) -> WorkingMemoryResponse:
    items = store.list_working_memory(agent_id, chat_id, key=key, tag=tag, task_tag=task_tag)
    if items is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return WorkingMemoryResponse(items=items)


@app.post("/api/agents/{agent_id}/chats/{chat_id}/memory/working", response_model=WorkingMemoryUpsert, status_code=201)
def upsert_working_memory(agent_id: str, chat_id: str, payload: WorkingMemoryUpsert) -> WorkingMemoryUpsert:
    item = store.upsert_working_memory(agent_id, chat_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return WorkingMemoryUpsert(
        key=item.key,
        value=item.value,
        tags=item.tags,
        task_tag=item.task_tag,
        reason=payload.reason,
        source_message_ordinal=item.source_message_ordinal,
    )


@app.delete("/api/agents/{agent_id}/chats/{chat_id}/memory/working/{key}", status_code=204)
def delete_working_memory(agent_id: str, chat_id: str, key: str) -> Response:
    if not store.delete_working_memory(agent_id, chat_id, key):
        raise HTTPException(status_code=404, detail="Working memory item not found")
    return Response(status_code=204)


@app.get("/api/agents/{agent_id}/memory/long-term", response_model=LongTermMemoryResponse)
def get_long_term_memory(agent_id: str, query: str | None = None, category: str | None = None, tag: str | None = None) -> LongTermMemoryResponse:
    items = store.list_long_term_memory(agent_id, query=query, category=category, tag=tag)
    if items is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return LongTermMemoryResponse(items=items)


@app.post("/api/agents/{agent_id}/memory/long-term", response_model=LongTermMemoryUpsert, status_code=201)
def upsert_long_term_memory(agent_id: str, payload: LongTermMemoryUpsert) -> LongTermMemoryUpsert:
    item = store.upsert_long_term_memory(agent_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return LongTermMemoryUpsert(
        category=item.category,
        key=item.key,
        value=item.value,
        tags=item.tags,
        reason=payload.reason,
        source_chat_id=item.source_chat_id,
        source_message_ordinal=item.source_message_ordinal,
    )


@app.delete("/api/agents/{agent_id}/memory/long-term/{item_id}", status_code=204)
def delete_long_term_memory(agent_id: str, item_id: str) -> Response:
    if not store.delete_long_term_memory(agent_id, item_id):
        raise HTTPException(status_code=404, detail="Long-term memory item not found")
    return Response(status_code=204)


@app.get("/api/agents/{agent_id}/memory/writes", response_model=MemoryWritesResponse)
def get_memory_writes(agent_id: str, chat_id: str | None = None) -> MemoryWritesResponse:
    writes = store.list_memory_writes(agent_id, chat_id)
    if writes is None:
        raise HTTPException(status_code=404, detail="Agent or chat not found")
    return MemoryWritesResponse(writes=writes)


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
    user_message_ordinal = store.get_last_message_ordinal(agent_id, chat_id, "user")
    store.record_memory_write(agent_id, chat_id, "short_term", "upsert", f"user_message_{user_message_ordinal or 1}", payload.message, [], None, "User message appended to current session history", user_message_ordinal)

    def stream_events() -> Generator[str, None, None]:
        assistant_content = ""
        current_memory = store.get_stored_messages(agent_id, chat_id) or []
        working_memory = store.list_working_memory(agent_id, chat_id) or []
        long_term_memory = store.list_long_term_memory(agent_id) or []
        memory_writes = store.list_memory_writes(agent_id, chat_id) or []
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
            current_memory,
            working_memory,
            long_term_memory,
            memory_writes,
            prompt_memory,
            summary_trace,
        )
        final_usage: TokenUsage | None = None

        for event, data in stream_agent_response(agent, prompt_memory, prompt_summary, prompt_facts, working_memory, long_term_memory):
            if event == "delta":
                assistant_content += str(data.get("text", ""))
            if event == "done":
                usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
                input_tokens = usage.get("input_tokens")
                output_tokens = usage.get("output_tokens")
                estimated = bool(usage.get("estimated", False))

                if not isinstance(input_tokens, int):
                    input_tokens = estimate_tokens(build_agent_input(agent, prompt_memory, prompt_summary, prompt_facts, working_memory, long_term_memory))
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
            store.record_memory_write(agent_id, chat_id, "short_term", "upsert", f"assistant_message_{assistant_message_ordinal or (user_message_ordinal + 1)}", assistant_content.strip(), [], None, "Assistant reply appended to current session history", assistant_message_ordinal)
            if trace_id is not None and assistant_message_ordinal is not None:
                store.update_run_trace_assistant_ordinal(trace_id, assistant_message_ordinal)

    return StreamingResponse(stream_events(), media_type="text/event-stream")
