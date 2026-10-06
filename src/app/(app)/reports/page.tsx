import type { Metadata } from 'next';
import Link from 'next/link';
import { isYm, monthRange, shiftYm, thisMonthKST, ymLabel } from '@/lib/dates';
import { headline, monthlyReport, projectReport, yearlyReport, type Summary } from '@/lib/ledger';
import { journal, makeTitleLookup, trialBalance } from '@/lib/journal';
import { getMasters, listTxs } from '@/server/data';
import { MonthNav, Tabs } from '@/components/month-nav';
import { BarList, MonthlyBars } from '@/components/charts';
import { PrintButton, ExcludeToggle } from './report-client';
import { won } from '@/lib/format';

export const metadata: Metadata = { title: '보고서' };

type Tab = 'monthly' | 'yearly' | 'project' | 'journal' | 'trial';
const TABS: { key: Tab; label: string }[] = [
  { key: 'monthly', label: '월간 보고' }, { key: 'yearly', label: '연간' }, { key: 'project', label: '학교별' },
  { key: 'journal', label: '분개장' }, { key: 'trial', label: '시산표' },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; ym?: string; year?: string; ex?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? sp.tab as Tab : 'monthly';
  const ym = isYm(sp.ym) ? sp.ym : thisMonthKST();
  const year = /^\d{4}$/.test(sp.year ?? '') ? sp.year! : ym.slice(0, 4);
  const href = (t: Tab) => `/reports?${new URLSearchParams({ tab: t, ym, year })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap no-print">
        <h1 className="text-2xl font-bold">보고서</h1>
        <PrintButton />
      </div>
      <div className="scroll-x no-print"><div className="min-w-[30rem]"><Tabs current={tab} items={TABS.map((t) => ({ ...t, href: href(t.key) }))} /></div></div>
      {tab === 'monthly' && <Monthly ym={ym} />}
      {tab === 'yearly' && <Yearly year={year} exclude={(sp.ex ?? '').split('|').filter(Boolean)} ym={ym} />}
      {tab === 'project' && <Project year={year} ym={ym} />}
      {(tab === 'journal' || tab === 'trial') && <Books tab={tab} ym={ym} />}
    </div>
  );
}

function Stat({ label, value, tone, note }: { label: string; value: number; tone?: 'in' | 'out' | 'brand'; note?: string }) {
  const c = tone === 'in' ? 'text-in-ink' : tone === 'out' ? 'text-out-ink' : tone === 'brand' ? 'text-brand-ink' : '';
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-xl md:text-2xl font-bold num ${c}`}>{won(value)}<span className="text-sm">원</span></p>
      {note && <p className="text-xs text-muted mt-0.5">{note}</p>}
    </div>
  );
}

