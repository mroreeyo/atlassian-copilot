import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react';
import { useProductTourStore } from '../stores/productTourStore';

interface ProductTourStep {
  title: string;
  eyebrow: string;
  description: string;
  checklist: string[];
  previewTitle: string;
  previewText: string;
}

const productTourSteps: ProductTourStep[] = [
  {
    eyebrow: '1 · 질문하기',
    title: '궁금한 업무를 바로 물어보세요',
    description: 'Jira와 Confluence 내용을 찾아 필요한 답변으로 정리합니다.',
    checklist: ['추천 질문으로 빠르게 시작', '후속 질문으로 맥락 이어가기'],
    previewTitle: '예시 질문',
    previewText: '오늘까지 처리할 이슈가 있어?'
  },
  {
    eyebrow: '2 · 근거 보기',
    title: '답변의 근거를 함께 확인하세요',
    description: '참고한 이슈와 문서를 답변 안에서 확인하고, 필요할 때 자세히 열어볼 수 있습니다.',
    checklist: ['관련 이슈와 문서를 함께 표시', '상태와 핵심 내용을 간결하게 정리'],
    previewTitle: '확인할 수 있는 것',
    previewText: '답변 · 근거 · 관련 항목'
  },
  {
    eyebrow: '3 · 실행 전 확인',
    title: '변경은 실행 전에 확인합니다',
    description: '댓글이나 요청을 남기기 전에 대상과 내용을 먼저 보여줍니다.',
    checklist: ['승인 전에는 변경하지 않음', '필요한 문구를 먼저 수정'],
    previewTitle: '안전한 실행 흐름',
    previewText: '확인 → 수정 → 승인'
  },
  {
    eyebrow: '4 · 연결과 기록',
    title: '연결과 기록을 따로 관리하세요',
    description: '설정에서 연결 상태를 확인하고, 기록에서 이전 질문과 근거를 다시 볼 수 있습니다.',
    checklist: ['설정에서 연결 상태 확인', '기록에서 지난 답변 다시 보기'],
    previewTitle: '함께 쓰는 메뉴',
    previewText: '설정 · 기록 · 빠른 둘러보기'
  }
];

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function ProductTour() {
  const isOpen = useProductTourStore((state) => state.isOpen);
  const currentStep = useProductTourStore((state) => state.currentStep);
  const completeTour = useProductTourStore((state) => state.completeTour);
  const goToStep = useProductTourStore((state) => state.goToStep);
  const nextStep = useProductTourStore((state) => state.nextStep);
  const previousStep = useProductTourStore((state) => state.previousStep);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const fallbackStep = productTourSteps[0]!;
  const step = productTourSteps[currentStep] ?? fallbackStep;
  const lastStep = productTourSteps.length - 1;
  const titleId = useMemo(() => `product-tour-title-${currentStep}`, [currentStep]);
  const descriptionId = useMemo(() => `product-tour-description-${currentStep}`, [currentStep]);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement;
    const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>('button');
    firstButton?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    const element = previousActiveElement.current;
    if (element instanceof HTMLElement && document.contains(element)) element.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      completeTour();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="tour-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="product-tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
      >
        <div className="tour-shell">
          <aside className="tour-rail" aria-label="둘러보기 단계">
            <span className="tour-kicker">처음 시작</span>
            <strong>주요 기능 안내</strong>
            <ol>
              {productTourSteps.map((tourStep, index) => (
                <li key={tourStep.title}>
                  <button type="button" className={index === currentStep ? 'active' : ''} aria-current={index === currentStep ? 'step' : undefined} onClick={() => goToStep(index)}>
                    <span>{index + 1}</span>
                    {tourStep.eyebrow.replace(/^\d · /, '')}
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <section className="tour-content">
            <div className="tour-topline">
              <span>{step.eyebrow}</span>
              <button type="button" className="tour-close" onClick={completeTour} aria-label="둘러보기 닫기">×</button>
            </div>
            <h2 id={titleId}>{step.title}</h2>
            <p id={descriptionId}>{step.description}</p>

            <div className="tour-preview-card">
              <span>{step.previewTitle}</span>
              <strong>{step.previewText}</strong>
            </div>

            <ul className="tour-checklist">
              {step.checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>

            <div className="tour-progress" aria-label={`전체 ${productTourSteps.length}단계 중 ${currentStep + 1}단계`}>
              {productTourSteps.map((tourStep, index) => <span key={tourStep.title} className={index <= currentStep ? 'filled' : ''} />)}
            </div>

            <div className="tour-actions">
              <button type="button" className="btn subtle" onClick={completeTour}>건너뛰기</button>
              <div>
                <button type="button" className="btn subtle" onClick={previousStep} disabled={currentStep === 0}>이전</button>
                {currentStep === lastStep ? (
                  <button type="button" className="btn primary" onClick={completeTour}>시작하기</button>
                ) : (
                  <button type="button" className="btn primary" onClick={() => nextStep(lastStep)}>다음</button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
