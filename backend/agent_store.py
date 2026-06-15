import os
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from schemas import Agent, AgentCreate, AgentRunTrace, Chat, ChatCreate, ChatFact, ChatMessage, StoredChatMessage, SummaryTrace, TokenUsage, TraceMessage


class AgentStore:
    def __init__(self) -> None:
        sqlite_path = Path(os.getenv("SQLITE_PATH", "data/app.sqlite3"))
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(sqlite_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._initialize()

    def _initialize(self) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                context TEXT NOT NULL,
                planning TEXT NOT NULL,
                model TEXT NOT NULL,
                temperature REAL,
                top_p REAL,
                top_k INTEGER,
                max_output_tokens INTEGER,
                context_window INTEGER,
                context_mode TEXT NOT NULL DEFAULT 'full',
                summary_window INTEGER NOT NULL DEFAULT 10
            );

            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_summaries (
                chat_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                covered_until_ordinal INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_run_traces (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                user_message_ordinal INTEGER NOT NULL,
                assistant_message_ordinal INTEGER,
                context_mode TEXT NOT NULL,
                context_window INTEGER,
                prompt_summary TEXT NOT NULL DEFAULT '',
                prompt_facts_json TEXT NOT NULL DEFAULT '[]',
                prompt_messages_json TEXT NOT NULL,
                summary_json TEXT,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_facts (
                chat_id TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN ('goal', 'constraints', 'preferences', 'decisions', 'agreements', 'entities')),
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                source_message_ordinal INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (chat_id, category, key),
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );
            """
        )
        self._add_missing_agent_columns()
        self._add_missing_message_columns()
        self._add_missing_trace_columns()
        self._connection.commit()

    def _add_missing_agent_columns(self) -> None:
        rows = self._connection.execute("PRAGMA table_info(agents)").fetchall()
        existing_columns = {row["name"] for row in rows}
        columns = {
            "context_mode": "TEXT NOT NULL DEFAULT 'full'",
            "summary_window": "INTEGER NOT NULL DEFAULT 10",
        }
        for name, definition in columns.items():
            if name not in existing_columns:
                self._connection.execute(f"ALTER TABLE agents ADD COLUMN {name} {definition}")

    def _add_missing_message_columns(self) -> None:
        rows = self._connection.execute("PRAGMA table_info(chat_messages)").fetchall()
        existing_columns = {row["name"] for row in rows}
        columns = {
            "input_tokens": "INTEGER",
            "output_tokens": "INTEGER",
            "total_chat_tokens": "INTEGER",
            "tokens_estimated": "INTEGER NOT NULL DEFAULT 0",
        }
        for name, definition in columns.items():
            if name not in existing_columns:
                self._connection.execute(f"ALTER TABLE chat_messages ADD COLUMN {name} {definition}")

    def _add_missing_trace_columns(self) -> None:
        rows = self._connection.execute("PRAGMA table_info(agent_run_traces)").fetchall()
        existing_columns = {row["name"] for row in rows}
        columns = {
            "prompt_facts_json": "TEXT NOT NULL DEFAULT '[]'",
        }
        for name, definition in columns.items():
            if name not in existing_columns:
                self._connection.execute(f"ALTER TABLE agent_run_traces ADD COLUMN {name} {definition}")

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _row_to_agent(self, row: sqlite3.Row) -> Agent:
        return Agent(
            id=row["id"],
            name=row["name"],
            context=row["context"],
            planning=row["planning"],
            parameters={
                "model": row["model"],
                "temperature": row["temperature"],
                "top_p": row["top_p"],
                "top_k": row["top_k"],
                "max_output_tokens": row["max_output_tokens"],
                "context_window": row["context_window"],
                "context_mode": row["context_mode"],
                "summary_window": row["summary_window"],
            },
        )

    def _row_to_chat(self, row: sqlite3.Row) -> Chat:
        return Chat(
            id=row["id"],
            agent_id=row["agent_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _trace_message_dict(self, message: StoredChatMessage) -> dict[str, object]:
        return {
            "ordinal": message.ordinal,
            "role": message.role,
            "content": message.content,
            "tokens": message.tokens.model_dump() if message.tokens else None,
        }

    def _row_to_trace(self, row: sqlite3.Row) -> AgentRunTrace:
        prompt_messages = [TraceMessage.model_validate(item) for item in json.loads(row["prompt_messages_json"])]
        prompt_facts = [ChatFact.model_validate(item) for item in json.loads(row["prompt_facts_json"] or "[]")]
        summary = None
        if row["summary_json"]:
            summary = SummaryTrace.model_validate(json.loads(row["summary_json"]))
        return AgentRunTrace(
            id=row["id"],
            created_at=row["created_at"],
            user_message_ordinal=row["user_message_ordinal"],
            assistant_message_ordinal=row["assistant_message_ordinal"],
            context_mode=row["context_mode"],
            context_window=row["context_window"],
            prompt_summary=row["prompt_summary"],
            prompt_facts=prompt_facts,
            prompt_messages=prompt_messages,
            summary=summary,
        )

    def _agent_exists(self, agent_id: str) -> bool:
        row = self._connection.execute("SELECT 1 FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return row is not None

    def _chat_exists(self, agent_id: str, chat_id: str) -> bool:
        row = self._connection.execute(
            "SELECT 1 FROM chats WHERE id = ? AND agent_id = ?",
            (chat_id, agent_id),
        ).fetchone()
        return row is not None

    def list_agents(self) -> list[Agent]:
        rows = self._connection.execute("SELECT * FROM agents ORDER BY name COLLATE NOCASE, id").fetchall()
        return [self._row_to_agent(row) for row in rows]

    def create_agent(self, payload: AgentCreate) -> Agent:
        agent = Agent(id=str(uuid4()), **payload.model_dump())
        parameters = agent.parameters
        self._connection.execute(
            """
            INSERT INTO agents (
                id, name, context, planning, model, temperature, top_p, top_k, max_output_tokens,
                context_window, context_mode, summary_window
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent.id,
                agent.name,
                agent.context,
                agent.planning,
                parameters.model,
                parameters.temperature,
                parameters.top_p,
                parameters.top_k,
                parameters.max_output_tokens,
                parameters.context_window,
                parameters.context_mode,
                parameters.summary_window,
            ),
        )
        self._connection.commit()
        return agent

    def get_agent(self, agent_id: str) -> Agent | None:
        row = self._connection.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_agent(row)

    def update_agent(self, agent_id: str, payload: AgentCreate) -> Agent | None:
        if not self._agent_exists(agent_id):
            return None

        agent = Agent(id=agent_id, **payload.model_dump())
        parameters = agent.parameters
        self._connection.execute(
            """
            UPDATE agents
            SET name = ?, context = ?, planning = ?, model = ?, temperature = ?, top_p = ?, top_k = ?,
                max_output_tokens = ?, context_window = ?, context_mode = ?, summary_window = ?
            WHERE id = ?
            """,
            (
                agent.name,
                agent.context,
                agent.planning,
                parameters.model,
                parameters.temperature,
                parameters.top_p,
                parameters.top_k,
                parameters.max_output_tokens,
                parameters.context_window,
                parameters.context_mode,
                parameters.summary_window,
                agent_id,
            ),
        )
        self._connection.commit()
        return agent

    def delete_agent(self, agent_id: str) -> bool:
        cursor = self._connection.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        self._connection.commit()
        existed = cursor.rowcount > 0
        return existed

    def list_chats(self, agent_id: str) -> list[Chat] | None:
        if not self._agent_exists(agent_id):
            return None
        rows = self._connection.execute(
            "SELECT * FROM chats WHERE agent_id = ? ORDER BY updated_at DESC, created_at DESC",
            (agent_id,),
        ).fetchall()
        return [self._row_to_chat(row) for row in rows]

    def create_chat(self, agent_id: str, payload: ChatCreate) -> Chat | None:
        if not self._agent_exists(agent_id):
            return None
        now = self._now()
        chat = Chat(
            id=str(uuid4()),
            agent_id=agent_id,
            title=payload.title,
            created_at=now,
            updated_at=now,
        )
        self._connection.execute(
            "INSERT INTO chats (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (chat.id, chat.agent_id, chat.title, chat.created_at, chat.updated_at),
        )
        self._connection.commit()
        return chat

    def delete_chat(self, agent_id: str, chat_id: str) -> bool:
        cursor = self._connection.execute(
            "DELETE FROM chats WHERE id = ? AND agent_id = ?",
            (chat_id, agent_id),
        )
        self._connection.commit()
        return cursor.rowcount > 0

    def get_messages(self, agent_id: str, chat_id: str) -> list[ChatMessage] | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        rows = self._connection.execute(
            """
            SELECT role, content, input_tokens, output_tokens, total_chat_tokens, tokens_estimated
            FROM chat_messages
            WHERE chat_id = ?
            ORDER BY ordinal ASC
            """,
            (chat_id,),
        ).fetchall()
        messages: list[ChatMessage] = []
        for row in rows:
            tokens = None
            if row["input_tokens"] is not None or row["output_tokens"] is not None or row["total_chat_tokens"] is not None:
                tokens = TokenUsage(
                    input_tokens=row["input_tokens"],
                    output_tokens=row["output_tokens"],
                    total_chat_tokens=row["total_chat_tokens"],
                    estimated=bool(row["tokens_estimated"]),
                )
            messages.append(ChatMessage(role=row["role"], content=row["content"], tokens=tokens))
        return messages

    def get_stored_messages(self, agent_id: str, chat_id: str) -> list[StoredChatMessage] | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        rows = self._connection.execute(
            """
            SELECT role, content, input_tokens, output_tokens, total_chat_tokens, tokens_estimated, ordinal
            FROM chat_messages
            WHERE chat_id = ?
            ORDER BY ordinal ASC
            """,
            (chat_id,),
        ).fetchall()
        messages: list[StoredChatMessage] = []
        for row in rows:
            tokens = None
            if row["input_tokens"] is not None or row["output_tokens"] is not None or row["total_chat_tokens"] is not None:
                tokens = TokenUsage(
                    input_tokens=row["input_tokens"],
                    output_tokens=row["output_tokens"],
                    total_chat_tokens=row["total_chat_tokens"],
                    estimated=bool(row["tokens_estimated"]),
                )
            messages.append(StoredChatMessage(role=row["role"], content=row["content"], tokens=tokens, ordinal=row["ordinal"]))
        return messages

    def get_chat_summary(self, agent_id: str, chat_id: str) -> tuple[str, int] | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        row = self._connection.execute(
            "SELECT content, covered_until_ordinal FROM chat_summaries WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        if row is None:
            return "", 0
        return row["content"], int(row["covered_until_ordinal"])

    def list_run_traces(self, agent_id: str, chat_id: str) -> list[AgentRunTrace] | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        rows = self._connection.execute(
            """
            SELECT * FROM agent_run_traces
            WHERE chat_id = ?
            ORDER BY user_message_ordinal ASC, created_at ASC
            """,
            (chat_id,),
        ).fetchall()
        return [self._row_to_trace(row) for row in rows]

    def list_chat_facts(self, agent_id: str, chat_id: str) -> list[ChatFact] | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        rows = self._connection.execute(
            """
            SELECT category, key, value, source_message_ordinal
            FROM chat_facts
            WHERE chat_id = ?
            ORDER BY category ASC, key ASC
            """,
            (chat_id,),
        ).fetchall()
        return [
            ChatFact(
                category=row["category"],
                key=row["key"],
                value=row["value"],
                source_message_ordinal=row["source_message_ordinal"],
            )
            for row in rows
        ]

    def create_run_trace(
        self,
        agent_id: str,
        chat_id: str,
        user_message_ordinal: int,
        context_mode: str,
        context_window: int | None,
        prompt_summary: str,
        prompt_facts: list[ChatFact],
        prompt_messages: list[StoredChatMessage],
        summary: SummaryTrace | None,
    ) -> str | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        trace_id = str(uuid4())
        self._connection.execute(
            """
            INSERT INTO agent_run_traces (
                id, chat_id, created_at, user_message_ordinal, assistant_message_ordinal,
                context_mode, context_window, prompt_summary, prompt_facts_json, prompt_messages_json, summary_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trace_id,
                chat_id,
                self._now(),
                user_message_ordinal,
                None,
                context_mode,
                context_window,
                prompt_summary,
                json.dumps([fact.model_dump() for fact in prompt_facts], ensure_ascii=True),
                json.dumps([self._trace_message_dict(message) for message in prompt_messages], ensure_ascii=True),
                json.dumps(summary.model_dump(), ensure_ascii=True) if summary else None,
            ),
        )
        self._connection.commit()
        return trace_id

    def upsert_chat_facts(self, agent_id: str, chat_id: str, facts: list[ChatFact]) -> bool:
        if not self._chat_exists(agent_id, chat_id):
            return False
        if not facts:
            return True
        now = self._now()
        for fact in facts:
            self._connection.execute(
                """
                INSERT INTO chat_facts (chat_id, category, key, value, source_message_ordinal, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id, category, key) DO UPDATE SET
                    value = excluded.value,
                    source_message_ordinal = excluded.source_message_ordinal,
                    updated_at = excluded.updated_at
                """,
                (chat_id, fact.category, fact.key, fact.value, fact.source_message_ordinal, now, now),
            )
        self._connection.commit()
        return True

    def update_run_trace_assistant_ordinal(self, trace_id: str, assistant_message_ordinal: int) -> bool:
        cursor = self._connection.execute(
            "UPDATE agent_run_traces SET assistant_message_ordinal = ? WHERE id = ?",
            (assistant_message_ordinal, trace_id),
        )
        self._connection.commit()
        return cursor.rowcount > 0

    def upsert_chat_summary(self, agent_id: str, chat_id: str, content: str, covered_until_ordinal: int) -> bool:
        if not self._chat_exists(agent_id, chat_id):
            return False
        now = self._now()
        self._connection.execute(
            """
            INSERT INTO chat_summaries (chat_id, content, covered_until_ordinal, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                content = excluded.content,
                covered_until_ordinal = excluded.covered_until_ordinal,
                updated_at = excluded.updated_at
            """,
            (chat_id, content, covered_until_ordinal, now, now),
        )
        self._connection.commit()
        return True

    def append_message(self, agent_id: str, chat_id: str, message: ChatMessage) -> bool:
        if not self._chat_exists(agent_id, chat_id):
            return False
        next_ordinal_row = self._connection.execute(
            "SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal FROM chat_messages WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        now = self._now()
        tokens = message.tokens
        self._connection.execute(
            """
            INSERT INTO chat_messages (
                id, chat_id, role, content, created_at, ordinal,
                input_tokens, output_tokens, total_chat_tokens, tokens_estimated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                chat_id,
                message.role,
                message.content,
                now,
                next_ordinal_row["next_ordinal"],
                tokens.input_tokens if tokens else None,
                tokens.output_tokens if tokens else None,
                tokens.total_chat_tokens if tokens else None,
                int(tokens.estimated) if tokens else 0,
            ),
        )
        self._connection.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))
        self._connection.commit()
        return True

    def get_last_message_ordinal(self, agent_id: str, chat_id: str, role: str | None = None) -> int | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        query = "SELECT ordinal FROM chat_messages WHERE chat_id = ?"
        params: list[object] = [chat_id]
        if role is not None:
            query += " AND role = ?"
            params.append(role)
        query += " ORDER BY ordinal DESC LIMIT 1"
        row = self._connection.execute(query, tuple(params)).fetchone()
        if row is None:
            return None
        return int(row["ordinal"])

    def update_last_user_message_tokens(self, agent_id: str, chat_id: str, tokens: TokenUsage) -> bool:
        if not self._chat_exists(agent_id, chat_id):
            return False
        row = self._connection.execute(
            """
            SELECT id FROM chat_messages
            WHERE chat_id = ? AND role = 'user'
            ORDER BY ordinal DESC
            LIMIT 1
            """,
            (chat_id,),
        ).fetchone()
        if row is None:
            return False
        self._connection.execute(
            """
            UPDATE chat_messages
            SET input_tokens = ?, output_tokens = ?, total_chat_tokens = ?, tokens_estimated = ?
            WHERE id = ?
            """,
            (tokens.input_tokens, tokens.output_tokens, tokens.total_chat_tokens, int(tokens.estimated), row["id"]),
        )
        self._connection.commit()
        return True

    def sum_chat_tokens(self, agent_id: str, chat_id: str) -> int | None:
        if not self._chat_exists(agent_id, chat_id):
            return None
        row = self._connection.execute(
            """
            SELECT COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) AS total
            FROM chat_messages
            WHERE chat_id = ?
            """,
            (chat_id,),
        ).fetchone()
        return int(row["total"])