const pctChange = (a: number, b: number) => (b ? `지난달 대비 ${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : undefined);

async function Monthly({ ym }: { ym: string }) {
  const [f, t] = monthRange(ym);
  const [pf, pt] = monthRange(shiftYm(ym, -1));
  const [m, txs, prev] = await Promise.all([getMasters(), listTxs({ from: f, to: t }), listTxs({ from: pf, to: pt })]);
  const r = monthlyReport(txs, prev);
  const s: Summary = r.summary;
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print"><MonthNav ym={ym} path="/reports" extra={{ tab: 'monthly' }} /></div>
      <section className="card p-5 md:p-7">
        <p className="text-sm text-muted">{m.settings.business_name || '캐시로그'} · 사장님 보고</p>
        <h2 className="text-2xl font-bold mt-1">{ymLabel(ym)} 자금 현황</h2>
        <p className="mt-3 text-lg leading-relaxed">{headline(ym, s)}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
          <Stat label="매출 (사업매출)" value={s.sales} tone="in" note={pctChange(s.sales, r.prev.sales)} />
          <Stat label="사업비" value={s.expense} note={pctChange(s.expense, r.prev.expense)} />
          <Stat label="세금" value={s.tax} />
          <Stat label="가계이체 (생활비)" value={s.household} note="사업비와 별도" />
          <Stat label="실제 사업 지출" value={s.realExpense} note="사업비 + 세금 + 기타지출" />
          <Stat label="순현금흐름" value={s.netCashFlow} tone={s.netCashFlow >= 0 ? 'brand' : 'out'} note="수입 − 사업지출 − 생활비" />
        </div>
        <p className="text-sm text-muted mt-3">기타수입(이자·보험금·환급) {won(s.otherIncome)}원 · 자금이동 {won(s.transfer)}원은 수입·지출에서 제외 · 예상 부가세 {won(s.vatEstimate)}원</p>
      </section>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-5"><h3 className="font-bold mb-4">사업비 TOP 5</h3><BarList groups={r.topExpenses} tone="out" max={5} /></section>
        <section className="card p-5"><h3 className="font-bold mb-4">거래처별 지출</h3><BarList groups={r.byVendor} tone="out" max={10} /></section>
        <section className="card p-5"><h3 className="font-bold mb-4">학교(프로젝트)별 매출</h3><BarList groups={r.byProjectSales} tone="in" max={10} /></section>
        <section className="card p-5"><h3 className="font-bold mb-4">생활비 내역</h3><BarList groups={r.byHousehold} tone="out" max={8} /></section>
      </div>
      {r.unpaid.count > 0 && (
        <section className="card p-5">
          <h3 className="font-bold mb-3">아직 안 받은 매출 {r.unpaid.count}건 · {won(r.unpaid.amount)}원</h3>
          <ul className="text-sm divide-y divide-line">
            {r.unpaid.items.map((u) => <li key={u.id} className="py-2 flex gap-3"><span className="num text-muted">{u.date}</span><span className="flex-1">{u.vendorName || u.description} {u.projectName && `· ${u.projectName}`}</span><b className="num">{won(u.amount)}</b></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

async function Yearly({ year, exclude, ym }: { year: string; exclude: string[]; ym: string }) {
  const txs = await listTxs({ from: `${year}-01-01`, to: `${year}-12-31` });
  const r = yearlyReport(year, txs, exclude);
  const t = r.total;
  const y = Number(year);
  const link = (yy: number) => `/reports?${new URLSearchParams({ tab: 'yearly', year: String(yy), ym })}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 no-print">
        <Link href={link(y - 1)} className="btn btn-ghost btn-sm text-xl">‹</Link>
        <h2 className="text-xl font-bold min-w-[6rem] text-center">{year}년</h2>
        <Link href={link(y + 1)} className="btn btn-ghost btn-sm text-xl">›</Link>
        <span className="text-sm text-muted ml-2">기록 있는 달 {r.activeMonths}개월 기준 월평균</span>
      </div>
      <section className="card p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="총 매출" value={t.sales} tone="in" note={`월평균 ${won(r.monthlyAvg.sales)}`} />
          <Stat label="총 사업비" value={t.expense} note={`월평균 ${won(r.monthlyAvg.expense)}`} />
          <Stat label="총 세금" value={t.tax} note={`월평균 ${won(r.monthlyAvg.tax)}`} />
          <Stat label="가계이체" value={t.household} note={`월평균 ${won(r.monthlyAvg.household)}`} />
          <Stat label="실제 지출 (자금이동 제외)" value={t.realExpense} note={`월평균 ${won(r.monthlyAvg.realExpense)}`} />
          <Stat label="전체 출금 (자금이동 포함)" value={t.grossOutflow} />
          <Stat label="자금이동" value={t.transfer} note="수입·지출 아님" />
          <Stat label="순현금흐름" value={t.netCashFlow} tone={t.netCashFlow >= 0 ? 'brand' : 'out'} note={`월평균 ${won(r.monthlyAvg.netCashFlow)}`} />
        </div>
      </section>
      <section className="card p-5"><h3 className="font-bold mb-3">월별 수입 · 지출</h3><MonthlyBars months={r.byMonth} /></section>
      <section className="card p-5">
        <h3 className="font-bold">항목별 합계 · 월평균</h3>
        <p className="text-sm text-muted mb-3">체크를 풀면 그 항목(일회성 비용 등)을 뺀 월평균을 함께 봅니다.</p>
        <ExcludeToggle year={year} ym={ym} rows={r.byCategory.map((g) => ({ key: g.key, label: `${g.icon ?? ''} ${g.type === '가계이체' ? '생활비' : g.type} › ${g.category}`, amount: g.amount, avg: g.monthlyAvg, excluded: g.excluded }))} />
        <p className="mt-3 text-sm">총 지출(생활비 포함) 월평균 <b className="num">{won(Math.round(t.totalOut / r.activeMonths))}원</b>
          {exclude.length > 0 && <> → 제외 후 <b className="num text-brand-ink">{won(r.adjusted.monthlyAvgTotalOut)}원</b></>}</p>
      </section>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-5"><h3 className="font-bold mb-4">거래처별 지출</h3><BarList groups={r.byVendor} tone="out" max={10} /></section>
        <section className="card p-5"><h3 className="font-bold mb-4">학교별 매출</h3><BarList groups={r.byProjectSales} tone="in" max={10} /></section>
      </div>
    </div>
  );
}

