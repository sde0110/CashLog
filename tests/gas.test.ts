import { describe, it, expect } from 'vitest';
import { convertGasSheets } from '@/lib/import/gas';

const TX_HEAD = ['transaction_id', 'date', 'ym', 'type', 'sub_category', 'flow', 'is_transfer', 'vendor_id', 'vendor_name', 'project_id', 'project_name', 'description',
  'supply_amount', 'vat', 'total_amount', 'account_from', 'account_to', 'account_from_name', 'account_to_name', 'payment_status', 'payment_date', 'invoice_status',
  'tags', 'memo', 'link_id', 'status', 'created_at', 'updated_at', 'debit_account', 'credit_account'];
const row = (o: Record<string, string>) => TX_HEAD.map((h) => o[h] ?? '');

describe('구 구글시트 가져오기', () => {
  const b = convertGasSheets({
    TRANSACTIONS: [TX_HEAD,
      row({ transaction_id: 'TRX-1', date: '2026-09-02', type: '사업비', sub_category: '상품매입', flow: 'OUT', vendor_name: '가나사무가구', project_name: '한빛중',
        supply_amount: '1,000,000', vat: '100,000', total_amount: '1,100,000', account_from: 'ACC-1', status: 'ACTIVE' }),
      row({ transaction_id: 'TRX-2', date: '2026-08-05', type: '가계이체', sub_category: '식비', total_amount: '9000', tags: '가계부이관', status: 'ACTIVE' }),
      row({ transaction_id: 'TRX-3', date: '2026-09-03', type: '세금', sub_category: '주민세', total_amount: '12500', status: 'DELETED' }),
      row({ transaction_id: 'TRX-5', date: '2026-09-01', type: '가계이체', sub_category: '식비', flow: 'OUT', description: '오륙도페이', total_amount: '18000', account_from_name: '신용카드', status: 'ACTIVE' }),
      row({ transaction_id: 'TRX-6', date: '2026-08-27', type: '가계이체', sub_category: '의복/미용', flow: 'OUT', description: '우리카드,아빠바지', total_amount: '18400', account_from_name: '신용카드', status: 'ACTIVE' }),
      row({ transaction_id: 'TRX-4', date: '2026-09-04', type: '자금이동', sub_category: '예금가입', flow: 'NEUTRAL', total_amount: '500000', account_from_name: 'KB기업 사업통장', account_to_name: '예금계좌', status: 'ACTIVE' }),
    ],
    ACCOUNTS: [['account_id', 'name', 'bank', 'account_type'], ['ACC-1', '신용카드', '', '카드'], ['ACC-9', '신용카드', '신용카드', '신용카드'], ['ACC-2', '동백전', '', '체크카드']],
    RECURRING: [['recurring_id', 'title', 'type', 'sub_category', 'vendor_id', 'project_id', 'account_from', 'account_to', 'supply_amount', 'vat', 'total_amount', 'day_of_month', 'description', 'tags', 'memo', 'active', 'last_generated_ym'],
      ['REC-1', '정기 가계이체', '가계이체', '정기가계이체', '', '', 'ACC-1', '', '2000000', '0', '2000000', '25', '', '', '', 'TRUE', '2026-09']],
  });

  it('직접 입력한 거래만 옮기고, 삭제·네이버이관 행은 건너뛴다', () => {
    expect(b.rows.map((r) => r.sourceKey)).toEqual(['gas:TRX-1', 'gas:TRX-5', 'gas:TRX-6', 'gas:TRX-4']);
    expect(b.stats.skippedOther).toBe(2);
  });
  it('계좌 id → 이름, 옛 이름은 새 이름으로', () => {
    expect(b.rows[0]).toMatchObject({ from: '카드(기타)', amount: 1_100_000, supplyAmount: 1_000_000, vat: 100_000, vendor: '가나사무가구', project: '한빛중' });
    expect(b.rows[3]).toMatchObject({ from: 'KB기업 사업통장', to: '예금·적금' });
    expect(b.accountKinds?.['동백전']).toBe('체크카드');
    expect(b.accountKinds?.['신용카드']).toBeUndefined(); // 이름이 account_type 에 들어간 깨진 시트
  });
  it('내용 칸에 적어 둔 결제수단을 진짜 결제수단으로 옮긴다 (피드백 1)', () => {
    expect(b.rows[1]).toMatchObject({ from: '오륙도', description: '' });
    expect(b.rows[2]).toMatchObject({ from: '우리카드', description: '아빠바지' });
  });
  it('반복거래도 옮긴다', () => {
    expect(b.recurring[0]).toMatchObject({ title: '정기 가계이체', dayOfMonth: 25, amount: 2_000_000, from: '카드(기타)', lastGeneratedYm: '2026-09' });
  });
});
