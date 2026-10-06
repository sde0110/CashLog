'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, categories, loginFailures, projects, recurring, settings, transactions, vendors } from '@/db/schema';
import { ACCOUNT_KIND_INFO, ACCOUNT_KINDS, DEFAULT_SETTINGS, TYPE_ORDER, type AccountKind, type TxType } from '@/lib/domain';
import { isDate, isYm, lastDayOfMonth, pad2 } from '@/lib/dates';
import { parseTags, parseWon } from '@/lib/format';
import { SESSION_COOKIE, checkPassword, createSessionValue, verifySessionValue } from '@/lib/session';
import { UserError, restore, saveTx, softDelete, resolveProject, resolveVendor, type SaveResult, type TxInput } from './tx';
import { commitBundle, parseFiles, removeImported } from './importer';

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function requireAuth() {
  const ok = await verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ok) throw new UserError('로그인이 만료되었습니다. 다시 로그인해 주세요.');
}

/** 예상한 오류는 메시지로, 예상 못 한 오류는 일반 문구로 돌려준다 */
async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    await requireAuth();
    const data = await fn();
    revalidatePath('/', 'layout');
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    const msg = String((e as Error)?.message ?? '');
    if (msg.includes('duplicate key')) return { ok: false, error: '같은 이름이 이미 있습니다.' };
    return { ok: false, error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}

/* ── 로그인 ─────────────────────────────────────────── */

/** 15분에 10번, 하루에 30번 틀리면 잠근다 (짧은 비밀번호의 무작위 대입 방지) */
const LOGIN_LIMITS = [
  { window: '15 minutes', max: 10, msg: '비밀번호를 여러 번 틀려 잠시 잠겼습니다. 15분 뒤에 다시 시도해 주세요.' },
  { window: '1 day', max: 30, msg: '오늘 비밀번호를 너무 많이 틀려 하루 동안 잠겼습니다. 내일 다시 시도해 주세요.' },
] as const;

/** 로그인 뒤 돌아갈 주소 — 같은 사이트 안의 경로만 허용 ('//x', '/\x' 같은 외부 주소 차단) */
function safeNext(v: unknown): string {
  const s = String(v ?? '/');
  return /^\/(?![/\\])[^\s]*$/.test(s) ? s : '/';
}

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const pw = String(form.get('password') ?? '').slice(0, 200);
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return { error: '서버에 APP_PASSWORD / SESSION_SECRET 이 설정되지 않았습니다.' };
  }
  const db = getDb();
  // 시도를 먼저 기록하고 센다 — 동시에 수백 번 보내도 한도를 넘지 못하게
  const [attempt] = await db.insert(loginFailures).values({}).returning({ id: loginFailures.id });
  const counts = (await db.execute<{ m15: number; d1: number }>(sql`
    select count(*) filter (where at > now() - interval '15 minutes')::int as m15,
           count(*) filter (where at > now() - interval '1 day')::int as d1
    from login_failures`)).rows[0];
  const used = [Number(counts.m15), Number(counts.d1)];
  const blocked = LOGIN_LIMITS.find((l, i) => used[i] > l.max);
  if (blocked) return { error: blocked.msg };

  if (!(await checkPassword(pw))) {
    await new Promise((r) => setTimeout(r, 800));
    const left = LOGIN_LIMITS[0].max - used[0];
    return { error: left > 0 ? `비밀번호가 맞지 않습니다. (${left}번 더 틀리면 15분 동안 잠깁니다)` : LOGIN_LIMITS[0].msg };
  }
  await db.delete(loginFailures).where(eq(loginFailures.id, attempt.id));
  await db.execute(sql`delete from login_failures where at < now() - interval '2 days'`);
  const { value, expires } = await createSessionValue();
  (await cookies()).set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires, path: '/' });
  redirect(safeNext(form.get('next')));
}

