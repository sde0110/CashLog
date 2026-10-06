import { sql } from 'drizzle-orm';
import {
  bigint, boolean, date, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const won = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

/** 통장 · 카드 · 페이 · 현금 · 저축/투자 — 돈이 머무르거나 쓰이는 곳 */
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  kind: text('kind').notNull(),
  institution: text('institution').notNull().default(''),
  /** 체크카드·페이가 실제로 돈을 빼 가는 통장 (잔액은 그 통장에서 차감) */
  linkedAccountId: integer('linked_account_id'),
  openingBalance: won('opening_balance'),
  accountTitle: text('account_title').notNull().default(''),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(100),
  memo: text('memo').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  flow: text('flow').notNull(), // IN | OUT | NEUTRAL — 집계의 유일한 기준
  accountTitle: text('account_title').notNull().default(''),
  icon: text('icon').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(100),
  active: boolean('active').notNull().default(true),
  memo: text('memo').notNull().default(''),
}, (t) => [uniqueIndex('categories_type_name').on(t.type, t.name)]);

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  bizNo: text('biz_no').notNull().default(''),
  manager: text('manager').notNull().default(''),
  phone: text('phone').notNull().default(''),
  memo: text('memo').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  memo: text('memo').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date', { mode: 'string' }).notNull(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  amount: won('amount'),
  supplyAmount: won('supply_amount'),
  vat: won('vat'),
  fromAccountId: integer('from_account_id').references(() => accounts.id),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  projectId: integer('project_id').references(() => projects.id),
  description: text('description').notNull().default(''),
  memo: text('memo').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  paymentStatus: text('payment_status').notNull().default('입금완료'),
  paymentDate: date('payment_date', { mode: 'string' }),
  invoiceStatus: text('invoice_status').notNull().default('해당없음'),
  /** 만기 원금 ↔ 이자처럼 함께 생긴 거래 묶음 */
  linkId: uuid('link_id'),
  recurringId: integer('recurring_id'),
  /** manual | recurring | naver | gas */
  source: text('source').notNull().default('manual'),
  /** 가져오기 재실행 시 중복 방지 키 */
  sourceKey: text('source_key').unique(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('transactions_date').on(t.date),
  index('transactions_category').on(t.categoryId),
]);

/** 고정지출 · 정기거래 템플릿 (PRD 17) */
export const recurring = pgTable('recurring', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  amount: won('amount'),
  supplyAmount: won('supply_amount'),
  vat: won('vat'),
  fromAccountId: integer('from_account_id').references(() => accounts.id),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  projectId: integer('project_id').references(() => projects.id),
  dayOfMonth: integer('day_of_month').notNull().default(1),
  description: text('description').notNull().default(''),
  memo: text('memo').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  active: boolean('active').notNull().default(true),
  lastGeneratedYm: text('last_generated_ym').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type RecurringRow = typeof recurring.$inferSelect;

/** 로그인 실패 기록 — 짧은 비밀번호를 무작위 대입으로 맞히지 못하게 잠근다 */
export const loginFailures = pgTable('login_failures', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
