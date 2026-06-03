import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authSessionQueryKey, isLocalAuthEnabled, normalizeAuthReturnTo, signup, startGoogleLogin } from '../../services/auth/authClient';

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: signup });
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
      setNotice(error instanceof Error ? error.message : '가입에 실패했습니다.');
    }
  };

  return (
    <div className="page auth-page">
      <section className="auth-card card" aria-labelledby="signup-title">
        <span className="badge ai">Google 최초 로그인 가입</span>
        <div className="page-heading">
          <h1 id="signup-title">Google로 작업 공간 만들기</h1>
          <p className="muted">최초 Google 로그인 시 AX Knowledge Copilot 계정이 생성됩니다. Google 계정의 안정적인 식별자 기반으로 연결되며 이메일만으로 계정을 병합하지 않습니다.</p>
        </div>
        <div className="auth-provider-panel" aria-label="Google 가입">
          <button className="btn primary auth-google-button" type="button" onClick={() => startGoogleLogin(returnTo)}>
            Google로 계속하기
          </button>
          <p className="muted">Google로 계속하면 최초 로그인 시 계정이 생성됩니다. 기존 전역 설정이나 비밀 값은 새 Google 사용자에게 자동 배정되지 않습니다.</p>
        </div>
        {notice ? <p className="settings-notice danger" role="alert">{notice}</p> : null}
        {localAuth ? (
          <>
            <div className="auth-divider" role="separator"><span>dev/demo 로컬 계정</span></div>
            <form className="auth-form" onSubmit={onSubmit} aria-label="로컬 이메일 가입">
              <label>
                이메일
                <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
              </label>
              <p className="muted">8자 이상과 기본 복잡도를 만족하는 비밀번호를 사용하세요. 서버가 최종 검증합니다.</p>
              <button className="btn subtle" type="submit" disabled={mutation.isPending}>{mutation.isPending ? '가입 중' : '로컬 계정 만들기'}</button>
            </form>
          </>
        ) : (
          <p className="settings-notice ai">로컬 이메일/비밀번호 가입은 현재 환경에서 비활성화되어 있습니다. Google 최초 로그인으로 계정을 생성하세요.</p>
        )}
        <p className="muted auth-switch">이미 계정이 있나요? <Link to="/login">로그인</Link></p>
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
