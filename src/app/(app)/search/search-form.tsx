'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TYPE_ORDER, ACCOUNT_KINDS } from '@/lib/domain';
import { useApp } from '@/components/app-context';

export function SearchForm({ initial }: { initial: Record<string, string | undefined> }) {
  const { masters } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(Object.keys(initial).some((k) => !['from', 'to', 'q'].includes(k) && initial[k]));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (String(v).trim()) p.set(k, String(v).trim());
    if (!p.toString()) p.set('q', '');
    router.push(`/search?${p}`);
  }

  const v = (k: string) => initial[k] ?? '';
  return (
    <form onSubmit={onSubmit} className="card p-4 flex flex-col gap-3" key={JSON.stringify(initial)}>
      <div className="flex gap-2">
        <input name="q" defaultValue={v('q')} className="input flex-1" placeholder="내용 · 거래처 · 학교 · 메모 검색" />
        <button className="btn btn-primary">검색</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="field"><span>시작일</span><input type="date" name="from" defaultValue={v('from')} className="input" /></label>
        <label className="field"><span>종료일</span><input type="date" name="to" defaultValue={v('to')} className="input" /></label>
      </div>
      <button type="button" className="text-sm text-muted self-start underline underline-offset-4" onClick={() => setOpen((x) => !x)}>
        {open ? '상세 조건 접기' : '상세 조건 (분류 · 결제수단 · 거래처 · 금액 …)'}
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <label className="field"><span>수입/지출</span>
            <select name="flow" defaultValue={v('flow')} className="input">
              <option value="">전체</option><option value="IN">수입</option><option value="OUT">지출</option><option value="NEUTRAL">이체</option>
            </select>
          </label>
          <label className="field"><span>대분류</span>
            <select name="type" defaultValue={v('type')} className="input">
              <option value="">전체</option>{TYPE_ORDER.map((t) => <option key={t} value={t}>{t === '가계이체' ? '생활비(가계이체)' : t}</option>)}
            </select>
          </label>
          <label className="field"><span>세부 분류</span>
            <select name="category" defaultValue={v('category')} className="input">
              <option value="">전체</option>
              {TYPE_ORDER.map((t) => (
                <optgroup key={t} label={t}>
                  {masters.categories.filter((c) => c.type === t).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field"><span>결제수단 / 계좌</span>
            <select name="account" defaultValue={v('account')} className="input">
              <option value="">전체</option>
              {ACCOUNT_KINDS.map((k) => (
                <optgroup key={k} label={k}>
                  {masters.accounts.filter((a) => a.kind === k).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field"><span>거래처</span>
            <select name="vendor" defaultValue={v('vendor')} className="input">
              <option value="">전체</option>{masters.vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="field"><span>학교 / 프로젝트</span>
            <select name="project" defaultValue={v('project')} className="input">
              <option value="">전체</option>{masters.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="field"><span>최소 금액</span><input name="min" inputMode="numeric" defaultValue={v('min')} className="input" /></label>
          <label className="field"><span>최대 금액</span><input name="max" inputMode="numeric" defaultValue={v('max')} className="input" /></label>
          <label className="field"><span>태그</span><input name="tag" defaultValue={v('tag')} className="input" /></label>
          <label className="flex items-center gap-2 min-h-[48px]">
            <input type="checkbox" name="unpaid" value="1" defaultChecked={v('unpaid') === '1'} className="h-5 w-5 accent-[var(--brand)]" /> 미입금 매출만
          </label>
        </div>
      )}
    </form>
  );
}
