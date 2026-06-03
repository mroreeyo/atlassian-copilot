import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ProductTour } from '../../features/onboarding/components/ProductTour';
import { useProductTourStore } from '../../features/onboarding/stores/productTourStore';
import { authSessionQueryKey, getAuthSession, logout, startGoogleLogin } from '../../services/auth/authClient';
import { useUiStore } from '../../stores/uiStore';

export function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initializeTour = useProductTourStore((state) => state.initializeTour);
  const openTour = useProductTourStore((state) => state.openTour);
  const isTourOpen = useProductTourStore((state) => state.isOpen);
  const themeMode = useUiStore((state) => state.themeMode);
  const initializeTheme = useUiStore((state) => state.initializeTheme);
  const initializeDemoMode = useUiStore((state) => state.initializeDemoMode);
  const toggleThemeMode = useUiStore((state) => state.toggleThemeMode);
  const sessionQuery = useQuery({ queryKey: authSessionQueryKey, queryFn: getAuthSession, staleTime: 30_000 });
  const user = sessionQuery.data?.user ?? null;
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(authSessionQueryKey, { user: null });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-status'] });
      navigate('/copilot', { replace: true });
    }
  });

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
    <div className="app-shell">
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
          {user ? (
            <div className="auth-sidebar-card" aria-label="로그인 상태">
              <span className="badge success">로그인됨</span>
              <strong>{user.email}</strong>
              <button
                className="theme-toggle-button"
                type="button"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                {logoutMutation.isPending ? '로그아웃 중' : '로그아웃'}
              </button>
            </div>
          ) : (
            <div className="auth-sidebar-card" aria-label="로그인 안내">
              <span className="badge warning">기록·설정 보호됨</span>
              <button className="btn primary" type="button" onClick={() => startGoogleLogin('/settings')}>Google로 계속하기</button>
              <NavLink className="btn subtle" to="/login">로그인 옵션</NavLink>
              <NavLink className="btn subtle" to="/signup">가입 안내</NavLink>
            </div>
          )}
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
