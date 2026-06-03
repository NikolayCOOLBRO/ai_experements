import { FormEvent, useState } from 'react';

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

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isLoading) {
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { message: ChatMessage };
      setMessages((current) => [...current, data.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить ответ');
    } finally {
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
          {messages.map((message, index) => (
            <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === 'user' ? 'Вы' : 'AI'}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {isLoading && (
            <article className="message assistant pending">
              <span>AI</span>
              <p>Думаю...</p>
            </article>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <form className="composer" onSubmit={handleSubmit}>
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
          <button disabled={isLoading || !input.trim()} type="submit">
            {isLoading ? 'Отправка...' : 'Отправить'}
          </button>
        </form>
      </section>
    </main>
  );
}
