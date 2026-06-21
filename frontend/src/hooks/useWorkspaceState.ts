import { useEffect, useState } from 'react';
import { fetchAgents, removeAgent, saveAgent } from '../api/agents';
import { createBranch, createCheckpoint, fetchCheckpoints } from '../api/checkpoints';
import { createChat, fetchChats, fetchMessages, removeChat } from '../api/chats';
import { createLongTermMemory, createWorkingMemory, deleteLongTermMemory, deleteWorkingMemory, fetchLongTermMemory, fetchWorkingMemory } from '../api/memory';
import { fetchModels } from '../api/models';
import { fetchTraces } from '../api/traces';
import type { Agent, AgentForm, AgentRunTrace, AiModel, Chat, ChatMessage, Checkpoint, LongTermMemoryItem, WorkingMemoryItem } from '../types/agents';
import { emptyForm, formFromAgent, numericValue } from '../utils/agentForm';

type MemoryTab = 'working' | 'long_term';

export function useWorkspaceState() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<AgentRunTrace[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [workingMemory, setWorkingMemory] = useState<WorkingMemoryItem[]>([]);
  const [longTermMemory, setLongTermMemory] = useState<LongTermMemoryItem[]>([]);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [task, setTask] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAgentsPanelVisible, setIsAgentsPanelVisible] = useState(true);
  const [isTraceVisible, setIsTraceVisible] = useState(true);
  const [isMemoryPanelVisible, setIsMemoryPanelVisible] = useState(true);
  const [isBranchesVisible, setIsBranchesVisible] = useState(false);
  const [memoryTab, setMemoryTab] = useState<MemoryTab>('working');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = models.find((model) => model.id === form.model);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const isBranchingMode = selectedAgent?.parameters.context_mode === 'branching';

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [modelsData, agentsData] = await Promise.all([fetchModels(), fetchAgents()]);
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

  async function loadChatsForAgent(agentId: string) {
    const data = await fetchChats(agentId);
    setChats(data.chats);
    return data.chats;
  }

  async function loadCheckpointsForAgent(agentId: string) {
    const data = await fetchCheckpoints(agentId);
    setCheckpoints(data.checkpoints);
    return data.checkpoints;
  }

  async function loadMessagesForChat(agentId: string, chatId: string) {
    const data = await fetchMessages(agentId, chatId);
    setMessages(data.messages);
  }

  async function loadTracesForChat(agentId: string, chatId: string) {
    const data = await fetchTraces(agentId, chatId);
    setTraces(data.traces);
  }

  async function loadWorkingMemoryForChat(agentId: string, chatId: string) {
    const items = await fetchWorkingMemory(agentId, chatId);
    setWorkingMemory(items);
  }

  async function loadLongTermMemoryForAgent(agentId: string) {
    const items = await fetchLongTermMemory(agentId);
    setLongTermMemory(items);
  }

  async function refreshChatData(agentId: string, chatId: string) {
    await Promise.all([loadMessagesForChat(agentId, chatId), loadTracesForChat(agentId, chatId), loadWorkingMemoryForChat(agentId, chatId)]);
  }

  async function refreshChats(agentId: string) {
    await loadChatsForAgent(agentId);
  }

  async function handleSelectChat(chat: Chat) {
    if (isLoading || !selectedAgentId) {
      return;
    }

    setSelectedChatId(chat.id);
    setError(null);

    try {
      await refreshChatData(selectedAgentId, chat.id);
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
    setTraces([]);
    setWorkingMemory([]);
    setLongTermMemory([]);
    setCheckpoints([]);
    setIsBranchesVisible(false);

    try {
      const [nextChats] = await Promise.all([loadChatsForAgent(agent.id), loadCheckpointsForAgent(agent.id), loadLongTermMemoryForAgent(agent.id)]);
      if (nextChats.length > 0) {
        setSelectedChatId(nextChats[0].id);
        await refreshChatData(agent.id, nextChats[0].id);
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
    setTraces([]);
    setWorkingMemory([]);
    setLongTermMemory([]);
    setCheckpoints([]);
    setIsBranchesVisible(false);
    setIsEditing(false);
    setError(null);
    setForm({ ...emptyForm, model: models[0]?.id || '' });
  }

  async function handleSaveAgent() {
    setError(null);

    try {
      const savedAgent = await saveAgent(selectedAgentId, isEditing, form);
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
      await removeAgent(selectedAgentId);
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
      await removeChat(selectedAgentId, selectedChatId);

      const nextChats = chats.filter((chat) => chat.id !== selectedChatId);
      setChats(nextChats);

      if (nextChats.length === 0) {
        setSelectedChatId('');
        setMessages([]);
        setTraces([]);
        setWorkingMemory([]);
      } else {
        setSelectedChatId(nextChats[0].id);
        await refreshChatData(selectedAgentId, nextChats[0].id);
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
      const chat = await createChat(selectedAgentId);
      setChats((current) => [chat, ...current]);
      setSelectedChatId(chat.id);
      setMessages([]);
      setTraces([]);
      setWorkingMemory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать чат');
    }
  }

  async function handleCreateCheckpoint() {
    if (!selectedAgentId || !selectedChatId || isLoading || messages.length === 0) {
      return;
    }

    const title = window.prompt('Название контрольной точки', `Ветка от ${selectedChat?.title ?? 'чата'}`)?.trim();
    if (!title) {
      return;
    }

    try {
      const checkpoint = await createCheckpoint(selectedAgentId, selectedChatId, title);
      setCheckpoints((current) => [checkpoint, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить контрольную точку');
    }
  }

  async function handleCreateBranch(checkpoint: Checkpoint) {
    if (!selectedAgentId || isLoading) {
      return;
    }

    const title = window.prompt('Название новой ветки', `${checkpoint.title} / ветка`)?.trim();
    if (!title) {
      return;
    }

    try {
      const chat = await createBranch(selectedAgentId, checkpoint.id, title);
      setChats((current) => [chat, ...current]);
      setSelectedChatId(chat.id);
      await Promise.all([refreshChatData(selectedAgentId, chat.id), loadCheckpointsForAgent(selectedAgentId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать ветку');
    }
  }

  async function handleCreateWorkingMemory(payload: {
    key: string;
    value: string;
    tags: string[];
    task_tag?: string | null;
    reason: string;
    source_message_ordinal?: number | null;
  }) {
    if (!selectedAgentId || !selectedChatId) {
      return;
    }
    setError(null);
    try {
      await createWorkingMemory(selectedAgentId, selectedChatId, payload);
      await loadWorkingMemoryForChat(selectedAgentId, selectedChatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить рабочую память');
    }
  }

  async function handleDeleteWorkingMemory(key: string) {
    if (!selectedAgentId || !selectedChatId) {
      return;
    }
    if (!window.confirm(`Удалить запись рабочей памяти ${key}?`)) {
      return;
    }
    setError(null);
    try {
      await deleteWorkingMemory(selectedAgentId, selectedChatId, key);
      await loadWorkingMemoryForChat(selectedAgentId, selectedChatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить рабочую память');
    }
  }

  async function handleCreateLongTermMemory(payload: {
    category: 'goal' | 'constraints' | 'preferences' | 'decisions' | 'agreements' | 'entities';
    key: string;
    value: string;
    tags: string[];
    reason: string;
    source_chat_id?: string | null;
    source_message_ordinal?: number | null;
  }) {
    if (!selectedAgentId) {
      return;
    }
    setError(null);
    try {
      await createLongTermMemory(selectedAgentId, payload);
      await loadLongTermMemoryForAgent(selectedAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить долговременную память');
    }
  }

  async function handleDeleteLongTermMemory(itemId: string) {
    if (!selectedAgentId) {
      return;
    }
    if (!window.confirm('Удалить запись долговременной памяти?')) {
      return;
    }
    setError(null);
    try {
      await deleteLongTermMemory(selectedAgentId, itemId);
      await loadLongTermMemoryForAgent(selectedAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить долговременную память');
    }
  }

  return {
    models,
    agents,
    chats,
    messages,
    traces,
    checkpoints,
    workingMemory,
    longTermMemory,
    form,
    task,
    error,
    isEditing,
    isAgentsPanelVisible,
    isTraceVisible,
    isMemoryPanelVisible,
    isBranchesVisible,
    isLoading,
    memoryTab,
    selectedModel,
    selectedAgent,
    selectedChat,
    selectedAgentId,
    selectedChatId,
    isBranchingMode,
    setForm,
    setTask,
    setError,
    setIsLoading,
    setMessages,
    setIsAgentsPanelVisible,
    setIsTraceVisible,
    setIsMemoryPanelVisible,
    setIsBranchesVisible,
    setMemoryTab,
    handleSelectChat,
    handleSelectAgent,
    handleNewAgent,
    handleSaveAgent,
    handleDeleteAgent,
    handleDeleteChat,
    handleCreateChat,
    handleCreateCheckpoint,
    handleCreateBranch,
    handleCreateWorkingMemory,
    handleDeleteWorkingMemory,
    handleCreateLongTermMemory,
    handleDeleteLongTermMemory,
    refreshChatData,
    refreshChats,
  };
}
