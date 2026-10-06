'use client';

import { useRef, useState, useTransition } from 'react';
import { ACCOUNT_KIND_INFO, ACCOUNT_KINDS, TYPE_ORDER, type AccountKind } from '@/lib/domain';
import {
  importFiles, removeImportedData, saveAccount, saveCategory, saveProject, saveSettings, saveVendor, type ActionResult,
} from '@/server/actions';
import { useApp, type ClientAccount, type ClientCategory } from '@/components/app-context';
import { AmountInput, fmt, toNum } from '@/components/pickers';

function Modal({ title, children, onClose, onSave, pending }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; pending: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <form className="anim-sheet bg-surface w-full md:max-w-md max-h-[94dvh] rounded-t-3xl md:rounded-3xl flex flex-col" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <header className="flex items-center px-5 pt-4 pb-3"><h2 className="text-lg font-bold flex-1">{title}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button></header>
        <div className="overflow-y-auto px-5 pb-4 flex flex-col gap-3">{children}</div>
        <footer className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"><button className="btn btn-primary w-full text-lg" disabled={pending}>{pending ? '저장 중…' : '저장'}</button></footer>
      </form>
    </div>
  );
}

function useSave() {
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, done?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast(r.error, { tone: 'error' });
    toast(r.message ?? '저장했습니다.', { tone: 'ok' });
    done?.();
  });
  return { pending, run };
}

const Active = ({ v, set }: { v: boolean; set: (b: boolean) => void }) => (
  <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={v} onChange={(e) => set(e.target.checked)} />사용 (끄면 입력 화면에서 숨김)</label>
);

/* ── 결제수단 · 계좌 ───────────────────────────────── */

