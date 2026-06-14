import { FormEvent, useEffect, useRef, useState } from 'react';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AiModel = {
  id: string;
  label: string;
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

export default function App() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [task, setTask] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

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

  async function loadMemory(agentId: string) {
    const response = await fetch(`/api/agents/${agentId}/memory`);
    if (!response.ok) {
      throw new Error('Не удалось загрузить память агента');
    }

    const data = (await response.json()) as { messages: ChatMessage[] };
    setMessages(data.messages);
  }

  async function handleSelectAgent(agent: Agent) {
    if (isLoading) {
      return;
    }

    setSelectedAgentId(agent.id);
    setForm(formFromAgent(agent));
    setIsEditing(true);
    setError(null);

    try {
      await loadMemory(agent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить память агента');
    }
  }

  function handleNewAgent() {
    if (isLoading) {
      return;
    }

    setSelectedAgentId('');
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
      setForm(formFromAgent(savedAgent));
      setIsEditing(true);
      await loadMemory(savedAgent.id);
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

  async function handleClearMemory() {
    if (!selectedAgentId || isLoading) {
      return;
    }

    try {
      const response = await fetch(`/api/agents/${selectedAgentId}/memory`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Не удалось очистить память');
      }
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось очистить память');
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  async function handleRunAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = task.trim();
    if (!text || !selectedAgentId || isLoading) {
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
      const response = await fetch(`/api/agents/${selectedAgentId}/run/stream`, {
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
      if (selectedAgentId) {
        try {
          await loadMemory(selectedAgentId);
        } catch {
          // UI already has the streamed response; memory refresh is best-effort.
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
                    <option key={model.id} value={model.id}>{model.label}</option>
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
                <input min="1" max="32000" type="number" value={form.maxOutputTokens} onChange={(event) => setForm({ ...form, maxOutputTokens: event.target.value })} />
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
              <p>{selectedAgent ? 'Опишите задачу, агент использует свой контекст, план и память.' : 'Сначала создайте или выберите агента.'}</p>
            </div>
            {selectedAgent && <button type="button" onClick={handleClearMemory}>Очистить память</button>}
          </div>

          {error && <div className="error">{error}</div>}

          <div className="messages" aria-live="polite">
            {!selectedAgent ? (
              <div className="empty">Создайте агента слева, затем выберите его для решения задачи.</div>
            ) : messages.length === 0 ? (
              <div className="empty">Память агента пуста. Отправьте первую задачу.</div>
            ) : (
              messages.map((message, index) => {
                const isPendingAssistant = isLoading && index === messages.length - 1 && message.role === 'assistant' && !message.content;
                return (
                  <article className={`message ${message.role}${isPendingAssistant ? ' pending' : ''}`} key={`${message.role}-${index}`}>
                    <span>{message.role === 'user' ? 'Вы' : 'Агент'}</span>
                    <p>{isPendingAssistant ? 'Думаю...' : message.content}</p>
                  </article>
                );
              })
            )}
          </div>

          <form className="runner" onSubmit={handleRunAgent}>
            <textarea
              aria-label="Задача"
              disabled={!selectedAgent}
              placeholder="Опишите задачу для выбранного агента..."
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
              <button disabled={!task.trim() || !selectedAgent} type="submit">Запустить</button>
            )}
          </form>
        </section>
      </section>
    </main>
  );
}
