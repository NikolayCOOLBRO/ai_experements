import { FormEvent, useRef, useState } from 'react';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const initialMessages: ChatMessage[] = [
  {
    role: 'assistant',
    content: 'Привет! Напиши вопрос, и я отправлю его в подключенную LLM.',
  },
];

type SseEvent = {
  event: string;
  data: string;
};

type ResponseFormat = 'free' | 'json' | 'md-list' | 'md-table';

function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const chunks = normalized.split('\n\n');
  const rest = chunks.pop() ?? '';
  const events = chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message';
    const data = lines
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');

    return { event, data };
  });

  return { events, rest };
}

function removeEmptyMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.content.trim());
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>('free');
  const [maxOutputTokens, setMaxOutputTokens] = useState('1024');
  const [temperature, setTemperature] = useState('1');
  const [stopSequences, setStopSequences] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isLoading) {
      return;
    }

    const currentMessages = removeEmptyMessages(messages);
    const visibleMessages: ChatMessage[] = [...currentMessages, { role: 'user', content: text }];

    setMessages(visibleMessages);
    setInput('');
    setError(null);
    setIsLoading(true);
    const assistantIndex = visibleMessages.length;
    setMessages([...visibleMessages, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const parsedMaxOutputTokens = Number(maxOutputTokens);
    const parsedTemperature = Number(temperature);
    const stop = stopSequences
      .split('\n')
      .map((sequence) => sequence.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: visibleMessages,
          response_format: responseFormat,
          max_output_tokens: Number.isFinite(parsedMaxOutputTokens) && parsedMaxOutputTokens > 0 ? parsedMaxOutputTokens : undefined,
          temperature:
            Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2 ? parsedTemperature : undefined,
          stop: stop.length ? stop : undefined,
        }),
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

        for (const event of parsed.events) {
          const data = event.data ? JSON.parse(event.data) : {};

          if (event.event === 'delta') {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex ? { ...message, content: message.content + data.text } : message,
              ),
            );
          }

          if (event.event === 'error') {
            throw new Error(data.message || 'Ошибка streaming ответа');
          }
        }

        if (done) {
          break;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((current) => removeEmptyMessages(current));
        return;
      }

      setMessages((current) => removeEmptyMessages(current));
      setError(err instanceof Error ? err.message : 'Не удалось получить ответ');
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="chat-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">OpenAI-compatible HTTP API</p>
            <h1>Простой чат с AI</h1>
          </div>
          <span className="status">Local frontend</span>
        </header>

        <div className="messages" aria-live="polite">
          {messages.map((message, index) => {
            const isPendingAssistant = isLoading && index === messages.length - 1 && message.role === 'assistant' && !message.content;

            return (
            <article className={`message ${message.role}${isPendingAssistant ? ' pending' : ''}`} key={`${message.role}-${index}`}>
              <span>{message.role === 'user' ? 'Вы' : 'AI'}</span>
              <p>{isPendingAssistant ? 'Думаю...' : message.content}</p>
            </article>
            );
          })}
        </div>

        {error && <div className="error">{error}</div>}

        <form className="composer" onSubmit={handleSubmit}>
          <div className="settings">
            <label>
              Max tokens
              <input
                min="1"
                max="32000"
                type="number"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
              />
            </label>
            <label>
              Temperature
              <input
                min="0"
                max="2"
                step="0.1"
                type="number"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
            </label>
            <label>
              Формат ответа
              <select value={responseFormat} onChange={(event) => setResponseFormat(event.target.value as ResponseFormat)}>
                <option value="free">Свободный</option>
                <option value="json">JSON</option>
                <option value="md-list">Markdown список</option>
                <option value="md-table">Markdown таблица</option>
              </select>
            </label>
            <label>
              Stop sequence
              <textarea
                aria-label="Stop sequence"
                placeholder="Одна sequence на строку"
                rows={2}
                value={stopSequences}
                onChange={(event) => setStopSequences(event.target.value)}
              />
            </label>
          </div>
          <textarea
            aria-label="Сообщение"
            placeholder="Введите сообщение..."
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {isLoading ? (
            <button type="button" onClick={handleStop}>
              Остановить
            </button>
          ) : (
            <button disabled={!input.trim()} type="submit">
              Отправить
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
