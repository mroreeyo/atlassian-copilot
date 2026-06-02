import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authSessionQueryKey, signup } from '../../services/auth/authClient';

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: signup });

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
      setNotice(error instanceof Error ? error.message : '가입에 실패했습니다.');
    }
  };

  return (
    <div className="page auth-page">
      <section className="auth-card card" aria-labelledby="signup-title">
        <span className="badge ai">P0 로컬 계정</span>
        <div className="page-heading">
          <h1 id="signup-title">가입하기</h1>
          <p className="muted">데모용 로컬 계정을 만들면 개인 연결 설정과 실행 기록을 보호할 수 있습니다. 비밀번호는 브라우저에 저장하지 않습니다.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            비밀번호
            <input name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          <p className="muted">8자 이상과 기본 복잡도를 만족하는 비밀번호를 사용하세요. 서버가 최종 검증합니다.</p>
          {notice ? <p className="settings-notice danger" role="alert">{notice}</p> : null}
          <button className="btn primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? '가입 중' : '가입하기'}</button>
        </form>
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
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return '/settings';
  const search = (from as { search?: unknown }).search;
  const hash = (from as { hash?: unknown }).hash;
  return `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`;
}
