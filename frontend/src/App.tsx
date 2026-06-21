import './App.css';
import { ActivityBar } from './components/layout/ActivityBar';
import { StatusBar } from './components/layout/StatusBar';
import { TitleBar } from './components/layout/TitleBar';
import { AgentsSidebar } from './components/sidebar/AgentsSidebar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { TraceInspector } from './components/trace/TraceInspector';
import { useAgentRunner } from './hooks/useAgentRunner';
import { useWorkspaceState } from './hooks/useWorkspaceState';

export default function App() {
  const workspace = useWorkspaceState();
  const { runAgent, stop } = useAgentRunner({
    messages: workspace.messages,
    selectedAgentId: workspace.selectedAgentId,
    selectedChatId: workspace.selectedChatId,
    isLoading: workspace.isLoading,
    setMessages: workspace.setMessages,
    setTask: workspace.setTask,
    setError: workspace.setError,
    setIsLoading: workspace.setIsLoading,
    refreshChatData: workspace.refreshChatData,
    refreshChats: workspace.refreshChats,
  });

  return (
    <main className="page">
      <div className="ide-shell">
        <TitleBar selectedAgent={workspace.selectedAgent} selectedChat={workspace.selectedChat} />

        <section className={`workbench ${workspace.isAgentsPanelVisible ? '' : 'sidebar-hidden'} ${workspace.isTraceVisible ? '' : 'inspector-hidden'}`}>
          <ActivityBar
            isAgentsPanelVisible={workspace.isAgentsPanelVisible}
            isTraceVisible={workspace.isTraceVisible}
            isMemoryPanelVisible={workspace.isMemoryPanelVisible}
            isBranchesVisible={workspace.isBranchesVisible}
            isBranchingMode={workspace.isBranchingMode}
            onToggleAgents={() => workspace.setIsAgentsPanelVisible((current) => !current)}
            onToggleTrace={() => workspace.setIsTraceVisible((current) => !current)}
            onToggleMemory={() => workspace.setIsMemoryPanelVisible((current) => !current)}
            onToggleBranches={() => workspace.setIsBranchesVisible((current) => !current)}
          />

          {workspace.isAgentsPanelVisible && (
            <AgentsSidebar
              agents={workspace.agents}
              selectedAgentId={workspace.selectedAgentId}
              selectedAgent={workspace.selectedAgent}
              models={workspace.models}
              selectedModel={workspace.selectedModel}
              form={workspace.form}
              isEditing={workspace.isEditing}
              onNewAgent={workspace.handleNewAgent}
              onSelectAgent={workspace.handleSelectAgent}
              onDeleteAgent={workspace.handleDeleteAgent}
              onSubmit={workspace.handleSaveAgent}
              setForm={workspace.setForm}
            />
          )}

          <ChatWorkspace
            selectedAgent={workspace.selectedAgent}
            selectedChat={workspace.selectedChat}
            chats={workspace.chats}
            checkpoints={workspace.checkpoints}
            messages={workspace.messages}
            workingMemory={workspace.workingMemory}
            longTermMemory={workspace.longTermMemory}
            isLoading={workspace.isLoading}
            isBranchingMode={workspace.isBranchingMode}
            isBranchesVisible={workspace.isBranchesVisible}
            isMemoryPanelVisible={workspace.isMemoryPanelVisible}
            selectedChatId={workspace.selectedChatId}
            memoryTab={workspace.memoryTab}
            task={workspace.task}
            error={workspace.error}
            onSelectChat={workspace.handleSelectChat}
            onCreateChat={workspace.handleCreateChat}
            onDeleteChat={workspace.handleDeleteChat}
            onCreateCheckpoint={workspace.handleCreateCheckpoint}
            onCreateBranch={workspace.handleCreateBranch}
            onMemoryTabChange={workspace.setMemoryTab}
            onTaskChange={workspace.setTask}
            onCreateWorkingMemory={workspace.handleCreateWorkingMemory}
            onDeleteWorkingMemory={workspace.handleDeleteWorkingMemory}
            onCreateLongTermMemory={workspace.handleCreateLongTermMemory}
            onDeleteLongTermMemory={workspace.handleDeleteLongTermMemory}
            onRunAgent={() => runAgent(workspace.task)}
            onStop={stop}
          />

          {workspace.isTraceVisible && (
            <TraceInspector
              selectedAgentId={workspace.selectedAgentId}
              selectedChatId={workspace.selectedChatId}
              traces={workspace.traces}
            />
          )}
        </section>

        <StatusBar
          selectedAgent={workspace.selectedAgent}
          selectedChat={workspace.selectedChat}
          isLoading={workspace.isLoading}
          error={workspace.error}
        />
      </div>
    </main>
  );
}
