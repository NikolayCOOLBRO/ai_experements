import type { AgentParameters } from '../types/agents';

export function contextModeLabel(mode: AgentParameters['context_mode']) {
  if (mode === 'sticky_facts') {
    return 'Sticky facts';
  }
  if (mode === 'branching') {
    return 'Ветки диалога';
  }
  if (mode === 'compressed') {
    return 'Со сжатием';
  }
  if (mode === 'sliding_window') {
    return 'Скользящее окно';
  }
  return 'Без сжатия';
}

export function contextWindowHint(mode: AgentParameters['context_mode']) {
  if (mode === 'sticky_facts') {
    return 'Последние N сообщений идут в prompt, важные факты хранятся отдельно как key-value память.';
  }
  if (mode === 'branching') {
    return 'История чата сохраняется полностью, а новые ветки создаются через checkpoint как независимые продолжения.';
  }
  if (mode === 'compressed') {
    return 'Последние N сообщений идут в prompt полностью, старые сжимаются.';
  }
  if (mode === 'sliding_window') {
    return 'Только последние N сообщений идут в prompt, старые отбрасываются.';
  }
  return 'В режиме без сжатия история не обрезается.';
}
