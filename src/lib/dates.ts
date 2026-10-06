/** 날짜 유틸 — 모두 한국 시간(Asia/Seoul) 기준의 'yyyy-MM-dd' 문자열로 다룬다. */

const pad2 = (n: number | string) => String(n).padStart(2, '0');

export function todayKST(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export const thisMonthKST = () => todayKST().slice(0, 7);

export function shiftYm(ym: string, delta: number): string {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) - 1 + delta;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}`;
}

export function lastDayOfMonth(ym: string): number {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
}

export function monthRange(ym: string): [string, string] {
  return [`${ym}-01`, `${ym}-${pad2(lastDayOfMonth(ym))}`];
}

export const isYm = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekday(date: string): string {
  return WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
}
export function weekdayIndex(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}

/** '2026-08' → '2026년 8월' */
export function ymLabel(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
}

/** '2026-08-05' → '8월 5일 (수)' */
export function dayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekday(date)})`;
}

export { pad2 };
