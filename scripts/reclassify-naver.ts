/**
 * 네이버 분류 규칙을 고친 뒤, 이미 들어간 거래에 다시 적용한다.  `npx dotenv -e .env.local -- tsx scripts/reclassify-naver.ts`
 * 사용자가 화면에서 고친 거래(updated_at ≠ created_at)는 건드리지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { convertNaverCsv, emptyBundle } from '../src/lib/import/naver';

const sql = neon(process.env.DATABASE_URL!);
const b = emptyBundle();
for (const f of fs.readdirSync('data').filter((x) => x.endsWith('.csv')).sort()) convertNaverCsv(fs.readFileSync(path.join('data', f), 'utf8'), b);

const cats = new Map((await sql`select id, type, name from categories`).map((c) => [`${c.type}|${c.name}`, c.id as number]));
const accs = new Map((await sql`select id, name from accounts`).map((a) => [a.name as string, a.id as number]));
const cur = new Map((await sql`select source_key, category_id, from_account_id, to_account_id, (updated_at = created_at) as untouched
  from transactions where source = 'naver'`).map((r) => [r.source_key as string, r]));

let changed = 0, skipped = 0;
for (const r of b.rows) {
  const c = cur.get(r.sourceKey);
  if (!c) continue;
  const want = { cat: cats.get(`${r.type}|${r.category}`)!, from: r.from ? accs.get(r.from) ?? null : null, to: r.to ? accs.get(r.to) ?? null : null };
  if (c.category_id === want.cat && c.from_account_id === want.from && c.to_account_id === want.to) continue;
  if (!c.untouched) { skipped++; continue; }
  await sql`update transactions set category_id = ${want.cat}, from_account_id = ${want.from}, to_account_id = ${want.to}
    where source_key = ${r.sourceKey}`;
  console.log(`  ${r.date} ${r.description} → ${r.type} > ${r.category} (${r.from ?? ''} → ${r.to ?? ''})`);
  changed++;
}
console.log(`고침 ${changed}건, 사용자가 수정해서 건너뜀 ${skipped}건`);
