'use client';

import { useState, useTransition } from 'react';
import { ACCOUNT_KINDS, TYPE_ORDER } from '@/lib/domain';
import type { TxView } from '@/lib/ledger';
import { bulkUpdate, deleteTransactions, restoreTransactions } from '@/server/actions';
import { useApp } from '@/components/app-context';
import { TxRow } from '@/components/tx-list';

export function SearchResults({ txs }: { txs: TxView[] }) {
  const { masters, openEntry, toast, confirm } = useApp();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const ids = [...sel];
  const selTx = txs.filter((t) => sel.has(t.id));
  const flows = new Set(selTx.map((t) => t.flow));
  const oneFlow = flows.size === 1 ? [...flows][0] : null;

  const toggle = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  function apply(patch: Parameters<typeof bulkUpdate>[1], label: string) {
    start(async () => {
      const r = await bulkUpdate(ids, patch);
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast(`${r.data}건의 ${label}을(를) 바꿨습니다.`, { tone: 'ok' });
      setSel(new Set());
    });
  }

  async function remove() {
    if (!(await confirm({ title: `${ids.length}건을 삭제할까요?`, ok: '삭제', danger: true }))) return;
    start(async () => {
      const r = await deleteTransactions(ids);
      if (!r.ok) return toast(r.error, { tone: 'error' });
      const done = r.data ?? [];
      setSel(new Set());
      toast(`${done.length}건 삭제했습니다.`, { action: { label: '되돌리기', onClick: () => { void restoreTransactions(done); } } });
    });
  }

  if (!txs.length) return <div className="card p-10 text-center text-muted">조건에 맞는 거래가 없습니다.</div>;

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-line text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={sel.size === txs.length}
              onChange={(e) => setSel(e.target.checked ? new Set(txs.map((t) => t.id)) : new Set())} />
            전체 선택
          </label>
          <span className="text-muted">선택해서 결제수단·분류를 한 번에 바꿀 수 있습니다</span>
        </div>
        <ul className="divide-y divide-line">
          {txs.map((t) => (
            <TxRow key={t.id} t={t} showDate selected={sel.has(t.id)} onSelect={(v) => toggle(t.id, v)} onClick={() => openEntry(t)} />
          ))}
        </ul>
      </div>

      {sel.size > 0 && (
        <div className="fixed z-50 inset-x-3 bottom-[calc(150px+env(safe-area-inset-bottom))] md:bottom-28 md:left-[calc(15rem+2rem)] md:right-8 card p-3 flex flex-wrap items-center gap-2 shadow-xl border border-line">
          <b className="px-2">{sel.size}건 선택</b>
          {oneFlow !== 'IN' && (
            <select className="input !min-h-[40px] !w-auto flex-1" disabled={pending} value=""
              onChange={(e) => e.target.value && apply({ fromAccountId: Number(e.target.value) }, oneFlow === 'NEUTRAL' ? '출금 계좌' : '결제수단')}>
              <option value="">{oneFlow === 'NEUTRAL' ? '출금 계좌 바꾸기…' : '결제수단 바꾸기…'}</option>
              {ACCOUNT_KINDS.map((k) => (
                <optgroup key={k} label={k}>{masters.accounts.filter((a) => a.kind === k && a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
              ))}
            </select>
          )}
          {oneFlow && (
            <select className="input !min-h-[40px] !w-auto flex-1" disabled={pending} value=""
              onChange={(e) => e.target.value && apply({ categoryId: Number(e.target.value) }, '분류')}>
              <option value="">분류 바꾸기…</option>
              {TYPE_ORDER.map((t) => (
                <optgroup key={t} label={t}>{masters.categories.filter((c) => c.type === t && c.flow === oneFlow && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              ))}
            </select>
          )}
          <button className="btn btn-danger btn-sm" onClick={remove} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>취소</button>
        </div>
      )}
    </>
  );
}
