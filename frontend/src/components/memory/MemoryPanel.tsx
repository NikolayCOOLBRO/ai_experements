import { FormEvent, useState } from 'react';
import type { Agent, Chat, LongTermMemoryItem, WorkingMemoryItem } from '../../types/agents';

type MemoryPanelProps = {
  selectedAgent: Agent | null;
  selectedChat: Chat | null;
  workingMemory: WorkingMemoryItem[];
  longTermMemory: LongTermMemoryItem[];
  activeTab: 'working' | 'long_term';
  onTabChange: (tab: 'working' | 'long_term') => void;
  onCreateWorkingMemory: (payload: {
    key: string;
    value: string;
    tags: string[];
    task_tag?: string | null;
    reason: string;
    source_message_ordinal?: number | null;
  }) => Promise<void>;
  onDeleteWorkingMemory: (key: string) => Promise<void>;
  onCreateLongTermMemory: (payload: {
    category: 'goal' | 'constraints' | 'preferences' | 'decisions' | 'agreements' | 'entities';
    key: string;
    value: string;
    tags: string[];
    reason: string;
    source_chat_id?: string | null;
    source_message_ordinal?: number | null;
  }) => Promise<void>;
  onDeleteLongTermMemory: (itemId: string) => Promise<void>;
};

function parseTags(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function MemoryPanel({
  selectedAgent,
  selectedChat,
  workingMemory,
  longTermMemory,
  activeTab,
  onTabChange,
  onCreateWorkingMemory,
  onDeleteWorkingMemory,
  onCreateLongTermMemory,
  onDeleteLongTermMemory,
}: MemoryPanelProps) {
  const [workingForm, setWorkingForm] = useState({ key: '', value: '', tags: '', taskTag: '', reason: '', sourceMessageOrdinal: '' });
  const [longTermForm, setLongTermForm] = useState({ category: 'decisions' as const, key: '', value: '', tags: '', reason: '', sourceMessageOrdinal: '' });

  async function handleWorkingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateWorkingMemory({
      key: workingForm.key.trim(),
      value: workingForm.value.trim(),
      tags: parseTags(workingForm.tags),
      task_tag: workingForm.taskTag.trim() || null,
      reason: workingForm.reason.trim(),
      source_message_ordinal: workingForm.sourceMessageOrdinal.trim() ? Number(workingForm.sourceMessageOrdinal) : null,
    });
    setWorkingForm({ key: '', value: '', tags: '', taskTag: '', reason: '', sourceMessageOrdinal: '' });
  }

  async function handleLongTermSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateLongTermMemory({
      category: longTermForm.category,
      key: longTermForm.key.trim(),
      value: longTermForm.value.trim(),
      tags: parseTags(longTermForm.tags),
      reason: longTermForm.reason.trim(),
      source_chat_id: selectedChat?.id ?? null,
      source_message_ordinal: longTermForm.sourceMessageOrdinal.trim() ? Number(longTermForm.sourceMessageOrdinal) : null,
    });
    setLongTermForm({ category: 'decisions', key: '', value: '', tags: '', reason: '', sourceMessageOrdinal: '' });
  }

  return (
    <aside className="memory-panel">
      <div className="panel-title">
        <div>
          <h2>Memory</h2>
          <p>Явное управление рабочей и долговременной памятью.</p>
        </div>
      </div>

      <div className="memory-tabs">
        <button className={`memory-tab ${activeTab === 'working' ? 'active' : ''}`} type="button" onClick={() => onTabChange('working')}>
          Рабочая
        </button>
        <button className={`memory-tab ${activeTab === 'long_term' ? 'active' : ''}`} type="button" onClick={() => onTabChange('long_term')}>
          Долговременная
        </button>
      </div>

      <div className="memory-content scroll-area">
        {!selectedAgent ? (
          <div className="empty">Выберите агента, чтобы управлять памятью.</div>
        ) : activeTab === 'working' ? (
          <>
            {!selectedChat ? (
              <div className="empty">Выберите чат для работы с рабочей памятью.</div>
            ) : (
              <>
                <form className="memory-form" onSubmit={handleWorkingSubmit}>
                  <label>
                    Ключ
                    <input required value={workingForm.key} onChange={(event) => setWorkingForm({ ...workingForm, key: event.target.value })} />
                  </label>
                  <label>
                    Значение
                    <textarea required rows={3} value={workingForm.value} onChange={(event) => setWorkingForm({ ...workingForm, value: event.target.value })} />
                  </label>
                  <label>
                    Теги
                    <input placeholder="tag1, tag2" value={workingForm.tags} onChange={(event) => setWorkingForm({ ...workingForm, tags: event.target.value })} />
                  </label>
                  <label>
                    Тег задачи
                    <input value={workingForm.taskTag} onChange={(event) => setWorkingForm({ ...workingForm, taskTag: event.target.value })} />
                  </label>
                  <label>
                    Source ordinal
                    <input type="number" min="1" value={workingForm.sourceMessageOrdinal} onChange={(event) => setWorkingForm({ ...workingForm, sourceMessageOrdinal: event.target.value })} />
                  </label>
                  <label>
                    Причина записи
                    <textarea required rows={2} value={workingForm.reason} onChange={(event) => setWorkingForm({ ...workingForm, reason: event.target.value })} />
                  </label>
                  <button type="submit">Сохранить запись</button>
                </form>

                <div className="memory-list">
                  {workingMemory.length === 0 ? (
                    <div className="empty">Рабочая память пока пуста.</div>
                  ) : (
                    workingMemory.map((item) => (
                      <article className="memory-card" key={item.key}>
                        <div className="memory-card-head">
                          <strong>{item.key}</strong>
                          <button className="danger" type="button" onClick={() => void onDeleteWorkingMemory(item.key)}>
                            Удалить
                          </button>
                        </div>
                        <p>{item.value}</p>
                        <small className="list-meta">
                          {item.task_tag ? `task=${item.task_tag} · ` : ''}
                          {item.tags.length > 0 ? `tags=${item.tags.join(', ')} · ` : ''}
                          {new Date(item.updated_at).toLocaleString('ru-RU')}
                        </small>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <form className="memory-form" onSubmit={handleLongTermSubmit}>
              <label>
                Категория
                <select value={longTermForm.category} onChange={(event) => setLongTermForm({ ...longTermForm, category: event.target.value as typeof longTermForm.category })}>
                  <option value="goal">goal</option>
                  <option value="constraints">constraints</option>
                  <option value="preferences">preferences</option>
                  <option value="decisions">decisions</option>
                  <option value="agreements">agreements</option>
                  <option value="entities">entities</option>
                </select>
              </label>
              <label>
                Ключ
                <input required value={longTermForm.key} onChange={(event) => setLongTermForm({ ...longTermForm, key: event.target.value })} />
              </label>
              <label>
                Значение
                <textarea required rows={3} value={longTermForm.value} onChange={(event) => setLongTermForm({ ...longTermForm, value: event.target.value })} />
              </label>
              <label>
                Теги
                <input placeholder="tag1, tag2" value={longTermForm.tags} onChange={(event) => setLongTermForm({ ...longTermForm, tags: event.target.value })} />
              </label>
              <label>
                Source ordinal
                <input type="number" min="1" value={longTermForm.sourceMessageOrdinal} onChange={(event) => setLongTermForm({ ...longTermForm, sourceMessageOrdinal: event.target.value })} />
              </label>
              <label>
                Причина записи
                <textarea required rows={2} value={longTermForm.reason} onChange={(event) => setLongTermForm({ ...longTermForm, reason: event.target.value })} />
              </label>
              <button type="submit">Сохранить запись</button>
            </form>

            <div className="memory-list">
              {longTermMemory.length === 0 ? (
                <div className="empty">Долговременная память пока пуста.</div>
              ) : (
                longTermMemory.map((item) => (
                  <article className="memory-card" key={item.id}>
                    <div className="memory-card-head">
                      <strong>{item.category}.{item.key}</strong>
                      <button className="danger" type="button" onClick={() => void onDeleteLongTermMemory(item.id)}>
                        Удалить
                      </button>
                    </div>
                    <p>{item.value}</p>
                    <small className="list-meta">
                      {item.tags.length > 0 ? `tags=${item.tags.join(', ')} · ` : ''}
                      {new Date(item.updated_at).toLocaleString('ru-RU')}
                    </small>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
