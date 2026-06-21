import type { Chat, ChatMessage } from '../types/agents';

export async function fetchChats(agentId: string) {
  const response = await fetch(`/api/agents/${agentId}/chats`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить чаты');
  }

  return (await response.json()) as { chats: Chat[] };
}

export async function fetchMessages(agentId: string, chatId: string) {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/messages`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить сообщения');
  }

  return (await response.json()) as { messages: ChatMessage[] };
}

export async function createChat(agentId: string) {
  const response = await fetch(`/api/agents/${agentId}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Новый чат' }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось создать чат');
  }

  return (await response.json()) as Chat;
}

export async function removeChat(agentId: string, chatId: string) {
  const response = await fetch(`/api/agents/${agentId}/chats/${chatId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Не удалось удалить чат');
  }
}
