/**
 * DB 스키마 적용 + 기본 분류·결제수단 채우기.
 * Vercel 빌드 때 자동으로 실행되고, 로컬에서는 `npm run db:migrate`.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as schema from '../src/db/schema';
import { seedDefaults } from '../src/server/seed';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] DATABASE_URL 이 없어 건너뜁니다.');
  process.exit(0);
}
// 미리보기(PR) 배포는 운영 DB 를 함께 쓰므로, 스키마 변경은 main 에 합쳐 운영 배포될 때만 적용한다
if (process.env.VERCEL_ENV === 'preview') {
  console.log('[migrate] 미리보기 배포 — 마이그레이션은 운영 배포에서만 실행합니다.');
  process.exit(0);
}
const db = drizzle(neon(url), { schema });
await migrate(db, { migrationsFolder: 'drizzle' });
await seedDefaults(db);
console.log('[migrate] 완료');
