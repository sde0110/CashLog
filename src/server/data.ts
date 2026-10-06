import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/db';
import { accounts, categories, projects, recurring, settings, transactions, vendors } from '@/db/schema';
import { DEFAULT_SETTINGS, TYPE_ORDER, ACCOUNT_KINDS, type Flow, type TxType } from '@/lib/domain';
import type { TxView } from '@/lib/ledger';

/* ── 기초정보 (요청 1회당 한 번만 읽는다) ───────────────── */

export const getMasters = cache(async () => {
  const db = getDb();
  const [acc, cat, ven, prj, set] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.sortOrder), asc(accounts.id)),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
    db.select().from(vendors).orderBy(asc(vendors.name)),
    db.select().from(projects).orderBy(asc(projects.name)),
    db.select().from(settings),
  ]);
  const kindRank = (k: string) => { const i = (ACCOUNT_KINDS as readonly string[]).indexOf(k); return i < 0 ? 99 : i; };
  acc.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.sortOrder - b.sortOrder || a.id - b.id);
  cat.sort((a, b) => TYPE_ORDER.indexOf(a.type as TxType) - TYPE_ORDER.indexOf(b.type as TxType) || a.sortOrder - b.sortOrder);
  const settingsMap: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const s of set) settingsMap[s.key] = s.value;
  return { accounts: acc, categories: cat, vendors: ven, projects: prj, settings: settingsMap };
});

export type Masters = Awaited<ReturnType<typeof getMasters>>;

/* ── 거래 조회 ──────────────────────────────────────── */

const fromAcc = alias(accounts, 'from_acc');
const toAcc = alias(accounts, 'to_acc');

export interface TxFilter {
  from?: string;
  to?: string;
  type?: string;
  categoryId?: number;
  accountId?: number;
  vendorId?: number;
  projectId?: number;
  flow?: Flow;
  unpaidOnly?: boolean;
  keyword?: string;
  tag?: string;
  amountMin?: number;
  amountMax?: number;
  limit?: number;
}

export async function listTxs(f: TxFilter = {}): Promise<TxView[]> {
  const db = getDb();
  const w: SQL[] = [isNull(transactions.deletedAt)];
  if (f.from) w.push(gte(transactions.date, f.from));
  if (f.to) w.push(lte(transactions.date, f.to));
  if (f.type) w.push(eq(categories.type, f.type));
  if (f.categoryId) w.push(eq(transactions.categoryId, f.categoryId));
  if (f.flow) w.push(eq(categories.flow, f.flow));
  if (f.vendorId) w.push(eq(transactions.vendorId, f.vendorId));
  if (f.projectId) w.push(eq(transactions.projectId, f.projectId));
  if (f.accountId) w.push(sql`(${transactions.fromAccountId} = ${f.accountId} or ${transactions.toAccountId} = ${f.accountId})`);
  if (f.unpaidOnly) w.push(sql`${transactions.paymentStatus} <> '입금완료'`);
  if (f.amountMin !== undefined) w.push(gte(transactions.amount, f.amountMin));
  if (f.amountMax !== undefined) w.push(lte(transactions.amount, f.amountMax));
  if (f.tag) w.push(sql`exists (select 1 from unnest(${transactions.tags}) t where t ilike ${'%' + f.tag + '%'})`);
  if (f.keyword) {
    const k = `%${f.keyword.replace(/[%_]/g, '')}%`;
    w.push(sql`(${transactions.description} ilike ${k} or ${transactions.memo} ilike ${k}
      or ${vendors.name} ilike ${k} or ${projects.name} ilike ${k} or ${categories.name} ilike ${k}
      or array_to_string(${transactions.tags}, ',') ilike ${k})`);
  }

  let q = db
    .select({
      t: transactions,
      type: categories.type,
      category: categories.name,
      icon: categories.icon,
      flow: categories.flow,
      fromName: fromAcc.name,
      toName: toAcc.name,
      vendorName: vendors.name,
      projectName: projects.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(fromAcc, eq(transactions.fromAccountId, fromAcc.id))
    .leftJoin(toAcc, eq(transactions.toAccountId, toAcc.id))
    .leftJoin(vendors, eq(transactions.vendorId, vendors.id))
    .leftJoin(projects, eq(transactions.projectId, projects.id))
    .where(and(...w))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .$dynamic();
  if (f.limit) q = q.limit(f.limit);

  const rows = await q;
  return rows.map((r) => ({
    id: r.t.id,
    date: r.t.date,
    type: r.type as TxType,
    category: r.category,
    categoryId: r.t.categoryId,
    icon: r.icon,
    flow: r.flow as Flow,
    amount: r.t.amount,
    supplyAmount: r.t.supplyAmount,
    vat: r.t.vat,
    fromAccountId: r.t.fromAccountId,
    toAccountId: r.t.toAccountId,
    fromName: r.fromName ?? '',
    toName: r.toName ?? '',
    vendorId: r.t.vendorId,
    vendorName: r.vendorName ?? '',
    projectId: r.t.projectId,
    projectName: r.projectName ?? '',
    description: r.t.description,
    memo: r.t.memo,
    tags: r.t.tags,
    paymentStatus: r.t.paymentStatus,
    paymentDate: r.t.paymentDate,
    invoiceStatus: r.t.invoiceStatus,
    linkId: r.t.linkId,
    recurringId: r.t.recurringId,
    source: r.t.source,
    createdAt: r.t.createdAt.toISOString(),
  }));
}

/* ── 계좌 잔액 ──────────────────────────────────────── */

/** 계좌별 (들어온 돈 − 나간 돈). asOf 까지. */
export async function accountMovements(asOf?: string) {
  const db = getDb();
  const dateCond = asOf ? sql`and date <= ${asOf}` : sql``;
  const res = await db.execute<{ id: number; inflow: string; outflow: string }>(sql`
    select id, sum(inflow)::bigint as inflow, sum(outflow)::bigint as outflow from (
      select to_account_id as id, amount as inflow, 0 as outflow from transactions
        where deleted_at is null and to_account_id is not null ${dateCond}
      union all
      select from_account_id as id, 0 as inflow, amount as outflow from transactions
        where deleted_at is null and from_account_id is not null ${dateCond}
    ) x group by id`);
  const m = new Map<number, { inflow: number; outflow: number }>();
  for (const r of res.rows) m.set(Number(r.id), { inflow: Number(r.inflow), outflow: Number(r.outflow) });
  return m;
}

export async function listRecurring() {
  return getDb().select().from(recurring).orderBy(asc(recurring.dayOfMonth), asc(recurring.id));
}

/** 데이터가 있는 가장 이른/늦은 날짜 */
export async function txDateRange(): Promise<{ min: string | null; max: string | null }> {
  const res = await getDb().execute<{ min: string | null; max: string | null }>(
    sql`select min(date)::text as min, max(date)::text as max from transactions where deleted_at is null`);
  return res.rows[0] ?? { min: null, max: null };
}
