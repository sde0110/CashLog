import type { TxType } from '../domain';

/** 가져오기 원천(네이버 CSV · 구글시트)에 상관없이 같은 모양으로 맞춘 거래 */
export interface ImportRow {
  /** 재실행해도 중복으로 들어가지 않게 하는 키 */
  sourceKey: string;
  date: string;
  type: TxType | string;
  category: string;
  amount: number;
  /** 공급가액/부가세를 직접 아는 경우 (구글시트) */
  supplyAmount?: number;
  vat?: number;
  /** true 면 합계를 부가세율로 자동 안분 (네이버 CSV 의 사업 거래) */
  vatSplit?: boolean;
  /** 계좌·결제수단 이름 — 없으면 새로 만든다 */
  from?: string;
  to?: string;
  vendor?: string;
  project?: string;
  description: string;
  memo?: string;
  tags: string[];
  paymentStatus?: string;
  paymentDate?: string | null;
  invoiceStatus?: string;
  flow?: string;
  origin?: 'I' | 'E';
}

export interface ImportOpening { account: string; amount: number; date: string; note: string }

export interface ImportRecurring {
  title: string; type: string; category: string; amount: number; supplyAmount: number; vat: number;
  from?: string; to?: string; vendor?: string; project?: string;
  dayOfMonth: number; description: string; memo: string; tags: string[]; active: boolean; lastGeneratedYm: string;
}

export interface ImportBundle {
  rows: ImportRow[];
  openings: ImportOpening[];
  recurring: ImportRecurring[];
  /** 계좌 이름 → 종류 (구글시트의 ACCOUNTS 탭) */
  accountKinds?: Record<string, string>;
  stats: { csvIncome: number; csvExpense: number; skippedZero: number; skippedCarry: number; skippedOther: number };
}
