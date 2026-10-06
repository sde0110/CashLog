'use client';

import { useState } from 'react';
import { lastDayOfMonth, pad2, todayKST, weekdayIndex } from '@/lib/dates';
import { dailyTotals, type TxView } from '@/lib/ledger';
import { useApp } from './app-context';
import { TxListByDay } from './tx-list';

const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : n.toLocaleString('ko-KR'));

export function MonthCalendar({ ym, txs }: { ym: string; txs: TxView[] }) {
  const { openEntry } = useApp();
  const today = todayKST();
  const [day, setDay] = useState<string | null>(today.startsWith(ym) ? today : null);
  const totals = dailyTotals(txs);
  const last = lastDayOfMonth(ym);
  const offset = weekdayIndex(`${ym}-01`);
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: last }, (_, i) => `${ym}-${pad2(i + 1)}`)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-2 sm:p-4">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
            <span key={w} className={i === 0 ? 'text-out-ink' : i === 6 ? 'text-in-ink' : ''}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const t = totals[d];
            const sel = d === day;
            return (
              <button key={d} onClick={() => setDay(d)} aria-pressed={sel}
                className={`min-h-[64px] sm:min-h-[84px] rounded-xl p-1 sm:p-2 text-left flex flex-col border-2 ${sel ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-surface-2'}`}>
                <span className={`text-sm font-semibold ${d === today ? 'bg-brand text-white rounded-full w-6 h-6 flex items-center justify-center' : ''} ${i % 7 === 0 ? 'text-out-ink' : ''}`}>
                  {Number(d.slice(8))}
                </span>
                {t?.income ? <span className="text-[0.68rem] sm:text-xs text-in-ink num leading-tight">+{short(t.income)}</span> : null}
                {t?.expense ? <span className="text-[0.68rem] sm:text-xs text-ink-2 num leading-tight">−{short(t.expense)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {day && (
        <div className="flex flex-col gap-2">
          <button className="btn btn-ghost self-end btn-sm" onClick={() => openEntry({ date: day })}>+ {Number(day.slice(5, 7))}월 {Number(day.slice(8))}일에 입력</button>
          <TxListByDay txs={txs.filter((t) => t.date === day)} empty="이 날은 기록이 없습니다." />
        </div>
      )}
    </div>
  );
}
