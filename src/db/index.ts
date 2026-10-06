import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 환경변수가 없습니다. (Vercel > Storage 에서 Neon 연결)');
  return drizzle(neon(url), { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** 빌드 시점에 DATABASE_URL 이 없어도 깨지지 않도록 처음 쓸 때 만든다 */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof createDb>;
export { schema };
