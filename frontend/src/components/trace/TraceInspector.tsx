import type { AgentRunTrace } from '../../types/agents';
import { contextModeLabel } from '../../utils/contextMode';

type TraceInspectorProps = {
  selectedAgentId: string;
  selectedChatId: string;
  traces: AgentRunTrace[];
};

export function TraceInspector({ selectedAgentId, selectedChatId, traces }: TraceInspectorProps) {
  return (
    <aside className="inspector">
      <div className="inspector-title">
        <div>
          <h3>Inspector</h3>
          <p>Какие сообщения, summary и facts попали в контекст.</p>
        </div>
      </div>

      <div className="trace-list scroll-area">
        {!selectedAgentId || !selectedChatId ? (
          <div className="empty">Выберите чат, чтобы увидеть действия запуска.</div>
        ) : traces.length === 0 ? (
          <div className="empty">Пока нет запусков для этого чата.</div>
        ) : (
          traces.map((trace) => (
            <details className="trace-card" key={trace.id}>
              <summary>
                <span>Запуск по сообщению #{trace.user_message_ordinal}</span>
                <small>{new Date(trace.created_at).toLocaleString('ru-RU')}</small>
              </summary>

              <div className="trace-meta">
                <span>Режим: {contextModeLabel(trace.context_mode)}</span>
                <span>Окно: {trace.context_window ?? 'вся история'}</span>
                {trace.assistant_message_ordinal && <span>Ответ: #{trace.assistant_message_ordinal}</span>}
              </div>

              {trace.summary && (
                <section className="trace-section">
                  <h4>Summary</h4>
                  <p>Сжаты сообщения до #{trace.summary.covered_until_ordinal}.</p>
                  {trace.summary.previous_summary && (
                    <>
                      <strong>Было</strong>
                      <pre>{trace.summary.previous_summary}</pre>
                    </>
                  )}
                  <strong>Стало</strong>
                  <pre>{trace.summary.new_summary}</pre>
                  <strong>Что сжимали</strong>
                  <div className="trace-messages">
                    {trace.summary.summarized_messages.map((message) => (
                      <article className="trace-message" key={`summary-${trace.id}-${message.ordinal}`}>
                        <span>#{message.ordinal} · {message.role === 'user' ? 'user' : 'assistant'}</span>
                        <p>{message.content}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="trace-section">
                <h4>Контекст prompt</h4>
                {trace.prompt_summary ? (
                  <>
                    <strong>Переданный summary</strong>
                    <pre>{trace.prompt_summary}</pre>
                  </>
                ) : (
                  <p>Summary в prompt не передавался.</p>
                )}
                {(trace.prompt_facts ?? []).length > 0 ? (
                  <>
                    <strong>Переданные facts</strong>
                    <div className="trace-messages">
                      {(trace.prompt_facts ?? []).map((fact) => (
                        <article className="trace-message" key={`fact-${trace.id}-${fact.category}-${fact.key}`}>
                          <span>{fact.category}.{fact.key}{fact.source_message_ordinal ? ` · #${fact.source_message_ordinal}` : ''}</span>
                          <p>{fact.value}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>Facts в prompt не передавались.</p>
                )}
                <strong>Сообщения</strong>
                <div className="trace-messages">
                  {trace.prompt_messages.map((message) => (
                    <article className="trace-message" key={`prompt-${trace.id}-${message.ordinal}`}>
                      <span>#{message.ordinal} · {message.role === 'user' ? 'user' : 'assistant'}</span>
                      <p>{message.content}</p>
                    </article>
                  ))}
                </div>
              </section>
            </details>
          ))
        )}
      </div>
    </aside>
  );
}
