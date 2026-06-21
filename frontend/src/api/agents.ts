import type { Agent, AgentForm } from '../types/agents';
import { buildAgentPayload } from '../utils/agentForm';

export async function fetchAgents() {
  const response = await fetch('/api/agents');
  if (!response.ok) {
    throw new Error('Не удалось загрузить список агентов');
  }

  return (await response.json()) as { agents: Agent[] };
}

export async function saveAgent(agentId: string, isEditing: boolean, form: AgentForm) {
  const payload = buildAgentPayload(form);
  const url = isEditing && agentId ? `/api/agents/${agentId}` : '/api/agents';
  const method = isEditing && agentId ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || 'Не удалось сохранить агента');
  }

  return (await response.json()) as Agent;
}

export async function removeAgent(agentId: string) {
  const response = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error('Не удалось удалить агента');
  }
}
