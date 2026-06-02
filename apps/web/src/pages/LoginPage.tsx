import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../services/copilot/brokerCopilotClient';
import { authSessionQueryKey, useAuthSession } from '../features/auth/useAuthSession';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const target = typeof location.state === 'object' && location.state && 'from' in location.state && typeof location.state.from === 'string'
    ? location.state.from
    : '/settings';

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      queryClient.setQueryData(authSessionQueryKey, data);
      setPassword('');
      navigate(target, { replace: true });
    },
    onError: () => setPassword('')
  });

  if (session.data?.user) return <Navigate to={target} replace />;

  return (
    <AuthPageShell
      title="로그인"
      subtitle="개인 설정과 작업 기록은 서버 세션으로 보호됩니다. 데모 코파일럿은 로그인 없이도 계속 사용할 수 있습니다."
      footer={<><span>계정이 없나요?</span> <Link to="/signup">회원가입</Link></>}
    >
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        loginMutation.mutate({ email, password });
      }}>
        <label>
          이메일
          <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          비밀번호
          <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {loginMutation.error ? <p className="error-text">{loginMutation.error.message}</p> : null}
        <button className="btn primary" type="submit" disabled={loginMutation.isPending}>로그인</button>
      </form>
    </AuthPageShell>
  );
}

function AuthPageShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-demo-link" to="/copilot">← 공개 데모로 돌아가기</Link>
        <p className="eyebrow">AX Knowledge Copilot</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
