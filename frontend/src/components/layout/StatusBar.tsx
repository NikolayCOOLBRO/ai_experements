import type { Agent, Chat } from '../../types/agents';
import { contextModeLabel } from '../../utils/contextMode';

type StatusBarProps = {
  selectedAgent: Agent | null;
  selectedChat: Chat | null;
  isLoading: boolean;
  error: string | null;
};

export function StatusBar({ selectedAgent, selectedChat, isLoading, error }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span><strong>Агент:</strong> {selectedAgent?.name ?? 'не выбран'}</span>
      <span><strong>Чат:</strong> {selectedChat?.title ?? 'не выбран'}</span>
      <span><strong>Режим:</strong> {selectedAgent ? contextModeLabel(selectedAgent.parameters.context_mode) : 'не выбран'}</span>
      <span><strong>Состояние:</strong> {isLoading ? 'выполняется' : error ? 'ошибка' : 'готово'}</span>
    </footer>
  );
}
