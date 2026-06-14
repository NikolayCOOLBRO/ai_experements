# Agent Workspace

Рабочая среда для создания и запуска LLM-агентов: React + TypeScript frontend, FastAPI backend и OpenAI-compatible LLM API через пакет `openai`.

Агент состоит из контекста, планирования и параметров LLM. История диалогов хранится в SQLite: у каждого агента может быть несколько отдельных чатов, а внутри каждого чата сохраняются все пользовательские сообщения и ответы модели.

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

Backend использует SQLite-файл. В Docker Compose история хранится в volume `backend_data`, поэтому агенты, чаты и сообщения переживают перезапуск контейнера.

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

## Пользовательский Сценарий

1. Создать агента.
2. Заполнить название, контекст, планирование и параметры LLM.
3. Выбрать созданного агента.
4. Создать новый чат или выбрать существующий.
5. Отправить сообщение в рамках выбранного чата.
6. Агент отвечает с учетом своего контекста, плана и истории текущего чата.

Дефолтного агента нет. Чат не создается автоматически: перед первым запуском нужно явно создать его в UI.

## Агент

Поля агента:

```json
{
  "id": "uuid",
  "name": "Аналитик требований",
  "context": "Зачем нужен агент и какие задачи он решает",
  "planning": "Какие шаги агент выполняет для решения задачи",
  "parameters": {
    "model": "yandexgpt-5-lite/latest",
    "temperature": 1,
    "top_p": 0.9,
    "top_k": 40,
    "max_output_tokens": 1024,
    "context_window": 20
  }
}
```

`context_window` - это количество последних сообщений из текущего чата, которые backend добавляет в prompt при новом запуске. Это не токеновый размер контекста модели.

`top_k` сейчас сохраняется в конфигурации агента, но не отправляется в OpenAI Responses API, потому что этот параметр не является стандартным для Responses API.

## Настройки LLM

Если `.env` не создан, `docker-compose.yml` использует безопасные локальные значения:

```env
OPENAI_BASE_URL=http://host.docker.internal:1234/v1
OPENAI_API_KEY=local-key
OPENAI_MODEL=yandexgpt-5-lite/latest
OPENAI_PROJECT=
YANDEX_CLOUD_FOLDER=
```

Чтобы переопределить их, создайте `.env` рядом с `docker-compose.yml`:

```bash
cp .env.example .env
```

Пример для Yandex AI API:

```env
OPENAI_BASE_URL=https://ai.api.cloud.yandex.net/v1
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=yandexgpt-5-lite/latest
OPENAI_PROJECT=your-project-id
YANDEX_CLOUD_FOLDER=your-folder-id
```

Текущая реализация собирает model URI в формате:

```text
gpt://{YANDEX_CLOUD_FOLDER}/{model}
```

Список доступных моделей находится в `backend/llm.py`.

## API

### Models

`GET /api/models`

Response:

```json
{
  "models": [
    { "id": "yandexgpt-5-lite/latest", "label": "YandexGPT 5 Lite" }
  ],
  "default_model": "yandexgpt-5-lite/latest"
}
```

### Agents

`GET /api/agents`

Response:

```json
{
  "agents": []
}
```

`POST /api/agents`

Request:

```json
{
  "name": "Аналитик требований",
  "context": "Помогает разбирать продуктовые требования.",
  "planning": "1. Уточнить цель\n2. Выделить ограничения\n3. Предложить решение",
  "parameters": {
    "model": "yandexgpt-5-lite/latest",
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "max_output_tokens": 2048,
    "context_window": 20
  }
}
```

Response: созданный агент с `id`.

Также доступны:

```text
GET    /api/agents/{agent_id}
PUT    /api/agents/{agent_id}
DELETE /api/agents/{agent_id}
```

### Chats

`GET /api/agents/{agent_id}/chats`

Response:

```json
{
  "chats": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "title": "Новый чат",
      "created_at": "2026-06-15T12:00:00+00:00",
      "updated_at": "2026-06-15T12:01:30+00:00"
    }
  ]
}
```

`POST /api/agents/{agent_id}/chats`

Request:

```json
{
  "title": "Новый чат"
}
```

Response: созданный чат с `id`.

`GET /api/agents/{agent_id}/chats/{chat_id}/messages`

Response:

```json
{
  "messages": [
    { "role": "user", "content": "Разбери задачу" },
    { "role": "assistant", "content": "Сначала уточню цель и ограничения." }
  ]
}
```

Удалить чат:

```text
DELETE /api/agents/{agent_id}/chats/{chat_id}
```

При удалении чата удаляются и все его сообщения.

### Run Agent

`POST /api/agents/{agent_id}/chats/{chat_id}/run/stream`

Request:

```json
{
  "message": "Разбери задачу и предложи план реализации"
}
```

Response: Server-Sent Events.

```text
event: delta
data: {"text":"Начну с анализа"}

event: done
data: {}
```

При ошибке:

```text
event: error
data: {"message":"..."}
```

Frontend использует streaming endpoint для постепенного вывода ответа и прерывания генерации.

## История Чатов

- История хранится в SQLite, а не в памяти процесса.
- У каждого агента может быть несколько независимых чатов.
- Все сообщения пользователя и ответы модели сохраняются целиком.
- В prompt уходит не вся история, а только последние `N` сообщений выбранного чата, где `N = context_window`.
- Если пользователь создает новый чат, предыдущие чаты остаются доступными в списке.
- Если пользователь удаляет чат, он удаляется безвозвратно вместе со всей историей.

## Структура

```text
backend/
  main.py          FastAPI routes
  schemas.py       Pydantic schemas
  llm.py           OpenAI-compatible LLM client and prompt assembly
  agent_store.py   SQLite storage for agents, chats and messages
  requirements.txt Python dependencies

frontend/
  src/App.tsx      Agent workspace UI
  src/App.css      Agent workspace styles
  src/main.tsx     React entrypoint
```

## Проверка

Frontend:

```bash
npm run build --prefix frontend
```

Backend syntax check:

```bash
python -m py_compile "backend\main.py" "backend\schemas.py" "backend\llm.py" "backend\agent_store.py"
```
