/**
 * 집계 규칙 (PRD 18, 20, 30) — 순수 함수. DB 를 모른다.
 *
 *   실제 수입   = 사업매출 + 기타수입
 *   실제 지출   = 사업비 + 세금 + 기타지출          ← 자금이동 · 가계이체 제외
 *   전체 출금   = 실제 지출 + 가계이체 + 자금이동
 *   순현금흐름  = 실제 수입 − 실제 지출 − 가계이체
 *
 * 자금이동(flow = NEUTRAL)은 어떤 수입/지출 지표에도 절대 포함되지 않는다.
 */
import type { Flow, TxType } from './domain';
import { TYPES, PAYMENT_STATUS } from './domain';
import { shiftYm } from './dates';

/** 화면·집계에서 쓰는 거래 (분류·계좌 이름까지 풀어 둔 형태) */
export interface TxView {
  id: string;
  date: string;
  type: TxType;
  category: string;
  categoryId: number;
  icon: string;
  flow: Flow;
  amount: number;
  supplyAmount: number;
  vat: number;
  fromAccountId: number | null;
  toAccountId: number | null;
  fromName: string;
  toName: string;
  vendorId: number | null;
  vendorName: string;
  projectId: number | null;
  projectName: string;
  description: string;
  memo: string;
  tags: string[];
  paymentStatus: string;
  paymentDate: string | null;
  invoiceStatus: string;
  linkId: string | null;
  recurringId: number | null;
  source: string;
  createdAt: string;
}

export interface Summary {
  sales: number;
  otherIncome: number;
  realIncome: number;
  expense: number;
  tax: number;
  otherExpense: number;
  realExpense: number;
  household: number;
  transfer: number;
  grossOutflow: number;
  netCashFlow: number;
  salesVat: number;
  purchaseVat: number;
  vatEstimate: number;
  /** 화면 상단 "수입 / 지출" — 네이버 가계부처럼 생활비까지 포함한 총 지출 */
  totalIn: number;
  totalOut: number;
  count: number;
}

export function emptySummary(): Summary {
  return {
    sales: 0, otherIncome: 0, realIncome: 0, expense: 0, tax: 0, otherExpense: 0,
    realExpense: 0, household: 0, transfer: 0, grossOutflow: 0, netCashFlow: 0,
    salesVat: 0, purchaseVat: 0, vatEstimate: 0, totalIn: 0, totalOut: 0, count: 0,
  };
}

export function summarize(txs: TxView[]): Summary {
  const b = emptySummary();
  for (const t of txs) {
    b.count++;
    if (t.flow === 'NEUTRAL') { b.transfer += t.amount; continue; }
    switch (t.type) {
      case TYPES.SALES: b.sales += t.amount; b.salesVat += t.vat; break;
      case TYPES.EXPENSE: b.expense += t.amount; b.purchaseVat += t.vat; break;
      case TYPES.TAX: b.tax += t.amount; break;
      case TYPES.HOUSEHOLD: b.household += t.amount; break;
      default:
        if (t.flow === 'IN') b.otherIncome += t.amount; else b.otherExpense += t.amount;
    }
  }
  b.realIncome = b.sales + b.otherIncome;
  b.realExpense = b.expense + b.tax + b.otherExpense;
  b.grossOutflow = b.realExpense + b.household + b.transfer;
  b.netCashFlow = b.realIncome - b.realExpense - b.household;
  b.vatEstimate = b.salesVat - b.purchaseVat;
  b.totalIn = b.realIncome;
  b.totalOut = b.realExpense + b.household;
  return b;
}

export interface Group { key: string; label: string; amount: number; count: number; icon?: string }

