/** RFC 4180 CSV 파서 (따옴표 안의 쉼표·줄바꿈 허용) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    // 엑셀이 =, +, -, @ 로 시작하는 글자를 수식으로 실행하지 않도록 (숫자는 그대로)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** 헤더 행 기준으로 객체 배열 */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const [head, ...body] = rows;
  if (!head) return [];
  return body
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [String(h).trim(), String(r[i] ?? '').trim()])));
}
