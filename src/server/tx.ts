import 'server-only';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, categories, projects, recurring, transactions, vendors } from '@/db/schema';
import { MATURITY_CATEGORIES, PAYMENT_STATUS, TYPES, hasVat } from '@/lib/domain';
import { isDate } from '@/lib/dates';
import { parseTags, parseWon, won } from '@/lib/format';
import { getMasters } from './data';

export class UserError extends Error {}
const fail = (msg: string): never => { throw new UserError(msg); };

export interface TxInput {
  id?: string;
  date: string;
  categoryId: number;
  amount: number | string;
  supplyAmount?: number | string;
  vat?: number | string;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  vendorName?: string;
  projectName?: string;
  description?: string;
  memo?: string;
  tags?: string | string[];
  paymentStatus?: string;
  paymentDate?: string | null;
  invoiceStatus?: string;
  /** 예금·적금 만기: 이자를 따로 입력하면 금융수입 거래를 하나 더 만든다 */
  interestAmount?: number | string;
  /** 체크하면 같은 내용으로 '고정지출'(매월 반복) 템플릿을 만든다 */
  makeRecurring?: boolean;
  /** 큰 금액·중복 경고를 확인했음 */
  confirmed?: boolean;
}

export interface Warning { code: 'LARGE' | 'DUPLICATE'; message: string; items?: { date: string; label: string; amount: number }[] }

/* ── 이름 → id (없으면 만든다) ──────────────────────── */

export async function resolveVendor(name?: string): Promise<number | null> {
  const n = (name ?? '').trim();
  if (!n) return null;
  const db = getDb();
  const [ins] = await db.insert(vendors).values({ name: n }).onConflictDoNothing().returning({ id: vendors.id });
  if (ins) return ins.id;
  const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.name, n));
  return row?.id ?? null;
}

export async function resolveProject(name?: string): Promise<number | null> {
  const n = (name ?? '').trim();
  if (!n) return null;
  const db = getDb();
  const [ins] = await db.insert(projects).values({ name: n }).onConflictDoNothing().returning({ id: projects.id });
  if (ins) return ins.id;
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, n));
  return row?.id ?? null;
}

/* ── 검증 · 정규화 ──────────────────────────────────── */

async function normalize(input: TxInput) {
  const m = await getMasters();
  const cat = m.categories.find((c) => c.id === Number(input.categoryId));
  if (!cat) fail('분류를 선택해 주세요.');
  const category = cat!;

  const date = String(input.date ?? '').slice(0, 10);
  if (!isDate(date)) fail('날짜를 올바르게 입력해 주세요.');

  const amount = parseWon(input.amount);
  if (amount <= 0) fail('금액을 입력해 주세요.');
  let supply = parseWon(input.supplyAmount);
  let vat = parseWon(input.vat);
  if (!hasVat(category.type) || (!supply && !vat)) { supply = amount; vat = 0; }
  if (supply + vat !== amount) {
    fail(`공급가액(${won(supply)}) + 부가세(${won(vat)})가 금액(${won(amount)})과 맞지 않습니다.`);
  }

  const accIds = new Set(m.accounts.map((a) => a.id));
  let from = input.fromAccountId ? Number(input.fromAccountId) : null;
  let to = input.toAccountId ? Number(input.toAccountId) : null;
  if (from && !accIds.has(from)) fail('출금 계좌를 다시 선택해 주세요.');
  if (to && !accIds.has(to)) fail('입금 계좌를 다시 선택해 주세요.');

  if (category.flow === 'NEUTRAL') {
    if (!from || !to) fail('이체는 보내는 곳과 받는 곳을 모두 골라 주세요.');
    if (from === to) fail('보내는 곳과 받는 곳이 같습니다.');
  } else if (category.flow === 'IN') {
    from = null;
  } else {
    to = null;
  }

  const isSales = category.type === TYPES.SALES;
  const paymentStatus = isSales && input.paymentStatus === PAYMENT_STATUS.UNPAID ? PAYMENT_STATUS.UNPAID : PAYMENT_STATUS.PAID;
  const paymentDate = paymentStatus === PAYMENT_STATUS.PAID
    ? (isDate(input.paymentDate) ? input.paymentDate! : date) : null;

  return {
    category,
    values: {
      date,
      categoryId: category.id,
      amount, supplyAmount: supply, vat,
      fromAccountId: from, toAccountId: to,
      description: String(input.description ?? '').trim().slice(0, 200),
      memo: String(input.memo ?? '').trim().slice(0, 1000),
      tags: parseTags(input.tags).slice(0, 20),
      paymentStatus,
      paymentDate,
      invoiceStatus: isSales || category.type === TYPES.EXPENSE
        ? (['발행', '미발행', '해당없음'].includes(input.invoiceStatus ?? '') ? input.invoiceStatus! : '해당없음')
        : '해당없음',
    },
    settings: m.settings,
  };
}

