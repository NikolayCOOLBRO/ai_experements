import type { LongTermMemoryItem, MemoryWriteRecord, WorkingMemoryItem } from '../types/agents';

type WorkingMemoryResponse = { items: WorkingMemoryItem[] };
type LongTermMemoryResponse = { items: LongTermMemoryItem[] };
type MemoryWritesResponse = { writes: MemoryWriteRecord[] };

export async function fetchWorkingMemory(agentId: string, chatId: string): Promise<WorkingMemoryItem[]> {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/memory/working`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить рабочую память');
  }
  const data = (await response.json()) as WorkingMemoryResponse;
  return data.items;
}

export async function fetchLongTermMemory(agentId: string): Promise<LongTermMemoryItem[]> {
  const response = await fetch(`/api/agents/${agentId}/memory/long-term`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить долговременную память');
  }
  const data = (await response.json()) as LongTermMemoryResponse;
  return data.items;
}

export async function fetchMemoryWrites(agentId: string, chatId?: string): Promise<MemoryWriteRecord[]> {
  const url = chatId ? `/api/agents/${agentId}/memory/writes?chat_id=${chatId}` : `/api/agents/${agentId}/memory/writes`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Не удалось загрузить журнал памяти');
  }
  const data = (await response.json()) as MemoryWritesResponse;
  return data.writes;
}

export async function createWorkingMemory(
  agentId: string,
  chatId: string,
  payload: {
    key: string;
    value: string;
    tags: string[];
    task_tag?: string | null;
    reason: string;
    source_message_ordinal?: number | null;
  },
): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/memory/working`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось сохранить рабочую память');
  }
}

export async function deleteWorkingMemory(agentId: string, chatId: string, key: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/memory/working/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось удалить запись рабочей памяти');
  }
}

export async function createLongTermMemory(
  agentId: string,
  payload: {
    category: 'goal' | 'constraints' | 'preferences' | 'decisions' | 'agreements' | 'entities';
    key: string;
    value: string;
    tags: string[];
    reason: string;
    source_chat_id?: string | null;
    source_message_ordinal?: number | null;
  },
): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/memory/long-term`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось сохранить долговременную память');
  }
}

export async function deleteLongTermMemory(agentId: string, itemId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/memory/long-term/${itemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось удалить запись долговременной памяти');
  }
}
