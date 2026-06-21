import type { Agent, Chat } from '../../types/agents';
import { contextModeLabel } from '../../utils/contextMode';

type TitleBarProps = {
  selectedAgent: Agent | null;
  selectedChat: Chat | null;
};

export function TitleBar({ selectedAgent, selectedChat }: TitleBarProps) {
  return (
    <header className="title-bar">
      <div className="title-bar-main">
        <span className="title-bar-badge">Workspace</span>
        <div className="title-bar-copy">
          <h1>Рабочая среда агентов</h1>
          <p>{selectedAgent ? `${selectedAgent.name} · ${selectedAgent.parameters.model}` : 'Выберите или создайте агента'}</p>
        </div>
      </div>
      <div className="title-bar-meta">
        <span className="meta-pill">Контекст: {selectedAgent ? contextModeLabel(selectedAgent.parameters.context_mode) : 'не выбран'}</span>
        <span className="meta-pill">Чат: {selectedChat ? selectedChat.title : 'не выбран'}</span>
        <span className="status-pill">Backend memory</span>
      </div>
    </header>
  );
}
