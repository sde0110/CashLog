'use client';

import { useState, useTransition } from 'react';
import { ACCOUNT_KINDS, PAYMENT_KINDS, hasVat, type Direction } from '@/lib/domain';
import { ymLabel } from '@/lib/dates';
import { deleteRecurring, generateRecurring, saveRecurring } from '@/server/actions';
import { useApp } from '@/components/app-context';
import { AccountPicker, AmountInput, CategoryPicker, fmt, toNum } from '@/components/pickers';

export interface FixedItem {
  id: number; title: string; categoryId: number; category: string; type: string; flow: string; icon: string;
  amount: number; supplyAmount: number; vat: number; dayOfMonth: number;
  fromAccountId: number | null; toAccountId: number | null; fromName: string; toName: string;
  vendorName: string; projectName: string; description: string; memo: string; tags: string; active: boolean; done: boolean;
}

export function FixedList({ ym, items }: { ym: string; items: FixedItem[] }) {
  const { toast } = useApp();
  const todo = items.filter((i) => i.active && !i.done);
  const [sel, setSel] = useState<Set<number>>(() => new Set(todo.map((i) => i.id)));
  const [editing, setEditing] = useState<Partial<FixedItem> | null>(null);
  const [pending, start] = useTransition();
  const chosen = todo.filter((i) => sel.has(i.id));
  const total = chosen.reduce((s, i) => s + (i.flow === 'IN' ? 0 : i.amount), 0);

  function generate() {
    start(async () => {
      const r = await generateRecurring(ym, chosen.map((i) => i.id));
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast(`${ymLabel(ym)}에 ${r.data}건을 넣었습니다.`, { tone: 'ok' });
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <p>아직 등록된 고정지출이 없습니다.</p>
            <p className="text-sm mt-1">거래를 입력할 때 <b>“매달 나가는 고정지출이에요”</b>를 체크하거나, 아래 버튼으로 등록하세요.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className={`flex items-center gap-3 px-4 py-3 ${!i.active ? 'opacity-50' : ''}`}>
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand)] shrink-0" aria-label={`${i.title} 선택`}
                  disabled={!i.active || i.done} checked={sel.has(i.id) && !i.done && i.active}
                  onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                <span className="w-12 text-center shrink-0">
                  <span className="block text-xs text-muted">매월</span><b>{i.dayOfMonth}일</b>
                </span>
                <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(i)}>
                  <p className="font-semibold truncate">{i.icon} {i.title}</p>
                  <p className="text-sm text-muted truncate">{i.category}{i.fromName ? ` · ${i.fromName}` : ''}{i.toName ? ` → ${i.toName}` : ''}</p>
                </button>
                <span className="text-right shrink-0">
                  <b className={`num ${i.flow === 'IN' ? 'text-in-ink' : ''}`}>{i.amount.toLocaleString('ko-KR')}원</b>
                  <span className={`block text-xs font-semibold ${i.done ? 'text-brand-ink' : i.active ? 'text-warn-ink' : 'text-muted'}`}>
                    {!i.active ? '쉬는 중' : i.done ? '✓ 넣음' : '아직 안 넣음'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button className="btn btn-ghost" onClick={() => setEditing({ flow: 'OUT', dayOfMonth: 1, active: true })}>+ 고정지출 등록</button>
        <button className="btn btn-primary flex-1 text-lg" onClick={generate} disabled={pending || !chosen.length}>
          {pending ? '넣는 중…' : chosen.length ? `선택한 ${chosen.length}건 ${ymLabel(ym)}에 넣기${total ? ` (지출 ${total.toLocaleString('ko-KR')}원)` : ''}` : `${ymLabel(ym)}에 넣을 항목이 없습니다`}
        </button>
      </div>

      {editing && <FixedForm item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function FixedForm({ item, onClose }: { item: Partial<FixedItem>; onClose: () => void }) {
  const { masters, toast, confirm } = useApp();
  const [direction, setDirection] = useState<Direction>((item.flow as Direction) ?? 'OUT');
  const [categoryId, setCategoryId] = useState<number | null>(item.categoryId ?? null);
  const [title, setTitle] = useState(item.title ?? '');
  const [amount, setAmount] = useState(fmt(item.amount ?? 0));
  const [day, setDay] = useState(String(item.dayOfMonth ?? 1));
  const [fromId, setFromId] = useState<number | null>(item.fromAccountId ?? null);
  const [toId, setToId] = useState<number | null>(item.toAccountId ?? null);
  const [vendorName, setVendorName] = useState(item.vendorName ?? '');
  const [active, setActive] = useState(item.active ?? true);
  const [pending, start] = useTransition();
  const cat = masters.categories.find((c) => c.id === categoryId);
  const vatRate = Number(masters.settings.vat_rate) || 0.1;

  function save() {
    if (!cat) return toast('분류를 골라 주세요.', { tone: 'error' });
    const total = toNum(amount);
    const keepSplit = item.amount === total && item.vat !== undefined && item.vat > 0;
    const supply = hasVat(cat.type) ? (keepSplit ? item.supplyAmount! : Math.round(total / (1 + vatRate))) : total;
    start(async () => {
      const r = await saveRecurring({
        id: item.id, title, categoryId: cat.id, amount: total, supplyAmount: supply, vat: total - supply,
        fromAccountId: fromId, toAccountId: toId, vendorName, projectName: item.projectName, dayOfMonth: day,
        description: item.description ?? title, memo: item.memo, tags: item.tags, active,
      });
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast('저장했습니다.', { tone: 'ok' });
      onClose();
    });
  }

  async function remove() {
    if (!item.id || !(await confirm({ title: '이 고정지출을 지울까요?', body: '이미 넣은 거래는 그대로 남습니다.', ok: '지우기', danger: true }))) return;
    start(async () => {
      const r = await deleteRecurring(item.id!);
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast('지웠습니다.');
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="anim-sheet bg-surface w-full md:max-w-xl max-h-[94dvh] rounded-t-3xl md:rounded-3xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold flex-1">{item.id ? '고정지출 수정' : '고정지출 등록'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </header>
        <div className="overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          <div className="seg">
            {(['OUT', 'IN', 'NEUTRAL'] as Direction[]).map((d) => (
              <button key={d} type="button" aria-pressed={direction === d} disabled={!!item.id && d !== direction}
                onClick={() => { setDirection(d); setCategoryId(null); }}>{d === 'OUT' ? '지출' : d === 'IN' ? '수입' : '이체'}</button>
            ))}
          </div>
          <label className="field"><span>이름</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 세무사 수수료, 아파트 관리비" /></label>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <label className="field"><span>금액</span><AmountInput value={amount} onChange={setAmount} className="text-xl font-bold" /></label>
            <label className="field"><span>매월 며칠</span>
              <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일{i === 30 ? '(말일)' : ''}</option>)}
              </select>
            </label>
          </div>
          <CategoryPicker categories={masters.categories} direction={direction} value={categoryId} onChange={setCategoryId} />
          {direction !== 'IN' && (
            <div><h3 className="text-sm font-semibold text-ink-2 mb-2">{direction === 'OUT' ? '결제수단' : '보내는 곳'}</h3>
              <AccountPicker accounts={masters.accounts} kinds={direction === 'OUT' ? PAYMENT_KINDS : ACCOUNT_KINDS} value={fromId} onChange={setFromId} exclude={toId} /></div>
          )}
          {direction !== 'OUT' && (
            <div><h3 className="text-sm font-semibold text-ink-2 mb-2">{direction === 'IN' ? '입금된 곳' : '받는 곳'}</h3>
              <AccountPicker accounts={masters.accounts} kinds={ACCOUNT_KINDS} value={toId} onChange={setToId} exclude={fromId} /></div>
          )}
          {cat && hasVat(cat.type) && (
            <label className="field"><span>거래처</span><input className="input" list="dl-vendors" value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></label>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용 중 (끄면 목록에만 남고 넣지 않습니다)</label>
        </div>
        <footer className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] flex gap-2">
          {item.id && <button className="btn btn-danger" onClick={remove} disabled={pending}>지우기</button>}
          <button className="btn btn-primary flex-1 text-lg" onClick={save} disabled={pending}>{pending ? '저장 중…' : '저장'}</button>
        </footer>
      </div>
    </div>
  );
}
