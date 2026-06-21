import { useRef } from 'react';
import type { ChatMessage } from '../types/agents';
import { parseSseEvents } from '../utils/sse';

type UseAgentRunnerArgs = {
  messages: ChatMessage[];
  selectedAgentId: string;
  selectedChatId: string;
  isLoading: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setTask: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  refreshChatData: (agentId: string, chatId: string) => Promise<void>;
  refreshChats: (agentId: string) => Promise<void>;
};

export function useAgentRunner({
  messages,
  selectedAgentId,
  selectedChatId,
  isLoading,
  setMessages,
  setTask,
  setError,
  setIsLoading,
  refreshChatData,
  refreshChats,
}: UseAgentRunnerArgs) {
  const abortControllerRef = useRef<AbortController | null>(null);

  function stop() {
    abortControllerRef.current?.abort();
  }

  async function runAgent(task: string) {
    const text = task.trim();
    if (!text || !selectedAgentId || !selectedChatId || isLoading) {
      return;
    }

    const visibleMessages: ChatMessage[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    const assistantIndex = visibleMessages.length - 1;
    setMessages(visibleMessages);
    setTask('');
    setError(null);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/chats/${selectedChatId}/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Сервер не вернул поток данных');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const parsed = parseSseEvents(buffer);
        buffer = parsed.rest;

        for (const eventItem of parsed.events) {
          const data = eventItem.data ? JSON.parse(eventItem.data) : {};

          if (eventItem.event === 'delta') {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex ? { ...message, content: message.content + data.text } : message,
              ),
            );
          }

          if (eventItem.event === 'done' && data.usage) {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex ? { ...message, tokens: data.usage } : message,
              ),
            );
          }

          if (eventItem.event === 'error') {
            throw new Error(data.message || 'Ошибка streaming ответа');
          }
        }

        if (done) {
          break;
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Не удалось получить ответ');
      }
      setMessages((current) => current.filter((message) => message.content.trim()));
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      if (selectedAgentId && selectedChatId) {
        try {
          await refreshChatData(selectedAgentId, selectedChatId);
          await refreshChats(selectedAgentId);
        } catch {
          // UI already has the streamed response; refresh is best-effort.
        }
      }
    }
  }

  return {
    runAgent,
    stop,
  };
}
