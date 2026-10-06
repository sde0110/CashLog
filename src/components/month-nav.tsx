import Link from 'next/link';
import { shiftYm, ymLabel } from '@/lib/dates';

/** ‹ 2026년 8월 › — 쿼리스트링의 ym 만 바꾼다 */
export function MonthNav({ ym, path, extra = {}, max }: { ym: string; path: string; extra?: Record<string, string>; max?: string }) {
  const href = (y: string) => `${path}?${new URLSearchParams({ ...extra, ym: y })}`;
  const next = shiftYm(ym, 1);
  return (
    <div className="flex items-center gap-1">
      <Link href={href(shiftYm(ym, -1))} className="btn btn-ghost btn-sm !px-3 text-xl" aria-label="이전 달">‹</Link>
      <h1 className="text-xl md:text-2xl font-bold min-w-[8.5rem] text-center">{ymLabel(ym)}</h1>
      {max && next > max
        ? <span className="btn btn-sm !px-3 text-xl opacity-30" aria-hidden>›</span>
        : <Link href={href(next)} className="btn btn-ghost btn-sm !px-3 text-xl" aria-label="다음 달">›</Link>}
    </div>
  );
}

export function Tabs({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div className="seg no-print" role="tablist">
      {items.map((i) => (
        <Link key={i.key} href={i.href} role="tab" aria-selected={current === i.key}
          className={`flex-1 min-h-[42px] rounded-[9px] font-semibold flex items-center justify-center text-[0.95rem] ${current === i.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