/** 큰 금액 · 같은 날 같은 금액 경고 (PRD 25-6, 25-7) */
async function warningsFor(id: string | undefined, v: { date: string; amount: number; categoryId: number }, vendorId: number | null, threshold: number, dupCheck: boolean) {
  const out: Warning[] = [];
  if (threshold > 0 && v.amount >= threshold) {
    out.push({ code: 'LARGE', message: `금액이 큽니다 (${won(v.amount)}원). 금액이 맞나요?` });
  }
  if (dupCheck) {
    const db = getDb();
    const conds = [
      isNull(transactions.deletedAt), eq(transactions.date, v.date), eq(transactions.amount, v.amount),
      vendorId ? eq(transactions.vendorId, vendorId) : eq(transactions.categoryId, v.categoryId),
    ];
    if (id) conds.push(ne(transactions.id, id));
    const dups = await db.select({ date: transactions.date, amount: transactions.amount, d: transactions.description, c: categories.name })
      .from(transactions).innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conds)).limit(5);
    if (dups.length) {
      out.push({
        code: 'DUPLICATE',
        message: `같은 날 같은 금액의 거래가 이미 ${dups.length}건 있습니다. 중복이 아닌가요?`,
        items: dups.map((d) => ({ date: d.date, label: d.d || d.c, amount: d.amount })),
      });
    }
  }
  return out;
}

export type SaveResult =
  | { ok: true; id: string; extra?: string }
  | { ok: false; needsConfirm: true; warnings: Warning[] };

export async function saveTx(input: TxInput): Promise<SaveResult> {
  const { category, values, settings } = await normalize(input);
  const db = getDb();

  // 거래처·학교는 경고 확인 전에 미리 만들지 않도록 이름만 먼저 조회
  const vendorName = (input.vendorName ?? '').trim();
  let vendorId: number | null = null;
  if (vendorName) {
    const [v] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.name, vendorName));
    vendorId = v?.id ?? null;
  }

  if (!input.confirmed) {
    const warnings = await warningsFor(input.id, values, vendorId,
      Number(settings.large_amount_threshold) || 0, settings.duplicate_check !== 'false');
    if (warnings.length) return { ok: false, needsConfirm: true, warnings };
  }

  if (vendorName && !vendorId) vendorId = await resolveVendor(vendorName);
  const projectId = await resolveProject(input.projectName);
  const row = { ...values, vendorId, projectId };

  if (input.id) {
    const updated = await db.update(transactions).set({ ...row, updatedAt: new Date() })
      .where(and(eq(transactions.id, input.id), isNull(transactions.deletedAt))).returning({ id: transactions.id });
    if (!updated.length) fail('수정할 거래를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
    return { ok: true, id: input.id };
  }

  let recurringId: number | null = null;
  if (input.makeRecurring) {
    const [r] = await db.insert(recurring).values({
      title: row.description || category.name,
      categoryId: row.categoryId, amount: row.amount, supplyAmount: row.supplyAmount, vat: row.vat,
      fromAccountId: row.fromAccountId, toAccountId: row.toAccountId, vendorId, projectId,
      dayOfMonth: Number(row.date.slice(8, 10)), description: row.description, memo: row.memo, tags: row.tags,
      lastGeneratedYm: row.date.slice(0, 7),
    }).returning({ id: recurring.id });
    recurringId = r.id;
  }

  const interest = parseWon(input.interestAmount);
  if (interest > 0 && MATURITY_CATEGORIES.includes(category.name)) {
    // 만기: 원금은 자금이동, 이자는 금융수입 (PRD 11)
    const m = await getMasters();
    const fin = m.categories.find((c) => c.type === TYPES.ETC && c.name === '금융수입');
    if (!fin) fail('"기타 > 금융수입" 분류가 없습니다. 설정 > 분류에서 다시 켜 주세요.');
    const linkId = crypto.randomUUID();
    const [p] = await db.batch([
      db.insert(transactions).values({ ...row, linkId, recurringId }).returning({ id: transactions.id }),
      db.insert(transactions).values({
        date: row.date, categoryId: fin!.id, amount: interest, supplyAmount: interest, vat: 0,
        toAccountId: row.toAccountId, vendorId, description: `${row.description || category.name} 이자`,
        tags: [...row.tags, '이자'], linkId,
      }),
    ]);
    return { ok: true, id: p[0].id, extra: `이자 ${won(interest)}원은 기타수입 > 금융수입으로 따로 기록했습니다.` };
  }

  const [ins] = await db.insert(transactions).values({ ...row, recurringId }).returning({ id: transactions.id });
  return { ok: true, id: ins.id, extra: recurringId ? '고정지출에도 등록했습니다. 다음 달부터 [고정지출]에서 한 번에 넣을 수 있습니다.' : undefined };
}

/** 삭제 — 함께 생긴 거래(만기 원금·이자)도 같이 지운다. 되돌리기 가능 (soft delete) */
export async function softDelete(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const db = getDb();
  const links = await db.select({ linkId: transactions.linkId }).from(transactions)
    .where(and(inArray(transactions.id, ids), sql`${transactions.linkId} is not null`));
  const linkIds = links.map((l) => l.linkId!).filter(Boolean);
  const cond = linkIds.length
    ? sql`(${inArray(transactions.id, ids)} or ${inArray(transactions.linkId, linkIds)})`
    : inArray(transactions.id, ids);
  const res = await db.update(transactions).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(cond, isNull(transactions.deletedAt))).returning({ id: transactions.id });
  return res.map((r) => r.id);
}

export async function restore(ids: string[]) {
  if (!ids.length) return;
  await getDb().update(transactions).set({ deletedAt: null, updatedAt: new Date() }).where(inArray(transactions.id, ids));
}

export async function ensureAccountExists(id: number) {
  const [a] = await getDb().select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id));
  if (!a) fail('계좌를 찾을 수 없습니다.');
}
