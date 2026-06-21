import { FormEvent } from 'react';
import type { Agent, Chat, ChatMessage, Checkpoint, LongTermMemoryItem, WorkingMemoryItem } from '../../types/agents';
import { tokenSummary } from '../../utils/tokenUsage';
import { MemoryPanel } from '../memory/MemoryPanel';

type ChatWorkspaceProps = {
  selectedAgent: Agent | null;
  selectedChat: Chat | null;
  chats: Chat[];
  checkpoints: Checkpoint[];
  messages: ChatMessage[];
  workingMemory: WorkingMemoryItem[];
  longTermMemory: LongTermMemoryItem[];
  isLoading: boolean;
  isBranchingMode: boolean;
  isBranchesVisible: boolean;
  isMemoryPanelVisible: boolean;
  selectedChatId: string;
  memoryTab: 'working' | 'long_term';
  task: string;
  error: string | null;
  onSelectChat: (chat: Chat) => void;
  onCreateChat: () => void;
  onDeleteChat: () => void;
  onCreateCheckpoint: () => void;
  onCreateBranch: (checkpoint: Checkpoint) => void;
  onMemoryTabChange: (tab: 'working' | 'long_term') => void;
  onTaskChange: React.Dispatch<React.SetStateAction<string>>;
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
  onRunAgent: () => void;
  onStop: () => void;
};

export function ChatWorkspace({
  selectedAgent,
  selectedChat,
  chats,
  checkpoints,
  messages,
  workingMemory,
  longTermMemory,
  isLoading,
  isBranchingMode,
  isBranchesVisible,
  isMemoryPanelVisible,
  selectedChatId,
  memoryTab,
  task,
  error,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
  onCreateCheckpoint,
  onCreateBranch,
  onMemoryTabChange,
  onTaskChange,
  onCreateWorkingMemory,
  onDeleteWorkingMemory,
  onCreateLongTermMemory,
  onDeleteLongTermMemory,
  onRunAgent,
  onStop,
}: ChatWorkspaceProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onRunAgent();
  }

  return (
    <section className="editor">
      <div className="editor-tabs">
        <div className="editor-tab">
          <strong>{selectedChat ? selectedChat.title : 'chat.ts'}</strong>
          <small>{selectedAgent ? selectedAgent.name : 'Выберите агента'}{selectedChat ? ` · ${new Date(selectedChat.updated_at).toLocaleString('ru-RU')}` : ''}</small>
        </div>
        {selectedAgent && (
          <div className="toolbar-actions">
            <button type="button" onClick={onCreateChat}>Новый чат</button>
            {isBranchingMode && <button type="button" onClick={onCreateCheckpoint} disabled={!selectedChat || messages.length === 0}>Checkpoint</button>}
            {selectedChat && <button className="danger" type="button" onClick={onDeleteChat}>Удалить чат</button>}
          </div>
        )}
      </div>

      <div className="editor-body">
        <aside className="chat-sidebar">
          <div className="panel-title">
            <div>
              <h2>Chats</h2>
              <p>История и ветки текущего агента.</p>
            </div>
          </div>

          {selectedAgent && isBranchingMode && isBranchesVisible && (
            <div className="branching-panel">
              <details className="branching-block" open>
                <summary>
                  <span className="section-caption">Checkpoint-ы</span>
                </summary>
                <div className="branching-content">
                  {checkpoints.length === 0 ? (
                    <div className="empty">Пока нет контрольных точек. Сохраните ветку из текущего чата.</div>
                  ) : (
                    checkpoints.map((checkpoint) => (
                      <div className="list-item" key={checkpoint.id}>
                        <strong>{checkpoint.title}</strong>
                        <span className="list-meta">Checkpoint до #{checkpoint.source_message_ordinal}</span>
                        <span className="list-meta">{new Date(checkpoint.created_at).toLocaleString('ru-RU')}</span>
                        <div className="list-item-actions">
                          <span className="list-meta">Новая ветка из checkpoint</span>
                          <button type="button" onClick={() => onCreateBranch(checkpoint)}>Создать ветку</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </details>
            </div>
          )}

          <div className="chat-list scroll-area">
            {!selectedAgent ? (
              <div className="empty">Сначала создайте или выберите агента.</div>
            ) : chats.length === 0 ? (
              <div className="empty">У этого агента пока нет чатов. Создайте новый чат.</div>
            ) : (
              chats.map((chat) => (
                <button className={`list-item ${chat.id === selectedChatId ? 'active' : ''}`} key={chat.id} type="button" onClick={() => onSelectChat(chat)}>
                  <strong>{chat.title}</strong>
                  <span className="list-meta">
                    {chat.branched_from_ordinal ? `Ветка от #${chat.branched_from_ordinal} · ` : ''}
                    {new Date(chat.updated_at).toLocaleString('ru-RU')}
                  </span>
                  {chat.branch_title && <span className="list-meta">{chat.branch_title}</span>}
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="chat-main">
          {error && <div className="error" style={{ margin: '12px 12px 0' }}>{error}</div>}

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
                    <div className="message-head">
                      <span className="message-role">{message.role === 'user' ? 'Вы' : 'Агент'}</span>
                      <span className="message-meta">{isPendingAssistant ? 'streaming...' : message.role === 'user' ? 'input' : 'response'}</span>
                    </div>
                    <p>{isPendingAssistant ? 'Думаю...' : message.content}</p>
                    {usage && <small className="token-usage">{usage}</small>}
                  </article>
                );
              })
            )}
          </div>

          <div className="runner-shell">
            <form className="runner" onSubmit={handleSubmit}>
              <textarea
                aria-label="Задача"
                disabled={!selectedAgent || !selectedChat}
                placeholder="Опишите задачу для выбранного чата..."
                rows={3}
                value={task}
                onChange={(event) => onTaskChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              {isLoading ? (
                <button type="button" onClick={onStop}>Остановить</button>
              ) : (
                <button disabled={!task.trim() || !selectedAgent || !selectedChat} type="submit">Запустить</button>
              )}
            </form>
          </div>
        </div>

        {isMemoryPanelVisible && (
          <MemoryPanel
            selectedAgent={selectedAgent}
            selectedChat={selectedChat}
            workingMemory={workingMemory}
            longTermMemory={longTermMemory}
            activeTab={memoryTab}
            onTabChange={onMemoryTabChange}
            onCreateWorkingMemory={onCreateWorkingMemory}
            onDeleteWorkingMemory={onDeleteWorkingMemory}
            onCreateLongTermMemory={onCreateLongTermMemory}
            onDeleteLongTermMemory={onDeleteLongTermMemory}
          />
        )}
      </div>
    </section>
  );
}
