import { describe, it, expect } from 'vitest';
import { findDuplicates, type DedupeExisting, type DedupeIncoming } from '@/lib/import/dedupe';

const ex = (id: string, date: string, amount: number, flow: DedupeExisting['flow'] = 'OUT', names: string[] = []): DedupeExisting =>
  ({ id, date, amount, flow, label: names[0] ?? id, names });
const inc = (key: string, date: string, amount: number, flow: DedupeIncoming['flow'] = 'OUT', names: string[] = []): DedupeIncoming =>
  ({ key, date, amount, flow, description: names[0] ?? key, names });

describe('가져오기 중복 검사', () => {
  it('같은 날 같은 금액 → 이미 있는 거래로 보고 건너뛴다', () => {
    const d = findDuplicates([inc('a', '2026-09-01', 25_700)], [ex('x', '2026-09-01', 25_700)]);
    expect(d.same).toHaveLength(1);
    expect(d.insert).toHaveLength(0);
  });

  it('수입과 지출은 금액이 같아도 다른 거래', () => {
    const d = findDuplicates([inc('a', '2026-09-01', 50_000, 'IN')], [ex('x', '2026-09-01', 50_000, 'OUT')]);
    expect(d.same).toHaveLength(0);
    expect(d.insert).toHaveLength(1);
  });

  it('이체는 지출·수입 어느 쪽과도 같을 수 있다 (네이버 "지출" ↔ 앱 "적금납입")', () => {
    const d = findDuplicates([inc('a', '2026-09-01', 50_000, 'OUT')], [ex('x', '2026-09-01', 50_000, 'NEUTRAL')]);
    expect(d.same).toHaveLength(1);
  });

  it('하나의 기존 거래는 한 번만 짝지어진다 — 같은 날 같은 금액 두 건이면 하나는 새로 넣는다', () => {
    const d = findDuplicates([inc('a', '2026-09-03', 9_000), inc('b', '2026-09-03', 9_000)], [ex('x', '2026-09-03', 9_000)]);
    expect(d.same).toHaveLength(1);
    expect(d.insert.map((r) => r.key)).toEqual(['b']);
  });

  it('금액이 같고 날짜가 ±2일 → 넣되 "의심"으로 알려 준다', () => {
    const d = findDuplicates([inc('a', '2026-09-05', 33_000)], [ex('x', '2026-09-03', 33_000)]);
    expect(d.near).toHaveLength(1);
    expect(d.insert).toHaveLength(1);
  });

  it('같은 날 같은 사용처인데 금액만 조금 다르면 오타로 보고 건너뛴다 (40,080 ↔ 40,800)', () => {
    const d = findDuplicates([inc('a', '2026-09-02', 40_800, 'OUT', ['일품수산'])], [ex('x', '2026-09-02', 40_080, 'OUT', ['', '일품수산'])]);
    expect(d.amountDiffers).toHaveLength(1);
    expect(d.insert).toHaveLength(0);
  });

  it('단골집에서 다른 날 먹은 건 다른 거래', () => {
    const d = findDuplicates([inc('a', '2026-09-04', 9_000, 'OUT', ['마산식당'])], [ex('x', '2026-09-03', 10_000, 'OUT', ['마산식당'])]);
    expect(d.amountDiffers).toHaveLength(0);
    expect(d.insert).toHaveLength(1);
  });

  it('같은 날 같은 가게라도 금액 차이가 크면 다른 거래 (점심 · 저녁)', () => {
    const d = findDuplicates([inc('a', '2026-09-04', 45_000, 'OUT', ['마산식당'])], [ex('x', '2026-09-04', 9_000, 'OUT', ['마산식당'])]);
    expect(d.insert).toHaveLength(1);
  });
});
