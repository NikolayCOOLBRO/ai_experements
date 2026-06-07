# Simple AI Chat

Простой чат с AI: React + TypeScript frontend, FastAPI backend и OpenAI-compatible LLM API через пакет `openai`.

## Запуск

Backend запускается через Docker:

```bash
docker compose up --build backend
```

Frontend запускается локально без Docker:

```bash
cd frontend
npm install
npm run dev
```

Или из корня проекта:

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Vite dev server проксирует `/api` на backend `http://localhost:8000`.

После запуска откройте:

```text
http://localhost:3000
```

Frontend production build без Docker:

```bash
npm run build --prefix frontend
```

Backend доступен на:

```text
http://localhost:8000
```

Health check:

```text
http://localhost:8000/health
```

## Настройки LLM

Если `.env` не создан, `docker-compose.yml` использует безопасные локальные значения:

```env
OPENAI_BASE_URL=http://host.docker.internal:1234/v1
OPENAI_API_KEY=local-key
OPENAI_MODEL=local-model
OPENAI_PROJECT=
OPENAI_PROMPT_ID=
```

Чтобы переопределить их, создайте `.env` рядом с `docker-compose.yml`:

```bash
cp .env.example .env
```

Пример для OpenAI API:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_PROJECT=
OPENAI_PROMPT_ID=
```

Пример для Yandex AI API с prompt id:

```env
OPENAI_BASE_URL=https://ai.api.cloud.yandex.net/v1
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=local-model
OPENAI_PROJECT=b1g76chjqes3nfvskktn
OPENAI_PROMPT_ID=fvtkanop432rcs96u2fu
```

Если `OPENAI_PROMPT_ID` задан, backend вызывает `client.responses.create(prompt={"id": OPENAI_PROMPT_ID}, input="...")` и отправляет последнюю реплику пользователя как `input`.

Если `OPENAI_PROMPT_ID` не задан, backend вызывает `client.responses.create(model=OPENAI_MODEL, input="...")` и отправляет историю сообщений как текст.

## API

`POST /api/chat`

Request:

```json
{
  "messages": [
    { "role": "user", "content": "Привет" }
  ],
  "max_output_tokens": 1024,
  "stop": ["\nuser:"]
}
```

Response:

```json
{
  "message": {
    "role": "assistant",
    "content": "Привет!"
  }
}
```

`POST /api/chat/stream`

Принимает такой же request, но возвращает Server-Sent Events:

```text
event: delta
data: {"text":"Привет"}

event: done
data: {}
```

Frontend использует этот endpoint для постепенного вывода ответа и прерывания генерации.

## Структура

```text
backend/   FastAPI backend
frontend/  React + TypeScript frontend, локальный Vite dev server
```
