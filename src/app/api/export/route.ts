import { cookies } from 'next/headers';
import { listTxs } from '@/server/data';
import { toCsv } from '@/lib/import/csv';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/session';
import { todayKST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** 전체 거래 CSV (엑셀에서 바로 열리도록 BOM 포함) */
export async function GET() {
  if (!(await verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response('로그인이 필요합니다.', { status: 401 });
  }
  const txs = (await listTxs()).reverse();
  const flowLabel = { IN: '수입', OUT: '지출', NEUTRAL: '이체' } as const;
  const csv = toCsv([
    ['날짜', '구분', '대분류', '세부분류', '내용', '금액', '공급가액', '부가세', '출금(결제수단)', '입금', '거래처', '학교/프로젝트', '입금여부', '세금계산서', '태그', '메모', 'ID'],
    ...txs.map((t) => [
      t.date, flowLabel[t.flow], t.type, t.category, t.description, t.amount, t.supplyAmount, t.vat,
      t.fromName, t.toName, t.vendorName, t.projectName, t.paymentStatus, t.invoiceStatus, t.tags.join(', '), t.memo, t.id,
    ]),
  ]);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`캐시로그_전체거래_${todayKST()}.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
