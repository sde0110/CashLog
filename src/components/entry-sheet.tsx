'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  DIRECTION_LABEL, MATURITY_CATEGORIES, PAYMENT_KINDS, ACCOUNT_KINDS, hasVat, type Direction,
} from '@/lib/domain';
import { todayKST } from '@/lib/dates';
import { deleteTransactions, restoreTransactions, saveTransaction } from '@/server/actions';
import { useApp, type EntryPrefill } from './app-context';
import { AccountPicker, AmountInput, CategoryPicker, fmt, toNum } from './pickers';

const LAST_KEY = 'cashlog:last';
const IN_KINDS = ['통장', '현금', '페이', '저축·투자', '기타자산'] as const;

type VatMode = 'incl' | 'none' | 'manual';

function readLast(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}'); } catch { return {}; }
}
function writeLast(patch: Record<string, number | null>) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...readLast(), ...patch })); } catch { /* 무시 */ }
}

export function EntrySheet() {
  const { entry, closeEntry } = useApp();
  if (!entry) return null;
  return <EntryForm key={entry.id ?? 'new'} prefill={entry} onClose={closeEntry} />;
}

function EntryForm({ prefill, onClose }: { prefill: EntryPrefill; onClose: () => void }) {
  const { masters, toast, confirm } = useApp();
  const editing = !!prefill.id;
  const vatRate = Number(masters.settings.vat_rate) || 0.1;

  const [direction, setDirection] = useState<Direction>(prefill.direction ?? (prefill.flow as Direction) ?? 'OUT');
  const [categoryId, setCategoryId] = useState<number | null>(prefill.categoryId ?? null);
  const [date, setDate] = useState(prefill.date ?? todayKST());
  const [amount, setAmount] = useState(fmt(prefill.amount ?? 0));
  const [vatMode, setVatMode] = useState<VatMode>(() => {
    if (!prefill.id) return 'incl';
    if (!prefill.vat) return 'none';
    const auto = (prefill.amount ?? 0) - Math.round((prefill.amount ?? 0) / (1 + vatRate));
    return auto === prefill.vat ? 'incl' : 'manual';
  });
  const [supply, setSupply] = useState(fmt(prefill.supplyAmount ?? 0));
  const [vatStr, setVatStr] = useState(fmt(prefill.vat ?? 0));
  const [fromId, setFromId] = useState<number | null>(prefill.fromAccountId ?? null);
  const [toId, setToId] = useState<number | null>(prefill.toAccountId ?? null);
  const [vendorName, setVendorName] = useState(prefill.vendorName ?? '');
  const [projectName, setProjectName] = useState(prefill.projectName ?? '');
  const [description, setDescription] = useState(prefill.description ?? '');
  const [memo, setMemo] = useState(prefill.memo ?? '');
  const [tags, setTags] = useState((prefill.tags ?? []).join(', '));
  const [paymentStatus, setPaymentStatus] = useState(prefill.paymentStatus ?? '입금완료');
  const [invoiceStatus, setInvoiceStatus] = useState(prefill.invoiceStatus ?? '발행');
  const [interest, setInterest] = useState('');
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [more, setMore] = useState(!!(prefill.memo || prefill.tags?.length));
  const [pending, start] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  const category = masters.categories.find((c) => c.id === categoryId) ?? null;
  const vatable = !!category && hasVat(category.type);
  const isSales = category?.type === '사업매출';
  const isBiz = vatable;
  const isMaturity = !!category && MATURITY_CATEGORIES.includes(category.name);

  // 새 입력이면 지난번에 쓴 결제수단을 미리 골라 둔다
  useEffect(() => {
    if (editing) return;
    const last = readLast();
    const ok = (id?: number) => (id && masters.accounts.some((a) => a.id === id && a.active) ? id : null);
    if (direction === 'OUT') { setFromId(ok(last.out)); setToId(null); }
    if (direction === 'IN') { setToId(ok(last.in)); setFromId(null); }
    if (direction === 'NEUTRAL') { setFromId(ok(last.tfrom)); setToId(ok(last.tto)); }
  }, [direction, editing, masters.accounts]);

  useEffect(() => { if (!editing) amountRef.current?.focus(); }, [editing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const total = toNum(amount);
  const split = useMemo(() => {
    if (!vatable || vatMode === 'none') return { supply: total, vat: 0 };
    if (vatMode === 'manual') return { supply: toNum(supply), vat: toNum(vatStr) };
    const s = Math.round(total / (1 + vatRate));
    return { supply: s, vat: total - s };
  }, [vatable, vatMode, total, supply, vatStr, vatRate]);

  function changeDirection(d: Direction) {
    if (editing || d === direction) return;
    setDirection(d);
    setCategoryId(null);
  }

  function reset() {
    setAmount(''); setDescription(''); setMemo(''); setTags(''); setInterest(''); setVendorName('');
    setProjectName(''); setMakeRecurring(false); setVatMode('incl');
    amountRef.current?.focus();
  }

  function submit(keepOpen: boolean, confirmed = false) {
    if (!category) { toast('분류를 골라 주세요.', { tone: 'error' }); return; }
    if (!total) { toast('금액을 입력해 주세요.', { tone: 'error' }); amountRef.current?.focus(); return; }
    if (vatable && vatMode === 'manual' && split.supply + split.vat !== total) {
      toast('공급가액 + 부가세가 금액과 맞지 않습니다.', { tone: 'error' }); return;
    }
    start(async () => {
      const res = await saveTransaction({
        id: prefill.id, date, categoryId: category.id, amount: total,
        supplyAmount: split.supply, vat: split.vat,
        fromAccountId: fromId, toAccountId: toId,
        vendorName: category.flow === 'NEUTRAL' ? '' : vendorName, projectName: isBiz ? projectName : '',
        description, memo, tags,
        paymentStatus: isSales ? paymentStatus : '입금완료',
        invoiceStatus: isBiz ? invoiceStatus : '해당없음',
        interestAmount: isMaturity ? toNum(interest) : 0,
        makeRecurring: !editing && makeRecurring,
        confirmed,
      });
      if (!res.ok) { toast(res.error, { tone: 'error' }); return; }
      const r = res.data!;
      if (!r.ok) {
        const yes = await confirm({
          title: '저장하기 전에 확인해 주세요',
          body: (
            <ul className="flex flex-col gap-3 text-sm">
              {r.warnings.map((w) => (
                <li key={w.code}>
                  <p className="font-semibold text-ink">{w.message}</p>
                  {w.items?.map((it, i) => (
                    <p key={i} className="text-muted mt-0.5">· {it.date} {it.label} {it.amount.toLocaleString('ko-KR')}원</p>
                  ))}
                </li>
              ))}
            </ul>
          ),
          ok: '그대로 저장',
        });
        if (yes) submit(keepOpen, true);
        return;
      }
      if (direction === 'OUT') writeLast({ out: fromId });
      if (direction === 'IN') writeLast({ in: toId });
      if (direction === 'NEUTRAL') writeLast({ tfrom: fromId, tto: toId });
      toast(editing ? '수정했습니다.' : '저장했습니다.', { tone: 'ok' });
      if (r.extra) setTimeout(() => toast(r.extra!, { tone: 'info' }), 300);
      if (keepOpen) reset(); else onClose();
    });
  }

  async function remove() {
    if (!prefill.id) return;
    const yes = await confirm({ title: '이 거래를 삭제할까요?', body: '삭제한 뒤에도 바로 되돌릴 수 있습니다.', ok: '삭제', danger: true });
    if (!yes) return;
    start(async () => {
      const res = await deleteTransactions([prefill.id!]);
      if (!res.ok) { toast(res.error, { tone: 'error' }); return; }
      const ids = res.data ?? [];
      onClose();
      toast(ids.length > 1 ? `함께 생긴 거래까지 ${ids.length}건 삭제했습니다.` : '삭제했습니다.', {
        action: { label: '되돌리기', onClick: () => { void restoreTransactions(ids); } },
      });
    });
  }

  const accounts = masters.accounts;
  const tone = direction === 'IN' ? 'text-in-ink' : direction === 'OUT' ? 'text-out-ink' : 'text-ink';

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center anim-fade" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={editing ? '거래 수정' : '거래 입력'}
        className="anim-sheet bg-surface w-full md:max-w-xl max-h-[94dvh] md:max-h-[90dvh] rounded-t-3xl md:rounded-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold flex-1">{editing ? '거래 수정' : '새 거래'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">닫기</button>
        </header>

        <div className="overflow-y-auto px-5 pb-4 flex flex-col gap-5">
          <div className="seg" role="tablist">
            {(['OUT', 'IN', 'NEUTRAL'] as Direction[]).map((d) => (
              <button key={d} type="button" aria-pressed={direction === d} onClick={() => changeDirection(d)}
                disabled={editing && d !== direction}
                className={direction === d ? (d === 'IN' ? '!text-in-ink' : d === 'OUT' ? '!text-out-ink' : '') : ''}>
                {DIRECTION_LABEL[d]}
              </button>
            ))}
          </div>
          {direction === 'NEUTRAL' && (
            <p className="text-sm text-muted -mt-2">통장 → 예금, 현금 인출, 카드대금처럼 <b className="text-ink-2">내 돈의 자리만 바뀌는 것</b>입니다. 수입·지출 합계에 들어가지 않습니다.</p>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="field">
              <span>금액</span>
              <div className="relative">
                <AmountInput ref={amountRef} value={amount} onChange={setAmount} placeholder="0" className={`!min-h-[60px] !text-3xl font-bold pr-10 ${tone}`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted text-lg">원</span>
              </div>
            </label>
            <label className="field">
              <span>날짜</span>
              <input type="date" className="input !min-h-[60px]" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>
          <div className="flex gap-2 -mt-3 scroll-x">
            {[10_000, 50_000, 100_000, 1_000_000].map((n) => (
              <button key={n} type="button" className="chip !min-h-[34px] text-sm" onClick={() => setAmount(fmt(total + n))}>
                +{n >= 10_000 ? `${n / 10_000}만` : n}
              </button>
            ))}
            {total > 0 && <button type="button" className="chip !min-h-[34px] text-sm" onClick={() => setAmount('')}>지우기</button>}
          </div>

          <section>
            <h3 className="text-sm font-semibold text-ink-2 mb-2">분류</h3>
            <CategoryPicker categories={masters.categories} direction={direction} value={categoryId} onChange={setCategoryId} />
            {category?.memo && <p className="text-xs text-muted mt-2">ℹ️ {category.memo}</p>}
          </section>

          {vatable && total > 0 && (
            <section className="rounded-2xl bg-surface-2 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">부가세</span>
                <div className="seg !p-1 text-sm">
                  {([['incl', '10% 포함'], ['none', '없음'], ['manual', '직접']] as [VatMode, string][]).map(([k, l]) => (
                    <button key={k} type="button" className="!min-h-[34px] px-3" aria-pressed={vatMode === k}
                      onClick={() => { setVatMode(k); if (k === 'manual') { setSupply(fmt(split.supply)); setVatStr(fmt(split.vat)); } }}>{l}</button>
                  ))}
                </div>
              </div>
              {vatMode === 'manual' ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="field"><span>공급가액</span><AmountInput value={supply} onChange={(v) => { setSupply(v); setVatStr(fmt(Math.max(total - toNum(v), 0))); }} /></label>
                  <label className="field"><span>부가세</span><AmountInput value={vatStr} onChange={setVatStr} /></label>
                </div>
              ) : (
                <p className="text-sm text-muted num">공급가액 {split.supply.toLocaleString('ko-KR')}원 + 부가세 {split.vat.toLocaleString('ko-KR')}원</p>
              )}
            </section>
          )}

          {direction === 'OUT' && (
            <section>
              <h3 className="text-sm font-semibold text-ink-2 mb-2">결제수단 <span className="font-normal text-muted">— 어디서 돈이 나갔나요?</span></h3>
              <AccountPicker accounts={accounts} kinds={PAYMENT_KINDS} value={fromId} onChange={setFromId} />
              <p className="text-xs text-muted mt-2">💵 현금으로 냈다면 <b>현금</b>을 고르세요. 통장에서 현금을 뽑은 일은 <b>이체 › 현금인출</b>로 적습니다.</p>
            </section>
          )}
          {direction === 'IN' && (
            <section>
              <h3 className="text-sm font-semibold text-ink-2 mb-2">입금된 곳</h3>
              <AccountPicker accounts={accounts} kinds={IN_KINDS} value={toId} onChange={setToId} />
            </section>
          )}
          {direction === 'NEUTRAL' && (
            <section className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-2 mb-2">보내는 곳 (출금)</h3>
                <AccountPicker accounts={accounts} kinds={ACCOUNT_KINDS} value={fromId} onChange={setFromId} exclude={toId} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-2 mb-2">받는 곳 (입금)</h3>
                <AccountPicker accounts={accounts} kinds={ACCOUNT_KINDS} value={toId} onChange={setToId} exclude={fromId} />
              </div>
            </section>
          )}

          {isMaturity && !editing && (
            <label className="field">
              <span>이자 (따로 받은 금액)</span>
              <AmountInput value={interest} onChange={setInterest} placeholder="예: 50,000" />
              <small className="text-xs text-muted">위 금액은 원금만 적으세요. 이자는 <b>기타수입 › 금융수입</b>으로 따로 기록됩니다.</small>
            </label>
          )}

          <label className="field">
            <span>내용</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={direction === 'OUT' ? '예: 점심 식사, 주유' : '예: ○○초 사물함 납품'} maxLength={200} />
          </label>

          {direction !== 'NEUTRAL' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="field">
                <span>{isBiz ? '거래처' : '사용처 · 거래처'}</span>
                <input className="input" list="dl-vendors" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder={isBiz ? '입력하면 자동 등록' : '예: ○○식당, ○○치과'} />
              </label>
              {isBiz && (
                <label className="field">
                  <span>학교 / 프로젝트</span>
                  <input className="input" list="dl-projects" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="예: 한빛중" />
                </label>
              )}
            </div>
          )}

          {isSales && (
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>입금 여부</span>
                <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option>입금완료</option><option>미입금</option>
                </select>
              </label>
              <label className="field">
                <span>세금계산서</span>
                <select className="input" value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
                  <option>발행</option><option>미발행</option><option>해당없음</option>
                </select>
              </label>
            </div>
          )}

          {!editing && direction !== 'NEUTRAL' && (
            <label className="flex items-start gap-3 rounded-2xl border border-line p-4 cursor-pointer">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand)]" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
              <span>
                <b>매달 {direction === 'OUT' ? '나가는 고정지출' : '들어오는 정기수입'}이에요</b>
                <span className="block text-sm text-muted">관리비·보험료·세무사 수수료처럼 매월 같은 날 반복되면 체크하세요. 다음 달부터 [고정지출] 화면에서 버튼 한 번으로 넣을 수 있습니다.</span>
              </span>
            </label>
          )}

          <button type="button" className="text-sm text-muted self-start underline underline-offset-4" onClick={() => setMore((v) => !v)}>
            {more ? '메모·태그 접기' : '메모·태그 추가'}
          </button>
          {more && (
            <div className="flex flex-col gap-3">
              <label className="field"><span>메모</span><textarea className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} /></label>
              <label className="field"><span>태그 (쉼표로 구분)</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 한빛중, 업무추진" /></label>
            </div>
          )}
        </div>

        <footer className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] flex gap-2">
          {editing ? (
            <>
              <button className="btn btn-danger" onClick={remove} disabled={pending}>삭제</button>
              <button className="btn btn-primary flex-1 text-lg" onClick={() => submit(false)} disabled={pending}>{pending ? '저장 중…' : '수정 완료'}</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => submit(true)} disabled={pending}>저장 후 계속</button>
              <button className="btn btn-primary flex-1 text-lg" onClick={() => submit(false)} disabled={pending}>{pending ? '저장 중…' : '저장'}</button>
            </>
          )}
        </footer>

      </div>
    </div>
  );
}
