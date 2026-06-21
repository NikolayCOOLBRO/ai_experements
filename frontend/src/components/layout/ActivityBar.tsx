type ActivityBarProps = {
  isAgentsPanelVisible: boolean;
  isTraceVisible: boolean;
  isBranchesVisible: boolean;
  isBranchingMode: boolean;
  onToggleAgents: () => void;
  onToggleTrace: () => void;
  onToggleBranches: () => void;
};

export function ActivityBar({
  isAgentsPanelVisible,
  isTraceVisible,
  isBranchesVisible,
  isBranchingMode,
  onToggleAgents,
  onToggleTrace,
  onToggleBranches,
}: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="Navigation">
      <button className={`activity-button ${isAgentsPanelVisible ? 'active' : ''}`} type="button" onClick={onToggleAgents} title="Агенты">
        AG
      </button>
      <button className={`activity-button ${isTraceVisible ? 'active' : ''}`} type="button" onClick={onToggleTrace} title="Действия">
        TR
      </button>
      <button
        className={`activity-button ${isBranchesVisible ? 'active' : ''}`}
        disabled={!isBranchingMode}
        type="button"
        onClick={onToggleBranches}
        title="Ветки"
      >
        BR
      </button>
    </nav>
  );
}
