import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from schemas import Agent, AgentCreate, Chat, ChatCreate, ChatMessage


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
                context_window INTEGER
            );

            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
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
            """
        )
        self._connection.commit()

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
                id, name, context, planning, model, temperature, top_p, top_k, max_output_tokens, context_window
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                max_output_tokens = ?, context_window = ?
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
            "SELECT role, content FROM chat_messages WHERE chat_id = ? ORDER BY ordinal ASC",
            (chat_id,),
        ).fetchall()
        return [ChatMessage(role=row["role"], content=row["content"]) for row in rows]

    def append_message(self, agent_id: str, chat_id: str, message: ChatMessage) -> bool:
        if not self._chat_exists(agent_id, chat_id):
            return False
        next_ordinal_row = self._connection.execute(
            "SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal FROM chat_messages WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        now = self._now()
        self._connection.execute(
            "INSERT INTO chat_messages (id, chat_id, role, content, created_at, ordinal) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid4()), chat_id, message.role, message.content, now, next_ordinal_row["next_ordinal"]),
        )
        self._connection.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))
        self._connection.commit()
        return True