export function groupSum(txs: TxView[], keyFn: (t: TxView) => string, iconFn?: (t: TxView) => string): Group[] {
  const m = new Map<string, Group>();
  for (const t of txs) {
    const k = keyFn(t) || '(미지정)';
    let g = m.get(k);
    if (!g) { g = { key: k, label: k, amount: 0, count: 0, icon: iconFn?.(t) }; m.set(k, g); }
    g.amount += t.amount;
    g.count++;
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

export const isOut = (t: TxView) => t.flow === 'OUT';
export const isIn = (t: TxView) => t.flow === 'IN';

/* ── 일별 (달력 · 날짜별 목록) ───────────────────────── */

export interface DayTotal { date: string; income: number; expense: number; transfer: number; count: number }

export function dailyTotals(txs: TxView[]): Record<string, DayTotal> {
  const m: Record<string, DayTotal> = {};
  for (const t of txs) {
    const d = (m[t.date] ??= { date: t.date, income: 0, expense: 0, transfer: 0, count: 0 });
    d.count++;
    if (t.flow === 'IN') d.income += t.amount;
    else if (t.flow === 'OUT') d.expense += t.amount;
    else d.transfer += t.amount;
  }
  return m;
}

/* ── 월간 보고 (PRD 18, 19) ──────────────────────────── */

export function monthlyReport(monthTxs: TxView[], prevMonthTxs: TxView[]) {
  const out = monthTxs.filter(isOut);
  const bizOut = out.filter((t) => t.type !== TYPES.HOUSEHOLD);
  const household = monthTxs.filter((t) => t.type === TYPES.HOUSEHOLD);
  const expense = monthTxs.filter((t) => t.type === TYPES.EXPENSE);
  const sales = monthTxs.filter((t) => t.type === TYPES.SALES);
  const unpaid = sales.filter((t) => t.paymentStatus !== PAYMENT_STATUS.PAID);
  const icon = (t: TxView) => t.icon;

  return {
    summary: summarize(monthTxs),
    prev: summarize(prevMonthTxs),
    topExpenses: groupSum(expense, (t) => t.category, icon).slice(0, 5),
    byOutCategory: groupSum(out, (t) => t.category, icon),
    byBizCategory: groupSum(bizOut, (t) => `${t.type} > ${t.category}`, icon),
    byHousehold: groupSum(household, (t) => t.category, icon),
    byIncomeCategory: groupSum(monthTxs.filter(isIn), (t) => t.category, icon),
    byVendor: groupSum(bizOut, (t) => t.vendorName).slice(0, 10),
    byProjectSales: groupSum(sales, (t) => t.projectName).slice(0, 10),
    byPayment: groupSum(out, (t) => t.fromName),
    transfers: groupSum(monthTxs.filter((t) => t.flow === 'NEUTRAL'), (t) => t.category, icon),
    unpaid: { count: unpaid.length, amount: unpaid.reduce((s, t) => s + t.amount, 0), items: unpaid },
  };
}

/* ── 연간 보고 (PRD 20, 21) ──────────────────────────── */

export function yearlyReport(year: string, yearTxs: TxView[], exclude: string[] = []) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const byMonth = months.map((ym) => ({ ym, ...summarize(yearTxs.filter((t) => t.date.startsWith(ym))) }));
  const total = summarize(yearTxs);
  // 거래가 있는 달 수로 나눈다 (아직 오지 않은 달로 평균이 희석되지 않게)
  const activeMonths = byMonth.filter((b) => b.count > 0).length || 1;

  const ex = new Set(exclude);
  const out = yearTxs.filter(isOut);
  const byCategory = groupSum(out, (t) => `${t.type} > ${t.category}`, (t) => t.icon).map((g) => {
    const [type, category] = g.key.split(' > ');
    return { ...g, type, category, monthlyAvg: Math.round(g.amount / activeMonths), excluded: ex.has(g.key) };
  });
  const excludedTotal = byCategory.filter((g) => g.excluded).reduce((s, g) => s + g.amount, 0);

  const avg = (n: number) => Math.round(n / activeMonths);
  return {
    year, activeMonths, byMonth, total,
    monthlyAvg: {
      realIncome: avg(total.realIncome), realExpense: avg(total.realExpense),
      household: avg(total.household), netCashFlow: avg(total.netCashFlow),
      sales: avg(total.sales), expense: avg(total.expense), tax: avg(total.tax), transfer: avg(total.transfer),
    },
    byCategory,
    adjusted: {
      realExpense: total.realExpense - excludedTotal,
      totalOut: total.totalOut - excludedTotal,
      monthlyAvgTotalOut: avg(total.totalOut - excludedTotal),
    },
    byVendor: groupSum(out.filter((t) => t.type !== TYPES.HOUSEHOLD), (t) => t.vendorName).slice(0, 15),
    byProjectSales: groupSum(yearTxs.filter((t) => t.type === TYPES.SALES), (t) => t.projectName).slice(0, 15),
  };
}

/* ── 학교(프로젝트)별 손익 (PRD 14) ──────────────────── */

export function projectReport(txs: TxView[]) {
  const m = new Map<string, { project: string; sales: number; expense: number; profit: number; count: number }>();
  for (const t of txs) {
    if (t.flow === 'NEUTRAL' || !t.projectName) continue;
    let r = m.get(t.projectName);
    if (!r) { r = { project: t.projectName, sales: 0, expense: 0, profit: 0, count: 0 }; m.set(t.projectName, r); }
    if (t.type === TYPES.SALES) r.sales += t.amount;
    else if (t.flow === 'OUT' && t.type !== TYPES.HOUSEHOLD) r.expense += t.amount;
    r.count++;
  }
  return [...m.values()].map((r) => ({ ...r, profit: r.sales - r.expense })).sort((a, b) => b.sales - a.sales);
}

/* ── 한 줄 요약 ──────────────────────────────────────── */

export function headline(ym: string, s: Summary): string {
  const m = Number(ym.slice(5, 7));
  if (!s.count) return `${m}월에는 아직 기록이 없습니다.`;
  const net = s.netCashFlow;
  return `${m}월 실제 수입 ${s.realIncome.toLocaleString('ko-KR')}원, 사업 지출 ${s.realExpense.toLocaleString('ko-KR')}원` +
    `, 생활비(가계이체) ${s.household.toLocaleString('ko-KR')}원으로 ` +
    `${net >= 0 ? `${net.toLocaleString('ko-KR')}원이 남았습니다.` : `${Math.abs(net).toLocaleString('ko-KR')}원이 부족했습니다.`}`;
}

export const prevYm = (ym: string) => shiftYm(ym, -1);
