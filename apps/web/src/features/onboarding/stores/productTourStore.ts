import { create } from 'zustand';

export const productTourStorageKey = 'akc.productTour.v1.completed';

interface ProductTourState {
  currentStep: number;
  hasCompleted: boolean;
  isOpen: boolean;
  completeTour: () => void;
  goToStep: (step: number) => void;
  initializeTour: () => void;
  nextStep: (lastStep: number) => void;
  openTour: () => void;
  previousStep: () => void;
}

function readCompletedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(productTourStorageKey) === 'true';
  } catch {
    return false;
  }
}

function persistCompletedFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(productTourStorageKey, 'true');
  } catch {
    // Non-critical preference persistence. The tour can still be dismissed in memory.
  }
}

export const useProductTourStore = create<ProductTourState>((set) => ({
  currentStep: 0,
  hasCompleted: false,
  isOpen: false,
  completeTour: () => {
    persistCompletedFlag();
    set({ currentStep: 0, hasCompleted: true, isOpen: false });
  },
  goToStep: (step) => set({ currentStep: Math.max(0, step) }),
  initializeTour: () => {
    const hasCompleted = readCompletedFlag();
    set({ hasCompleted, isOpen: !hasCompleted, currentStep: 0 });
  },
  nextStep: (lastStep) => set((state) => ({ currentStep: Math.min(state.currentStep + 1, lastStep) })),
  openTour: () => set({ currentStep: 0, isOpen: true }),
  previousStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) }))
}));
