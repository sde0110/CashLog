'use client';

import { useActionState } from 'react';
import { login } from '@/server/actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="card p-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>비밀번호</span>
        <input className="input text-lg" type="password" name="password" autoComplete="current-password" autoFocus required />
      </label>
      {state?.error && <p className="text-danger text-sm" role="alert">{state.error}</p>}
      <button className="btn btn-primary text-lg" disabled={pending}>{pending ? '확인 중…' : '들어가기'}</button>
      <p className="text-xs text-muted text-center">한 번 로그인하면 30일 동안 유지됩니다.</p>
    </form>
  );
}
