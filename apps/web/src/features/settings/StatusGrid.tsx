import type { LlmConnectionStatus, LlmProvider, SettingsStatus } from '@akc/shared';

type BadgeTone = 'ai' | 'success' | 'warning' | 'danger';
type CardState = 'active' | 'attention' | 'inactive' | 'failed';

export function StatusGrid({ status }: { status: SettingsStatus }) {
  const atlassian = atlassianCardState(status);
  const llm = llmCardState(status.llm);

  return (
    <div className="status-grid" aria-label="연결 상태">
      <StatusCard
        badge="Atlassian"
        badgeTone={atlassian.badgeTone}
        title="Atlassian 연결"
        value={atlassianStatusLabel(status)}
        state={atlassian.state}
        signal={atlassian.signal}
      />
      <StatusCard
        badge="LLM"
        badgeTone={llm.badgeTone}
        title="LLM 제공자"
        value={llmStatusLabel(status.llm)}
        state={llm.state}
        signal={llm.signal}
      />
    </div>
  );
}

function StatusCard({
  badge,
  badgeTone,
  title,
  value,
  state,
  signal
}: {
  badge: string;
  badgeTone: BadgeTone;
  title: string;
  value: string;
  state: CardState;
  signal: string;
}) {
  return (
    <div className={`card status-card ${state}`}>
      <div className="status-card-topline">
        <span className={`badge ${badgeTone}`}>{badge}</span>
        <span className="status-signal" aria-label={`현재 상태: ${signal}`}>
          <span aria-hidden="true" />
          {signal}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  );
}

function atlassianCardState(status: SettingsStatus): { state: CardState; badgeTone: BadgeTone; signal: string } {
  if (status.atlassian.connectionState === 'failed') return { state: 'failed', badgeTone: 'danger', signal: '확인 필요' };
  if (status.mcpConnected || status.atlassian.connected) return { state: 'active', badgeTone: 'success', signal: '활성' };
  if (status.atlassian.configured) return { state: 'attention', badgeTone: 'warning', signal: '테스트 필요' };
  return { state: 'inactive', badgeTone: 'ai', signal: '미설정' };
}

function llmCardState(status: LlmConnectionStatus): { state: CardState; badgeTone: BadgeTone; signal: string } {
  if (status.connectionState === 'failed') return { state: 'failed', badgeTone: 'danger', signal: '확인 필요' };
  if (status.connected && status.enabled) return { state: 'active', badgeTone: 'success', signal: '활성' };
  if (status.configured && !status.enabled) return { state: 'inactive', badgeTone: 'warning', signal: '비활성' };
  if (status.configured) return { state: 'attention', badgeTone: 'warning', signal: '테스트 필요' };
  return { state: 'inactive', badgeTone: 'ai', signal: '미설정' };
}

function atlassianStatusLabel(status: SettingsStatus): string {
  if (status.atlassian.connectionState === 'failed') return '테스트 실패';
  if (status.mcpConnected || status.atlassian.connected) return '검증됨';
  if (status.atlassian.configured) return '저장됨 · 테스트 필요';
  return '연결 없음';
}

function llmStatusLabel(status: LlmConnectionStatus): string {
  if (status.provider === 'mock') return 'LLM 미사용';
  const name = llmProviderLabel(status.provider);
  if (status.connectionState === 'failed') return `${name} 테스트 실패`;
  if (status.connected && status.enabled) return `${name} 연결됨`;
  if (status.configured && !status.enabled) return `${name} 저장됨, 비활성`;
  if (status.configured) return `${name} 설정됨`;
  return 'LLM 미사용';
}

function llmProviderLabel(provider: Exclude<LlmProvider, 'mock'>): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Claude';
  return 'OpenRouter';
}
