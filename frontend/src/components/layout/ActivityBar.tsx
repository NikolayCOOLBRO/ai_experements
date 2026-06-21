type ActivityBarProps = {
  isAgentsPanelVisible: boolean;
  isTraceVisible: boolean;
  isMemoryPanelVisible: boolean;
  isBranchesVisible: boolean;
  isBranchingMode: boolean;
  onToggleAgents: () => void;
  onToggleTrace: () => void;
  onToggleMemory: () => void;
  onToggleBranches: () => void;
};

export function ActivityBar({
  isAgentsPanelVisible,
  isTraceVisible,
  isMemoryPanelVisible,
  isBranchesVisible,
  isBranchingMode,
  onToggleAgents,
  onToggleTrace,
  onToggleMemory,
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
      <button className={`activity-button ${isMemoryPanelVisible ? 'active' : ''}`} type="button" onClick={onToggleMemory} title="Память">
        MM
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
