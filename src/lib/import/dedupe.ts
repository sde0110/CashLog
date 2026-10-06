/**
 * 가져오기 중복 검사 — 이미 장부에 있는 거래와 같은 것을 찾는다.
 *
 * 같은 파일을 다시 올리는 경우는 source_key 로 이미 막힌다.
 * 여기서는 "앱에 직접 입력한 거래가 네이버 파일에도 있는" 경우처럼
 * 출처가 달라 source_key 로는 알 수 없는 중복을 잡는다.
 *
 * 규칙
 *   같음   : 날짜 · 금액이 같고 방향이 부딪히지 않음 → 건너뜀 (이미 있는 쪽을 남긴다)
 *   의심   : 금액이 같고 날짜가 ±2일 이내         → 넣되 목록으로 알려 준다
 *   방향   : 수입↔지출은 다른 거래로 본다. 이체는 어느 쪽과도 같을 수 있다
 *            (네이버에선 '지출', 앱에선 '이체'로 적은 적금 납입 같은 경우)
 *   금액다름: 같은 날 · 같은 사용처 · 금액 차이 20% 이내 → 건너뛰고 "금액 확인 필요"로 알려 준다
 *            (한쪽에 오타가 난 경우. 예: 40,080 ↔ 40,800. 단골집에서 이틀 연속 먹은 건 다른 거래로 둔다)
 *   1:1    : 이미 있는 거래 하나는 한 번만 짝지어진다 (같은 날 같은 금액이 두 번이면 둘 다 확인)
 */
import type { Flow } from '../domain';

export interface DedupeIncoming { key: string; date: string; amount: number; flow: Flow; description: string; names?: string[] }
export interface DedupeExisting { id: string; date: string; amount: number; flow: Flow; label: string; names?: string[] }

export interface DedupeMatch { incoming: DedupeIncoming; existing: DedupeExisting }

const compatible = (a: Flow, b: Flow) => !((a === 'IN' && b === 'OUT') || (a === 'OUT' && b === 'IN'));

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

const norm = (s: string) => s.toLowerCase().replace(/[\s()（）_\-·.,]/g, '').replace(/^\(?주\)?|주식회사/g, '');
/** 사용처 이름이 같은가 — 공백·괄호를 무시하고, 한쪽이 다른 쪽을 포함하면 같다고 본다 (2글자 이상) */
function sameName(a: string[] = [], b: string[] = []): boolean {
  const A = a.map(norm).filter((x) => x.length >= 2);
  const B = b.map(norm).filter((x) => x.length >= 2);
  return A.some((x) => B.some((y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)))));
}

export function findDuplicates(incoming: DedupeIncoming[], existing: DedupeExisting[], nearDays = 2) {
  const byAmount = new Map<number, DedupeExisting[]>();
  for (const e of existing) {
    const list = byAmount.get(e.amount) ?? [];
    list.push(e);
    byAmount.set(e.amount, list);
  }
  const used = new Set<string>();
  const same: DedupeMatch[] = [];
  const near: DedupeMatch[] = [];
  const amountDiffers: DedupeMatch[] = [];
  const rest: DedupeIncoming[] = [];

  // 날짜까지 같은 것부터 짝짓고, 남은 것으로 '의심'을 찾는다
  const pending: DedupeIncoming[] = [];
  for (const r of incoming) {
    const hit = (byAmount.get(r.amount) ?? []).find((e) => !used.has(e.id) && e.date === r.date && compatible(r.flow, e.flow));
    if (hit) { used.add(hit.id); same.push({ incoming: r, existing: hit }); } else pending.push(r);
  }
  for (const r of pending) {
    const hit = (byAmount.get(r.amount) ?? []).find((e) =>
      !used.has(e.id) && Math.abs(dayDiff(e.date, r.date)) <= nearDays && compatible(r.flow, e.flow));
    if (hit) { used.add(hit.id); near.push({ incoming: r, existing: hit }); rest.push(r); continue; }
    // 금액이 다른 같은 거래 (오타)
    const typo = existing.find((e) =>
      !used.has(e.id) && e.date === r.date && compatible(r.flow, e.flow) && sameName(r.names, e.names) &&
      Math.abs(e.amount - r.amount) <= Math.max(e.amount, r.amount) * 0.2);
    if (typo) { used.add(typo.id); amountDiffers.push({ incoming: r, existing: typo }); continue; }
    rest.push(r);
  }
  return { same, near, amountDiffers, insert: rest };
}
