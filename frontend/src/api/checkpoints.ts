import type { Chat, Checkpoint } from '../types/agents';

export async function fetchCheckpoints(agentId: string) {
  const response = await fetch(`/api/agents/${agentId}/checkpoints`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить контрольные точки');
  }

  return (await response.json()) as { checkpoints: Checkpoint[] };
}

export async function createCheckpoint(agentId: string, chatId: string, title: string) {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/checkpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось сохранить контрольную точку');
  }

  return (await response.json()) as Checkpoint;
}

export async function createBranch(agentId: string, checkpointId: string, title: string) {
  const response = await fetch(`/api/agents/${agentId}/checkpoints/${checkpointId}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось создать ветку');
  }

  return (await response.json()) as Chat;
}
