import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthSession } from './useAuthSession';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = useAuthSession();

  if (session.isLoading) {
    return (
      <section className="page">
        <div className="support-panel">
          <p className="muted">로그인 세션을 확인하고 있습니다.</p>
        </div>
      </section>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
