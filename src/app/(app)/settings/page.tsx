import type { Metadata } from 'next';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { Tabs } from '@/components/month-nav';
import { recentLoginFailures } from '@/server/actions';
import { AccountsSection, BusinessSection, CategoriesSection, DataSection, NamedSection } from './settings-client';

export const metadata: Metadata = { title: '설정' };

const TABS = [
  { key: 'accounts', label: '결제수단·계좌' }, { key: 'categories', label: '분류' }, { key: 'vendors', label: '거래처' },
  { key: 'projects', label: '학교' }, { key: 'business', label: '사업자' }, { key: 'data', label: '데이터' },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: t } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? t! : 'accounts';

  let stats: { source: string; n: number; min: string; max: string }[] = [];
  if (tab === 'data') {
    const r = await getDb().execute<{ source: string; n: number; min: string; max: string }>(sql`
      select source, count(*)::int as n, min(date)::text as min, max(date)::text as max
      from transactions where deleted_at is null group by source order by source`);
    stats = r.rows;
  }

  const fails = await recentLoginFailures();
  const weak = (process.env.APP_PASSWORD ?? '').length < 8;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">설정</h1>
      {(fails > 0 || weak) && (
        <div className="card p-4 bg-warn-soft text-warn-ink text-sm leading-relaxed">
          {fails > 0 && <p>⚠️ 최근 24시간 동안 비밀번호를 <b>{fails}번</b> 틀린 기록이 있습니다. 본인이 아니라면 비밀번호를 바꿔 주세요.</p>}
          {weak && <p>🔒 비밀번호가 짧습니다. 8자 이상(글자+숫자)으로 바꾸면 훨씬 안전합니다. 바꾸면 모든 기기에서 다시 로그인해야 합니다.</p>}
        </div>
      )}
      <div className="scroll-x"><div className="min-w-[34rem]"><Tabs current={tab} items={TABS.map((x) => ({ ...x, href: `/settings?tab=${x.key}` }))} /></div></div>
      {tab === 'accounts' && <AccountsSection />}
      {tab === 'categories' && <CategoriesSection />}
      {tab === 'vendors' && <NamedSection kind="vendor" />}
      {tab === 'projects' && <NamedSection kind="project" />}
      {tab === 'business' && <BusinessSection />}
      {tab === 'data' && <DataSection stats={stats} />}
    </div>
  );
}