async function Project({ year, ym }: { year: string; ym: string }) {
  const txs = await listTxs({ from: `${year}-01-01`, to: `${year}-12-31` });
  const rows = projectReport(txs);
  const y = Number(year);
  const link = (yy: number) => `/reports?${new URLSearchParams({ tab: 'project', year: String(yy), ym })}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 no-print">
        <Link href={link(y - 1)} className="btn btn-ghost btn-sm text-xl">‹</Link>
        <h2 className="text-xl font-bold min-w-[6rem] text-center">{year}년</h2>
        <Link href={link(y + 1)} className="btn btn-ghost btn-sm text-xl">›</Link>
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-muted text-left border-b border-line"><th className="p-3">학교 / 프로젝트</th><th className="p-3 text-right">매출</th><th className="p-3 text-right">비용</th><th className="p-3 text-right">이익</th><th className="p-3 text-right">건수</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">학교가 지정된 거래가 없습니다. 거래 입력 때 [학교 / 프로젝트]를 적어 주세요.</td></tr>}
            {rows.map((r) => (
              <tr key={r.project}>
                <td className="p-3 font-semibold">{r.project}</td>
                <td className="p-3 text-right num text-in-ink">{won(r.sales)}</td>
                <td className="p-3 text-right num">{won(r.expense)}</td>
                <td className={`p-3 text-right num font-bold ${r.profit < 0 ? 'text-out-ink' : ''}`}>{won(r.profit)}</td>
                <td className="p-3 text-right num text-muted">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

async function Books({ tab, ym }: { tab: 'journal' | 'trial'; ym: string }) {
  const [f, t] = monthRange(ym);
  const [m, txs] = await Promise.all([getMasters(), listTxs({ from: f, to: t })]);
  const L = makeTitleLookup(m.accounts, m.categories);
  const nav = <div className="no-print"><MonthNav ym={ym} path="/reports" extra={{ tab }} /></div>;
  const note = <p className="text-xs text-muted">분류와 결제수단으로 자동 작성한 참고용 장부입니다. 세무상 최종 판단은 세무대리인이 합니다.</p>;

  if (tab === 'journal') {
    const j = journal(txs, L);
    return (
      <div className="flex flex-col gap-3">
        {nav}
        <section className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead><tr className="text-muted text-left border-b border-line"><th className="p-2 pl-4">날짜</th><th className="p-2">적요</th><th className="p-2">계정과목</th><th className="p-2 text-right">차변</th><th className="p-2 pr-4 text-right">대변</th></tr></thead>
            <tbody>
              {j.entries.map(({ tx, lines }) => lines.map((l, i) => (
                <tr key={`${tx.id}-${i}`} className={i === 0 ? 'border-t border-line' : ''}>
                  <td className="p-2 pl-4 num text-muted">{i === 0 ? tx.date.slice(5) : ''}</td>
                  <td className="p-2">{i === 0 ? (tx.description || tx.category) : ''}</td>
                  <td className={`p-2 ${l.credit ? 'pl-6' : ''}`}>{l.account}</td>
                  <td className="p-2 text-right num">{l.debit ? won(l.debit) : ''}</td>
                  <td className="p-2 pr-4 text-right num">{l.credit ? won(l.credit) : ''}</td>
                </tr>
              )))}
            </tbody>
            <tfoot><tr className="border-t-2 border-ink font-bold"><td colSpan={3} className="p-2 pl-4">합계 {j.balanced ? '✓ 대차 일치' : '⚠ 대차 불일치'}</td><td className="p-2 text-right num">{won(j.totalDebit)}</td><td className="p-2 pr-4 text-right num">{won(j.totalCredit)}</td></tr></tfoot>
          </table>
        </section>
        {note}
      </div>
    );
  }
  const tb = trialBalance(txs, L);
  return (
    <div className="flex flex-col gap-3">
      {nav}
      <section className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead><tr className="text-muted border-b border-line"><th className="p-2 pl-4 text-right">차변 잔액</th><th className="p-2 text-right">차변 합계</th><th className="p-2 text-center">계정과목</th><th className="p-2 text-right">대변 합계</th><th className="p-2 pr-4 text-right">대변 잔액</th></tr></thead>
          <tbody className="divide-y divide-line">
            {tb.rows.map((r) => (
              <tr key={r.account}>
                <td className="p-2 pl-4 text-right num">{r.debitBalance ? won(r.debitBalance) : ''}</td>
                <td className="p-2 text-right num text-muted">{won(r.debit)}</td>
                <td className="p-2 text-center font-semibold">{r.account}</td>
                <td className="p-2 text-right num text-muted">{won(r.credit)}</td>
                <td className="p-2 pr-4 text-right num">{r.creditBalance ? won(r.creditBalance) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-ink font-bold">
            <td className="p-2 pl-4 text-right num">{won(tb.totalDebitBalance)}</td><td className="p-2 text-right num">{won(tb.totalDebit)}</td>
            <td className="p-2 text-center">{tb.balanced ? '✓ 일치' : '⚠ 불일치'}</td>
            <td className="p-2 text-right num">{won(tb.totalCredit)}</td><td className="p-2 pr-4 text-right num">{won(tb.totalCreditBalance)}</td>
          </tr></tfoot>
        </table>
      </section>
      {note}
    </div>
  );
}
