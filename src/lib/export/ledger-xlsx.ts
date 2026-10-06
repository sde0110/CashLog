/**
 * 세무사 제출용 엑셀 장부.
 *
 * 시트
 *   요약 · 전체내역 · 매출 · 매입·경비 · 세금·공과 · 계정별 월합계 · 분개장 · 합계잔액시산표
 *
 * 원칙
 *   - 날짜는 진짜 날짜 셀, 금액은 숫자 셀(#,##0) — 세무사가 바로 정렬·합계를 낼 수 있게
 *   - 합계 행은 SUM 수식(계산된 값 포함) — 행을 지우거나 고쳐도 다시 맞는다
 *   - 첫 줄 고정 · 자동 필터 · 인쇄 시 머리글 반복 · 가로 한 쪽 맞춤
 *   - 자금이동(계좌 간 이동·예적금·투자)은 손익에서 빠진다는 것을 요약에 적어 둔다
 */
import ExcelJS from 'exceljs';
import { TYPES } from '../domain';
import { journal, trialBalance, type TitleLookup } from '../journal';
import { summarize, type TxView } from '../ledger';

export interface LedgerExportInput {
  txs: TxView[];
  from: string;
  to: string;
  settings: Record<string, string>;
  accounts: { id: number; name: string; kind: string }[];
  vendors: { id: number; name: string; bizNo: string }[];
  titles: TitleLookup;
  generatedAt?: Date;
}

const FONT = '맑은 고딕';
const WON = '#,##0;[Red]-#,##0';
const BRAND = 'FF00A04A';
const HEAD_FILL = 'FFE8F6EE';
const SUM_FILL = 'FFF3F5F7';
const thin = { style: 'thin' as const, color: { argb: 'FFD5DAE0' } };

const flowLabel = { IN: '수입', OUT: '지출', NEUTRAL: '이체' } as const;
const typeLabel = (t: TxView) => (t.type === TYPES.HOUSEHOLD ? '가계이체(생활비)' : t.type === TYPES.ETC ? (t.flow === 'IN' ? '기타수입' : '기타지출') : t.type);

/** 'yyyy-mm-dd' → 엑셀 날짜 (시간대 영향 없이) */
const xDate = (s: string | null | undefined) => (s ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))) : null);

interface Col { header: string; key: string; width: number; money?: boolean; date?: boolean; sum?: boolean; wrap?: boolean }

/** 표 하나를 시트에 깔끔하게 쓴다 (머리글 · 서식 · 합계 · 필터 · 고정 · 인쇄) */
function writeTable(ws: ExcelJS.Worksheet, startRow: number, cols: Col[], rows: Record<string, unknown>[], opts: { sumLabel?: string; filter?: boolean } = {}) {
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, c.width); });

  const head = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: thin, bottom: { style: 'medium', color: { argb: BRAND } }, left: thin, right: thin };
  });
  head.height = 22;

  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = r[c.key];
      cell.value = c.date ? xDate(v as string) : (v as ExcelJS.CellValue) ?? null;
      cell.font = { name: FONT, size: 10 };
      cell.border = { bottom: thin, left: thin, right: thin };
      if (c.money) cell.numFmt = WON;
      if (c.date) { cell.numFmt = 'yyyy-mm-dd'; cell.alignment = { horizontal: 'center' }; }
      if (c.wrap) cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });

  const last = startRow + rows.length;
  if (opts.sumLabel) {
    const row = ws.getRow(last + 1);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const col = ws.getColumn(i + 1).letter;
      if (!c.sum && i === 0) cell.value = opts.sumLabel;
      else if (c.sum) {
        const total = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        cell.value = rows.length ? { formula: `SUBTOTAL(9,${col}${startRow + 1}:${col}${last})`, result: total } : 0;
        cell.numFmt = WON;
      }
      cell.font = { name: FONT, bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUM_FILL } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF8A919C' } }, bottom: { style: 'double', color: { argb: 'FF8A919C' } } };
    });
  }
  if (opts.filter !== false && rows.length) {
    ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: last, column: cols.length } };
  }
  return last + (opts.sumLabel ? 1 : 0);
}

function setupSheet(ws: ExcelJS.Worksheet, headerRow: number, landscape = true) {
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: `&L&"${FONT}"&8${ws.name}&R&"${FONT}"&8&P / &N` };
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, bold: true, size: 14 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } };
}

