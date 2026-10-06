/**
 * data/ 폴더의 네이버 가계부 CSV 를 DB 로 옮긴다.  `npm run import:naver`
 * 웹 화면 [설정 > 데이터 가져오기] 와 같은 코드를 쓴다. 여러 번 실행해도 중복되지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema';
import { parseFiles, commitBundle } from '../src/server/importer';

const dir = process.argv[2] ?? 'data';
const files = fs.readdirSync(dir).filter((f) => /\.(csv|xlsx?)$/i.test(f)).sort()
  .map((f) => { const b = fs.readFileSync(path.join(dir, f)); return { name: f, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }; });

const { bundle, recognized, unknown } = parseFiles(files);
console.log(`인식 ${recognized.length}개 / 모름 ${unknown.length}개 → 거래 ${bundle.rows.length}건`);
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const r = await commitBundle(db, bundle);
console.log(r);