/** 최근 24시간 로그인 실패 횟수 (설정 화면 경고용) */
export async function recentLoginFailures(): Promise<number> {
  await requireAuth();
  const r = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from login_failures where at > now() - interval '1 day'`);
  return Number(r.rows[0]?.n ?? 0);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

/* ── 거래 ───────────────────────────────────────────── */

export async function saveTransaction(input: TxInput): Promise<ActionResult<SaveResult>> {
  return run(() => saveTx(input));
}

export async function deleteTransactions(ids: string[]): Promise<ActionResult<string[]>> {
  return run(() => softDelete(ids));
}

export async function restoreTransactions(ids: string[]): Promise<ActionResult> {
  return run(() => restore(ids), '되돌렸습니다.');
}

/** 미입금 매출 → 입금 처리 */
export async function markPaid(id: string, date: string, accountId: number | null): Promise<ActionResult> {
  return run(async () => {
    await getDb().update(transactions).set({
      paymentStatus: '입금완료', paymentDate: isDate(date) ? date : null,
      ...(accountId ? { toAccountId: accountId } : {}), updatedAt: new Date(),
    }).where(eq(transactions.id, id));
  }, '입금 처리했습니다.');
}

/** 여러 거래의 결제수단·분류를 한 번에 바꾼다 (과거 '카드(기타)' 정리용) */
export async function bulkUpdate(ids: string[], patch: { fromAccountId?: number; toAccountId?: number; categoryId?: number }): Promise<ActionResult<number>> {
  return run(async () => {
    if (!ids.length) throw new UserError('선택한 거래가 없습니다.');
    const db = getDb();
    const set: Partial<typeof transactions.$inferInsert> = { updatedAt: new Date() };
    if (patch.categoryId) {
      // 분류 변경은 같은 성격(수입/지출/이체) 안에서만 — 계좌 칸 의미가 달라지지 않게
      const [target] = await db.select().from(categories).where(eq(categories.id, patch.categoryId));
      if (!target) throw new UserError('분류를 찾을 수 없습니다.');
      const flows = await db.selectDistinct({ flow: categories.flow }).from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id)).where(inArray(transactions.id, ids));
      if (flows.some((f) => f.flow !== target.flow)) throw new UserError('수입·지출·이체가 섞여 있으면 분류를 한 번에 바꿀 수 없습니다.');
      set.categoryId = patch.categoryId;
    }
    const accIds = [patch.fromAccountId, patch.toAccountId].filter(Boolean) as number[];
    if (accIds.length) {
      const found = await db.select({ id: accounts.id }).from(accounts).where(inArray(accounts.id, accIds));
      if (found.length !== new Set(accIds).size) throw new UserError('계좌를 찾을 수 없습니다.');
    }
    const live = and(inArray(transactions.id, ids), isNull(transactions.deletedAt));
    const flowIs = (cond: SQL) => inArray(transactions.categoryId, db.select({ id: categories.id }).from(categories).where(cond));
    const touched = new Set<string>();
    if (set.categoryId) {
      (await db.update(transactions).set(set).where(live).returning({ id: transactions.id })).forEach((r) => touched.add(r.id));
    }
    // 수입에는 출금 계좌가, 지출에는 입금 계좌가 없다 — 성격에 맞는 거래에만 넣는다
    if (patch.fromAccountId) {
      (await db.update(transactions).set({ fromAccountId: patch.fromAccountId, updatedAt: new Date() })
        .where(and(live, flowIs(ne(categories.flow, 'IN')))).returning({ id: transactions.id })).forEach((r) => touched.add(r.id));
    }
    if (patch.toAccountId) {
      (await db.update(transactions).set({ toAccountId: patch.toAccountId, updatedAt: new Date() })
        .where(and(live, flowIs(ne(categories.flow, 'OUT')))).returning({ id: transactions.id })).forEach((r) => touched.add(r.id));
    }
    return touched.size;
  });
}

/* ── 고정지출 (반복거래, PRD 17 · 피드백 3) ─────────── */

export interface RecurringInput {
  id?: number; title: string; categoryId: number; amount: number | string; supplyAmount?: number | string; vat?: number | string;
  fromAccountId?: number | null; toAccountId?: number | null; vendorName?: string; projectName?: string;
  dayOfMonth: number | string; description?: string; memo?: string; tags?: string; active?: boolean;
}

export async function saveRecurring(input: RecurringInput): Promise<ActionResult> {
  return run(async () => {
    const db = getDb();
    const title = String(input.title ?? '').trim();
    if (!title) throw new UserError('이름을 입력해 주세요. 예: 세무사 수수료');
    const [cat] = await db.select().from(categories).where(eq(categories.id, Number(input.categoryId)));
    if (!cat) throw new UserError('분류를 선택해 주세요.');
    const amount = parseWon(input.amount);
    if (amount <= 0) throw new UserError('금액을 입력해 주세요.');
    let supply = parseWon(input.supplyAmount), vat = parseWon(input.vat);
    if (!supply && !vat) supply = amount;
    if (supply + vat !== amount) throw new UserError('공급가액 + 부가세가 금액과 맞지 않습니다.');
    const day = Number(input.dayOfMonth);
    if (!(day >= 1 && day <= 31)) throw new UserError('매월 며칠인지 1~31 사이로 입력해 주세요.');
    const from = cat.flow === 'IN' ? null : input.fromAccountId || null;
    const to = cat.flow === 'OUT' ? null : input.toAccountId || null;
    if (cat.flow === 'NEUTRAL' && (!from || !to)) throw new UserError('이체는 보내는 곳과 받는 곳을 모두 골라 주세요.');

    const values = {
      title, categoryId: cat.id, amount, supplyAmount: supply, vat, fromAccountId: from, toAccountId: to,
      vendorId: await resolveVendor(input.vendorName), projectId: await resolveProject(input.projectName),
      dayOfMonth: day, description: String(input.description ?? '').trim(), memo: String(input.memo ?? '').trim(),
      tags: parseTags(input.tags), active: input.active ?? true, updatedAt: new Date(),
    };
    if (input.id) await db.update(recurring).set(values).where(eq(recurring.id, input.id));
    else await db.insert(recurring).values(values);
  }, '저장했습니다.');
}

export async function deleteRecurring(id: number): Promise<ActionResult> {
  return run(async () => {
    const db = getDb();
    await db.update(transactions).set({ recurringId: null }).where(eq(transactions.recurringId, id));
    await db.delete(recurring).where(eq(recurring.id, id));
  }, '삭제했습니다.');
}

/** 선택한 고정지출을 해당 월 거래로 만든다. 같은 달에 두 번 만들지 않는다. */
export async function generateRecurring(ym: string, ids: number[]): Promise<ActionResult<number>> {
  return run(async () => {
    if (!isYm(ym)) throw new UserError('월을 다시 선택해 주세요.');
    if (!ids.length) throw new UserError('넣을 항목을 골라 주세요.');
    const db = getDb();
    const list = await db.select().from(recurring).where(and(inArray(recurring.id, ids), eq(recurring.active, true)));
    const todo = list.filter((r) => r.lastGeneratedYm < ym || !r.lastGeneratedYm);
    if (!todo.length) throw new UserError('이미 이번 달에 넣은 항목입니다.');
    const last = lastDayOfMonth(ym);
    await db.batch([
      db.insert(transactions).values(todo.map((r) => ({
        date: `${ym}-${pad2(Math.min(r.dayOfMonth, last))}`,
        categoryId: r.categoryId, amount: r.amount, supplyAmount: r.supplyAmount, vat: r.vat,
        fromAccountId: r.fromAccountId, toAccountId: r.toAccountId, vendorId: r.vendorId, projectId: r.projectId,
        description: r.description || r.title, memo: r.memo, tags: r.tags,
        recurringId: r.id, source: 'recurring',
      }))),
      db.update(recurring).set({ lastGeneratedYm: ym, updatedAt: new Date() }).where(inArray(recurring.id, todo.map((r) => r.id))),
    ]);
    return todo.length;
  });
}

/* ── 기초정보 ───────────────────────────────────────── */

export interface AccountInput {
  id?: number; name: string; kind: string; institution?: string; linkedAccountId?: number | null;
  openingBalance?: number | string; active?: boolean; memo?: string; sortOrder?: number;
}

export async function saveAccount(input: AccountInput): Promise<ActionResult> {
  return run(async () => {
    const name = String(input.name ?? '').trim();
    if (!name) throw new UserError('이름을 입력해 주세요.');
    const kind = (ACCOUNT_KINDS as readonly string[]).includes(input.kind) ? input.kind as AccountKind : '통장';
    if (input.linkedAccountId) {
      if (input.linkedAccountId === input.id) throw new UserError('자기 자신을 연결 통장으로 고를 수 없습니다.');
      const [l] = await getDb().select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, input.linkedAccountId));
      if (l?.kind !== '통장') throw new UserError('연결 통장은 "통장" 종류만 고를 수 있습니다.');
    }
    const values = {
      name, kind, institution: String(input.institution ?? '').trim(),
      linkedAccountId: kind === '체크카드' || kind === '페이' || kind === '신용카드' ? input.linkedAccountId || null : null,
      openingBalance: parseWon(input.openingBalance), active: input.active ?? true,
      memo: String(input.memo ?? '').trim(), accountTitle: ACCOUNT_KIND_INFO[kind].title, updatedAt: new Date(),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    };
    const db = getDb();
    if (input.id) await db.update(accounts).set(values).where(eq(accounts.id, input.id));
    else await db.insert(accounts).values(values);
  }, '저장했습니다.');
}

export async function saveCategory(input: { id?: number; type: string; name: string; flow?: string; icon?: string; memo?: string; active?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const db = getDb();
    const name = String(input.name ?? '').trim();
    if (!name) throw new UserError('분류 이름을 입력해 주세요.');
    if (input.id) {
      // 성격(flow)은 바꾸지 않는다 — 과거 집계가 통째로 바뀌기 때문
      await db.update(categories).set({ name, icon: input.icon ?? '', memo: input.memo ?? '', active: input.active ?? true })
        .where(eq(categories.id, input.id));
      return;
    }
    if (!TYPE_ORDER.includes(input.type as TxType)) throw new UserError('대분류를 골라 주세요.');
    const flow = input.type === '자금이동' ? 'NEUTRAL' : input.type === '사업매출' ? 'IN'
      : input.type === '기타' ? (input.flow === 'IN' ? 'IN' : 'OUT') : 'OUT';
    const title = input.type === '가계이체' ? '인출금' : '';
    await db.insert(categories).values({ type: input.type, name, flow, icon: input.icon ?? '', memo: input.memo ?? '', accountTitle: title, sortOrder: 800 });
  }, '저장했습니다.');
}

export async function saveVendor(input: { id?: number; name: string; bizNo?: string; manager?: string; phone?: string; memo?: string; active?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const name = String(input.name ?? '').trim();
    if (!name) throw new UserError('거래처 이름을 입력해 주세요.');
    const v = { name, bizNo: input.bizNo ?? '', manager: input.manager ?? '', phone: input.phone ?? '', memo: input.memo ?? '', active: input.active ?? true };
    const db = getDb();
    if (input.id) await db.update(vendors).set(v).where(eq(vendors.id, input.id));
    else await db.insert(vendors).values(v);
  }, '저장했습니다.');
}

export async function saveProject(input: { id?: number; name: string; memo?: string; active?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const name = String(input.name ?? '').trim();
    if (!name) throw new UserError('학교/프로젝트 이름을 입력해 주세요.');
    const p = { name, memo: input.memo ?? '', active: input.active ?? true };
    const db = getDb();
    if (input.id) await db.update(projects).set(p).where(eq(projects.id, input.id));
    else await db.insert(projects).values(p);
  }, '저장했습니다.');
}

export async function saveSettings(patch: Record<string, string>): Promise<ActionResult> {
  return run(async () => {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    const rows = Object.entries(patch).filter(([k]) => allowed.includes(k)).map(([key, value]) => ({ key, value: String(value).trim() }));
    if (!rows.length) return;
    await getDb().insert(settings).values(rows).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  }, '저장했습니다.');
}

/* ── 가져오기 ───────────────────────────────────────── */

export async function importFiles(form: FormData): Promise<ActionResult<Awaited<ReturnType<typeof commitBundle>> & { recognized: string[]; unknown: string[] }>> {
  return run(async () => {
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserError('파일을 골라 주세요.');
    const parsed = parseFiles(await Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))));
    if (!parsed.recognized.length) {
      throw new UserError('알아볼 수 있는 파일이 없습니다. 네이버 가계부 CSV 또는 구글시트 엑셀(.xlsx)인지 확인해 주세요.');
    }
    const db = getDb();
    const [rate] = await db.select().from(settings).where(eq(settings.key, 'vat_rate'));
    const result = await commitBundle(db, parsed.bundle, Number(rate?.value) || 0.1);
    return { ...result, recognized: parsed.recognized, unknown: parsed.unknown };
  });
}

export async function removeImportedData(source: 'naver' | 'gas'): Promise<ActionResult<number>> {
  return run(() => removeImported(getDb(), source));
}
