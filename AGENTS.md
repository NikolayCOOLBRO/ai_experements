# AGENTS.md

## Pipline работы
1. Рассуждай последовательно;
2. Прогоняй каждыое рассуждение как будто ты 4 разных специалиста:
 a) Senior Инженер-программист с бэкенд опытом - принимаешь все решение через призму HighLoad, HighPerformece, и гибких систем;
 б) Senior Инженер-программист с фронтенд опытом - принимаешь каждое решение, как максимально переиспользуемое;
 в) UI/UX дизайнер - примаешь решения с точки зрения использования, конечного продукта;
 г) Главный архитектор - смотришь на все рассуждения предыдущих и ищешь недочёт в остальных;
3. После этого ты должен составить итоговый план и получить одобрение на разработку;


## Project Shape
- Backend is a FastAPI agent workspace. Routes live in `backend/main.py`; schemas are in `backend/schemas.py`; OpenAI-compatible LLM calls are isolated in `backend/llm.py`; SQLite-backed agent, chat, summary, and trace storage is in `backend/agent_store.py`.
- Backend Docker builds `backend/requirements.txt` and copies the whole `backend/` directory, because the app now uses multiple Python modules.
- Frontend is a Vite React TypeScript app under `frontend/`; entrypoints are `frontend/src/main.tsx` and `frontend/src/App.tsx`.
- The root `package-lock.json` is effectively empty; frontend npm commands must use `--prefix frontend` or run from `frontend/`.

## Commands
- Start backend: `docker compose up --build backend`.
- Start frontend: `npm install --prefix frontend` then `npm run dev --prefix frontend`.
- Frontend production/type check: `npm run build --prefix frontend` (`tsc && vite build`).
- Backend syntax check: `python -m py_compile "backend\main.py" "backend\schemas.py" "backend\llm.py" "backend\agent_store.py"`.
- There are no configured test, lint, formatter, or Python typecheck commands in the repo; use the frontend build and backend syntax check as automated verification.

## Runtime Wiring
- Vite serves on port `3000` and proxies `/api` to `http://localhost:8000` via `frontend/vite.config.ts`.
- Backend exposes `/health`, `/api/models`, and agent endpoints under `/api/agents`.
- Frontend no longer uses the old `/api/chat` contract; user work happens through agents.
- Docker Compose maps backend port `8000:8000` and loads LLM settings from root `.env` with safe defaults.

## Agent Behavior
- Agents, chats, chat messages, token usage, chat summaries, and per-run agent traces are stored in SQLite via `backend/agent_store.py`.
- There is no default agent. The user must create an agent before running tasks.
- An agent contains context, planning instructions, and LLM parameters: `model`, `temperature`, `top_p`, `top_k`, `max_output_tokens`, `context_window`, `context_mode`, and `summary_window`.
- Each agent can have multiple chats. Chat history stores user/assistant messages plus token usage metadata.
- `context_mode="full"` sends the full chat history to the LLM as-is.
- `context_mode="compressed"` sends a separately stored chat summary plus the latest `context_window` messages as-is.
- `summary_window` limits how many old messages are compressed in one separate summary LLM call before the main streamed response.
- `context_window` is not the provider model token context size.
- `top_k` is stored in the agent config but is not sent to the OpenAI Responses API unless provider-specific support is added later.
- Each streamed run also stores a trace of what the agent actually used: prompt messages, prompt summary, summarized messages, and the updated summary text when compression ran.

## API Contract
- `GET /api/agents` returns `{ "agents": Agent[] }`.
- `POST /api/agents` creates an agent.
- `GET /api/agents/{agent_id}` returns one agent.
- `PUT /api/agents/{agent_id}` updates an agent.
- `DELETE /api/agents/{agent_id}` deletes an agent and its memory.
- `GET /api/agents/{agent_id}/chats` returns `{ "chats": Chat[] }`.
- `POST /api/agents/{agent_id}/chats` creates a chat.
- `GET /api/agents/{agent_id}/chats/{chat_id}/messages` returns `{ "messages": ChatMessage[] }`.
- `GET /api/agents/{agent_id}/chats/{chat_id}/traces` returns `{ "traces": AgentRunTrace[] }`.
- `DELETE /api/agents/{agent_id}/chats/{chat_id}` deletes a chat and all its messages.
- `POST /api/agents/{agent_id}/chats/{chat_id}/run/stream` runs an agent with `{ "message": "..." }` and streams the answer.
- Streaming responses are Server-Sent Events named `delta`, `done`, and `error`; preserve this event contract when changing either side.

## LLM Env Behavior
- Root `.env.example` documents the expected variables: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PROJECT`, `YANDEX_CLOUD_FOLDER`.
- `OPENAI_MODEL` selects the default model id shown in the UI if it matches `backend/llm.py` `AVAILABLE_MODELS`.
- `YANDEX_CLOUD_FOLDER` is required by the current `resolve_model()` implementation because model ids are converted to `gpt://{YANDEX_CLOUD_FOLDER}/{model}`.
- Do not commit real `.env` values; `.env` is gitignored.

## Implementation Notes
- Keep API schemas in `backend/schemas.py`; avoid adding route-local Pydantic models in `main.py`.
- Keep direct OpenAI SDK usage in `backend/llm.py`; routes should not call the OpenAI client directly.
- Frontend text and UI labels are currently Russian; keep copy consistent unless the task asks otherwise.
- Frontend chat layout now supports three independently hideable areas: the agents panel, the main chat panel, and the separate agent actions trace panel.
