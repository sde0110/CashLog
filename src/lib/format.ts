export function won(n: number | null | undefined): string {
  return Math.round(Number(n) || 0).toLocaleString('ko-KR');
}

/** 부호를 붙인 금액: +1,000 / −1,000 */
export function signedWon(n: number): string {
  if (!n) return '0';
  return (n > 0 ? '+' : '−') + won(Math.abs(n));
}

/** 큰 금액을 짧게: 12,345,678 → 1,235만 */
export function shortWon(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 100_000_000) return `${s}${(a / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`;
  if (a >= 10_000) return `${s}${Math.round(a / 10_000).toLocaleString('ko-KR')}만`;
  return `${s}${won(a)}`;
}

/** 금액 입력값 '1,234원' → 1234 */
export function parseWon(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number(String(v ?? '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 'a, b, #c' → ['a','b','c'] (빈 값·중복 제거) */
export function parseTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[,;|]/);
  const out: string[] = [];
  for (const t of arr) {
    const s = String(t).trim().replace(/^#/, '');
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export const normKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
