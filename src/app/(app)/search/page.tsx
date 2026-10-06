import type { Metadata } from 'next';
import { isDate, monthRange, thisMonthKST } from '@/lib/dates';
import { summarize } from '@/lib/ledger';
import { listTxs, type TxFilter } from '@/server/data';
import { SearchForm } from './search-form';
import { SearchResults } from './search-results';
import { won } from '@/lib/format';

export const metadata: Metadata = { title: '검색' };

const LIMIT = 1000;

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const searched = Object.values(sp).some(Boolean);
  const [mf, mt] = monthRange(thisMonthKST());
  const f: TxFilter = {
    from: isDate(sp.from) ? sp.from : searched ? undefined : mf,
    to: isDate(sp.to) ? sp.to : searched ? undefined : mt,
    type: sp.type || undefined,
    categoryId: n(sp.category),
    accountId: n(sp.account),
    vendorId: n(sp.vendor),
    projectId: n(sp.project),
    flow: sp.flow === 'IN' || sp.flow === 'OUT' || sp.flow === 'NEUTRAL' ? sp.flow : undefined,
    unpaidOnly: sp.unpaid === '1',
    keyword: sp.q?.trim() || undefined,
    tag: sp.tag?.trim() || undefined,
    amountMin: n(sp.min),
    amountMax: n(sp.max),
    limit: LIMIT + 1,
  };
  const rows = await listTxs(f);
  const truncated = rows.length > LIMIT;
  const txs = rows.slice(0, LIMIT);
  const s = summarize(txs);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">내역 검색</h1>
      <SearchForm initial={{ ...sp, from: f.from ?? '', to: f.to ?? '' }} />
      <div className="card p-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><b className="num">{txs.length.toLocaleString('ko-KR')}</b>건{truncated && ` (처음 ${LIMIT}건만 표시)`}</span>
        <span>수입 <b className="num text-in-ink">{won(s.totalIn)}</b></span>
        <span>지출 <b className="num">{won(s.totalOut)}</b></span>
        <span className="text-muted">이체 {won(s.transfer)}</span>
      </div>
      <SearchResults txs={txs} />
    </div>
  );
}
