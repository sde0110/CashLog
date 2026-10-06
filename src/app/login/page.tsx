import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-brand flex items-center justify-center text-3xl text-white">₩</div>
          <h1 className="text-2xl font-bold">캐시로그</h1>
          <p className="text-muted mt-1">1인 사업자 가계부 · 자금관리 장부</p>
        </div>
        <LoginForm next={next ?? '/'} />
      </div>
    </main>
  );
}
