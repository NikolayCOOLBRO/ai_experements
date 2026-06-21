import math
import os
import json
from collections.abc import Generator
from typing import Literal

from fastapi import HTTPException
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from schemas import Agent, ChatFact, ChatMessage, LongTermMemoryItem, StoredChatMessage, WorkingMemoryItem


StreamChunk = tuple[Literal["delta", "done", "error"], dict[str, object]]


OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://host.docker.internal:1234/v1").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "local-key")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "yandexgpt-5-lite/latest")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
YANDEX_CLOUD_FOLDER = os.getenv("YANDEX_CLOUD_FOLDER", "")

AVAILABLE_MODELS = [
    {
        "id": "yandexgpt-5-lite/latest",
        "label": "YandexGPT 5 Lite",
        "max_tokens": 32768,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
    {
        "id": "gpt-oss-20b/latest",
        "label": "GPT OSS 20B",
        "max_tokens": 131072,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
    {
        "id": "deepseek-v4-flash/latest",
        "label": "DeepSeek V4 Flash",
        "max_tokens": 393216,
        "token_hint": "1 токен ≈ 4 английских символа или 6 русских",
    },
]
AVAILABLE_MODEL_IDS = {model["id"] for model in AVAILABLE_MODELS}
DEFAULT_MODEL = OPENAI_MODEL if OPENAI_MODEL in AVAILABLE_MODEL_IDS else AVAILABLE_MODELS[0]["id"]

client_options = {
    "api_key": OPENAI_API_KEY,
    "base_url": OPENAI_BASE_URL,
    "timeout": 60,
}
if OPENAI_PROJECT:
    client_options["project"] = OPENAI_PROJECT

client = OpenAI(**client_options)


def resolve_model(model: str) -> str:
    if model not in AVAILABLE_MODEL_IDS:
        raise HTTPException(status_code=400, detail="Unknown AI model")

    if not YANDEX_CLOUD_FOLDER:
        raise HTTPException(status_code=500, detail="YANDEX_CLOUD_FOLDER is not configured")

    return f"gpt://{YANDEX_CLOUD_FOLDER}/{model}"


def sse_event(event: str, data: object) -> str:
    import json

    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def format_history(memory: list[ChatMessage]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in memory)


def format_facts(facts: list[ChatFact]) -> str:
    return "\n".join(f"- {fact.category}.{fact.key}: {fact.value}" for fact in facts)


def format_working_memory(items: list[WorkingMemoryItem]) -> str:
    return "\n".join(
        f"- {item.key}: {item.value}"
        + (f" [task={item.task_tag}]" if item.task_tag else "")
        + (f" [tags={', '.join(item.tags)}]" if item.tags else "")
        for item in items
    )


def format_long_term_memory(items: list[LongTermMemoryItem]) -> str:
    return "\n".join(
        f"- {item.category}.{item.key}: {item.value}" + (f" [tags={', '.join(item.tags)}]" if item.tags else "")
        for item in items
    )


def build_agent_input(agent: Agent, memory: list[ChatMessage], summary: str = "", facts: list[ChatFact] | None = None, working_memory: list[WorkingMemoryItem] | None = None, long_term_memory: list[LongTermMemoryItem] | None = None) -> str:
    summary_block = ""
    if summary.strip():
        summary_block = f"""
Сжатая память чата:
{summary.strip()}
"""
    facts_block = ""
    if facts:
        facts_block = f"""
Sticky facts / Key-Value Memory:
{format_facts(facts)}
"""
    working_memory_block = ""
    if working_memory:
        working_memory_block = f"""
Рабочая память активной задачи:
{format_working_memory(working_memory)}
"""
    long_term_memory_block = ""
    if long_term_memory:
        long_term_memory_block = f"""
Долговременная память:
{format_long_term_memory(long_term_memory)}
"""
    history = format_history(memory)
    return f"""Ты агент: {agent.name}

Контекст агента:
{agent.context}

Планирование:
{agent.planning}

Инструкции:
- Используй контекст агента как назначение и границы ответственности.
- Используй планирование как внутренний порядок работы.
- Краткосрочная память - это только текущий диалог.
- Рабочая память - это временные данные активной задачи.
- Долговременная память - это устойчивые факты между сессиями.
- Не считай данные сохраненными, пока они явно не записаны в нужный слой памяти.
- Используй Sticky facts как устойчивую память чата, если они переданы.
- Если Sticky facts повлияли на ответ, кратко укажи использованные факты в конце ответа.
- Не показывай внутренние шаги, если пользователь явно не просит.
- Отвечай на русском языке, если пользователь не попросил другой язык.

{summary_block}
{facts_block}
{working_memory_block}
{long_term_memory_block}

Диалог:
{history}"""


def estimate_tokens(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return max(1, math.ceil(len(stripped) / 4))


def usage_from_response(response: object) -> dict[str, object] | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None

    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    if input_tokens is None and output_tokens is None:
        return None

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated": False,
    }


def build_request_body(agent: Agent, memory: list[ChatMessage], summary: str = "", facts: list[ChatFact] | None = None, working_memory: list[WorkingMemoryItem] | None = None, long_term_memory: list[LongTermMemoryItem] | None = None) -> dict[str, object]:
    parameters = agent.parameters
    request_body: dict[str, object] = {
        "model": resolve_model(parameters.model),
        "input": build_agent_input(agent, memory, summary, facts, working_memory, long_term_memory),
    }

    if parameters.max_output_tokens is not None:
        request_body["max_output_tokens"] = parameters.max_output_tokens
    if parameters.temperature is not None:
        request_body["temperature"] = parameters.temperature
    if parameters.top_p is not None:
        request_body["top_p"] = parameters.top_p

    return request_body


def stream_agent_response(agent: Agent, memory: list[ChatMessage], summary: str = "", facts: list[ChatFact] | None = None, working_memory: list[WorkingMemoryItem] | None = None, long_term_memory: list[LongTermMemoryItem] | None = None) -> Generator[StreamChunk, None, None]:
    try:
        with client.responses.create(**build_request_body(agent, memory, summary, facts, working_memory, long_term_memory), stream=True) as stream:
            for event in stream:
                if event.type == "response.output_text.delta":
                    yield "delta", {"text": event.delta}
                elif event.type == "response.completed":
                    yield "done", {"usage": usage_from_response(event.response)}
                elif event.type == "response.error":
                    yield "error", {"message": event.error.message}
    except APIStatusError as exc:
        yield "error", {"message": exc.message, "status": exc.status_code}
    except (APIConnectionError, APITimeoutError) as exc:
        yield "error", {"message": f"LLM request failed: {exc}"}
    except Exception as exc:
        yield "error", {"message": f"Unexpected LLM error: {exc}"}


def select_context(agent: Agent, memory: list[ChatMessage], summary: str = "") -> tuple[list[ChatMessage], str]:
    if agent.parameters.context_mode in {"full", "branching"}:
        return memory, ""

    context_window = agent.parameters.context_window
    if context_window is None:
        return memory, summary if agent.parameters.context_mode == "compressed" else ""

    prompt_memory = memory[-context_window:]
    if agent.parameters.context_mode == "sliding_window":
        return prompt_memory, ""
    return prompt_memory, summary


def messages_to_summarize(
    agent: Agent,
    memory: list[StoredChatMessage],
    covered_until_ordinal: int,
) -> list[StoredChatMessage]:
    if agent.parameters.context_mode != "compressed":
        return []

    context_window = agent.parameters.context_window or 0
    tail_start = len(memory) - context_window
    if tail_start <= 0:
        return []

    candidates = [message for message in memory[:tail_start] if message.ordinal > covered_until_ordinal]
    return candidates[: agent.parameters.summary_window]


def build_summary_input(agent: Agent, previous_summary: str, memory: list[StoredChatMessage]) -> str:
    previous_summary_block = previous_summary.strip() or "Пока нет сжатой памяти."
    history = "\n".join(f"#{message.ordinal} {message.role}: {message.content}" for message in memory)
    return f"""Обнови сжатую память чата для веб-агента.

Агент: {agent.name}

Контекст агента:
{agent.context}

Текущее summary:
{previous_summary_block}

Новые сообщения для сжатия:
{history}

Требования:
- Верни только обновленное summary без преамбулы.
- Сохрани выполненные действия, принятые решения, важные ограничения и договоренности.
- Сохрани открытые вопросы и факты, которые понадобятся агенту позже.
- Не пересказывай диалог дословно, сжимай до устойчивой памяти.
- Пиши на русском языке."""


def summarize_chat_history(agent: Agent, previous_summary: str, memory: list[StoredChatMessage]) -> str:
    if not memory:
        return previous_summary

    parameters = agent.parameters
    request_body: dict[str, object] = {
        "model": resolve_model(parameters.model),
        "input": build_summary_input(agent, previous_summary, memory),
    }
    if parameters.temperature is not None:
        request_body["temperature"] = min(parameters.temperature, 0.3)
    if parameters.top_p is not None:
        request_body["top_p"] = parameters.top_p

    response = client.responses.create(**request_body)
    summary = getattr(response, "output_text", "")
    return str(summary).strip() or previous_summary


def build_facts_input(agent: Agent, current_facts: list[ChatFact], memory: list[StoredChatMessage]) -> str:
    facts_block = format_facts(current_facts) or "Пока нет сохраненных фактов."
    history = "\n".join(f"#{message.ordinal} {message.role}: {message.content}" for message in memory)
    return f"""Обнови Sticky Facts / Key-Value Memory для чата веб-агента.

Агент: {agent.name}

Контекст агента:
{agent.context}

Текущие facts:
{facts_block}

Новые сообщения:
{history}

Категории facts:
- goal — основная цель, подцели, желаемый результат
- constraints — жесткие ограничения: бюджет, сроки, табу, запрещенные темы/инструменты
- preferences — предпочтения: стиль общения, формат ответа, любит/не любит
- decisions — принятые решения, утвержденные планы, выбранные варианты
- agreements — договоренности о процессе работы, правила взаимодействия
- entities — ключевые сущности: имена, даты, места, числа, ссылки, критичные для задачи

Требования:
- Верни только JSON-массив без markdown и преамбулы.
- Каждый элемент: {{"category":"goal|constraints|preferences|decisions|agreements|entities","key":"snake_case_key","value":"краткое значение"}}.
- Верни только новые или изменившиеся facts, которые стоит сохранить надолго.
- Если facts нет, верни [].
- Не сохраняй временные детали, обычные реплики и очевидные факты без пользы для будущего ответа.
- Пиши values на русском языке."""


def extract_chat_facts(agent: Agent, current_facts: list[ChatFact], memory: list[StoredChatMessage]) -> list[ChatFact]:
    if not memory:
        return []

    parameters = agent.parameters
    request_body: dict[str, object] = {
        "model": resolve_model(parameters.model),
        "input": build_facts_input(agent, current_facts, memory),
    }
    if parameters.temperature is not None:
        request_body["temperature"] = min(parameters.temperature, 0.2)
    if parameters.top_p is not None:
        request_body["top_p"] = parameters.top_p

    response = client.responses.create(**request_body)
    output = str(getattr(response, "output_text", "")).strip()
    if output.startswith("```"):
        output = output.strip("`").removeprefix("json").strip()
    parsed = json.loads(output or "[]")
    if not isinstance(parsed, list):
        return []

    source_ordinal = memory[-1].ordinal
    facts: list[ChatFact] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            facts.append(ChatFact(**item, source_message_ordinal=source_ordinal))
        except Exception:
            continue
    return facts
