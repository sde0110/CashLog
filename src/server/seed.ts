import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { accounts, categories, settings } from '@/db/schema';
import { ACCOUNT_KIND_INFO, DEFAULT_SETTINGS, SEED_ACCOUNTS, SEED_CATEGORIES } from '@/lib/domain';

/** 기본 분류·결제수단·설정을 채운다. 여러 번 실행해도 안전하다 (없는 것만 넣는다). */
export async function seedDefaults(db: Db) {
  await db.insert(categories).values(SEED_CATEGORIES.map((c, i) => ({
    type: c.type, name: c.name, flow: c.flow, accountTitle: c.title, icon: c.icon ?? '', memo: c.memo ?? '',
    sortOrder: (i + 1) * 10,
  }))).onConflictDoNothing();

  await db.insert(accounts).values(SEED_ACCOUNTS.map((a, i) => ({
    name: a.name, kind: a.kind, institution: a.institution ?? '', memo: a.memo ?? '',
    accountTitle: ACCOUNT_KIND_INFO[a.kind].title, sortOrder: (i + 1) * 10,
  }))).onConflictDoNothing();

  await db.insert(settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
}

export async function isEmptyDb(db: Db): Promise<boolean> {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from categories`);
  return Number(r.rows[0]?.n ?? 0) === 0;
}
