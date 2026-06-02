import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { signup } from '../services/copilot/brokerCopilotClient';
import { authSessionQueryKey, useAuthSession } from '../features/auth/useAuthSession';

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signupMutation = useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      queryClient.setQueryData(authSessionQueryKey, data);
      setPassword('');
      navigate('/settings', { replace: true });
    },
    onError: () => setPassword('')
  });

  if (session.data?.user) return <Navigate to="/settings" replace />;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-demo-link" to="/copilot">← 공개 데모로 돌아가기</Link>
        <p className="eyebrow">AX Knowledge Copilot</p>
        <h1>회원가입</h1>
        <p>이메일과 강한 비밀번호로 로컬 계정을 만듭니다. 비밀번호는 브라우저 저장소에 저장되지 않습니다.</p>
        <form className="auth-form" onSubmit={(event) => {
          event.preventDefault();
          signupMutation.mutate({ email, password });
        }}>
          <label>
            이메일
            <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="new-password"
              type="password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="password-help"
              required
            />
          </label>
          <p id="password-help" className="muted">10자 이상, 영문 대문자·소문자·숫자를 포함하세요.</p>
          {signupMutation.error ? <p className="error-text">{signupMutation.error.message}</p> : null}
          <button className="btn primary" type="submit" disabled={signupMutation.isPending}>계정 만들기</button>
        </form>
        <div className="auth-footer"><span>이미 계정이 있나요?</span> <Link to="/login">로그인</Link></div>
      </section>
    </main>
  );
}
