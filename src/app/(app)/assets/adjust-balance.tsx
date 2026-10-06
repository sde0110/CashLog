'use client';

import { useState, useTransition } from 'react';
import { saveAccount } from '@/server/actions';
import { useApp } from '@/components/app-context';
import { AmountInput, toNum } from '@/components/pickers';

/** 실제 잔액을 넣으면 기초잔액을 거꾸로 맞춘다 (거래 기록은 건드리지 않는다) */
export function AdjustBalance({ id, name, current, opening }: { id: number; name: string; current: number; opening: number }) {
  const { masters, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [pending, start] = useTransition();
  const acc = masters.accounts.find((a) => a.id === id);

  function save() {
    if (!acc) return;
    const actual = toNum(val) * (val.trim().startsWith('-') ? -1 : 1);
    start(async () => {
      const r = await saveAccount({ ...acc, openingBalance: opening + (actual - current) });
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast(`${name} 잔액을 맞췄습니다.`, { tone: 'ok' });
      setOpen(false);
    });
  }

  if (!open) return <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setOpen(true)}>잔액 맞추기</button>;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="card p-5 w-full max-w-sm flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg">{name} 잔액 맞추기</h3>
        <p className="text-sm text-muted">지금 장부상 잔액은 <b className="num">{current.toLocaleString('ko-KR')}원</b>입니다. 통장 앱에 보이는 오늘 잔액을 넣어 주세요.</p>
        <AmountInput value={val} onChange={setVal} autoFocus placeholder="실제 잔액" className="text-xl font-bold" />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={pending || !val}>맞추기</button>
        </div>
      </div>
    </div>
  );
}
