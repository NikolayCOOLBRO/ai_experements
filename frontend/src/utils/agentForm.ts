import type { Agent, AgentForm } from '../types/agents';

export const emptyForm: AgentForm = {
  name: '',
  context: '',
  planning: '',
  model: '',
  temperature: '1',
  topP: '',
  topK: '',
  maxOutputTokens: '1024',
  contextWindow: '20',
  contextMode: 'full',
  summaryWindow: '10',
};

export function numericValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formFromAgent(agent: Agent): AgentForm {
  return {
    name: agent.name,
    context: agent.context,
    planning: agent.planning,
    model: agent.parameters.model,
    temperature: String(agent.parameters.temperature ?? ''),
    topP: String(agent.parameters.top_p ?? ''),
    topK: String(agent.parameters.top_k ?? ''),
    maxOutputTokens: String(agent.parameters.max_output_tokens ?? ''),
    contextWindow: String(agent.parameters.context_window ?? ''),
    contextMode: agent.parameters.context_mode ?? 'full',
    summaryWindow: String(agent.parameters.summary_window ?? 10),
  };
}

export function buildAgentPayload(form: AgentForm) {
  return {
    name: form.name.trim(),
    context: form.context.trim(),
    planning: form.planning.trim(),
    parameters: {
      model: form.model,
      temperature: numericValue(form.temperature),
      top_p: numericValue(form.topP),
      top_k: numericValue(form.topK),
      max_output_tokens: numericValue(form.maxOutputTokens),
      context_window: numericValue(form.contextWindow),
      context_mode: form.contextMode,
      summary_window: numericValue(form.summaryWindow) ?? 10,
    },
  };
}
