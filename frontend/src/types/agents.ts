export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  tokens?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_chat_tokens?: number | null;
    estimated?: boolean;
  } | null;
};

export type TraceMessage = ChatMessage & {
  ordinal: number;
};

export type SummaryTrace = {
  previous_summary: string;
  new_summary: string;
  covered_until_ordinal: number;
  summarized_messages: TraceMessage[];
};

export type ChatFact = {
  category: 'goal' | 'constraints' | 'preferences' | 'decisions' | 'agreements' | 'entities';
  key: string;
  value: string;
  source_message_ordinal?: number | null;
};

export type AgentRunTrace = {
  id: string;
  created_at: string;
  user_message_ordinal: number;
  assistant_message_ordinal?: number | null;
  context_mode: 'full' | 'compressed' | 'sliding_window' | 'sticky_facts' | 'branching';
  context_window?: number | null;
  prompt_summary: string;
  prompt_facts: ChatFact[];
  prompt_messages: TraceMessage[];
  summary?: SummaryTrace | null;
};

export type AiModel = {
  id: string;
  label: string;
  max_tokens: number;
  token_hint: string;
};

export type ModelsResponse = {
  models: AiModel[];
  default_model: string;
};

export type AgentParameters = {
  model: string;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  max_output_tokens?: number | null;
  context_window?: number | null;
  context_mode: 'full' | 'compressed' | 'sliding_window' | 'sticky_facts' | 'branching';
  summary_window: number;
};

export type Agent = {
  id: string;
  name: string;
  context: string;
  planning: string;
  parameters: AgentParameters;
};

export type Chat = {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  parent_checkpoint_id?: string | null;
  branch_title?: string | null;
  branched_from_chat_id?: string | null;
  branched_from_ordinal?: number | null;
};

export type Checkpoint = {
  id: string;
  agent_id: string;
  source_chat_id: string;
  source_message_ordinal: number;
  title: string;
  created_at: string;
};

export type AgentForm = {
  name: string;
  context: string;
  planning: string;
  model: string;
  temperature: string;
  topP: string;
  topK: string;
  maxOutputTokens: string;
  contextWindow: string;
  contextMode: 'full' | 'compressed' | 'sliding_window' | 'sticky_facts' | 'branching';
  summaryWindow: string;
};

export type SseEvent = {
  event: string;
  data: string;
};
