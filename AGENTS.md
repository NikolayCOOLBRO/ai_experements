# AGENTS.md

## Project Shape
- Backend is a FastAPI app in `backend/main.py`; Docker builds only `backend/requirements.txt` and `backend/main.py`.
- Frontend is a Vite React TypeScript app under `frontend/`; entrypoints are `frontend/src/main.tsx` and `frontend/src/App.tsx`.
- The root `package-lock.json` is effectively empty; frontend npm commands must use `--prefix frontend` or run from `frontend/`.

## Commands
- Start backend: `docker compose up --build backend`.
- Start frontend: `npm install --prefix frontend` then `npm run dev --prefix frontend`.
- Frontend production/type check: `npm run build --prefix frontend` (`tsc && vite build`).
- There are no configured test, lint, formatter, or Python typecheck commands in the repo; use the frontend build as the main automated verification for UI changes.

## Runtime Wiring
- Vite serves on port `3000` and proxies `/api` to `http://localhost:8000` via `frontend/vite.config.ts`.
- Backend exposes `/health`, `/api/chat`, and `/api/chat/stream`; the frontend uses only the streaming endpoint for chat responses.
- Docker Compose maps backend port `8000:8000` and loads LLM settings from root `.env` with safe defaults.

## LLM Env Behavior
- Root `.env.example` documents the expected variables: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PROJECT`, `OPENAI_PROMPT_ID`.
- If `OPENAI_PROMPT_ID` is set, backend sends only the latest user message as `input` with `prompt={"id": ...}`.
- If `OPENAI_PROMPT_ID` is unset, backend sends the whole message history as formatted text with `model=OPENAI_MODEL`.
- Do not commit real `.env` values; `.env` is gitignored.

## Implementation Notes
- Backend request/response schemas are Pydantic models in `backend/main.py`; `stop` sequences are normalized server-side and capped at 4 by the schema.
- Streaming responses are Server-Sent Events named `delta`, `done`, and `error`; preserve this event contract when changing either side.
- Frontend text and UI labels are currently Russian; keep copy consistent unless the task asks otherwise.
