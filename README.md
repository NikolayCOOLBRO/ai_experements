# Agent Workspace

Рабочая среда для создания и запуска LLM-агентов: React + TypeScript frontend, FastAPI backend и OpenAI-compatible LLM API через пакет `openai`.

Агент состоит из контекста, планирования и параметров LLM. История диалогов хранится в SQLite: у каждого агента может быть несколько отдельных чатов, а внутри каждого чата сохраняются все пользовательские сообщения, ответы модели и статистика затраченных токенов.

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
7. Под сообщениями отображаются токены входящего запроса, ответа LLM и общий расход в чате.

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
    "context_window": 20,
    "context_mode": "full",
    "summary_window": 10
  }
}
```

`context_mode` управляет историей чата в prompt: `full` отправляет всю историю как есть, `compressed` отправляет summary старой истории и последние `context_window` сообщений полностью.

`context_window` - это количество последних сообщений без сжатия в режиме `compressed`. Это не токеновый размер контекста модели.

`summary_window` - максимальное количество старых сообщений, которые backend сжимает за один отдельный LLM-вызов перед основным ответом.

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
    {
      "id": "yandexgpt-5-lite/latest",
      "label": "YandexGPT 5 Lite",
      "max_tokens": 32768,
      "token_hint": "1 токен ≈ 4 английских символа или 6 русских"
    }
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
    "context_window": 20,
    "context_mode": "compressed",
    "summary_window": 10
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
    {
      "role": "user",
      "content": "Разбери задачу",
      "tokens": {
        "input_tokens": 120,
        "output_tokens": null,
        "total_chat_tokens": null,
        "estimated": true
      }
    },
    {
      "role": "assistant",
      "content": "Сначала уточню цель и ограничения.",
      "tokens": {
        "input_tokens": 120,
        "output_tokens": 48,
        "total_chat_tokens": 168,
        "estimated": true
      }
    }
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
data: {"usage":{"input_tokens":120,"output_tokens":48,"total_chat_tokens":168,"estimated":true}}
```

При ошибке:

```text
event: error
data: {"message":"..."}
```

Frontend использует streaming endpoint для постепенного вывода ответа и прерывания генерации.

## Токены

Backend сохраняет статистику токенов вместе с сообщениями:

- `input_tokens` - токены текущего входящего запроса к LLM. Значение записывается у пользовательского сообщения.
- `output_tokens` - токены ответа LLM. Значение записывается у сообщения ассистента.
- `total_chat_tokens` - общий известный расход токенов в текущем чате после ответа ассистента.
- `estimated` - `true`, если хотя бы часть значений рассчитана локально приблизительно.

Если OpenAI-compatible провайдер возвращает `usage` в финальном событии `response.completed`, backend использует эти значения. Если `usage` отсутствует или неполный, backend применяет fallback: приблизительно считает токены по длине текста. Это не tokenizer конкретной модели, поэтому такие значения помечаются `estimated: true`.

Для `input_tokens` учитывается полный prompt, который отправляется в LLM: контекст агента, планирование, инструкции, summary при включенном сжатии и выбранная история чата.

## История Чатов

- История хранится в SQLite, а не в памяти процесса.
- У каждого агента может быть несколько независимых чатов.
- Все сообщения пользователя и ответы модели сохраняются целиком.
- Статистика токенов сохраняется вместе с сообщениями и возвращается через API истории чата.
- В режиме `full` в prompt уходит вся история выбранного чата.
- В режиме `compressed` старые сообщения заменяются summary, которое хранится отдельно в SQLite, а последние `context_window` сообщений идут в prompt как есть.
- Summary обновляется отдельным LLM-вызовом только когда появились новые сообщения старше последних `context_window`.
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
