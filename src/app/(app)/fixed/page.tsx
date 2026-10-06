import type { Metadata } from 'next';
import { isYm, thisMonthKST, ymLabel } from '@/lib/dates';
import { getMasters, listRecurring } from '@/server/data';
import { MonthNav } from '@/components/month-nav';
import { FixedList, type FixedItem } from './fixed-list';

export const metadata: Metadata = { title: '고정지출' };

export default async function FixedPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const { ym: q } = await searchParams;
  const ym = isYm(q) ? q : thisMonthKST();
  const [m, rec] = await Promise.all([getMasters(), listRecurring()]);
  const cat = new Map(m.categories.map((c) => [c.id, c]));
  const acc = new Map(m.accounts.map((a) => [a.id, a.name]));
  const ven = new Map(m.vendors.map((v) => [v.id, v.name]));
  const prj = new Map(m.projects.map((p) => [p.id, p.name]));

  const items: FixedItem[] = rec.map((r) => {
    const c = cat.get(r.categoryId);
    return {
      id: r.id, title: r.title, categoryId: r.categoryId, category: c?.name ?? '', type: c?.type ?? '', flow: c?.flow ?? 'OUT', icon: c?.icon ?? '',
      amount: r.amount, supplyAmount: r.supplyAmount, vat: r.vat, dayOfMonth: r.dayOfMonth,
      fromAccountId: r.fromAccountId, toAccountId: r.toAccountId,
      fromName: r.fromAccountId ? acc.get(r.fromAccountId) ?? '' : '', toName: r.toAccountId ? acc.get(r.toAccountId) ?? '' : '',
      vendorName: r.vendorId ? ven.get(r.vendorId) ?? '' : '', projectName: r.projectId ? prj.get(r.projectId) ?? '' : '',
      description: r.description, memo: r.memo, tags: r.tags.join(', '), active: r.active,
      done: !!r.lastGeneratedYm && r.lastGeneratedYm >= ym,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">고정지출 · 정기거래</h1>
        <MonthNav ym={ym} path="/fixed" />
      </div>
      <section className="card p-5 bg-brand-soft/60 leading-relaxed">
        <p className="font-bold mb-1">🔁 고정지출이 뭔가요?</p>
        <p className="text-ink-2">
          관리비 · 보험료 · 세무사 수수료 · 매달 보내는 가계이체 200만 원처럼 <b>매달 같은 날 반복되는 거래</b>를 미리 등록해 두는 곳입니다.
          매달 이 화면에서 확인한 뒤 <b>[{ymLabel(ym)}에 넣기]</b>를 누르면 그 달 거래로 한 번에 들어갑니다.
          자동으로 들어가지 않으니 금액이 달라진 달은 넣은 뒤 고치면 됩니다.
        </p>
      </section>
      <FixedList ym={ym} items={items} />
    </div>
  );
}
