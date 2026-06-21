import type { SseEvent } from '../types/agents';

export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const chunks = normalized.split('\n\n');
  const rest = chunks.pop() ?? '';
  const events = chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message';
    const data = lines
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');

    return { event, data };
  });

  return { events, rest };
}
