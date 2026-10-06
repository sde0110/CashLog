import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLedgerWorkbook } from '@/lib/export/ledger-xlsx';
import { makeTitleLookup } from '@/lib/journal';
import type { TxView } from '@/lib/ledger';

let seq = 0;
const tx = (p: Partial<TxView>): TxView => ({
  id: String(++seq), date: '2025-03-10', type: '사업비', category: '상품매입', categoryId: 20, icon: '', flow: 'OUT',
  amount: 0, supplyAmount: 0, vat: 0, fromAccountId: 1, toAccountId: null, fromName: '사업통장', toName: '',
  vendorId: 7, vendorName: '가나가구', projectId: null, projectName: '한빛중', description: '', memo: '', tags: [],
  paymentStatus: '입금완료', paymentDate: null, invoiceStatus: '발행', linkId: null, recurringId: null,
  source: 'manual', createdAt: '2025-03-10T00:00:00Z', ...p,
});

const txs = [
  tx({ type: '사업매출', category: '학교납품', categoryId: 10, flow: 'IN', amount: 11_000_000, supplyAmount: 10_000_000, vat: 1_000_000, fromAccountId: null, toAccountId: 1, toName: '사업통장', vendorId: 8, vendorName: '한빛중학교' }),
  tx({ amount: 3_300_000, supplyAmount: 3_000_000, vat: 300_000, fromAccountId: 2, fromName: 'KB기업카드' }),
  tx({ date: '2025-04-02', type: '세금', category: '부가가치세', categoryId: 30, amount: 700_000, supplyAmount: 700_000, vendorId: null, vendorName: '' }),
  tx({ date: '2025-04-25', type: '가계이체', category: '정기가계이체', categoryId: 40, amount: 2_000_000, supplyAmount: 2_000_000, vendorId: null, vendorName: '' }),
  tx({ date: '2025-04-30', type: '자금이동', category: '적금납입', categoryId: 50, flow: 'NEUTRAL', amount: 500_000, supplyAmount: 500_000, fromAccountId: 1, toAccountId: 3, vendorId: null, vendorName: '' }),
];
const titles = makeTitleLookup(
  [{ id: 1, kind: '통장', accountTitle: '' }, { id: 2, kind: '신용카드', accountTitle: '' }, { id: 3, kind: '저축·투자', accountTitle: '' }],
  [{ id: 10, type: '사업매출', accountTitle: '상품매출' }, { id: 20, type: '사업비', accountTitle: '상품매입' },
   { id: 30, type: '세금', accountTitle: '부가세예수금' }, { id: 40, type: '가계이체', accountTitle: '인출금' }, { id: 50, type: '자금이동', accountTitle: '' }],
);

async function load() {
  const buf = await buildLedgerWorkbook({
    txs, from: '2025-01-01', to: '2025-12-31', titles,
    settings: { business_name: '테스트상사', owner_name: '홍길동', biz_no: '123-45-67890' },
    accounts: [{ id: 1, name: '사업통장', kind: '통장' }, { id: 2, name: 'KB기업카드', kind: '신용카드' }, { id: 3, name: '예금·적금', kind: '저축·투자' }],
    vendors: [{ id: 7, name: '가나가구', bizNo: '111-22-33333' }, { id: 8, name: '한빛중학교', bizNo: '' }],
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
const result = (c: ExcelJS.Cell) => (typeof c.value === 'object' && c.value && 'result' in c.value ? c.value.result : c.value);
const lastRow = (ws: ExcelJS.Worksheet) => ws.getRow(ws.rowCount);

describe('세무사 제출용 엑셀 장부', () => {
  it('시트 8개가 정해진 순서로 들어간다', async () => {
    const wb = await load();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['요약', '전체내역', '매출', '매입·경비', '세금·공과', '계정별 월합계', '분개장', '합계잔액시산표']);
  });

  it('요약에 상호·사업자번호와 부가세 집계가 들어간다', async () => {
    const ws = (await load()).getWorksheet('요약')!;
    const text = ws.getSheetValues().flat().map(String).join('|');
    expect(text).toContain('테스트상사');
    expect(text).toContain('123-45-67890');
    expect(text).toContain('1000000');   // 매출세액
    expect(text).toContain('700000');    // 매출세액 − 매입세액
  });

  it('전체내역: 날짜는 날짜 셀, 금액은 숫자 셀, 합계는 SUBTOTAL 수식', async () => {
    const ws = (await load()).getWorksheet('전체내역')!;
    const first = ws.getRow(5);
    expect(first.getCell(1).value).toBeInstanceOf(Date);
    expect((first.getCell(1).value as Date).toISOString().slice(0, 10)).toBe('2025-03-10');
    expect(typeof first.getCell(11).value).toBe('number');
    const sum = lastRow(ws).getCell(11);
    expect((sum.value as { formula: string }).formula).toMatch(/^SUBTOTAL\(9,K5:K9\)$/);
    expect(result(sum)).toBe(17_500_000);
    expect(ws.autoFilter).toBeTruthy();
  });

  it('매출 · 매입 시트는 각각 사업매출 · 사업비만, 거래처 사업자번호와 결제수단 종류 포함', async () => {
    const wb = await load();
    const s = wb.getWorksheet('매출')!;
    expect(s.rowCount).toBe(6); // 제목 2 + 빈 줄 + 머리글 + 1건 + 합계
    expect(result(lastRow(s).getCell(7))).toBe(10_000_000);
    const p = wb.getWorksheet('매입·경비')!;
    expect(p.getRow(5).getCell(3).value).toBe('111-22-33333');
    expect(p.getRow(5).getCell(12).value).toBe('신용카드');
    expect(result(lastRow(p).getCell(9))).toBe(300_000);
  });

  it('계정별 월합계는 자금이동을 빼고 공급가액 기준', async () => {
    const ws = (await load()).getWorksheet('계정별 월합계')!;
    const titlesInSheet = ws.getColumn(2).values.slice(5).filter(Boolean).map(String);
    expect(titlesInSheet).toEqual(expect.arrayContaining(['상품매출', '상품매입', '인출금']));
    expect(titlesInSheet.join()).not.toContain('적금');
  });

  it('분개장 차변 합계 = 대변 합계', async () => {
    const ws = (await load()).getWorksheet('분개장')!;
    const last = lastRow(ws);
    expect(result(last.getCell(6))).toBe(result(last.getCell(7)));
  });
});
