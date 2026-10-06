'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/server/actions';
import { useApp } from './app-context';

const ITEMS = [
  { href: '/', label: '가계부', icon: '📒' },
  { href: '/assets', label: '자산', icon: '🏦' },
  { href: '/reports', label: '보고서', icon: '📊' },
  { href: '/fixed', label: '고정지출', icon: '🔁' },
  { href: '/search', label: '검색', icon: '🔍' },
  { href: '/settings', label: '설정', icon: '⚙️' },
  { href: '/help', label: '도움말', icon: '❓' },
];
// 휴대폰 하단 탭은 6개 — 검색은 가계부 화면 상단 버튼으로
const MOBILE = ITEMS.filter((i) => i.href !== '/search');

export function Nav({ businessName }: { businessName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <>
      <aside className="no-print hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-surface border-r border-line p-4 gap-1">
        <Link href="/" className="flex items-center gap-3 px-3 py-4 mb-2">
          <span className="h-10 w-10 rounded-xl bg-brand text-white flex items-center justify-center text-xl font-bold">₩</span>
          <span>
            <b className="block text-lg leading-tight">캐시로그</b>
            <span className="text-xs text-muted">{businessName || '1인 사업자 장부'}</span>
          </span>
        </Link>
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex items-center gap-3 rounded-xl px-3 min-h-[48px] font-semibold ${active(i.href) ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
            <span aria-hidden>{i.icon}</span>{i.label}
          </Link>
        ))}
        <form action={logout} className="mt-auto">
          <button className="w-full text-left rounded-xl px-3 min-h-[44px] text-sm text-muted hover:bg-surface-2">로그아웃</button>
        </form>
      </aside>

      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-6">
          {MOBILE.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className={`flex flex-col items-center justify-center gap-0.5 min-h-[60px] text-[0.7rem] font-semibold ${active(i.href) ? 'text-brand-ink' : 'text-muted'}`}>
                <span className={`text-xl ${active(i.href) ? '' : 'grayscale opacity-70'}`} aria-hidden>{i.icon}</span>{i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export function Fab() {
  const { openEntry } = useApp();
  return (
    <button
      onClick={() => openEntry()}
      className="no-print fixed z-50 right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] md:right-8 md:bottom-8 h-16 pl-5 pr-6 rounded-full bg-brand text-white shadow-lg flex items-center gap-2 text-lg font-bold active:scale-95 transition"
      aria-label="거래 입력">
      <span className="text-3xl leading-none -mt-0.5">+</span> 입력
    </button>
  );
}
