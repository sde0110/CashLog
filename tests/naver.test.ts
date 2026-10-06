import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertNaverCsv, emptyBundle, isNaverCsv } from '@/lib/import/naver';
import { SEED_CATEGORIES, SEED_ACCOUNTS } from '@/lib/domain';

/* 실제 내보내기와 같은 형식의 가짜 데이터 (tests/fixtures) */
const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');
const b = emptyBundle();
for (const f of ['naver_income.csv', 'naver_expense.csv']) convertNaverCsv(read(f), b);
const find = (desc: string) => b.rows.find((r) => r.description === desc)!;
const sum = (o: 'I' | 'E') => b.rows.filter((r) => r.origin === o).reduce((s, r) => s + r.amount, 0);

describe('네이버 가계부 CSV 변환', () => {
  it('수입현황·지출현황 형식을 알아본다', () => {
    expect(isNaverCsv(read('naver_income.csv'))).toBe(true);
    expect(isNaverCsv('a,b,c\n1,2,3')).toBe(false);
  });

  it('원본 합계와 한 원도 어긋나지 않는다 (0원 행은 제외)', () => {
    expect(sum('I')).toBe(b.stats.csvIncome);
    expect(sum('E')).toBe(b.stats.csvExpense);
    expect(b.stats.skippedZero).toBe(1);
  });

  it('전월이월은 수입이 아니라 기초잔액이다', () => {
    expect(b.rows.some((r) => r.amount === 3_000_000)).toBe(false);
    expect(b.openings).toEqual(expect.arrayContaining([
      expect.objectContaining({ account: 'KB기업 사업통장', amount: 3_000_000 }),
    ]));
  });

  it('○○은행잔고이체 → 그 은행 통장 기초잔액 + 사업통장으로 이체', () => {
    expect(b.openings).toEqual(expect.arrayContaining([expect.objectContaining({ account: '○○은행 통장', amount: 500_000 })]));
    expect(find('○○은행잔고이체')).toMatchObject({ type: '자금이동', from: '○○은행 통장', to: 'KB기업 사업통장' });
    expect(find('○○은행잔고이체').origin).toBeUndefined(); // 원본 수입 합계 대조에 들어가지 않는다
  });

  it('사업 거래는 매출·사업비로, 학교 이름을 뽑아낸다', () => {
    expect(find('가나교구')).toMatchObject({ type: '사업매출', category: '학교납품', project: '한빛초', vatSplit: true });
    expect(find('다라디자인')).toMatchObject({ category: '설치비' });
    expect(find('가나사무가구_한빛초')).toMatchObject({ type: '사업비', category: '상품매입', vendor: '가나사무가구', project: '한빛초' });
    expect(find('주유비')).toMatchObject({ type: '사업비', category: '차량유지비', from: '카드(기타)' });
  });

  it('급여 이체는 공과금이 아니라 가계이체', () => {
    expect(find('급여')).toMatchObject({ type: '가계이체', category: '정기가계이체' });
    expect(find('주민세')).toMatchObject({ type: '세금', category: '주민세' });
  });

  it('노란우산공제는 네이버에서 어느 분류에 있든 비용이 아니라 공제부금납입(이체)', () => {
    expect(find('노란우산공제보험')).toMatchObject({ type: '자금이동', category: '공제부금납입', from: 'KB기업 사업통장', to: '연금·공제' });
  });

  it('보험금·이자·환급·적금만기는 매출이 아니다', () => {
    expect(find('실손보험금')).toMatchObject({ type: '기타', category: '보험보상금' });
    expect(find('예금이자')).toMatchObject({ type: '기타', category: '금융수입' });
    expect(find('종합소득세환급')).toMatchObject({ category: '세금환급' });
    expect(find('적금만기')).toMatchObject({ type: '자금이동', category: '적금만기원금' });
  });

  it('태그에서 결제수단을 찾고, 결제수단 태그는 지운다', () => {
    const noodles = b.rows.filter((r) => r.description === '○○국수');
    expect(noodles.map((r) => r.from)).toEqual(['동백전', '동백전']);
    expect(noodles[0].tags).toEqual([]);
    expect(find('편의점').from).toBe('부산은행 체크카드');
    expect(find('병원').from).toBe('KB페이');
    expect(find('옷가게').from).toBe('우리카드');
  });

  it("'지갑속현금' 중 투자·저축 이체는 현금이 아니다", () => {
    expect(find('○○CMA이체')).toMatchObject({ category: '투자계좌이체', to: '투자계좌' });
    expect(find('○○뱅크셰이브박스이체')).toMatchObject({ to: '예금·적금' });
    expect(find('ATM출금')).toMatchObject({ category: '현금인출', to: '현금(지갑)' });
  });

  it('모든 분류는 기본 목록에 있다', () => {
    const cats = new Set(SEED_CATEGORIES.map((c) => `${c.type}|${c.name}`));
    for (const r of b.rows) expect(cats.has(`${r.type}|${r.category}`), `${r.type}|${r.category}`).toBe(true);
    const accs = new Set([...SEED_ACCOUNTS.map((a) => a.name), '○○은행 통장']);
    for (const r of b.rows) for (const a of [r.from, r.to]) if (a) expect(accs.has(a), a).toBe(true);
  });

  it('같은 날 같은 내용·금액이 두 번 있어도 sourceKey 는 유일하다 (재가져오기 중복 방지)', () => {
    expect(new Set(b.rows.map((r) => r.sourceKey)).size).toBe(b.rows.length);
  });
});

describe('네이버 가계부 엑셀(.xls) 내보내기', () => {
  it('CSV 와 같은 칸 구성의 엑셀 시트를 알아보고 똑같이 변환한다', async () => {
    const XLSX = await import('xlsx');
    const { parseCsv } = await import('@/lib/import/csv');
    const { parseFiles } = await import('@/server/importer');
    const rows = parseCsv(read('naver_expense.csv'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer;
    const { bundle, recognized } = parseFiles([{ name: '네이버가계부_지출현황.xls'.normalize('NFD'), data: buf }]);
    expect(recognized).toHaveLength(1);
    const fromCsv = convertNaverCsv(read('naver_expense.csv'));
    expect(bundle.rows.map((r) => [r.sourceKey, r.type, r.category, r.from])).toEqual(fromCsv.rows.map((r) => [r.sourceKey, r.type, r.category, r.from]));
  });
});
