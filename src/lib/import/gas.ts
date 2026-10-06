/**
 * 구 GAS 버전 구글 스프레드시트 → 캐시로그.
 *
 * 구글시트에서 [파일 > 다운로드 > Microsoft Excel(.xlsx)] 로 받은 파일 하나,
 * 또는 TRANSACTIONS 탭만 CSV 로 받은 파일을 읽는다.
 *
 * 건너뛰는 행
 *   - status = DELETED
 *   - 태그 '가계부이관' / '예시데이터' — 네이버 가계부 CSV 에서 온 것이라 CSV 로 다시 가져온다
 */
import { parseWon, parseTags } from '../format';
import { rowsToObjects } from './csv';
import { detectPayment, emptyBundle } from './naver';
import type { ImportBundle } from './types';

type Sheets = Record<string, string[][]>;

const KIND_MAP: Record<string, string> = {
  입출금: '통장', 체크카드: '체크카드', 페이: '페이', 카드: '신용카드', 현금: '현금',
  예적금: '저축·투자', 투자: '저축·투자', 기타: '기타자산',
};
/** 구 시트의 계좌 이름 → 새 기본 계좌 이름 */
const NAME_MAP: Record<string, string> = { 예금계좌: '예금·적금', 신용카드: '카드(기타)' };
const mapName = (n: string) => NAME_MAP[n] ?? n;

const IMPORTED_TAGS = ['가계부이관', '예시데이터'];

export function isGasTransactionsHeader(row: string[] | undefined): boolean {
  return !!row && row.includes('transaction_id') && row.includes('sub_category') && row.includes('total_amount');
}

export function convertGasSheets(sheets: Sheets, out: ImportBundle = emptyBundle()): ImportBundle {
  const find = (name: string) => Object.entries(sheets).find(([k]) => k.trim().toUpperCase() === name)?.[1];
  let txRows = find('TRANSACTIONS');
  if (!txRows) txRows = Object.values(sheets).find((r) => isGasTransactionsHeader(r[0]));

  const accRows = rowsToObjects(find('ACCOUNTS') ?? []);
  const vendorRows = rowsToObjects(find('VENDORS') ?? []);
  const projectRows = rowsToObjects(find('PROJECTS') ?? []);

  const accById = new Map(accRows.map((a) => [a.account_id, mapName(a.name)]));
  const vendorById = new Map(vendorRows.map((v) => [v.vendor_id, v.name]));
  const projectById = new Map(projectRows.map((p) => [p.project_id, p.name]));

  out.accountKinds ??= {};
  for (const a of accRows) {
    // 구 GAS 의 버그로 account_type 칸에 이름이 들어간 시트가 있다 → 아는 값일 때만 쓰고, 아니면 이름으로 추정
    if (a.name && KIND_MAP[a.account_type]) out.accountKinds[mapName(a.name)] = KIND_MAP[a.account_type];
  }

  for (const t of rowsToObjects(txRows ?? [])) {
    if (!t.transaction_id || !t.date) continue;
    const tags = parseTags(t.tags);
    if (t.status === 'DELETED' || tags.some((x) => IMPORTED_TAGS.includes(x))) { out.stats.skippedOther++; continue; }
    const amount = parseWon(t.total_amount);
    if (amount <= 0) { out.stats.skippedZero++; continue; }

    let from = mapName(t.account_from_name || accById.get(t.account_from) || '');
    const to = t.account_to_name || accById.get(t.account_to) || '';
    let description = t.description ?? '';
    // 예전 화면엔 '신용카드' 하나뿐이라 실제 결제수단(동백전·오륙도페이·우리카드)을 내용 칸에 적었다 (피드백 1)
    if (t.flow !== 'IN' && (from === '카드(기타)' || !from)) {
      const parts = description.split(',').map((x) => x.trim()).filter(Boolean);
      const { account, rest } = detectPayment(parts);
      if (account) { from = account; description = rest.join(', '); }
    }
    out.rows.push({
      sourceKey: `gas:${t.transaction_id}`,
      date: t.date.slice(0, 10).replace(/\./g, '-'),
      type: t.type,
      category: t.sub_category,
      flow: t.flow,
      amount,
      supplyAmount: parseWon(t.supply_amount),
      vat: parseWon(t.vat),
      from: from || undefined,
      to: to ? mapName(to) : undefined,
      vendor: t.vendor_name || vendorById.get(t.vendor_id) || undefined,
      project: t.project_name || projectById.get(t.project_id) || undefined,
      description,
      memo: t.memo ?? '',
      tags,
      paymentStatus: t.payment_status === '입금완료' ? '입금완료' : t.payment_status ? '미입금' : undefined,
      paymentDate: t.payment_date || null,
      invoiceStatus: t.invoice_status || undefined,
    });
  }

  for (const r of rowsToObjects(find('RECURRING') ?? [])) {
    if (!r.title || !r.type) continue;
    out.recurring.push({
      title: r.title, type: r.type, category: r.sub_category,
      amount: parseWon(r.total_amount), supplyAmount: parseWon(r.supply_amount), vat: parseWon(r.vat),
      from: accById.get(r.account_from), to: accById.get(r.account_to),
      vendor: vendorById.get(r.vendor_id), project: projectById.get(r.project_id),
      dayOfMonth: Number(r.day_of_month) || 1, description: r.description ?? '', memo: r.memo ?? '',
      tags: parseTags(r.tags), active: String(r.active).toUpperCase() !== 'FALSE',
      lastGeneratedYm: r.last_generated_ym ?? '',
    });
  }
  return out;
}
