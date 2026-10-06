/**
 * 복식기장 — 분개장 · 합계잔액시산표 (순수 함수).
 *
 * 사용자는 차변/대변을 입력하지 않는다 (PRD 16). 분류와 계좌만 있으면 분개가 나온다.
 *
 *   수입     차) 보통예금      총액    대) 매출계정       공급가액
 *                                      대) 부가세예수금    부가세
 *   지출     차) 비용계정    공급가액   대) 보통예금/미지급금 총액
 *            차) 부가세대급금  부가세
 *   가계이체 차) 인출금        총액    대) 보통예금        총액
 *   자금이동 차) 입금계좌계정  총액    대) 출금계좌계정    총액
 *
 * 세무상 최종 판단은 세무대리인이 한다. 이 장부는 근거 자료를 만들 뿐이다.
 */
import { ACCOUNT_KIND_INFO, PAYMENT_STATUS, TYPES, type AccountKind } from './domain';
import type { TxView } from './ledger';

export interface JournalLine { account: string; debit: number; credit: number }

const VAT_PAYABLE = '부가세예수금';
const VAT_RECEIVABLE = '부가세대급금';

export interface TitleLookup {
  account: (id: number | null) => string;
  category: (categoryId: number, type: string) => string;
}

export function makeTitleLookup(
  accounts: { id: number; kind: string; accountTitle: string }[],
  categories: { id: number; type: string; accountTitle: string }[],
): TitleLookup {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  return {
    account(id) {
      const a = id ? acc.get(id) : undefined;
      if (!a) return '보통예금';
      return a.accountTitle || ACCOUNT_KIND_INFO[a.kind as AccountKind]?.title || '보통예금';
    },
    category(id, type) {
      const t = cat.get(id)?.accountTitle;
      if (t) return t;
      return type === TYPES.HOUSEHOLD ? '인출금' : type === TYPES.SALES ? '상품매출' : '잡비';
    },
  };
}

export function entriesOf(t: TxView, L: TitleLookup): JournalLine[] {
  const total = t.amount;
  const supply = t.supplyAmount || total;
  const vat = t.vat || 0;

  if (t.flow === 'NEUTRAL') {
    return [
      { account: L.account(t.toAccountId), debit: total, credit: 0 },
      { account: L.account(t.fromAccountId), debit: 0, credit: total },
    ];
  }
  if (t.flow === 'IN') {
    // 아직 입금되지 않은 매출은 통장이 아니라 외상매출금
    const debitAcc = t.type === TYPES.SALES && t.paymentStatus !== PAYMENT_STATUS.PAID
      ? '외상매출금' : L.account(t.toAccountId);
    const lines: JournalLine[] = [
      { account: debitAcc, debit: total, credit: 0 },
      { account: L.category(t.categoryId, t.type), debit: 0, credit: supply },
    ];
    if (vat) lines.push({ account: VAT_PAYABLE, debit: 0, credit: vat });
    return lines;
  }
  const lines: JournalLine[] = [{ account: L.category(t.categoryId, t.type), debit: supply, credit: 0 }];
  if (vat) lines.push({ account: VAT_RECEIVABLE, debit: vat, credit: 0 });
  lines.push({ account: L.account(t.fromAccountId), debit: 0, credit: total });
  return lines;
}

export function journal(txs: TxView[], L: TitleLookup) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  let totalDebit = 0, totalCredit = 0;
  const entries = sorted.map((t) => {
    const lines = entriesOf(t, L);
    for (const l of lines) { totalDebit += l.debit; totalCredit += l.credit; }
    return { tx: t, lines };
  });
  return { entries, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

const ORDER = [
  '현금', '보통예금', '정기예적금', '단기투자자산', '외상매출금', '단기대여금', '보증금', '기타자산', '부가세대급금',
  '미지급금', '부가세예수금', '인출금',
  '상품매출', '용역매출', '이자수익', '잡이익',
  '상품매입', '외주비', '지급수수료', '운반비', '차량유지비', '소모품비', '접대비', '보험료', '세금과공과', '잡비', '잡손실',
];

export function trialBalance(txs: TxView[], L: TitleLookup) {
  const j = journal(txs, L);
  const m = new Map<string, { account: string; debit: number; credit: number }>();
  for (const e of j.entries) for (const l of e.lines) {
    const r = m.get(l.account) ?? { account: l.account, debit: 0, credit: 0 };
    r.debit += l.debit; r.credit += l.credit;
    m.set(l.account, r);
  }
  const rank = (a: string) => { const i = ORDER.indexOf(a); return i < 0 ? 999 : i; };
  const rows = [...m.values()]
    .map((r) => {
      const net = r.debit - r.credit;
      return { ...r, debitBalance: net > 0 ? net : 0, creditBalance: net < 0 ? -net : 0 };
    })
    .sort((a, b) => rank(a.account) - rank(b.account) || a.account.localeCompare(b.account));
  return {
    rows,
    totalDebit: j.totalDebit,
    totalCredit: j.totalCredit,
    totalDebitBalance: rows.reduce((s, r) => s + r.debitBalance, 0),
    totalCreditBalance: rows.reduce((s, r) => s + r.creditBalance, 0),
    balanced: j.balanced,
  };
}