export async function buildLedgerWorkbook(input: LedgerExportInput): Promise<ArrayBuffer> {
  const { from, to, settings, titles } = input;
  const txs = [...input.txs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const accKind = new Map(input.accounts.map((a) => [a.id, a.kind]));
  const bizNo = new Map(input.vendors.map((v) => [v.id, v.bizNo]));
  const biz = settings.business_name || '';
  const period = `${from} ~ ${to}`;
  const now = input.generatedAt ?? new Date();
  const stamp = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const sub = `${biz ? `${biz} · ` : ''}기간 ${period} · 작성 ${stamp} · 캐시로그`;

  const wb = new ExcelJS.Workbook();
  wb.creator = '캐시로그';
  wb.created = now;
  wb.title = `${biz || '캐시로그'} 장부 ${period}`;

  /* ── 요약 ─────────────────────────────────────────── */
  const s = summarize(txs);
  const ws0 = wb.addWorksheet('요약', { properties: { tabColor: { argb: BRAND } } });
  titleBlock(ws0, `${biz || '사업자'} 장부 요약`, sub, 8);
  const info: [string, string][] = [
    ['상호', biz], ['대표자', settings.owner_name || ''], ['사업자등록번호', settings.biz_no || ''],
    ['기간', period], ['거래 건수', `${txs.length.toLocaleString('ko-KR')}건`],
  ];
  info.forEach(([k, v], i) => {
    const r = ws0.getRow(4 + i);
    r.getCell(1).value = k; r.getCell(1).font = { name: FONT, bold: true, size: 10 };
    r.getCell(2).value = v; r.getCell(2).font = { name: FONT, size: 10 };
  });
  ws0.getColumn(1).width = 22;
  ws0.getColumn(2).width = 18;

  let r0 = 10;
  ws0.getCell(r0, 1).value = '■ 기간 합계';
  ws0.getCell(r0, 1).font = { name: FONT, bold: true, size: 11 };
  r0 = writeTable(ws0, r0 + 1, [
    { header: '항목', key: 'k', width: 22 }, { header: '금액', key: 'v', width: 18, money: true }, { header: '설명', key: 'd', width: 16 },
  ], [
    { k: '사업매출', v: s.sales, d: '공급가액 + 부가세' },
    { k: '기타수입', v: s.otherIncome, d: '이자 · 보험보상금 · 세금환급 등 (매출 아님)' },
    { k: '사업비', v: s.expense, d: '부가세 포함 금액' },
    { k: '세금', v: s.tax, d: '부가세 · 소득세 · 지방세 · 과태료 등' },
    { k: '기타지출', v: s.otherExpense, d: '' },
    { k: '가계이체(생활비)', v: s.household, d: '사업주 개인 · 가정 용도 — 사업비 아님(인출금)' },
    { k: '순현금흐름', v: s.netCashFlow, d: '수입 − 사업비 − 세금 − 기타지출 − 가계이체' },
    { k: '자금이동(제외)', v: s.transfer, d: '계좌 간 이동 · 예적금 · 투자 · 카드대금 — 수입·지출에서 제외' },
  ], { filter: false });

  for (let i = 12; i <= r0; i++) {
    const c = ws0.getCell(i, 3);
    c.border = {};
    c.font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } };
  }
  ws0.getCell(11, 3).value = '';
  ws0.getCell(11, 3).fill = { type: 'pattern', pattern: 'none' };
  ws0.getCell(11, 3).border = {};

  r0 += 2;
  ws0.getCell(r0, 1).value = '■ 부가가치세 집계 (참고용)';
  ws0.getCell(r0, 1).font = { name: FONT, bold: true, size: 11 };
  const sales = txs.filter((t) => t.type === TYPES.SALES);
  const purch = txs.filter((t) => t.type === TYPES.EXPENSE);
  const sum = (a: TxView[], k: 'supplyAmount' | 'vat' | 'amount') => a.reduce((x, t) => x + t[k], 0);
  r0 = writeTable(ws0, r0 + 1, [
    { header: '구분', key: 'k', width: 22 }, { header: '공급가액', key: 's', width: 18, money: true },
    { header: '세액', key: 'v', width: 16, money: true }, { header: '합계', key: 't', width: 18, money: true }, { header: '건수', key: 'n', width: 10 },
  ], [
    { k: '매출', s: sum(sales, 'supplyAmount'), v: sum(sales, 'vat'), t: sum(sales, 'amount'), n: sales.length },
    { k: '매입 · 경비 (사업비)', s: sum(purch, 'supplyAmount'), v: sum(purch, 'vat'), t: sum(purch, 'amount'), n: purch.length },
    { k: '차감 (매출세액 − 매입세액)', s: null, v: s.vatEstimate, t: null, n: null },
  ], { filter: false });

  r0 += 2;
  ws0.getCell(r0, 1).value = '■ 월별';
  ws0.getCell(r0, 1).font = { name: FONT, bold: true, size: 11 };
  const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))].sort();
  writeTable(ws0, r0 + 1, [
    { header: '월', key: 'ym', width: 22 }, { header: '사업매출', key: 'sales', width: 18, money: true, sum: true },
    { header: '기타수입', key: 'oi', width: 16, money: true, sum: true }, { header: '사업비', key: 'ex', width: 18, money: true, sum: true },
    { header: '세금', key: 'tax', width: 14, money: true, sum: true }, { header: '가계이체', key: 'hh', width: 16, money: true, sum: true },
    { header: '순현금흐름', key: 'net', width: 16, money: true, sum: true }, { header: '자금이동(제외)', key: 'tr', width: 16, money: true, sum: true },
  ], months.map((ym) => {
    const m = summarize(txs.filter((t) => t.date.startsWith(ym)));
    return { ym: `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`, sales: m.sales, oi: m.otherIncome, ex: m.expense, tax: m.tax, hh: m.household, net: m.netCashFlow, tr: m.transfer };
  }), { sumLabel: '합계', filter: false });
  ws0.getRow(r0 + months.length + 4).getCell(1).value =
    '※ 분류와 결제수단으로 자동 집계한 내부 관리 장부입니다. 세무상 계정 처리와 공제 여부는 세무대리인이 판단합니다.';
  ws0.getRow(r0 + months.length + 4).getCell(1).font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } };
  ws0.views = [{ showGridLines: false }];
  ws0.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  /* ── 전체내역 ─────────────────────────────────────── */
  const wsAll = wb.addWorksheet('전체내역');
  titleBlock(wsAll, '전체 거래 내역', sub, 12);
  writeTable(wsAll, 4, [
    { header: '일자', key: 'date', width: 12, date: true },
    { header: '구분', key: 'flow', width: 7 },
    { header: '대분류', key: 'type', width: 15 },
    { header: '세부분류', key: 'cat', width: 14 },
    { header: '계정과목', key: 'title', width: 12 },
    { header: '내용', key: 'desc', width: 26, wrap: true },
    { header: '거래처 · 사용처', key: 'vendor', width: 18 },
    { header: '학교/프로젝트', key: 'project', width: 13 },
    { header: '공급가액', key: 'supply', width: 13, money: true, sum: true },
    { header: '부가세', key: 'vat', width: 11, money: true, sum: true },
    { header: '합계', key: 'amount', width: 13, money: true, sum: true },
    { header: '출금 · 결제수단', key: 'from', width: 16 },
    { header: '입금 계좌', key: 'to', width: 16 },
    { header: '입금상태', key: 'paid', width: 9 },
    { header: '세금계산서', key: 'inv', width: 9 },
    { header: '메모', key: 'memo', width: 24, wrap: true },
    { header: '태그', key: 'tags', width: 16 },
  ], txs.map((t) => ({
    date: t.date, flow: flowLabel[t.flow], type: typeLabel(t), cat: t.category,
    title: t.flow === 'NEUTRAL' ? '' : titles.category(t.categoryId, t.type),
    desc: t.description, vendor: t.vendorName, project: t.projectName,
    supply: t.supplyAmount, vat: t.vat, amount: t.amount,
    from: t.fromName, to: t.toName,
    paid: t.type === TYPES.SALES ? t.paymentStatus : '', inv: t.invoiceStatus === '해당없음' ? '' : t.invoiceStatus,
    memo: t.memo, tags: t.tags.join(', '),
  })), { sumLabel: '합계 (필터 적용 시 보이는 행만 합산)' });
  setupSheet(wsAll, 4);

  /* ── 매출 ─────────────────────────────────────────── */
  const wsS = wb.addWorksheet('매출');
  titleBlock(wsS, '매출 명세 (사업매출)', sub, 10);
  writeTable(wsS, 4, [
    { header: '일자', key: 'date', width: 12, date: true },
    { header: '거래처', key: 'vendor', width: 20 },
    { header: '사업자번호', key: 'biz', width: 14 },
    { header: '학교/프로젝트', key: 'project', width: 14 },
    { header: '품목', key: 'cat', width: 12 },
    { header: '내용', key: 'desc', width: 26, wrap: true },
    { header: '공급가액', key: 'supply', width: 14, money: true, sum: true },
    { header: '부가세', key: 'vat', width: 12, money: true, sum: true },
    { header: '합계', key: 'amount', width: 14, money: true, sum: true },
    { header: '세금계산서', key: 'inv', width: 10 },
    { header: '입금상태', key: 'paid', width: 9 },
    { header: '입금일', key: 'pdate', width: 12, date: true },
    { header: '입금 계좌', key: 'to', width: 16 },
  ], sales.map((t) => ({
    date: t.date, vendor: t.vendorName, biz: t.vendorId ? bizNo.get(t.vendorId) ?? '' : '', project: t.projectName,
    cat: t.category, desc: t.description, supply: t.supplyAmount, vat: t.vat, amount: t.amount,
    inv: t.invoiceStatus, paid: t.paymentStatus, pdate: t.paymentDate, to: t.toName,
  })), { sumLabel: '합계' });
  setupSheet(wsS, 4);

  /* ── 매입·경비 ────────────────────────────────────── */
  const wsP = wb.addWorksheet('매입·경비');
  titleBlock(wsP, '매입 · 경비 명세 (사업비)', sub, 10);
  writeTable(wsP, 4, [
    { header: '일자', key: 'date', width: 12, date: true },
    { header: '거래처', key: 'vendor', width: 20 },
    { header: '사업자번호', key: 'biz', width: 14 },
    { header: '세부분류', key: 'cat', width: 13 },
    { header: '계정과목', key: 'title', width: 12 },
    { header: '내용', key: 'desc', width: 26, wrap: true },
    { header: '학교/프로젝트', key: 'project', width: 13 },
    { header: '공급가액', key: 'supply', width: 14, money: true, sum: true },
    { header: '부가세', key: 'vat', width: 12, money: true, sum: true },
    { header: '합계', key: 'amount', width: 14, money: true, sum: true },
    { header: '결제수단', key: 'from', width: 16 },
    { header: '결제수단 종류', key: 'kind', width: 11 },
    { header: '세금계산서', key: 'inv', width: 10 },
  ], purch.map((t) => ({
    date: t.date, vendor: t.vendorName, biz: t.vendorId ? bizNo.get(t.vendorId) ?? '' : '',
    cat: t.category, title: titles.category(t.categoryId, t.type), desc: t.description, project: t.projectName,
    supply: t.supplyAmount, vat: t.vat, amount: t.amount, from: t.fromName,
    kind: t.fromAccountId ? accKind.get(t.fromAccountId) ?? '' : '', inv: t.invoiceStatus === '해당없음' ? '' : t.invoiceStatus,
  })), { sumLabel: '합계' });
  setupSheet(wsP, 4);

  /* ── 세금·공과 ────────────────────────────────────── */
  const taxes = txs.filter((t) => t.type === TYPES.TAX);
  const wsT = wb.addWorksheet('세금·공과');
  titleBlock(wsT, '세금 · 공과 납부 내역', sub, 6);
  writeTable(wsT, 4, [
    { header: '일자', key: 'date', width: 12, date: true },
    { header: '세목', key: 'cat', width: 16 },
    { header: '계정과목', key: 'title', width: 14 },
    { header: '내용', key: 'desc', width: 30, wrap: true },
    { header: '금액', key: 'amount', width: 14, money: true, sum: true },
    { header: '납부 계좌 · 수단', key: 'from', width: 18 },
  ], taxes.map((t) => ({ date: t.date, cat: t.category, title: titles.category(t.categoryId, t.type), desc: t.description, amount: t.amount, from: t.fromName })),
  { sumLabel: '합계' });
  setupSheet(wsT, 4, false);

  /* ── 계정별 월합계 ────────────────────────────────── */
  // 손익·인출 계정만 (자금이동 제외). 금액은 분개 기준 — 부가세는 부가세 계정으로 따로 잡힌다
  const pivot = new Map<string, { side: string; title: string; m: Record<string, number> }>();
  const sideOf = (t: TxView) => (t.flow === 'IN' ? '수익' : t.type === TYPES.HOUSEHOLD ? '인출' : '비용');
  for (const t of txs) {
    if (t.flow === 'NEUTRAL') continue;
    const title = titles.category(t.categoryId, t.type);
    const key = `${sideOf(t)}|${title}`;
    const p = pivot.get(key) ?? { side: sideOf(t), title, m: {} };
    const ym = t.date.slice(0, 7);
    p.m[ym] = (p.m[ym] ?? 0) + (t.supplyAmount || t.amount);
    pivot.set(key, p);
  }
  const order = { 수익: 0, 비용: 1, 인출: 2 } as Record<string, number>;
  const pivotRows = [...pivot.values()].sort((a, b) => order[a.side] - order[b.side] || a.title.localeCompare(b.title, 'ko'));
  const wsM = wb.addWorksheet('계정별 월합계');
  titleBlock(wsM, '계정과목별 월 합계 (공급가액 기준, 자금이동 제외)', sub, Math.min(months.length + 3, 16));
  writeTable(wsM, 4, [
    { header: '구분', key: 'side', width: 7 },
    { header: '계정과목', key: 'title', width: 14 },
    ...months.map((ym) => ({ header: `${Number(ym.slice(5))}월${months.length > 12 || ym.slice(0, 4) !== months[0].slice(0, 4) ? `\n${ym.slice(2, 4)}년` : ''}`, key: ym, width: 12, money: true, sum: true })),
    { header: '합계', key: 'total', width: 14, money: true, sum: true },
  ], pivotRows.map((p) => ({ side: p.side, title: p.title, ...p.m, total: Object.values(p.m).reduce((a, b) => a + b, 0) })), { sumLabel: '합계 (수익·비용·인출 섞임 — 필터로 구분해 보세요)' });
  setupSheet(wsM, 4);

  /* ── 분개장 ───────────────────────────────────────── */
  const j = journal(txs, titles);
  const wsJ = wb.addWorksheet('분개장');
  titleBlock(wsJ, '분개장', `${sub} · 차변 합계 ${j.totalDebit.toLocaleString('ko-KR')} = 대변 합계 ${j.totalCredit.toLocaleString('ko-KR')}${j.balanced ? ' (일치)' : ' (불일치)'}`, 7);
  const jRows: Record<string, unknown>[] = [];
  j.entries.forEach((e, n) => e.lines.forEach((l, i) => jRows.push({
    no: i === 0 ? n + 1 : null, date: i === 0 ? e.tx.date : null, summary: i === 0 ? (e.tx.description || e.tx.vendorName || e.tx.category) : '',
    side: l.debit ? '차변' : '대변', account: l.account, debit: l.debit || null, credit: l.credit || null,
  })));
  writeTable(wsJ, 4, [
    { header: '번호', key: 'no', width: 7 },
    { header: '일자', key: 'date', width: 12, date: true },
    { header: '적요', key: 'summary', width: 30 },
    { header: '차/대', key: 'side', width: 7 },
    { header: '계정과목', key: 'account', width: 14 },
    { header: '차변', key: 'debit', width: 15, money: true, sum: true },
    { header: '대변', key: 'credit', width: 15, money: true, sum: true },
  ], jRows, { sumLabel: '합계', filter: false });
  setupSheet(wsJ, 4, false);

  /* ── 합계잔액시산표 ───────────────────────────────── */
  const tb = trialBalance(txs, titles);
  const wsB = wb.addWorksheet('합계잔액시산표');
  titleBlock(wsB, '합계잔액시산표', sub, 5);
  writeTable(wsB, 4, [
    { header: '차변 잔액', key: 'db', width: 16, money: true, sum: true },
    { header: '차변 합계', key: 'd', width: 16, money: true, sum: true },
    { header: '계정과목', key: 'account', width: 16 },
    { header: '대변 합계', key: 'c', width: 16, money: true, sum: true },
    { header: '대변 잔액', key: 'cb', width: 16, money: true, sum: true },
  ], tb.rows.map((r) => ({ db: r.debitBalance || null, d: r.debit, account: r.account, c: r.credit, cb: r.creditBalance || null })),
  { sumLabel: '', filter: false });
  wsB.getColumn(3).alignment = { horizontal: 'center' };
  setupSheet(wsB, 4, false);

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
