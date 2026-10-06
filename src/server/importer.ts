import * as XLSX from 'xlsx';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { accounts, categories, projects, recurring, transactions, vendors } from '@/db/schema';
import { ACCOUNT_KIND_INFO, ACCOUNT_KINDS, type AccountKind, type Flow } from '@/lib/domain';
import { convertNaverCsv, emptyBundle, isNaverCsv } from '@/lib/import/naver';
import { convertGasSheets, isGasTransactionsHeader } from '@/lib/import/gas';
import { parseCsv } from '@/lib/import/csv';
import type { ImportBundle } from '@/lib/import/types';
import { seedDefaults } from './seed';

export interface ImportFile { name: string; data: ArrayBuffer }

/** 파일 종류를 알아내 하나의 묶음으로 변환한다 */
export function parseFiles(files: ImportFile[]): { bundle: ImportBundle; recognized: string[]; unknown: string[] } {
  const bundle = emptyBundle();
  const recognized: string[] = [];
  const unknown: string[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const wb = XLSX.read(new Uint8Array(f.data), { type: 'array' });
      const sheets: Record<string, string[][]> = {};
      for (const n of wb.SheetNames) {
        sheets[n] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' })
          .map((r) => r.map((c) => String(c ?? '')));
      }
      const before = bundle.rows.length;
      convertGasSheets(sheets, bundle);
      (bundle.rows.length > before || bundle.recurring.length ? recognized : unknown).push(f.name);
      continue;
    }
    const text = decodeText(f.data);
    if (isNaverCsv(text)) { convertNaverCsv(text, bundle); recognized.push(f.name); continue; }
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (isGasTransactionsHeader(rows[0])) { convertGasSheets({ TRANSACTIONS: rows }, bundle); recognized.push(f.name); continue; }
    unknown.push(f.name);
  }
  return { bundle, recognized, unknown };
}

/** UTF-8 이 아니면(엑셀에서 저장한 CSV) EUC-KR 로 읽는다 */
function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
}

function guessKind(name: string): AccountKind {
  if (/페이|pay/i.test(name)) return '페이';
  if (/체크|동백|오륙도/.test(name)) return '체크카드';
  if (/카드/.test(name)) return '신용카드';
  if (/현금|지갑/.test(name)) return '현금';
  if (/예금|적금|투자|펀드|주식|cma/i.test(name)) return '저축·투자';
  if (/대여|보증|연금|공제/.test(name)) return '기타자산';
  return '통장';
}

const defaultFlow = (type: string): Flow =>
  type === '사업매출' ? 'IN' : type === '자금이동' ? 'NEUTRAL' : 'OUT';

