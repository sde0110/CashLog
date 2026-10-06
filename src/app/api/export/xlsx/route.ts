import { cookies } from 'next/headers';
import { getMasters, listTxs, txDateRange } from '@/server/data';
import { buildLedgerWorkbook } from '@/lib/export/ledger-xlsx';
import { makeTitleLookup } from '@/lib/journal';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/session';
import { isDate, todayKST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** 세무사 제출용 엑셀 장부. ?from=yyyy-mm-dd&to=yyyy-mm-dd (생략하면 전체 기간) */
export async function GET(req: Request) {
  if (!(await verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response('로그인이 필요합니다.', { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  const range = await txDateRange();
  const from = isDate(q.get('from')) ? q.get('from')! : range.min ?? todayKST();
  const to = isDate(q.get('to')) ? q.get('to')! : range.max ?? todayKST();
  if (from > to) return new Response('시작일이 종료일보다 늦습니다.', { status: 400 });

  const [m, txs] = await Promise.all([getMasters(), listTxs({ from, to })]);
  const buf = await buildLedgerWorkbook({
    txs, from, to, settings: m.settings,
    accounts: m.accounts, vendors: m.vendors,
    titles: makeTitleLookup(m.accounts, m.categories),
  });

  const name = `${m.settings.business_name || '캐시로그'}_장부_${from}_${to}.xlsx`;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ledger.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
