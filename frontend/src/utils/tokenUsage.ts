import type { ChatMessage } from '../types/agents';

function formatTokens(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : null;
}

export function tokenSummary(message: ChatMessage) {
  if (!message.tokens) {
    return null;
  }

  const parts: string[] = [];
  const inputTokens = formatTokens(message.tokens.input_tokens);
  const outputTokens = formatTokens(message.tokens.output_tokens);
  const totalChatTokens = formatTokens(message.tokens.total_chat_tokens);

  if (inputTokens) {
    parts.push(`Вход: ${inputTokens}`);
  }
  if (outputTokens) {
    parts.push(`Ответ: ${outputTokens}`);
  }
  if (totalChatTokens) {
    parts.push(`Всего в чате: ${totalChatTokens}`);
  }
  if (message.tokens.estimated) {
    parts.push('примерно');
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
