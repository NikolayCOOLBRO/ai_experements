import type { AgentRunTrace } from '../types/agents';

export async function fetchTraces(agentId: string, chatId: string) {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/traces`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить действия агента');
  }

  return (await response.json()) as { traces: AgentRunTrace[] };
}
