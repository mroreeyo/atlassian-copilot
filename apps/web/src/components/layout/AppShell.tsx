import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ProductTour } from '../../features/onboarding/components/ProductTour';
import { useProductTourStore } from '../../features/onboarding/stores/productTourStore';
import { useUiStore } from '../../stores/uiStore';

export function AppShell() {
  const initializeTour = useProductTourStore((state) => state.initializeTour);
  const openTour = useProductTourStore((state) => state.openTour);
  const isTourOpen = useProductTourStore((state) => state.isOpen);
  const themeMode = useUiStore((state) => state.themeMode);
  const initializeTheme = useUiStore((state) => state.initializeTheme);
  const initializeDemoMode = useUiStore((state) => state.initializeDemoMode);
  const toggleThemeMode = useUiStore((state) => state.toggleThemeMode);

  useEffect(() => {
    initializeTour();
  }, [initializeTour]);

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  useEffect(() => {
    initializeDemoMode();
  }, [initializeDemoMode]);

  return (
    <div className="app-shell min-h-screen">
      <aside className="sidebar" aria-label="기본 탐색" aria-hidden={isTourOpen ? true : undefined}>
        <div className="brand">
          <strong>Atlassian 코파일럿</strong>
          <span>업무 이슈와 문서를 한곳에서 묻고 확인하세요</span>
        </div>
        <nav className="nav">
          <NavLink to="/copilot">Atlassian 코파일럿</NavLink>
          <NavLink to="/history">기록</NavLink>
          <NavLink to="/settings">설정</NavLink>
        </nav>
        <div className="sidebar-helper">
          <p className="muted">질문하고, 참고한 항목을 확인하고, 필요한 변경은 실행 전에 검토합니다.</p>
          <button className="theme-toggle-button" type="button" onClick={toggleThemeMode} aria-pressed={themeMode === 'light'}>
            {themeMode === 'dark' ? '밝은 화면으로 보기' : '어두운 화면으로 보기'}
          </button>
          <button className="tour-replay-button" type="button" onClick={openTour}>빠른 둘러보기</button>
        </div>
      </aside>
      <main className="shell-main" aria-hidden={isTourOpen ? true : undefined}>
        <Outlet />
      </main>
      <ProductTour />
    </div>
  );
}
