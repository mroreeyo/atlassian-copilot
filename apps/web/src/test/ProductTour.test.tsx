import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProductTour } from '../features/onboarding/components/ProductTour';
import { productTourStorageKey, useProductTourStore } from '../features/onboarding/stores/productTourStore';

function resetTourState() {
  window.localStorage.removeItem(productTourStorageKey);
  useProductTourStore.setState({ currentStep: 0, hasCompleted: false, isOpen: false });
}

function renderOpenTour() {
  useProductTourStore.getState().initializeTour();
  return render(<ProductTour />);
}

const expectedStepLabels = ['질문하기', '근거 보기', '실행 전 확인', '연결과 기록'];
const forbiddenInternalTerms = ['Broker', 'P0', 'P1', 'MCP', 'OpenAI', 'API', 'Action Review', 'SSE', 'MSW', 'Zod', 'TanStack', 'Zustand', '아코디언', '스키마', '라우트', '토큰'];

function getOpenTourDialog() {
  return screen.getByRole('dialog');
}

describe('ProductTour', () => {
  beforeEach(() => {
    resetTourState();
  });

  it('opens on first visit as an accessible dark dialog without a spotlight target', async () => {
    renderOpenTour();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('product-tour');
    expect(screen.getByLabelText('전체 4단계 중 1단계')).toBeInTheDocument();
    expect(document.querySelector('.spotlight, [data-spotlight-target]')).toBeNull();
    expect(screen.getByText('오늘까지 처리할 이슈가 있어?')).toBeInTheDocument();
    for (const term of forbiddenInternalTerms) expect(dialog).not.toHaveTextContent(term);
  });

  it('uses compact Korean step labels and concise checklist copy', async () => {
    const user = userEvent.setup();
    renderOpenTour();

    const dialog = await screen.findByRole('dialog');

    expectedStepLabels.forEach((label, index) => {
      expect(within(dialog).getByRole('button', { name: new RegExp(`^${index + 1}\\s*${label}$`) })).toBeInTheDocument();
    });

    for (const label of expectedStepLabels) {
      expect(label.length).toBeLessThanOrEqual(7);
    }

    for (let stepIndex = 0; stepIndex < expectedStepLabels.length; stepIndex += 1) {
      const checklistItems = dialog.querySelectorAll('.tour-checklist li');
      expect(checklistItems).toHaveLength(2);
      for (const item of checklistItems) {
        expect(item.textContent?.trim().length ?? 0).toBeLessThanOrEqual(34);
      }

      if (stepIndex < expectedStepLabels.length - 1) await user.click(screen.getByRole('button', { name: '다음' }));
    }
  });

  it('keeps user-facing tour copy free of internal implementation language across every step', async () => {
    const user = userEvent.setup();
    renderOpenTour();

    await screen.findByRole('dialog');

    for (let stepIndex = 0; stepIndex < expectedStepLabels.length; stepIndex += 1) {
      const dialog = getOpenTourDialog();
      for (const term of forbiddenInternalTerms) expect(dialog).not.toHaveTextContent(term);
      expect(dialog).not.toHaveTextContent(/개발자|내부 구현|실험 단계/);

      if (stepIndex < expectedStepLabels.length - 1) await user.click(screen.getByRole('button', { name: '다음' }));
    }
  });

  it('advances through four concise steps and persists completion', async () => {
    const user = userEvent.setup();
    renderOpenTour();

    expect(await screen.findByRole('dialog')).toHaveTextContent('1 · 질문하기');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('2 · 근거 보기');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('3 · 실행 전 확인');
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('4 · 연결과 기록');

    await user.click(screen.getByRole('button', { name: '시작하기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(productTourStorageKey)).toBe('true');
  });

  it('allows users to skip and reopen the tour from store-backed replay', async () => {
    const user = userEvent.setup();
    renderOpenTour();

    await user.click(await screen.findByRole('button', { name: '건너뛰기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(productTourStorageKey)).toBe('true');

    act(() => useProductTourStore.getState().openTour());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('closes with Escape and keeps keyboard focus inside while open', async () => {
    const user = userEvent.setup();
    renderOpenTour();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.tab({ shift: true });
    const focusedElement = document.activeElement;
    expect(focusedElement).toBeInstanceOf(HTMLElement);
    expect(dialog).toContainElement(focusedElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(productTourStorageKey)).toBe('true');
  });
});
