import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockRunEvents, fictionalSources } from '@akc/shared/mock';
import { initialCopilotRunView, reduceCopilotEvent, type CopilotSseEvent } from '@akc/shared';
import { ToolExecutionAccordion } from '../features/copilot/components/ToolExecutionAccordion';

function runViewFrom(events: CopilotSseEvent[]) {
  return events.reduce(reduceCopilotEvent, initialCopilotRunView);
}

describe('ToolExecutionAccordion', () => {
  it('collapses completed tool details until the user expands them', async () => {
    const user = userEvent.setup();
    const runView = runViewFrom(createMockRunEvents('run_accordion'));

    render(<ToolExecutionAccordion runView={runView} />);

    const toggle = screen.getByRole('button', { name: /조회 실행/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2개 도구 · 2개 완료 · 8개 근거');
    expect(screen.queryByText('테스트 Jira 이슈 5개 발견')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Jira 이슈 조회')).toBeInTheDocument();
    expect(screen.getByText('Confluence 문서 조회')).toBeInTheDocument();
    expect(screen.getByText(/assignee = currentUser\(\)/)).toBeInTheDocument();
    expect(screen.getByText('테스트 Jira 이슈 5개 발견')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NFS 인증 장애 대응 Runbook' })).toHaveAttribute('href', 'https://example.atlassian.net/wiki/spaces/AKC/pages/001');
    expect(screen.getAllByText(/데모 자료/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/실제 · Jira/)).not.toBeInTheDocument();
    expect(screen.queryByText('Jira 댓글 작성')).not.toBeInTheDocument();
  });

  it('keeps running tools collapsed with a compact spinner status until expanded', async () => {
    const user = userEvent.setup();
    const events = createMockRunEvents('run_running').filter((event) =>
      ['run.created', 'tool_plan.created', 'tool.started'].includes(event.type)
    );
    const runView = runViewFrom(events);

    render(<ToolExecutionAccordion runView={runView} />);

    const toggle = screen.getByRole('button', { name: /조회 실행 중/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2개 실행 중');
    expect(screen.queryAllByLabelText('실행 중')).toHaveLength(0);

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByLabelText('실행 중')).toHaveLength(2);
    expect(screen.getAllByText('아직 조회 중입니다.')).toHaveLength(2);
  });

  it('shows failed tool errors inside the accordion', () => {
    const sourceEvents = createMockRunEvents('run_failed');
    const failed: CopilotSseEvent = { type: 'tool.failed', actionId: 'act_001', tool: 'jira_search', error: 'Jira test failure' };
    const runView = runViewFrom([sourceEvents[0]!, sourceEvents[1]!, sourceEvents[2]!, failed]);

    render(<ToolExecutionAccordion runView={runView} />);

    expect(screen.getByRole('button', { name: /조회 확인 필요/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Jira test failure')).toBeInTheDocument();
    expect(screen.getByText('실패')).toBeInTheDocument();
  });

  it('renders unsafe source URLs as inert text', async () => {
    const user = userEvent.setup();
    const runView = {
      ...runViewFrom(createMockRunEvents('run_unsafe_url')),
      sources: [
        {
          ...fictionalSources[0]!,
          id: 'unsafe_source',
          title: 'Unsafe test source',
          url: 'javascript:alert(1)'
        }
      ]
    };

    render(<ToolExecutionAccordion runView={runView} />);
    await user.click(screen.getByRole('button', { name: /조회 실행/i }));

    expect(screen.getByText('Unsafe test source')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unsafe test source' })).not.toBeInTheDocument();
  });
});
