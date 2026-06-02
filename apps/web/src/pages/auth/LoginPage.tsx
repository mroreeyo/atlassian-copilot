import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authSessionQueryKey, login } from '../../services/auth/authClient';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: login });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    try {
      const session = await mutation.mutateAsync({ email, password });
      queryClient.setQueryData(authSessionQueryKey, session);
      setPassword('');
      navigate(returnTarget(location.state), { replace: true });
    } catch (error) {
      setPassword('');
      setNotice(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    }
  };

  return (
    <div className="page auth-page">
      <section className="auth-card card" aria-labelledby="login-title">
        <span className="badge ai">보호된 작업 공간</span>
        <div className="page-heading">
          <h1 id="login-title">로그인</h1>
          <p className="muted">기록과 설정은 로컬 계정으로 로그인한 뒤 접근할 수 있습니다. 세션은 HttpOnly 쿠키로만 유지됩니다.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {notice ? <p className="settings-notice danger" role="alert">{notice}</p> : null}
          <button className="btn primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? '로그인 중' : '로그인'}</button>
        </form>
        <p className="muted auth-switch">계정이 없나요? <Link to="/signup">가입하기</Link></p>
      </section>
    </div>
  );
}

function returnTarget(state: unknown): string {
  if (!state || typeof state !== 'object') return '/settings';
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== 'object') return '/settings';
  const pathname = (from as { pathname?: unknown }).pathname;
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return '/settings';
  const search = (from as { search?: unknown }).search;
  const hash = (from as { hash?: unknown }).hash;
  return `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`;
}
