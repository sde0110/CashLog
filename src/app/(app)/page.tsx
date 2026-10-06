import Link from 'next/link';
import { isYm, monthRange, shiftYm, thisMonthKST } from '@/lib/dates';
import { monthlyReport, summarize } from '@/lib/ledger';
import { listRecurring, listTxs } from '@/server/data';
import { MonthNav, Tabs } from '@/components/month-nav';
import { TxListByDay } from '@/components/tx-list';
import { MonthCalendar } from '@/components/calendar';
import { BarList } from '@/components/charts';
import { won } from '@/lib/format';

type View = 'list' | 'calendar' | 'stats';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ym?: string; view?: string }> }) {
  const sp = await searchParams;
  const ym = isYm(sp.ym) ? sp.ym : thisMonthKST();
  const view: View = sp.view === 'calendar' || sp.view === 'stats' ? sp.view : 'list';
  const [from, to] = monthRange(ym);
  const [pf, pt] = monthRange(shiftYm(ym, -1));

  const [txs, prev, rec] = await Promise.all([listTxs({ from, to }), listTxs({ from: pf, to: pt }), listRecurring()]);
  const s = summarize(txs);
  const ps = summarize(prev);
  const report = view === 'stats' ? monthlyReport(txs, prev) : null;
  const pendingFixed = ym === thisMonthKST() ? rec.filter((r) => r.active && r.lastGeneratedYm < ym) : [];
  const unpaid = txs.filter((t) => t.type === '사업매출' && t.paymentStatus === '미입금');

  const diff = s.totalOut - ps.totalOut;
  const tab = (v: View) => `/?${new URLSearchParams({ ym, view: v })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <MonthNav ym={ym} path="/" extra={{ view }} />
        <Link href="/search" className="btn btn-ghost btn-sm md:hidden" aria-label="검색">🔍 검색</Link>
      </div>

      <section className="card p-5 md:p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted">수입</p>
            <p className="text-2xl md:text-3xl font-bold num text-in-ink">{won(s.totalIn)}<span className="text-base font-semibold">원</span></p>
          </div>
          <div>
            <p className="text-sm text-muted">지출</p>
            <p className="text-2xl md:text-3xl font-bold num">{won(s.totalOut)}<span className="text-base font-semibold">원</span></p>
            {ps.count > 0 && s.count > 0 && (
              <p className="text-xs text-muted mt-0.5">지난달보다 {diff >= 0 ? `${won(diff)}원 더 씀` : `${won(-diff)}원 덜 씀`}</p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 flex items-center justify-between">
          <span className="font-semibold">남은 돈 <span className="text-xs text-muted font-normal">(수입 − 지출)</span></span>
          <span className={`text-xl font-bold num ${s.netCashFlow >= 0 ? 'text-brand-ink' : 'text-out-ink'}`}>
            {s.netCashFlow >= 0 ? '+' : '−'}{won(Math.abs(s.netCashFlow))}원
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[
            ['사업비', s.expense], ['세금', s.tax], ['생활비 (가계이체)', s.household], ['이체 (제외됨)', s.transfer],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-line px-3 py-2">
              <dt className="text-muted text-xs">{k}</dt>
              <dd className="num font-semibold">{won(v as number)}원</dd>
            </div>
          ))}
        </dl>
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer">계산 방법 보기</summary>
          <p className="mt-2 leading-relaxed">
            지출 = 사업비 {won(s.expense)} + 세금 {won(s.tax)} + 기타지출 {won(s.otherExpense)} + 생활비 {won(s.household)}<br />
            이체 {won(s.transfer)}원(통장↔예금, 현금인출, 카드대금 등)은 내 돈의 위치만 바뀐 것이라 수입·지출에서 뺍니다.
          </p>
        </details>
      </section>

      {pendingFixed.length > 0 && (
        <Link href={`/fixed?ym=${ym}`} className="card p-4 flex items-center gap-3 bg-warn-soft hover:brightness-[.98]">
          <span className="text-2xl" aria-hidden>🔁</span>
          <span className="flex-1"><b>이번 달 고정지출 {pendingFixed.length}건</b>을 아직 넣지 않았어요.</span>
          <span className="font-semibold text-warn-ink">확인 ›</span>
        </Link>
      )}
      {unpaid.length > 0 && (
        <Link href={`/search?unpaid=1`} className="card p-4 flex items-center gap-3 hover:bg-surface-2">
          <span className="text-2xl" aria-hidden>⏳</span>
          <span className="flex-1">아직 안 받은 매출 <b>{unpaid.length}건 · {won(unpaid.reduce((a, t) => a + t.amount, 0))}원</b></span>
          <span className="text-muted">›</span>
        </Link>
      )}

      <Tabs current={view} items={[
        { key: 'list', label: '내역', href: tab('list') },
        { key: 'calendar', label: '달력', href: tab('calendar') },
        { key: 'stats', label: '분석', href: tab('stats') },
      ]} />

      {view === 'list' && <TxListByDay txs={txs} empty={`${Number(ym.slice(5))}월에는 아직 기록이 없습니다.`} />}
      {view === 'calendar' && <MonthCalendar ym={ym} txs={txs} />}
      {view === 'stats' && report && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="card p-5">
            <h2 className="font-bold mb-4">어디에 썼나 <span className="text-sm font-normal text-muted">분류별 지출</span></h2>
            <BarList groups={report.byOutCategory} tone="out" />
          </section>
          <section className="card p-5">
            <h2 className="font-bold mb-4">무엇으로 냈나 <span className="text-sm font-normal text-muted">결제수단별</span></h2>
            <BarList groups={report.byPayment} tone="out" />
          </section>
          <section className="card p-5">
            <h2 className="font-bold mb-4">어디서 벌었나 <span className="text-sm font-normal text-muted">분류별 수입</span></h2>
            <BarList groups={report.byIncomeCategory} tone="in" />
          </section>
          <section className="card p-5">
            <h2 className="font-bold mb-4">이체 <span className="text-sm font-normal text-muted">수입·지출에서 빠진 돈</span></h2>
            <BarList groups={report.transfers} tone="neutral" />
          </section>
        </div>
      )}
    </div>
  );
}
