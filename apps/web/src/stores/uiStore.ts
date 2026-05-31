import { create } from 'zustand';

export const themeStorageKey = 'akc-theme-mode';
export const demoModeStorageKey = 'akc-demo-mode.v2';
export type ThemeMode = 'dark' | 'light';

interface UiState {
  contextPanelOpen: boolean;
  themeMode: ThemeMode;
  demoMode: boolean;
  toggleContextPanel: () => void;
  initializeTheme: () => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleThemeMode: () => void;
  initializeDemoMode: () => void;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  contextPanelOpen: false,
  themeMode: readStoredThemeMode(),
  demoMode: readStoredDemoMode(),
  toggleContextPanel: () => set((state) => ({ contextPanelOpen: !state.contextPanelOpen })),
  initializeTheme: () => {
    const themeMode = readStoredThemeMode();
    applyThemeMode(themeMode);
    set({ themeMode });
  },
  setThemeMode: (themeMode) => {
    applyThemeMode(themeMode);
    set({ themeMode });
  },
  toggleThemeMode: () => {
    const themeMode = get().themeMode === 'dark' ? 'light' : 'dark';
    applyThemeMode(themeMode);
    set({ themeMode });
  },
  initializeDemoMode: () => {
    set({ demoMode: readStoredDemoMode() });
  },
  setDemoMode: (enabled) => {
    persistDemoMode(enabled);
    set({ demoMode: enabled });
  },
  toggleDemoMode: () => {
    const enabled = !get().demoMode;
    persistDemoMode(enabled);
    set({ demoMode: enabled });
  }
}));

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === 'light' ? 'light' : 'dark';
}

function applyThemeMode(themeMode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;
  if (typeof window !== 'undefined') window.localStorage.setItem(themeStorageKey, themeMode);
}

function readStoredDemoMode(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(demoModeStorageKey);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function persistDemoMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(demoModeStorageKey, String(enabled));
  } catch {
    // Non-critical preference persistence. Demo mode can still run for this session.
  }
}
