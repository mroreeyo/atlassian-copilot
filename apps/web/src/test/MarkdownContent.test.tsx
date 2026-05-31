import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fictionalSources } from '@akc/shared/mock';
import { MarkdownContent } from '../features/copilot/components/MarkdownContent';

describe('MarkdownContent', () => {
  it('renders GFM pipe tables as accessible table markup', () => {
    render(
      <MarkdownContent
        content={`요약입니다.\n\n| 항목 | 상태 | 담당 |\n| --- | :---: | ---: |\n| Jira | 진행 중 | AX팀 |\n| Confluence | 완료 | Docs |`}
      />
    );

    expect(screen.getByText('요약입니다.')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: '항목' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '상태' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Confluence' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '완료' })).toBeInTheDocument();
  });



  it('links known Jira and Confluence source IDs inside paragraphs and tables', () => {
    render(
      <MarkdownContent
        content={`AKC-124를 먼저 확인하세요.

| 항목 | 상태 |
| --- | --- |
| AKC-117 | 할 일 |
| AX-KB-001 | 문서 |`}
        sources={fictionalSources}
      />
    );

    expect(screen.getByRole('link', { name: 'AKC-124' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/AKC-124');
    expect(screen.getByRole('link', { name: 'AKC-117' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/AKC-117');
    expect(screen.getByRole('link', { name: 'AX-KB-001' })).toHaveAttribute('href', 'https://example.atlassian.net/wiki/spaces/AKC/pages/001');
  });

  it('renders safe markdown task links and known source titles as links', () => {
    render(
      <MarkdownContent
        content={`[AKC-124 작업](https://example.atlassian.net/browse/AKC-124)을 확인하고 NFS 인증 장애 대응 Runbook을 참고하세요.`}
        sources={fictionalSources}
      />
    );

    expect(screen.getByRole('link', { name: 'AKC-124 작업' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/AKC-124');
    expect(screen.getByRole('link', { name: 'NFS 인증 장애 대응 Runbook' })).toHaveAttribute('href', 'https://example.atlassian.net/wiki/spaces/AKC/pages/001');
  });

  it('renders unsafe markdown links as inert text', () => {
    render(<MarkdownContent content={'[위험 링크](javascript:alert(1))'} />);

    expect(screen.queryByRole('link', { name: '위험 링크' })).toBeNull();
    expect(screen.getByText('[위험 링크](javascript:alert(1))')).toBeInTheDocument();
  });

  it('renders HTML-looking assistant text as inert text instead of raw markup', () => {
    render(<MarkdownContent content={'| 항목 | 값 |\n| --- | --- |\n| 위험 | <img src=x onerror=alert(1)> |'} />);

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('preserves literal backslashes while still supporting escaped pipes', () => {
    render(<MarkdownContent content={'| 항목 | 값 |\n| --- | --- |\n| 경로 | C:\\\\Temp\\\\file.txt |\n| 파이프 | A\\|B |'} />);

    expect(screen.getByRole('cell', { name: 'C:\\Temp\\file.txt' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'A|B' })).toBeInTheDocument();
  });

  it('does not treat malformed table delimiters as a table', () => {
    render(<MarkdownContent content={'| 항목 | 값 |\n| --- |\n| Jira | 진행 중 |'} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('| 항목 | 값 |')).toBeInTheDocument();
  });
});
