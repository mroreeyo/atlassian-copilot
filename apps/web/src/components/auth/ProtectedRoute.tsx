import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authSessionQueryKey, getAuthSession } from '../../services/auth/authClient';

export function ProtectedRoute() {
  const location = useLocation();
  const sessionQuery = useQuery({ queryKey: authSessionQueryKey, queryFn: getAuthSession, staleTime: 30_000 });

  if (sessionQuery.isLoading) {
    return (
      <div className="page">
        <div className="card auth-status" role="status" aria-live="polite">로그인 상태를 확인하는 중입니다.</div>
      </div>
    );
  }

  if (sessionQuery.error) {
    return (
      <div className="page">
        <div className="card auth-status" role="alert">세션 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.</div>
      </div>
    );
  }

  if (!sessionQuery.data?.user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
