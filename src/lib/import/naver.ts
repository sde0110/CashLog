/**
 * 네이버 가계부 CSV(수입현황 / 지출현황) → 캐시로그 거래.
 *
 * 분류 원칙 (구 tools/convert_history.js 와 같음)
 *   거래처 매입·주유·업무 지출 → 사업비 / 조세 → 세금 /
 *   사업주 개인 사용분 → 가계이체 / 계좌 간 이동 → 자금이동
 *
 * 전월이월(통장잔고·잔고이체)은 수입이 아니다 (사용자 피드백 4).
 *   '통장잔고'          → 사업통장 기초잔액
 *   '○○은행잔고이체'    → 그 은행 통장 기초잔액 + 사업통장으로 자금이동
 */
import { MAIN_ACCOUNT } from '../domain';
import { parseCsv } from './csv';
import type { ImportBundle, ImportRow } from './types';

const num = (v: unknown) => Number(String(v ?? '').replace(/[^0-9-]/g, '')) || 0;
const isNaverDate = (v: unknown) => /^\d{4}년\d{2}월\d{2}일$/.test(String(v ?? '').trim());
const toDate = (v: string) => {
  const m = v.match(/(\d{4})년(\d{2})월(\d{2})일/)!;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const has = (s: unknown, ...keys: string[]) => keys.some((k) => String(s ?? '').includes(k));

/* ── 결제수단 추정 (사용자 피드백 1) ───────────────────
   네이버 가계부는 결제수단을 태그로 적어 두었다. 태그에서 찾고, 못 찾으면
   카드 칸에 금액이 있으면 '카드(기타)', 아니면 사업통장으로 본다. */

const PAYMENT_TAGS: [RegExp, string][] = [
  [/^동백/, '동백전'],
  [/^오륙도/, '오륙도'],
  [/^부산체크/, '부산은행 체크카드'],
  [/^(kbpay|kb페이|kb pay)$/i, 'KB페이'],
  [/^스마일페이$/, '스마일페이'],
  [/^(네이버페이|npay|n페이)$/i, '네이버페이'],
  [/^카카오페이$/, '카카오페이'],
  [/^kb기업카드$/i, 'KB기업카드'],
  [/^(국민카드|kb카드|kb국민카드)$/i, 'KB국민카드'],
  [/^(우리카드|우카)$/, '우리카드'],
  [/^(개인통장|kb개인통장)$/i, 'KB개인통장'],
  [/^(부가세통장|국민부가세통장)$/, '부가세통장'],
  [/^(kb기업통장|사업통장)$/i, MAIN_ACCOUNT],
];

function splitTags(raw: string): string[] {
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 태그에서 결제수단을 찾고, 결제수단 태그는 일반 태그에서 뺀다 */
export function detectPayment(tags: string[]): { account: string | null; rest: string[] } {
  let account: string | null = null;
  const rest: string[] = [];
  for (const t of tags) {
    const hit = PAYMENT_TAGS.find(([re]) => re.test(t));
    if (hit && !account) account = hit[1];
    else if (!hit) rest.push(t);
  }
  return { account, rest };
}

/* ── 학교명 추출 ───────────────────────────────────── */

const SCHOOL_RE = /([가-힣]{2,6}(?:초등학교|중학교|고등학교|여중|여고|유치원|초|중|고))$/;
const normalizeSchool = (n: string) => n.replace(/초등학교$/, '초').replace(/중학교$/, '중').replace(/고등학교$/, '고');

export function findProject(...sources: string[]): string {
  for (const src of sources) {
    for (const raw of String(src ?? '').split(/[,\s_]+/)) {
      const t = raw.trim();
      if (t.length < 2) continue;
      const m = t.match(SCHOOL_RE);
      if (m) return normalizeSchool(m[1]);
    }
  }
  return '';
}

/* ── 가계이체 세부분류 ─────────────────────────────── */

const HOUSEHOLD_SUB: Record<string, string> = {
  식비: '식비', '주거/통신': '주거/공과금', '의복/미용': '의복/미용', '교통/차량': '교통/차량',
  '경조사/회비': '경조사', 생활용품: '생활용품', '교육/육아': '교육', '용돈/기타': '기타가계', 미분류: '기타가계',
};

function householdSub(cat: string): string {
  const [big, small] = cat.split('>');
  if (big === '건강/문화') {
    if (small === '병원비') return '의료/건강';
    if (small === '보장성보험') return '보험료';
    return '문화/여가';
  }
  if (big === '용돈/기타' && small === '용돈') return '용돈';
  return HOUSEHOLD_SUB[big] ?? '기타가계';
}

type Cls = Pick<ImportRow, 'type' | 'category'> & { from?: string; to?: string; vat?: boolean; vendor?: string; project?: string };

/* ── 수입 1행 ──────────────────────────────────────── */

function classifyIncome(name: string, cat: string, tags: string): Cls {
  const [big, small] = cat.split('>');
  const BIZ = MAIN_ACCOUNT;

  if (has(tags, '자금이동') || big === '저축/보험') {
    if (has(name, '보험금', '보상금', '화재') || has(tags, '보험보상금')) return { type: '기타', category: '보험보상금', to: BIZ };
    if (has(name, '국민연금', '공적연금')) return { type: '자금이동', category: '공제부금납입', from: BIZ, to: '연금·공제' };
    if (has(name, '보증금')) return { type: '자금이동', category: '보증금회수', from: '보증금', to: BIZ };
    if (has(name, '대여금')) return { type: '자금이동', category: '대여금회수', from: '대여금', to: BIZ };
    if (has(name, '펀드')) return { type: '자금이동', category: '펀드원금회수', from: '투자계좌', to: BIZ };
    if (has(name, '적금')) return { type: '자금이동', category: '적금만기원금', from: '예금·적금', to: BIZ };
    if (has(name, '예금', '청약')) return { type: '자금이동', category: '예금만기원금', from: '예금·적금', to: BIZ };
    if (big === '저축/보험' && small === '기타') return { type: '기타', category: '기타수입', to: BIZ };
    return { type: '자금이동', category: '계좌간이동', from: '예금·적금', to: BIZ };
  }

  if (cat === '주수입>사업소득') {
    const category = has(name + tags, '설치비') ? '설치비' : has(name + tags, '용역') ? '용역비' : '학교납품';
    const vendor = name.replace(/설치비.*$/, '').trim() || name;
    return { type: '사업매출', category, vat: true, to: BIZ, vendor, project: findProject(tags, name) };
  }
  if (small === '이자/배당금') return { type: '기타', category: '금융수입', to: BIZ };
  if (has(name, '환급', '국고')) return { type: '기타', category: '세금환급', to: BIZ };
  if (has(name, '환전')) return { type: '자금이동', category: '계좌간이동', from: '투자계좌', to: BIZ };
  if (has(name, '보증금')) return { type: '자금이동', category: '보증금회수', from: '보증금', to: BIZ };
  if (has(name, '대여금')) return { type: '자금이동', category: '대여금회수', from: '대여금', to: BIZ };
  return { type: '기타', category: '기타수입', to: BIZ };
}

/* ── 지출 1행 ──────────────────────────────────────── */

function classifyExpense(name: string, cat: string, tags: string, acc: string): Cls {
  const [big] = cat.split('>');
  const BIZ = MAIN_ACCOUNT;
  // 카드로는 계좌 이동을 할 수 없으므로, 자금이동의 출금은 통장으로 본다
  const bank = /카드|페이|동백|오륙도/.test(acc) ? BIZ : acc;

  // 노란우산공제 · 국민연금 납입은 비용이 아니라 적립(자금이동) — 네이버에서 어느 분류에 있든
  if (has(name, '노란우산')) return { type: '자금이동', category: '공제부금납입', from: bank, to: '연금·공제' };

  if (has(tags, '자금이동') || big === '이체/대체' || big === '저축/보험') {
    if (has(name, '노란우산', '국민연금')) return { type: '자금이동', category: '공제부금납입', from: bank, to: '연금·공제' };
    if (has(name, '주식', 'ETF', 'CMA', '코인', '빗썸', '업비트', '펀드', '투신')) return { type: '자금이동', category: '투자계좌이체', from: bank, to: '투자계좌' };
    if (has(name, '보증금')) return { type: '자금이동', category: '보증금지급', from: bank, to: '보증금' };
    if (has(name, '대여')) return { type: '자금이동', category: '대여금지급', from: bank, to: '대여금' };
    if (has(name, '적금', '청약', '출자금')) return { type: '자금이동', category: '적금납입', from: bank, to: '예금·적금' };
    if (has(name, '예금')) return { type: '자금이동', category: '예금가입', from: bank, to: '예금·적금' };
    if (has(name, '부가세')) return { type: '자금이동', category: '부가세통장이체', from: bank, to: '부가세통장' };
    if (has(name, '셰이브박스', '세이프박스', '파킹')) return { type: '자금이동', category: '계좌간이동', from: bank, to: '예금·적금' };
    // 네이버의 '지갑속현금'은 실제 현금 인출일 때만 현금으로 본다 (투자·저축 이체가 섞여 있었다)
    if (cat === '이체/대체>지갑속현금') return { type: '자금이동', category: '현금인출', from: bank, to: '현금(지갑)' };
    return { type: '자금이동', category: '계좌간이동', from: bank, to: '예금·적금' };
  }

  if (cat === '세금/이자>거래처') {
    const category = has(name, '세무사') ? '세무사수수료'
      : has(name, '설치비', '철거', '제작') ? '외주/설치비'
      : has(name, '택배', '운송') ? '운반/택배' : '상품매입';
    const vendor = name.split('_')[0].replace(/(가구설치비|설치비|철거비|운송비).*$/, '').trim() || name;
    return { type: '사업비', category, vat: true, from: acc, vendor, project: findProject(tags, name) };
  }

  if (cat === '세금/이자>세금') {
    if (has(name, '과태료', '위반', '범칙')) return { type: '세금', category: '과태료/범칙금', from: acc };
    if (has(name, '수수료', '인증서')) return { type: '사업비', category: '지급수수료', vat: true, from: acc, vendor: name };
    if (has(name, '부가가치세', '부가세')) return { type: '세금', category: '부가가치세', from: acc };
    if (has(name, '종합소득세')) return { type: '세금', category: '종합소득세', from: acc };
    if (has(name, '지방소득세')) return { type: '세금', category: '지방소득세', from: acc };
    if (has(name, '자동차세')) return { type: '세금', category: '자동차세', from: acc };
    if (has(name, '주민세')) return { type: '세금', category: '주민세', from: acc };
    return { type: '세금', category: '기타세금', from: acc };
  }

  if (cat === '세금/이자>기타') {
    if (has(name, '인증서')) return { type: '사업비', category: '지급수수료', vat: true, from: acc, vendor: name };
    if (has(name, '자동차보험')) return { type: '사업비', category: '보험', from: acc, vendor: name };
    return { type: '사업비', category: '기타사업비', from: acc, vendor: name };
  }

  // 주유는 사업용 차량으로 본다
  if (cat === '교통/차량>주유비') return { type: '사업비', category: '차량유지비', vat: true, from: acc, vendor: '' };

  // 사업통장에서 집으로 보내는 정기 이체 (은행 적요 "급여")
  if (has(name, '급여') && big === '주거/통신') return { type: '가계이체', category: '정기가계이체', from: BIZ };

  return { type: '가계이체', category: householdSub(cat), from: acc };
}

/* ── 파일 하나 변환 ────────────────────────────────── */

export function isNaverCsv(text: string): boolean {
  return /수입 현황|지출 현황/.test(text.slice(0, 300)) || /^날짜,사용처,사용내역|^날짜,내역,금액,입금통장/m.test(text.slice(0, 1000));
}

export function convertNaverCsv(text: string, out: ImportBundle = emptyBundle()): ImportBundle {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  return convertNaverRows(rows, out, /수입 현황/.test(text.slice(0, 300)));
}

/** 네이버 가계부 엑셀(.xls)·CSV 의 한 시트인지 — 머리글 행으로 판단 */
export function isNaverRows(rows: string[][]): boolean {
  const header = rows.slice(0, 15).find((r) => String(r[0]).trim() === '날짜');
  return !!header && ((header[1] === '내역' && header[2] === '금액') || (header[1] === '사용처' && header[2] === '사용내역'));
}

/** 네이버 가계부 내보내기 표(엑셀이든 CSV든 같은 칸 구성) → 거래 */
export function convertNaverRows(rowsIn: unknown[][], out: ImportBundle = emptyBundle(), incomeHint = false): ImportBundle {
  const rows = rowsIn.map((r) => r.map((c) => String(c ?? '')));
  const header = rows.find((r) => r[0].trim() === '날짜');
  const isIncome = header ? header[1] === '내역' : incomeHint;
  const seen = new Map<string, number>();

  for (const r of rows) {
    if (!isNaverDate(r[0])) continue;
    const date = toDate(r[0]);

    if (isIncome) {
      const [, name = '', amountRaw, , cat = '', tagsRaw = ''] = r;
      const amount = num(amountRaw);
      if (cat.startsWith('전월이월')) {
        addOpening(out, date, name.trim(), amount);
        continue;
      }
      if (amount <= 0) { out.stats.skippedZero++; continue; }
      out.stats.csvIncome += amount;
      const tags = splitTags(tagsRaw);
      const { account, rest } = detectPayment(tags);
      const c = classifyIncome(name, cat, tagsRaw);
      if (c.to === MAIN_ACCOUNT && account) c.to = account;
      push(out, seen, { src: 'I', date, amount, name, cls: c, tags: rest, origCat: cat });
    } else {
      const [, , name = '', cashRaw, cardRaw, , , cat = '', tagsRaw = ''] = r;
      const cash = num(cashRaw), card = num(cardRaw);
      const amount = cash + card;
      if (amount <= 0) { out.stats.skippedZero++; continue; }
      out.stats.csvExpense += amount;
      const tags = splitTags(tagsRaw);
      const { account, rest } = detectPayment(tags);
      const acc = account ?? (card > 0 ? '카드(기타)' : MAIN_ACCOUNT);
      const c = classifyExpense(name, cat, tagsRaw, acc);
      push(out, seen, { src: 'E', date, amount, name, cls: c, tags: rest, origCat: cat });
    }
  }
  return out;
}

export function emptyBundle(): ImportBundle {
  return {
    rows: [], openings: [], recurring: [],
    stats: { csvIncome: 0, csvExpense: 0, skippedZero: 0, skippedCarry: 0, skippedOther: 0 },
  };
}

function addOpening(out: ImportBundle, date: string, name: string, amount: number) {
  out.stats.skippedCarry++;
  if (amount <= 0) return;
  // '부산은행잔고이체' → 부산은행 통장의 기초잔액을 사업통장으로 옮긴 것
  const bank = name.match(/^(.+?은행)잔고이체/);
  if (bank) {
    const acc = `${bank[1]} 통장`;
    out.openings.push({ account: acc, amount, date, note: name });
    out.rows.push({
      sourceKey: `naver:open:${date}:${name}:${amount}`,
      date, type: '자금이동', category: '계좌간이동', amount,
      from: acc, to: MAIN_ACCOUNT, description: name, tags: ['전월이월'], vatSplit: false,
    });
    return;
  }
  out.openings.push({ account: MAIN_ACCOUNT, amount, date, note: name });
}

function push(
  out: ImportBundle, seen: Map<string, number>,
  p: { src: 'I' | 'E'; date: string; amount: number; name: string; cls: Cls; tags: string[]; origCat: string },
) {
  const base = `naver:${p.src}:${p.date}:${p.name}:${p.amount}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  const c = p.cls;
  const isBiz = c.type === '사업매출' || c.type === '사업비';
  out.rows.push({
    sourceKey: n > 1 ? `${base}:${n}` : base,
    date: p.date,
    type: c.type,
    category: c.category,
    amount: p.amount,
    from: c.from,
    to: c.to,
    vendor: isBiz ? (c.vendor ?? p.name) || undefined : undefined,
    project: c.project || undefined,
    description: p.name,
    tags: p.tags,
    memo: p.origCat ? `네이버 분류: ${p.origCat}` : '',
    vatSplit: !!c.vat,
    origin: p.src,
  });
}
