import { useState } from 'react';

export function ChatComposer({ onSubmit, disabled }: { onSubmit: (prompt: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');
  const canSubmit = !disabled && value.trim().length > 0;

  function submitPrompt() {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue('');
  }

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); submitPrompt(); }}>
      <div className="composer-box">
        <textarea
          aria-label="Atlassian 코파일럿 프롬프트"
          placeholder="메시지를 입력하세요."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <button className="send-button" type="submit" disabled={!canSubmit} aria-label="메시지 보내기" title={disabled ? '응답 생성 중' : '메시지 보내기'}>
          <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
            <path d="M10 3.5a.9.9 0 0 1 .64.26l5 5a.9.9 0 1 1-1.28 1.28L10.9 6.58V16a.9.9 0 1 1-1.8 0V6.58l-3.46 3.46a.9.9 0 0 1-1.28-1.28l5-5A.9.9 0 0 1 10 3.5Z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
