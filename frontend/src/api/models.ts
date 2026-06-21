import type { ModelsResponse } from '../types/agents';

export async function fetchModels() {
  const response = await fetch('/api/models');
  if (!response.ok) {
    throw new Error('Не удалось загрузить список моделей');
  }

  return (await response.json()) as ModelsResponse;
}
