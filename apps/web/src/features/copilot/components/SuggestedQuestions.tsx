import type { CopilotSuggestion } from '@akc/shared';

export function SuggestedQuestions({
  suggestions,
  disabled,
  onSelect
}: {
  suggestions: CopilotSuggestion[];
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="suggested-questions" aria-label="추천 질문">
      <span className="muted">추천 질문</span>
      <div className="suggested-question-list">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            className={suggestion.requiresWrite ? 'suggestion-chip warning' : 'suggestion-chip'}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(suggestion.prompt)}
            title={suggestion.requiresWrite ? '변경 작업은 실행 전 확인이 필요합니다.' : suggestion.prompt}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}
