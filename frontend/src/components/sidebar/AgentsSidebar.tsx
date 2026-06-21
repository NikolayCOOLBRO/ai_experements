import { FormEvent } from 'react';
import type { Agent, AgentForm, AiModel } from '../../types/agents';
import { contextModeLabel, contextWindowHint } from '../../utils/contextMode';

type AgentsSidebarProps = {
  agents: Agent[];
  selectedAgentId: string;
  selectedAgent: Agent | null;
  models: AiModel[];
  selectedModel: AiModel | undefined;
  form: AgentForm;
  isEditing: boolean;
  onNewAgent: () => void;
  onSelectAgent: (agent: Agent) => void;
  onDeleteAgent: () => void;
  onSubmit: () => void;
  setForm: React.Dispatch<React.SetStateAction<AgentForm>>;
};

export function AgentsSidebar({
  agents,
  selectedAgentId,
  selectedAgent,
  models,
  selectedModel,
  form,
  isEditing,
  onNewAgent,
  onSelectAgent,
  onDeleteAgent,
  onSubmit,
  setForm,
}: AgentsSidebarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  return (
    <aside className="sidebar">
      <div className="panel-title">
        <div>
          <h2>Explorer</h2>
          <p>Агенты и их конфигурация.</p>
        </div>
        <button type="button" onClick={onNewAgent}>Новый</button>
      </div>

      <div className="agent-list scroll-area">
        {agents.length === 0 ? (
          <div className="empty">Пока нет агентов. Создайте первого, чтобы начать.</div>
        ) : (
          agents.map((agent) => (
            <button
              className={`list-item ${agent.id === selectedAgentId ? 'active' : ''}`}
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent)}
            >
              <strong>{agent.name}</strong>
              <span className="list-meta">{agent.parameters.model}</span>
              <span className="list-meta">{contextModeLabel(agent.parameters.context_mode)}</span>
            </button>
          ))
        )}
      </div>

      <form className="agent-form scroll-area" onSubmit={handleSubmit}>
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
            {selectedModel && <small className="helper-text">Максимум: {selectedModel.max_tokens.toLocaleString('ru-RU')} токенов. {selectedModel.token_hint}.</small>}
          </label>
          <label>
            Окно памяти
            <input min="1" max="200" type="number" value={form.contextWindow} onChange={(event) => setForm({ ...form, contextWindow: event.target.value })} />
            <small className="helper-text">{contextWindowHint(form.contextMode)}</small>
          </label>
          <label>
            Режим контекста
            <select value={form.contextMode} onChange={(event) => setForm({ ...form, contextMode: event.target.value as AgentForm['contextMode'] })}>
              <option value="full">Без сжатия</option>
              <option value="compressed">Со сжатием</option>
              <option value="sliding_window">Скользящее окно</option>
              <option value="sticky_facts">Sticky facts</option>
              <option value="branching">Ветки диалога</option>
            </select>
          </label>
          <label>
            Пачка summary
            <input min="1" max="100" type="number" value={form.summaryWindow} onChange={(event) => setForm({ ...form, summaryWindow: event.target.value })} />
            <small className="helper-text">Сколько старых сообщений сжимать за один LLM-вызов.</small>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">{isEditing ? 'Сохранить' : 'Создать агента'}</button>
          {selectedAgent && <button className="danger" type="button" onClick={onDeleteAgent}>Удалить</button>}
        </div>
      </form>
    </aside>
  );
}
