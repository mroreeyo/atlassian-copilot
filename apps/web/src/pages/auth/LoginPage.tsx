import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authSessionQueryKey, isLocalAuthEnabled, login, normalizeAuthReturnTo, startGoogleLogin } from '../../services/auth/authClient';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(authErrorNotice(location.search));
  const mutation = useMutation({ mutationFn: login });
  const localAuth = isLocalAuthEnabled();
  const returnTo = returnTarget(location.state);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    try {
      const session = await mutation.mutateAsync({ email, password });
      queryClient.setQueryData(authSessionQueryKey, session);
      setPassword('');
      navigate(returnTo, { replace: true });
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
          <p className="muted">Google로 로그인하면 계정이 없을 경우 자동으로 작업 공간이 생성됩니다. 세션은 HttpOnly 쿠키로만 유지됩니다.</p>
        </div>
        <div className="auth-provider-panel" aria-label="Google 로그인">
          <button className="btn primary auth-google-button" type="button" onClick={() => startGoogleLogin(returnTo)}>
            Google로 계속하기
          </button>
          <p className="muted">최초 Google 로그인 시 AX Knowledge Copilot 계정이 생성됩니다. 브라우저는 Google 토큰이나 코드를 저장하지 않고 Broker 시작 경로로만 이동합니다.</p>
        </div>
        {notice ? <p className="settings-notice danger" role="alert">{notice}</p> : null}
        {localAuth ? (
          <>
            <div className="auth-divider" role="separator"><span>또는 로컬 계정</span></div>
            <form className="auth-form" onSubmit={onSubmit} aria-label="로컬 이메일 로그인">
              <label>
                이메일
                <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <button className="btn subtle" type="submit" disabled={mutation.isPending}>{mutation.isPending ? '로그인 중' : '로컬 계정으로 로그인'}</button>
            </form>
          </>
        ) : (
          <p className="settings-notice ai">로컬 이메일/비밀번호 로그인은 현재 환경에서 비활성화되어 있습니다. Google 로그인을 사용하세요.</p>
        )}
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
  const search = (from as { search?: unknown }).search;
  const hash = (from as { hash?: unknown }).hash;
  return normalizeAuthReturnTo(`${typeof pathname === 'string' ? pathname : ''}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`);
}

function authErrorNotice(search: string): string | null {
  const error = new URLSearchParams(search).get('authError');
  if (error === 'domain_denied') return '허용되지 않은 Google Workspace 도메인입니다. 관리자에게 문의하세요.';
  if (error === 'callback_failed') return 'Google 로그인 콜백 처리에 실패했습니다. 다시 시도해 주세요.';
  if (error === 'cookie_blocked') return '로그인 쿠키를 저장할 수 없습니다. 브라우저 쿠키 설정을 확인해 주세요.';
  return null;
}
