import type { CopilotSuggestionsResponse } from '@akc/shared';

const fallbackSuggestions: CopilotSuggestionsResponse['suggestions'] = [
  {
    id: 'assigned-issues',
    label: '내 할당 이슈',
    prompt: '나에게 할당된 JIRA 이슈를 조회해줘.',
    category: 'jira',
    requiresConnection: true,
    requiresWrite: false
  },
  {
    id: 'due-today',
    label: '오늘 마감',
    prompt: '오늘까지 끝내야 할 이슈들이 있어?',
    category: 'jira',
    requiresConnection: true,
    requiresWrite: false
  },
  {
    id: 'recent-updates',
    label: '최근 업데이트',
    prompt: '최근 업데이트된 Jira 이슈와 Confluence 문서를 요약해줘.',
    category: 'general',
    requiresConnection: true,
    requiresWrite: false
  }
];

export function buildCopilotSuggestions(): CopilotSuggestionsResponse {
  return {
    source: 'fallback',
    suggestions: fallbackSuggestions,
    message: '기본 추천 질문을 표시합니다. 개인화 추천은 추후 확장할 수 있습니다.'
  };
}
