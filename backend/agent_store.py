from uuid import uuid4

from schemas import Agent, AgentCreate, ChatMessage


class AgentStore:
    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._memory: dict[str, list[ChatMessage]] = {}

    def list_agents(self) -> list[Agent]:
        return list(self._agents.values())

    def create_agent(self, payload: AgentCreate) -> Agent:
        agent = Agent(id=str(uuid4()), **payload.model_dump())
        self._agents[agent.id] = agent
        self._memory[agent.id] = []
        return agent

    def get_agent(self, agent_id: str) -> Agent | None:
        return self._agents.get(agent_id)

    def update_agent(self, agent_id: str, payload: AgentCreate) -> Agent | None:
        if agent_id not in self._agents:
            return None

        agent = Agent(id=agent_id, **payload.model_dump())
        self._agents[agent_id] = agent
        self._memory.setdefault(agent_id, [])
        return agent

    def delete_agent(self, agent_id: str) -> bool:
        existed = self._agents.pop(agent_id, None) is not None
        self._memory.pop(agent_id, None)
        return existed

    def get_memory(self, agent_id: str) -> list[ChatMessage] | None:
        if agent_id not in self._agents:
            return None
        return list(self._memory.setdefault(agent_id, []))

    def clear_memory(self, agent_id: str) -> bool:
        if agent_id not in self._agents:
            return False
        self._memory[agent_id] = []
        return True

    def append_memory(self, agent_id: str, message: ChatMessage) -> None:
        self._memory.setdefault(agent_id, []).append(message)
