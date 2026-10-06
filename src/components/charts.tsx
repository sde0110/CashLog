'use client';

import { useState } from 'react';
import type { Group } from '@/lib/ledger';

const won = (n: number) => n.toLocaleString('ko-KR');

/** 항목별 금액 막대 (한 계열 = 한 색, 값과 비율을 직접 표기) */
export function BarList({ groups, tone = 'out', max = 12, onPick }: {
  groups: Group[]; tone?: 'in' | 'out' | 'neutral'; max?: number; onPick?: (g: Group) => void;
}) {
  const [all, setAll] = useState(false);
  const total = groups.reduce((s, g) => s + g.amount, 0);
  if (!groups.length) return <p className="text-muted text-sm py-6 text-center">기록이 없습니다.</p>;
  const top = groups[0].amount || 1;
  const shown = all ? groups : groups.slice(0, max);
  const fill = tone === 'in' ? 'var(--in)' : tone === 'out' ? 'var(--out)' : 'var(--neutral)';
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {shown.map((g) => {
          const pct = total ? Math.round((g.amount / total) * 1000) / 10 : 0;
          return (
            <li key={g.key} className={onPick ? 'cursor-pointer' : ''} onClick={() => onPick?.(g)}
              title={`${g.label}: ${won(g.amount)}원 · ${g.count}건 · ${pct}%`}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="truncate font-medium">{g.icon ? `${g.icon} ` : ''}{g.label}</span>
                <span className="num shrink-0 text-sm"><b>{won(g.amount)}원</b> <span className="text-muted">{pct}%</span></span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max((g.amount / top) * 100, 1.5)}%`, background: fill }} />
              </div>
            </li>
          );
        })}
      </ul>
      {groups.length > max && (
        <button className="btn btn-ghost btn-sm w-full mt-3" onClick={() => setAll((v) => !v)}>
          {all ? '접기' : `나머지 ${groups.length - max}개 더 보기`}
        </button>
      )}
    </div>
  );
}

/** 월별 수입·지출 막대 (같은 축 하나, 범례 + 마우스 올리면 금액) */
export function MonthlyBars({ months }: { months: { ym: string; totalIn: number; totalOut: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.totalIn, m.totalOut]));
  const h = hover !== null ? months[hover] : null;
  return (
    <div>
      <div className="flex items-center gap-4 text-sm mb-3">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm" style={{ background: 'var(--in)' }} />수입</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm" style={{ background: 'var(--out)' }} />지출 (사업 + 생활비)</span>
        <span className="ml-auto text-muted num min-h-[1.25rem]">
          {h ? `${Number(h.ym.slice(5))}월 · 수입 ${won(h.totalIn)} · 지출 ${won(h.totalOut)}` : '막대에 손가락/마우스를 올려 보세요'}
        </span>
      </div>
      <div className="relative h-48 flex items-end gap-1 sm:gap-2 border-b border-line" onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => (
          <div key={m.ym} className={`flex-1 h-full flex items-end justify-center gap-[2px] rounded-t-md ${hover === i ? 'bg-surface-2' : ''}`}
            onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
            <div className="w-[38%] rounded-t-[4px]" style={{ height: `${(m.totalIn / max) * 100}%`, background: 'var(--in)' }} />
            <div className="w-[38%] rounded-t-[4px]" style={{ height: `${(m.totalOut / max) * 100}%`, background: 'var(--out)' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1">
        {months.map((m) => <span key={m.ym} className="flex-1 text-center text-xs text-muted">{Number(m.ym.slice(5))}</span>)}
      </div>
    </div>
  );
}