/** 묶음을 DB 에 넣는다. sourceKey 로 중복을 막으므로 다시 실행해도 안전하다. */
export async function commitBundle(db: Db, b: ImportBundle, vatRate = 0.1) {
  await seedDefaults(db);

  /* 계좌 */
  const accNames = new Set<string>();
  for (const r of b.rows) { if (r.from) accNames.add(r.from); if (r.to) accNames.add(r.to); }
  for (const o of b.openings) accNames.add(o.account);
  for (const r of b.recurring) { if (r.from) accNames.add(r.from); if (r.to) accNames.add(r.to); }
  if (accNames.size) {
    await db.insert(accounts).values([...accNames].map((name) => {
      const k = b.accountKinds?.[name];
      const kind = (ACCOUNT_KINDS as readonly string[]).includes(k ?? '') ? k as AccountKind : guessKind(name);
      return { name, kind, accountTitle: ACCOUNT_KIND_INFO[kind].title, sortOrder: 500 };
    })).onConflictDoNothing();
  }
  const accRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const accId = new Map(accRows.map((a) => [a.name, a.id]));

  /* 기초잔액 (피드백 4: 전월이월은 수입이 아니라 잔액) */
  const openingSum = new Map<string, number>();
  for (const o of b.openings) openingSum.set(o.account, (openingSum.get(o.account) ?? 0) + o.amount);
  for (const [name, amount] of openingSum) {
    await db.update(accounts).set({ openingBalance: amount, updatedAt: new Date() }).where(eq(accounts.name, name));
  }

  /* 분류 */
  const catKeys = new Map<string, { type: string; name: string; flow: Flow }>();
  for (const r of [...b.rows, ...b.recurring]) {
    const k = `${r.type}|${r.category}`;
    if (!catKeys.has(k)) {
      const flow = ('flow' in r && ['IN', 'OUT', 'NEUTRAL'].includes(String(r.flow))) ? r.flow as Flow : defaultFlow(r.type);
      catKeys.set(k, { type: r.type, name: r.category, flow: r.type === '자금이동' ? 'NEUTRAL' : flow });
    }
  }
  if (catKeys.size) {
    await db.insert(categories).values([...catKeys.values()].map((c) => ({ ...c, sortOrder: 900 }))).onConflictDoNothing();
  }
  const catRows = await db.select({ id: categories.id, type: categories.type, name: categories.name }).from(categories);
  const catId = new Map(catRows.map((c) => [`${c.type}|${c.name}`, c.id]));

  /* 거래처 · 학교 */
  const vNames = [...new Set([...b.rows, ...b.recurring].map((r) => r.vendor?.trim()).filter(Boolean) as string[])];
  const pNames = [...new Set([...b.rows, ...b.recurring].map((r) => r.project?.trim()).filter(Boolean) as string[])];
  for (let i = 0; i < vNames.length; i += 500) {
    await db.insert(vendors).values(vNames.slice(i, i + 500).map((name) => ({ name }))).onConflictDoNothing();
  }
  for (let i = 0; i < pNames.length; i += 500) {
    await db.insert(projects).values(pNames.slice(i, i + 500).map((name) => ({ name }))).onConflictDoNothing();
  }
  const vId = new Map((vNames.length ? await db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(inArray(vendors.name, vNames)) : []).map((v) => [v.name, v.id]));
  const pId = new Map((pNames.length ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.name, pNames)) : []).map((p) => [p.name, p.id]));

  /* 거래 */
  const values = b.rows.map((r) => {
    let supply = r.supplyAmount ?? 0, vat = r.vat ?? 0;
    if (r.vatSplit) { supply = Math.round(r.amount / (1 + vatRate)); vat = r.amount - supply; }
    if (supply + vat !== r.amount) { supply = r.amount; vat = 0; }
    const source = r.sourceKey.startsWith('gas:') ? 'gas' : 'naver';
    return {
      date: r.date,
      categoryId: catId.get(`${r.type}|${r.category}`)!,
      amount: r.amount, supplyAmount: supply, vat,
      fromAccountId: r.from ? accId.get(r.from) ?? null : null,
      toAccountId: r.to ? accId.get(r.to) ?? null : null,
      vendorId: r.vendor ? vId.get(r.vendor.trim()) ?? null : null,
      projectId: r.project ? pId.get(r.project.trim()) ?? null : null,
      description: r.description ?? '',
      memo: r.memo ?? '',
      tags: r.tags,
      paymentStatus: r.paymentStatus ?? '입금완료',
      paymentDate: r.paymentDate === undefined ? r.date : r.paymentDate,
      invoiceStatus: r.invoiceStatus ?? (r.type === '사업매출' ? '발행' : '해당없음'),
      source,
      sourceKey: r.sourceKey,
    };
  });

  let inserted = 0;
  for (let i = 0; i < values.length; i += 300) {
    const res = await db.insert(transactions).values(values.slice(i, i + 300))
      .onConflictDoNothing({ target: transactions.sourceKey }).returning({ id: transactions.id });
    inserted += res.length;
  }

  /* 고정지출 템플릿 (같은 이름이 없을 때만) */
  let recurringAdded = 0;
  for (const r of b.recurring) {
    const cid = catId.get(`${r.type}|${r.category}`);
    if (!cid) continue;
    const [exists] = await db.select({ id: recurring.id }).from(recurring).where(and(eq(recurring.title, r.title), eq(recurring.categoryId, cid)));
    if (exists) continue;
    await db.insert(recurring).values({
      title: r.title, categoryId: cid, amount: r.amount, supplyAmount: r.supplyAmount || r.amount, vat: r.vat,
      fromAccountId: r.from ? accId.get(r.from) ?? null : null, toAccountId: r.to ? accId.get(r.to) ?? null : null,
      vendorId: r.vendor ? vId.get(r.vendor) ?? null : null, projectId: r.project ? pId.get(r.project) ?? null : null,
      dayOfMonth: r.dayOfMonth, description: r.description, memo: r.memo, tags: r.tags, active: r.active,
      lastGeneratedYm: r.lastGeneratedYm,
    });
    recurringAdded++;
  }

  const months = [...new Set(b.rows.map((r) => r.date.slice(0, 7)))].sort();
  return {
    total: b.rows.length,
    inserted,
    duplicates: b.rows.length - inserted,
    recurringAdded,
    openings: [...openingSum].map(([account, amount]) => ({ account, amount })),
    months: months.length ? `${months[0]} ~ ${months.at(-1)} (${months.length}개월)` : '',
    skippedCarry: b.stats.skippedCarry,
    skippedOther: b.stats.skippedOther,
  };
}

/** 가져온 거래만 지운다 (직접 입력한 거래는 그대로) */
export async function removeImported(db: Db, source: 'naver' | 'gas') {
  const res = await db.delete(transactions).where(eq(transactions.source, source)).returning({ id: transactions.id });
  return res.length;
}
