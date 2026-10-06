'use client';

import { dayLabel } from '@/lib/dates';
import type { TxView } from '@/lib/ledger';
import { useApp } from './app-context';

const won = (n: number) => n.toLocaleString('ko-KR');

export function AmountText({ t, className = '' }: { t: Pick<TxView, 'flow' | 'amount'>; className?: string }) {
  const cls = t.flow === 'IN' ? 'text-in-ink' : t.flow === 'OUT' ? 'text-ink' : 'text-muted';
  const sign = t.flow === 'IN' ? '+' : t.flow === 'OUT' ? '−' : '';
  return <span className={`num font-bold ${cls} ${className}`}>{sign}{won(t.amount)}원</span>;
}

export function TxRow({ t, onClick, selected, onSelect, showDate }: {
  t: TxView; onClick?: () => void; selected?: boolean; onSelect?: (v: boolean) => void; showDate?: boolean;
}) {
  const sub = t.flow === 'NEUTRAL'
    ? `${t.fromName || '?'} → ${t.toName || '?'}`
    : [t.flow === 'IN' ? t.toName : t.fromName, t.description ? t.vendorName : '', t.projectName].filter(Boolean).join(' · ');
  const typeLabel = t.type === '가계이체' ? '생활비' : t.type === '기타' ? (t.flow === 'IN' ? '기타수입' : '기타지출') : t.type;
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 cursor-pointer" onClick={onClick}>
      {onSelect && (
        <input type="checkbox" className="h-5 w-5 accent-[var(--brand)] shrink-0" checked={!!selected}
          onClick={(e) => e.stopPropagation()} onChange={(e) => onSelect(e.target.checked)} aria-label="선택" />
      )}
      <span className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-xl ${t.flow === 'IN' ? 'bg-in-soft' : t.flow === 'OUT' ? 'bg-out-soft' : 'bg-surface-2'}`} aria-hidden>
        {t.icon || (t.flow === 'NEUTRAL' ? '🔁' : '•')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{t.description || t.vendorName || t.category}</p>
        <p className="text-sm text-muted truncate">
          <span className="text-ink-2">{typeLabel} › {t.category}</span>{sub ? ` · ${sub}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        {showDate && <p className="text-xs text-muted num">{t.date}</p>}
        <AmountText t={t} />
        {t.paymentStatus === '미입금' && <p className="text-xs font-semibold text-warn-ink">미입금</p>}
        {t.recurringId && <p className="text-xs text-muted">고정</p>}
      </div>
    </li>
  );
}

/** 날짜별로 묶은 거래 목록 (네이버 가계부 '내역' 화면) */
export function TxListByDay({ txs, empty = '기록이 없습니다.' }: { txs: TxView[]; empty?: string }) {
  const { openEntry } = useApp();
  if (!txs.length) {
    return (
      <div className="card p-10 text-center text-muted">
        <p className="text-4xl mb-2">📭</p>
        <p>{empty}</p>
        <button className="btn btn-primary mt-4" onClick={() => openEntry()}>+ 첫 거래 입력</button>
      </div>
    );
  }
  const days: { date: string; items: TxView[]; inc: number; exp: number }[] = [];
  for (const t of txs) {
    let d = days.at(-1);
    if (!d || d.date !== t.date) { d = { date: t.date, items: [], inc: 0, exp: 0 }; days.push(d); }
    d.items.push(t);
    if (t.flow === 'IN') d.inc += t.amount;
    if (t.flow === 'OUT') d.exp += t.amount;
  }
  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => (
        <section key={d.date} className="card overflow-hidden">
          <header className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-line">
            <h3 className="font-bold">{dayLabel(d.date)}</h3>
            <p className="text-sm num flex gap-3">
              {d.inc > 0 && <span className="text-in-ink">+{won(d.inc)}</span>}
              {d.exp > 0 && <span className="text-ink-2">−{won(d.exp)}</span>}
            </p>
          </header>
          <ul className="divide-y divide-line">
            {d.items.map((t) => <TxRow key={t.id} t={t} onClick={() => openEntry(t)} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
