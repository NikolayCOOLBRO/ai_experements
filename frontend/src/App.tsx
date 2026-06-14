import { FormEvent, useEffect, useRef, useState } from 'react';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  tokens?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_chat_tokens?: number | null;
    estimated?: boolean;
  } | null;
};

type AiModel = {
  id: string;
  label: string;
  max_tokens: number;
  token_hint: string;
};

type ModelsResponse = {
  models: AiModel[];
  default_model: string;
};

type AgentParameters = {
  model: string;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  max_output_tokens?: number | null;
  context_window?: number | null;
};

type Agent = {
  id: string;
  name: string;
  context: string;
  planning: string;
  parameters: AgentParameters;
};

type Chat = {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type AgentForm = {
  name: string;
  context: string;
  planning: string;
  model: string;
  temperature: string;
  topP: string;
  topK: string;
  maxOutputTokens: string;
  contextWindow: string;
};

type SseEvent = {
  event: string;
  data: string;
};

const emptyForm: AgentForm = {
  name: '',
  context: '',
  planning: '',
  model: '',
  temperature: '1',
  topP: '',
  topK: '',
  maxOutputTokens: '1024',
  contextWindow: '20',
};

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

function numericValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formFromAgent(agent: Agent): AgentForm {
  return {
    name: agent.name,
    context: agent.context,
    planning: agent.planning,
    model: agent.parameters.model,
    temperature: String(agent.parameters.temperature ?? ''),
    topP: String(agent.parameters.top_p ?? ''),
    topK: String(agent.parameters.top_k ?? ''),
    maxOutputTokens: String(agent.parameters.max_output_tokens ?? ''),
    contextWindow: String(agent.parameters.context_window ?? ''),
  };
}

function buildAgentPayload(form: AgentForm) {
  return {
    name: form.name.trim(),
    context: form.context.trim(),
    planning: form.planning.trim(),
    parameters: {
      model: form.model,
      temperature: numericValue(form.temperature),
      top_p: numericValue(form.topP),
      top_k: numericValue(form.topK),
      max_output_tokens: numericValue(form.maxOutputTokens),
      context_window: numericValue(form.contextWindow),
    },
  };
}

function formatTokens(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : null;
}

function tokenSummary(message: ChatMessage) {
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

export default function App() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [task, setTask] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedModel = models.find((model) => model.id === form.model);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [modelsResponse, agentsResponse] = await Promise.all([fetch('/api/models'), fetch('/api/agents')]);
        if (!modelsResponse.ok) {
          throw new Error('Не удалось загрузить список моделей');
        }
        if (!agentsResponse.ok) {
          throw new Error('Не удалось загрузить список агентов');
        }

        const modelsData = (await modelsResponse.json()) as ModelsResponse;
        const agentsData = (await agentsResponse.json()) as { agents: Agent[] };
        setModels(modelsData.models);
        setAgents(agentsData.agents);
        setForm((current) => ({ ...current, model: modelsData.default_model || modelsData.models[0]?.id || '' }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    const currentMaxOutputTokens = numericValue(form.maxOutputTokens);
    if (currentMaxOutputTokens === null || currentMaxOutputTokens <= selectedModel.max_tokens) {
      return;
    }

    setForm((current) => ({
      ...current,
      maxOutputTokens: String(selectedModel.max_tokens),
    }));
  }, [form.maxOutputTokens, selectedModel]);

  async function loadChats(agentId: string) {
    const response = await fetch(`/api/agents/${agentId}/chats`);
    if (!response.ok) {
      throw new Error('Не удалось загрузить чаты');
    }

    const data = (await response.json()) as { chats: Chat[] };
    setChats(data.chats);
    return data.chats;
  }

  async function loadMessages(agentId: string, chatId: string) {
    const response = await fetch(`/api/agents/${agentId}/chats/${chatId}/messages`);
    if (!response.ok) {
      throw new Error('Не удалось загрузить сообщения');
    }

    const data = (await response.json()) as { messages: ChatMessage[] };
    setMessages(data.messages);
  }

  async function handleSelectChat(chat: Chat) {
    if (isLoading || !selectedAgentId) {
      return;
    }

    setSelectedChatId(chat.id);
    setError(null);

    try {
      await loadMessages(selectedAgentId, chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сообщения');
    }
  }

  async function handleSelectAgent(agent: Agent) {
    if (isLoading) {
      return;
    }

    setSelectedAgentId(agent.id);
    setSelectedChatId('');
    setChats([]);
    setForm(formFromAgent(agent));
    setIsEditing(true);
    setError(null);
    setMessages([]);

    try {
      const nextChats = await loadChats(agent.id);
      if (nextChats.length > 0) {
        setSelectedChatId(nextChats[0].id);
        await loadMessages(agent.id, nextChats[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить чаты агента');
    }
  }

  function handleNewAgent() {
    if (isLoading) {
      return;
    }

    setSelectedAgentId('');
    setSelectedChatId('');
    setChats([]);
    setMessages([]);
    setIsEditing(false);
    setError(null);
    setForm({ ...emptyForm, model: models[0]?.id || '' });
  }

  async function handleSaveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload = buildAgentPayload(form);
    const url = isEditing && selectedAgentId ? `/api/agents/${selectedAgentId}` : '/api/agents';
    const method = isEditing && selectedAgentId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || 'Не удалось сохранить агента');
      }

      const savedAgent = (await response.json()) as Agent;
      setAgents((current) => {
        const exists = current.some((agent) => agent.id === savedAgent.id);
        return exists ? current.map((agent) => (agent.id === savedAgent.id ? savedAgent : agent)) : [...current, savedAgent];
      });
      setSelectedAgentId(savedAgent.id);
      setSelectedChatId('');
      setChats([]);
      setForm(formFromAgent(savedAgent));
      setIsEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить агента');
    }
  }

  async function handleDeleteAgent() {
    if (!selectedAgentId || isLoading) {
      return;
    }

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Не удалось удалить агента');
      }

      setAgents((current) => current.filter((agent) => agent.id !== selectedAgentId));
      handleNewAgent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить агента');
    }
  }

  async function handleDeleteChat() {
    if (!selectedAgentId || !selectedChatId || isLoading) {
      return;
    }

    if (!window.confirm('Удалить этот чат без возможности восстановления?')) {
      return;
    }

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/chats/${selectedChatId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Не удалось удалить чат');
      }

      const nextChats = chats.filter((chat) => chat.id !== selectedChatId);
      setChats(nextChats);

      if (nextChats.length === 0) {
        setSelectedChatId('');
        setMessages([]);
      } else {
        setSelectedChatId(nextChats[0].id);
        await loadMessages(selectedAgentId, nextChats[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить чат');
    }
  }

  async function handleCreateChat() {
    if (!selectedAgentId || isLoading) {
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Новый чат' }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || 'Не удалось создать чат');
      }

      const chat = (await response.json()) as Chat;
      setChats((current) => [chat, ...current]);
      setSelectedChatId(chat.id);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать чат');
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  async function handleRunAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
          await loadMessages(selectedAgentId, selectedChatId);
          const nextChats = await loadChats(selectedAgentId);
          setChats(nextChats);
        } catch {
          // UI already has the streamed response; refresh is best-effort.
        }
      }
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Agent Workspace</p>
          <h1>Рабочая среда агентов</h1>
        </div>
        <span className="status">Backend memory</span>
      </header>

      <section className="workspace">
        <aside className="panel agents-panel">
          <div className="panel-head">
            <div>
              <h2>Агенты</h2>
              <p>Создайте агента, задайте контекст, план и параметры LLM.</p>
            </div>
            <button type="button" onClick={handleNewAgent}>Новый</button>
          </div>

          <div className="agent-list">
            {agents.length === 0 ? (
              <div className="empty">Пока нет агентов. Создайте первого, чтобы начать.</div>
            ) : (
              agents.map((agent) => (
                <button
                  className={`agent-card ${agent.id === selectedAgentId ? 'active' : ''}`}
                  key={agent.id}
                  type="button"
                  onClick={() => handleSelectAgent(agent)}
                >
                  <strong>{agent.name}</strong>
                  <span>{agent.parameters.model}</span>
                </button>
              ))
            )}
          </div>

          <form className="agent-form" onSubmit={handleSaveAgent}>
            <label>
              Название
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Контекст
              <textarea
                rows={5}
                value={form.context}
                onChange={(event) => setForm({ ...form, context: event.target.value })}
                placeholder="Зачем нужен агент и какие задачи он решает"
                required
              />
            </label>
            <label>
              Планирование
              <textarea
                rows={5}
                value={form.planning}
                onChange={(event) => setForm({ ...form, planning: event.target.value })}
                placeholder="Какие шаги агент должен выполнять для решения задачи"
                required
              />
            </label>
            <div className="params-grid">
              <label>
                LLM
                <select value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} required>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>{model.label} · до {model.max_tokens.toLocaleString('ru-RU')} токенов</option>
                  ))}
                </select>
              </label>
              <label>
                Temperature
                <input min="0" max="2" step="0.1" type="number" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: event.target.value })} />
              </label>
              <label>
                Top P
                <input min="0" max="1" step="0.05" type="number" value={form.topP} onChange={(event) => setForm({ ...form, topP: event.target.value })} />
              </label>
              <label>
                Top K
                <input min="1" type="number" value={form.topK} onChange={(event) => setForm({ ...form, topK: event.target.value })} />
              </label>
              <label>
                Max tokens
                <input min="1" max={selectedModel?.max_tokens ?? 393216} type="number" value={form.maxOutputTokens} onChange={(event) => setForm({ ...form, maxOutputTokens: event.target.value })} />
                {selectedModel && (
                  <small>Максимум: {selectedModel.max_tokens.toLocaleString('ru-RU')} токенов. {selectedModel.token_hint}.</small>
                )}
              </label>
              <label>
                Окно памяти
                <input min="1" max="200" type="number" value={form.contextWindow} onChange={(event) => setForm({ ...form, contextWindow: event.target.value })} />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit">{isEditing ? 'Сохранить' : 'Создать агента'}</button>
              {selectedAgent && <button className="danger" type="button" onClick={handleDeleteAgent}>Удалить</button>}
            </div>
          </form>
        </aside>

        <section className="panel chat-panel">
          <div className="panel-head">
            <div>
              <h2>{selectedAgent ? selectedAgent.name : 'Задача для агента'}</h2>
              <p>{selectedAgent ? 'Выберите чат, затем опишите задачу. Агент использует свой контекст, план и историю чата.' : 'Сначала создайте или выберите агента.'}</p>
            </div>
            {selectedAgent && (
              <div className="form-actions">
                <button type="button" onClick={handleCreateChat}>Новый чат</button>
                {selectedChat && <button className="danger" type="button" onClick={handleDeleteChat}>Удалить чат</button>}
              </div>
            )}
          </div>

          {error && <div className="error">{error}</div>}

          {selectedAgent && (
            <div className="agent-list">
              {chats.length === 0 ? (
                <div className="empty">У этого агента пока нет чатов. Создайте новый чат.</div>
              ) : (
                chats.map((chat) => (
                  <button
                    className={`agent-card ${chat.id === selectedChatId ? 'active' : ''}`}
                    key={chat.id}
                    type="button"
                    onClick={() => handleSelectChat(chat)}
                  >
                    <strong>{chat.title}</strong>
                    <span>{new Date(chat.updated_at).toLocaleString('ru-RU')}</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="messages" aria-live="polite">
            {!selectedAgent ? (
              <div className="empty">Создайте агента слева, затем выберите его для решения задачи.</div>
            ) : !selectedChat ? (
              <div className="empty">Выберите существующий чат или создайте новый.</div>
            ) : messages.length === 0 ? (
              <div className="empty">Чат пуст. Отправьте первое сообщение.</div>
            ) : (
              messages.map((message, index) => {
                const isPendingAssistant = isLoading && index === messages.length - 1 && message.role === 'assistant' && !message.content;
                const usage = tokenSummary(message);
                return (
                  <article className={`message ${message.role}${isPendingAssistant ? ' pending' : ''}`} key={`${message.role}-${index}`}>
                    <span>{message.role === 'user' ? 'Вы' : 'Агент'}</span>
                    <p>{isPendingAssistant ? 'Думаю...' : message.content}</p>
                    {usage && <small className="token-usage">{usage}</small>}
                  </article>
                );
              })
            )}
          </div>

          <form className="runner" onSubmit={handleRunAgent}>
            <textarea
              aria-label="Задача"
              disabled={!selectedAgent || !selectedChat}
              placeholder="Опишите задачу для выбранного чата..."
              rows={3}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {isLoading ? (
              <button type="button" onClick={handleStop}>Остановить</button>
            ) : (
              <button disabled={!task.trim() || !selectedAgent || !selectedChat} type="submit">Запустить</button>
            )}
          </form>
        </section>
      </section>
    </main>
  );
}
