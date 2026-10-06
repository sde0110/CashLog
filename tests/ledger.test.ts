import { describe, it, expect } from 'vitest';
import { summarize, yearlyReport, projectReport, type TxView } from '@/lib/ledger';
import { entriesOf, journal, makeTitleLookup, trialBalance } from '@/lib/journal';

let seq = 0;
function tx(p: Partial<TxView>): TxView {
  return {
    id: String(++seq), date: '2026-08-10', type: '사업비', category: '상품매입', categoryId: 1, icon: '', flow: 'OUT',
    amount: 0, supplyAmount: 0, vat: 0, fromAccountId: 1, toAccountId: null, fromName: '', toName: '',
    vendorId: null, vendorName: '', projectId: null, projectName: '', description: '', memo: '', tags: [],
    paymentStatus: '입금완료', paymentDate: null, invoiceStatus: '해당없음', linkId: null, recurringId: null,
    source: 'manual', createdAt: '2026-08-10T00:00:00Z', ...p,
  };
}

const sample = [
  tx({ type: '사업매출', category: '학교납품', categoryId: 10, flow: 'IN', amount: 11_000_000, supplyAmount: 10_000_000, vat: 1_000_000, fromAccountId: null, toAccountId: 1, projectName: '한빛중' }),
  tx({ type: '사업비', category: '상품매입', categoryId: 20, amount: 3_300_000, supplyAmount: 3_000_000, vat: 300_000, projectName: '한빛중' }),
  tx({ type: '세금', category: '주민세', categoryId: 30, amount: 12_500 }),
  tx({ type: '가계이체', category: '정기가계이체', categoryId: 40, amount: 2_000_000 }),
  tx({ type: '자금이동', category: '부가세통장이체', categoryId: 50, flow: 'NEUTRAL', amount: 1_000_000, fromAccountId: 1, toAccountId: 2 }),
  tx({ type: '기타', category: '금융수입', categoryId: 60, flow: 'IN', amount: 50_000, fromAccountId: null, toAccountId: 1 }),
];

describe('집계 규칙 (PRD 18)', () => {
  const s = summarize(sample);
  it('자금이동은 수입·지출 어디에도 들어가지 않는다', () => {
    expect(s.transfer).toBe(1_000_000);
    expect(s.realIncome).toBe(11_050_000);
    expect(s.realExpense).toBe(3_312_500);
  });
  it('가계이체는 사업 지출과 따로 집계된다', () => {
    expect(s.household).toBe(2_000_000);
    expect(s.totalOut).toBe(5_312_500);
  });
  it('실제 지출 = 전체 출금 − 자금이동 − 가계이체', () => {
    expect(s.realExpense).toBe(s.grossOutflow - s.transfer - s.household);
  });
  it('순현금흐름 = 실제 수입 − 실제 지출 − 가계이체', () => {
    expect(s.netCashFlow).toBe(11_050_000 - 3_312_500 - 2_000_000);
  });
  it('예상 부가세 = 매출 VAT − 매입 VAT', () => {
    expect(s.vatEstimate).toBe(700_000);
  });
});

describe('연간 · 학교별', () => {
  it('월평균은 거래가 있는 달 수로 나눈다', () => {
    const y = yearlyReport('2026', [...sample, tx({ date: '2026-09-01', amount: 100_000, supplyAmount: 100_000 })]);
    expect(y.activeMonths).toBe(2);
    expect(y.monthlyAvg.realExpense).toBe(Math.round(y.total.realExpense / 2));
  });
  it('제외 항목은 조정 평균에서 빠진다', () => {
    const y = yearlyReport('2026', sample, ['사업비 > 상품매입']);
    expect(y.adjusted.realExpense).toBe(y.total.realExpense - 3_300_000);
  });
  it('학교별 이익 = 매출 − 사업비', () => {
    const p = projectReport(sample);
    expect(p[0]).toMatchObject({ project: '한빛중', sales: 11_000_000, expense: 3_300_000, profit: 7_700_000 });
  });
});

describe('복식기장', () => {
  const L = makeTitleLookup(
    [{ id: 1, kind: '통장', accountTitle: '' }, { id: 2, kind: '통장', accountTitle: '' }, { id: 3, kind: '신용카드', accountTitle: '' }],
    [{ id: 10, type: '사업매출', accountTitle: '상품매출' }, { id: 20, type: '사업비', accountTitle: '상품매입' },
     { id: 30, type: '세금', accountTitle: '세금과공과' }, { id: 40, type: '가계이체', accountTitle: '인출금' },
     { id: 60, type: '기타', accountTitle: '이자수익' }],
  );
  it('모든 거래의 차변 합계 = 대변 합계', () => {
    for (const t of sample) {
      const lines = entriesOf(t, L);
      expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
    }
    expect(journal(sample, L).balanced).toBe(true);
    const tb = trialBalance(sample, L);
    expect(tb.totalDebitBalance).toBe(tb.totalCreditBalance);
  });
  it('신용카드 결제는 미지급금, 미입금 매출은 외상매출금', () => {
    expect(entriesOf(tx({ amount: 1000, fromAccountId: 3, categoryId: 20 }), L).at(-1)!.account).toBe('미지급금');
    const unpaid = tx({ type: '사업매출', categoryId: 10, flow: 'IN', amount: 1100, supplyAmount: 1000, vat: 100, paymentStatus: '미입금' });
    expect(entriesOf(unpaid, L)[0].account).toBe('외상매출금');
  });
  it('가계이체는 비용이 아니라 인출금', () => {
    expect(entriesOf(sample[3], L)[0].account).toBe('인출금');
  });
});