export function AccountsSection() {
  const { masters } = useApp();
  const [edit, setEdit] = useState<Partial<ClientAccount> | null>(null);
  return (
    <>
      <p className="text-sm text-muted">지출 입력 화면의 <b>결제수단</b>이 이 목록입니다. 동백전·오륙도 같은 체크카드, 네이버·카카오·KB페이, 현금을 따로 관리할 수 있습니다.</p>
      {ACCOUNT_KINDS.map((k) => {
        const items = masters.accounts.filter((a) => a.kind === k);
        return (
          <section key={k} className="card overflow-hidden">
            <div className="flex items-center px-5 pt-4 pb-2">
              <h2 className="font-bold flex-1">{ACCOUNT_KIND_INFO[k].icon} {k} <span className="text-xs font-normal text-muted">{ACCOUNT_KIND_INFO[k].hint}</span></h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ kind: k, active: true })}>+ 추가</button>
            </div>
            <ul className="divide-y divide-line">
              {items.length === 0 && <li className="px-5 py-3 text-sm text-muted">없음</li>}
              {items.map((a) => {
                const linked = masters.accounts.find((x) => x.id === a.linkedAccountId);
                return (
                  <li key={a.id}>
                    <button className={`w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-surface-2 ${a.active ? '' : 'opacity-50'}`} onClick={() => setEdit(a)}>
                      <span className="flex-1 min-w-0"><b>{a.name}</b>
                        <span className="block text-xs text-muted truncate">{[a.institution, linked && `연결: ${linked.name}`, a.memo, !a.active && '숨김'].filter(Boolean).join(' · ')}</span>
                      </span>
                      {a.openingBalance !== 0 && <span className="text-xs text-muted num">기초 {a.openingBalance.toLocaleString('ko-KR')}</span>}
                      <span className="text-muted">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {edit && <AccountForm a={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function AccountForm({ a, onClose }: { a: Partial<ClientAccount>; onClose: () => void }) {
  const { masters } = useApp();
  const { pending, run } = useSave();
  const [name, setName] = useState(a.name ?? '');
  const [kind, setKind] = useState(a.kind ?? '통장');
  const [institution, setInstitution] = useState(a.institution ?? '');
  const [linked, setLinked] = useState(a.linkedAccountId ? String(a.linkedAccountId) : '');
  const [opening, setOpening] = useState(fmt(Math.abs(a.openingBalance ?? 0)));
  const [memo, setMemo] = useState(a.memo ?? '');
  const [active, setActive] = useState(a.active ?? true);
  const canLink = kind === '체크카드' || kind === '페이' || kind === '신용카드';
  return (
    <Modal title={a.id ? '결제수단 수정' : '결제수단 추가'} onClose={onClose} pending={pending}
      onSave={() => run(() => saveAccount({ id: a.id, name, kind, institution, linkedAccountId: linked ? Number(linked) : null, openingBalance: toNum(opening) * ((a.openingBalance ?? 0) < 0 ? -1 : 1), memo, active, sortOrder: a.sortOrder }), onClose)}>
      <label className="field"><span>이름</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 동백전, 카카오페이, 부산은행 통장" required autoFocus /></label>
      <label className="field"><span>종류</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{k} — {ACCOUNT_KIND_INFO[k as AccountKind].hint}</option>)}
        </select>
      </label>
      <label className="field"><span>금융기관 (선택)</span><input className="input" value={institution} onChange={(e) => setInstitution(e.target.value)} /></label>
      {canLink && (
        <label className="field"><span>돈이 빠져나가는 통장 (선택)</span>
          <select className="input" value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="">지정 안 함</option>
            {masters.accounts.filter((x) => x.kind === '통장' && x.id !== a.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <small className="text-xs text-muted">지정하면 [자산] 화면에서 이 카드·페이로 쓴 돈이 그 통장 잔액에서 빠집니다.</small>
        </label>
      )}
      {!canLink && (
        <label className="field"><span>기초잔액 (장부 시작 시점 잔액)</span><AmountInput value={opening} onChange={setOpening} /></label>
      )}
      <label className="field"><span>메모</span><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <Active v={active} set={setActive} />
    </Modal>
  );
}

/* ── 분류 ──────────────────────────────────────────── */

export function CategoriesSection() {
  const { masters } = useApp();
  const [edit, setEdit] = useState<Partial<ClientCategory> | null>(null);
  const label = (t: string, flow?: string) => t === '가계이체' ? '생활비 (가계이체)' : t === '기타' ? (flow === 'IN' ? '기타수입' : '기타지출') : t;
  const groups: { t: string; flow?: string }[] = TYPE_ORDER.flatMap<{ t: string; flow?: string }>((t) => t === '기타' ? [{ t, flow: 'IN' }, { t, flow: 'OUT' }] : [{ t }]);
  return (
    <>
      <p className="text-sm text-muted">분류의 성격(수입·지출·이체)은 처음 만들 때 정해지고 바꿀 수 없습니다. 지난 집계가 한꺼번에 바뀌지 않게 하기 위해서입니다. 안 쓰는 분류는 지우지 말고 꺼 두세요.</p>
      {groups.map(({ t, flow }) => {
        const items = masters.categories.filter((c) => c.type === t && (!flow || c.flow === flow));
        return (
          <section key={t + (flow ?? '')} className="card p-5">
            <div className="flex items-center mb-3">
              <h2 className="font-bold flex-1">{label(t, flow)}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ type: t, flow: flow ?? '', active: true })}>+ 추가</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((c) => (
                <button key={c.id} className={`chip ${c.active ? '' : 'opacity-40 line-through'}`} onClick={() => setEdit(c)}>{c.icon} {c.name}</button>
              ))}
            </div>
          </section>
        );
      })}
      {edit && <CategoryForm c={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function CategoryForm({ c, onClose }: { c: Partial<ClientCategory>; onClose: () => void }) {
  const { pending, run } = useSave();
  const [name, setName] = useState(c.name ?? '');
  const [icon, setIcon] = useState(c.icon ?? '');
  const [memo, setMemo] = useState(c.memo ?? '');
  const [active, setActive] = useState(c.active ?? true);
  return (
    <Modal title={c.id ? '분류 수정' : `${c.type} 분류 추가`} onClose={onClose} pending={pending}
      onSave={() => run(() => saveCategory({ id: c.id, type: c.type!, flow: c.flow, name, icon, memo, active }), onClose)}>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <label className="field"><span>아이콘</span><input className="input text-center text-xl" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></label>
        <label className="field"><span>이름</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      </div>
      <label className="field"><span>설명 (입력 화면에 표시)</span><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <Active v={active} set={setActive} />
    </Modal>
  );
}

/* ── 거래처 · 학교 ─────────────────────────────────── */

export function NamedSection({ kind }: { kind: 'vendor' | 'project' }) {
  const { masters } = useApp();
  const list = kind === 'vendor' ? masters.vendors : masters.projects;
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id?: number; name: string; active: boolean } | null>(null);
  const { pending, run } = useSave();
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const shown = list.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  const word = kind === 'vendor' ? '거래처' : '학교/프로젝트';
  const open = (x: { id?: number; name: string; active: boolean }) => { setEdit(x); setName(x.name); setActive(x.active); };
  const save = () => run(() => (kind === 'vendor' ? saveVendor({ id: edit?.id, name, active }) : saveProject({ id: edit?.id, name, active })), () => setEdit(null));
  return (
    <>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder={`${word} 찾기`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => open({ name: '', active: true })}>+ 추가</button>
      </div>
      <p className="text-sm text-muted">거래 입력 때 새 이름을 적으면 자동으로 등록됩니다. {list.length}개</p>
      <section className="card overflow-hidden">
        <ul className="divide-y divide-line">
          {shown.slice(0, 300).map((x) => (
            <li key={x.id}><button className={`w-full text-left px-5 py-3 hover:bg-surface-2 ${x.active ? '' : 'opacity-50'}`} onClick={() => open(x)}>{x.name}{!x.active && ' (숨김)'}</button></li>
          ))}
          {!shown.length && <li className="px-5 py-6 text-muted text-center">없음</li>}
        </ul>
      </section>
      {edit && (
        <Modal title={edit.id ? `${word} 수정` : `${word} 추가`} onClose={() => setEdit(null)} onSave={save} pending={pending}>
          <label className="field"><span>이름</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
          <Active v={active} set={setActive} />
        </Modal>
      )}
    </>
  );
}

/* ── 사업자 정보 · 기준 ────────────────────────────── */

export function BusinessSection() {
  const { masters } = useApp();
  const s = masters.settings;
  const { pending, run } = useSave();
  const [v, setV] = useState<Record<string, string>>({ ...s, large_amount_threshold: fmt(Number(s.large_amount_threshold) || 0) });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="card p-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettings({ ...v, large_amount_threshold: String(toNum(v.large_amount_threshold)) })); }}>
      <label className="field"><span>상호</span><input className="input" value={v.business_name ?? ''} onChange={set('business_name')} /></label>
      <label className="field"><span>대표자</span><input className="input" value={v.owner_name ?? ''} onChange={set('owner_name')} /></label>
      <label className="field"><span>사업자등록번호</span><input className="input" value={v.biz_no ?? ''} onChange={set('biz_no')} /></label>
      <label className="field"><span>큰 금액 확인 기준 (이 금액 이상이면 저장 전에 한 번 더 묻습니다)</span>
        <AmountInput value={v.large_amount_threshold} onChange={(x) => setV({ ...v, large_amount_threshold: x })} /></label>
      <label className="field"><span>부가세율</span><input className="input" value={v.vat_rate ?? '0.1'} onChange={set('vat_rate')} inputMode="decimal" /></label>
      <label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={v.duplicate_check !== 'false'} onChange={(e) => setV({ ...v, duplicate_check: e.target.checked ? 'true' : 'false' })} />같은 날 같은 금액 거래가 있으면 경고</label>
      <button className="btn btn-primary" disabled={pending}>{pending ? '저장 중…' : '저장'}</button>
    </form>
  );
}

/* ── 데이터 가져오기 · 내보내기 ─────────────────────── */

type DupItem = { date: string; amount: number; description: string; existingDate: string; existing: string; existingAmount?: number };
type ImportResult = { alreadyImported: number; sameAsExisting: DupItem[]; nearDuplicates: DupItem[]; amountDiffers: DupItem[];
  total: number; inserted: number; duplicates: number; recurringAdded: number; openings: { account: string; amount: number }[]; months: string; skippedCarry: number; skippedOther: number; recognized: string[]; unknown: string[] };

export function DataSection({ stats }: { stats: { source: string; n: number; min: string; max: string }[] }) {
  const { toast, confirm } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const SRC: Record<string, string> = { manual: '직접 입력', recurring: '고정지출', naver: '네이버 가계부에서 가져옴', gas: '구글시트에서 가져옴' };

  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await importFiles(fd);
      if (!r.ok) return toast(r.error, { tone: 'error' });
      setResult(r.data as ImportResult);
      toast(`${(r.data as ImportResult).inserted.toLocaleString('ko-KR')}건을 가져왔습니다.`, { tone: 'ok' });
      if (fileRef.current) fileRef.current.value = '';
    });
  }

  async function remove(source: 'naver' | 'gas') {
    if (!(await confirm({ title: `${SRC[source]} 거래를 모두 지울까요?`, body: '직접 입력한 거래는 그대로 남습니다. 지운 뒤 같은 파일을 다시 가져올 수 있습니다.', ok: '지우기', danger: true }))) return;
    start(async () => {
      const r = await removeImportedData(source);
      if (!r.ok) return toast(r.error, { tone: 'error' });
      toast(`${r.data}건을 지웠습니다.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <h2 className="font-bold mb-3">지금 들어 있는 데이터</h2>
        <ul className="text-sm divide-y divide-line">
          {stats.length === 0 && <li className="py-2 text-muted">아직 거래가 없습니다.</li>}
          {stats.map((s) => (
            <li key={s.source} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex-1 min-w-[10rem] font-semibold">{SRC[s.source] ?? s.source}</span>
              <b className="num">{s.n.toLocaleString('ko-KR')}건</b>
              {(s.source === 'naver' || s.source === 'gas') && <button className="btn btn-danger btn-sm" onClick={() => remove(s.source as 'naver' | 'gas')} disabled={pending}>지우기</button>}
              <span className="basis-full num text-muted text-xs">{s.min} ~ {s.max}</span>
            </li>
          ))}
        </ul>
      </section>

      <form className="card p-5 flex flex-col gap-3" onSubmit={upload}>
        <h2 className="font-bold">데이터 가져오기</h2>
        <ul className="text-sm text-ink-2 list-disc pl-5 leading-relaxed">
          <li><b>네이버 가계부</b> — 수입현황·지출현황 파일(CSV 또는 엑셀 .xls)을 여러 개 한꺼번에 고르세요. <b>전월이월(통장잔고·잔고이체)은 수입에서 빼고 통장 기초잔액으로</b> 넣습니다.</li>
          <li><b>예전 캐시로그 구글시트</b> — 구글시트에서 [파일 › 다운로드 › Microsoft Excel(.xlsx)]로 받은 파일 하나를 고르세요. 직접 입력했던 거래·계좌·반복거래를 옮깁니다.</li>
          <li><b>중복은 자동으로 걸러집니다.</b> 같은 파일을 다시 올려도, 기간이 겹치는 파일을 올려도, 앱에 이미 직접 입력한 거래(같은 날 · 같은 금액)가 있어도 한 번만 들어갑니다.</li>
        </ul>
        <input ref={fileRef} type="file" name="files" multiple accept=".csv,.xlsx,.xls" className="input pt-3" required />
        <button className="btn btn-primary" disabled={pending}>{pending ? '가져오는 중… (1~2분 걸릴 수 있어요)' : '가져오기'}</button>
        {result && (
          <div className="rounded-2xl bg-brand-soft p-4 text-sm leading-relaxed flex flex-col gap-2">
            <p className="font-bold text-base">✅ 새 거래 {result.inserted.toLocaleString('ko-KR')}건을 넣었습니다</p>
            <ul className="list-disc pl-5">
              <li>파일 속 거래 {result.total.toLocaleString('ko-KR')}건{result.months && ` (${result.months})`}</li>
              {result.alreadyImported > 0 && <li>예전에 이미 가져온 {result.alreadyImported.toLocaleString('ko-KR')}건은 건너뜀</li>}
              {result.sameAsExisting.length > 0 && <li>앱에 이미 입력돼 있던 {result.sameAsExisting.length}건은 건너뜀 (아래 목록)</li>}
              {result.openings.map((o) => <li key={o.account}>기초잔액: {o.account} {o.amount.toLocaleString('ko-KR')}원 (수입 아님)</li>)}
              {result.recurringAdded > 0 && <li>고정지출 {result.recurringAdded}건 등록</li>}
              {result.skippedOther > 0 && <li className="text-muted">삭제됐거나 네이버에서 온 시트 행 {result.skippedOther}건은 건너뜀</li>}
            </ul>
            {result.unknown.length > 0 && <p className="text-danger">알 수 없는 파일: {result.unknown.join(', ')}</p>}
            {result.amountDiffers.length > 0 && (
              <div className="rounded-xl bg-warn-soft text-warn-ink p-3">
                <p className="font-bold">⚠️ 금액 확인 필요 {result.amountDiffers.length}건 — 같은 날 같은 곳인데 금액이 달라 넣지 않았습니다</p>
                <ul className="mt-1">{result.amountDiffers.map((x, i) => (
                  <li key={i} className="num">· {x.date} {x.description}: 파일 {x.amount.toLocaleString('ko-KR')}원 ↔ 장부 {(x.existingAmount ?? 0).toLocaleString('ko-KR')}원</li>
                ))}</ul>
                <p className="mt-1">장부의 금액이 틀렸다면 가계부에서 그 거래를 눌러 고쳐 주세요.</p>
              </div>
            )}
            {result.nearDuplicates.length > 0 && (
              <div className="rounded-xl bg-surface p-3">
                <p className="font-bold">🔍 중복인지 확인해 보세요 {result.nearDuplicates.length}건 — 금액이 같고 날짜가 1~2일 차이 나서 일단 넣었습니다</p>
                <ul className="mt-1">{result.nearDuplicates.map((x, i) => (
                  <li key={i} className="num">· {x.date} {x.description} {x.amount.toLocaleString('ko-KR')}원 ↔ {x.existingDate} {x.existing}</li>
                ))}</ul>
                <p className="mt-1 text-muted">같은 거래라면 하나를 지우면 됩니다.</p>
              </div>
            )}
            {result.sameAsExisting.length > 0 && (
              <details className="rounded-xl bg-surface p-3">
                <summary className="cursor-pointer font-semibold">앱에 이미 있어서 건너뛴 {result.sameAsExisting.length}건 보기</summary>
                <ul className="mt-1">{result.sameAsExisting.map((x, i) => (
                  <li key={i} className="num">· {x.date} {x.description} {x.amount.toLocaleString('ko-KR')}원 ↔ {x.existing}</li>
                ))}</ul>
              </details>
            )}
          </div>
        )}
      </form>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-bold">백업 · 내보내기</h2>
        <p className="text-sm text-muted">모든 거래를 엑셀에서 열 수 있는 CSV로 내려받습니다. 한 달에 한 번 받아 두면 좋습니다. (데이터베이스는 Neon이 따로 보관하며, 짧은 기간의 시점 복원도 됩니다.)</p>
        <a href="/api/export" className="btn btn-ghost">⬇ 전체 거래 CSV 내려받기</a>
      </section>
    </div>
  );
}
