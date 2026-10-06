/**
 * 캐시로그 도메인 정의 — 분류 · 결제수단 종류 · 초기 데이터.
 *
 * 설계 철학 (PRD 30)
 *   "돈이 나갔다고 모두 비용이 아니고, 돈이 들어왔다고 모두 수입이 아니다."
 *   모든 거래는 분류(category)가 정한 flow(IN / OUT / NEUTRAL)를 가진다.
 *   NEUTRAL(자금이동)은 어떤 수입·지출 집계에도 들어가지 않는다.
 */

export const TYPES = {
  SALES: '사업매출',
  EXPENSE: '사업비',
  TAX: '세금',
  HOUSEHOLD: '가계이체',
  TRANSFER: '자금이동',
  ETC: '기타',
} as const;
export type TxType = (typeof TYPES)[keyof typeof TYPES];
export const TYPE_ORDER: TxType[] = ['사업매출', '사업비', '세금', '가계이체', '자금이동', '기타'];

export type Flow = 'IN' | 'OUT' | 'NEUTRAL';

/** 입력 화면 상단 탭 — 네이버 가계부의 수입/지출/이체와 같은 구조 */
export type Direction = Flow;
export const DIRECTION_LABEL: Record<Direction, string> = { OUT: '지출', IN: '수입', NEUTRAL: '이체' };

/** 탭별로 보여줄 대분류 묶음. '기타'는 방향에 따라 기타수입/기타지출로 나뉜다. */
export const GROUPS_BY_DIRECTION: Record<Direction, { type: TxType; label: string; hint: string }[]> = {
  OUT: [
    { type: '사업비', label: '사업비', hint: '매입 · 외주 · 수수료 · 차량' },
    { type: '가계이체', label: '생활비 (가계이체)', hint: '사업과 무관한 개인·가정 지출' },
    { type: '세금', label: '세금', hint: '부가세 · 소득세 · 자동차세' },
    { type: '기타', label: '기타지출', hint: '' },
  ],
  IN: [
    { type: '사업매출', label: '사업매출', hint: '납품 · 설치비 · 용역비' },
    { type: '기타', label: '기타수입', hint: '이자 · 보험금 · 세금환급' },
  ],
  NEUTRAL: [{ type: '자금이동', label: '자금이동', hint: '수입·지출이 아닌 돈의 이동' }],
};

export const PAYMENT_STATUS = { PAID: '입금완료', UNPAID: '미입금' } as const;
export const INVOICE_STATUS = ['발행', '미발행', '해당없음'] as const;

/** 사업 거래만 부가세를 나눈다 */
export const hasVat = (type: string) => type === TYPES.SALES || type === TYPES.EXPENSE;

/** 이자를 함께 입력받는 만기 분류 (PRD 11) */
export const MATURITY_CATEGORIES = ['예금만기원금', '적금만기원금', '펀드원금회수'];

/* ── 결제수단 / 계좌 종류 (사용자 피드백 1) ───────────── */

export const ACCOUNT_KINDS = ['통장', '체크카드', '신용카드', '페이', '현금', '저축·투자', '기타자산'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_INFO: Record<AccountKind, { hint: string; title: string; icon: string }> = {
  통장: { hint: '은행 입출금 통장', title: '보통예금', icon: '🏦' },
  체크카드: { hint: '동백전 · 오륙도 · 은행 체크카드', title: '보통예금', icon: '💳' },
  신용카드: { hint: '결제일에 통장에서 빠져나가는 카드', title: '미지급금', icon: '💳' },
  페이: { hint: '네이버페이 · 카카오페이 · KB페이', title: '보통예금', icon: '📱' },
  현금: { hint: '지갑 속 현금', title: '현금', icon: '💵' },
  '저축·투자': { hint: '예금 · 적금 · 주식 · 펀드', title: '정기예적금', icon: '📈' },
  기타자산: { hint: '대여금 · 보증금 · 공제', title: '기타자산', icon: '📦' },
};

/** 결제수단(돈이 실제로 쓰이는 곳). 지출 입력 시 이 종류들을 위에 보여준다. */
export const PAYMENT_KINDS: AccountKind[] = ['체크카드', '신용카드', '페이', '현금', '통장'];

/* ── 분류 시드 ───────────────────────────────────────── */

export interface CategorySeed {
  type: TxType;
  name: string;
  flow: Flow;
  title: string; // 복식기장 계정과목 (사용자는 고르지 않는다 — PRD 16)
  memo?: string;
  icon?: string;
}

const c = (type: TxType, name: string, flow: Flow, title: string, icon = '', memo = ''): CategorySeed =>
  ({ type, name, flow, title, icon, memo });

export const SEED_CATEGORIES: CategorySeed[] = [
  // 사업매출 (IN)
  c('사업매출', '학교납품', 'IN', '상품매출', '🏫'),
  c('사업매출', '설치비', 'IN', '용역매출', '🔧'),
  c('사업매출', '용역비', 'IN', '용역매출', '🧾'),
  c('사업매출', '상품판매', 'IN', '상품매출', '📦'),
  c('사업매출', '기타사업소득', 'IN', '잡이익', '➕'),

  // 사업비 (OUT)
  c('사업비', '상품매입', 'OUT', '상품매입', '📦'),
  c('사업비', '외주/설치비', 'OUT', '외주비', '🔧'),
  c('사업비', '지급수수료', 'OUT', '지급수수료', '🧾'),
  c('사업비', '세무사수수료', 'OUT', '지급수수료', '📋'),
  c('사업비', '운반/택배', 'OUT', '운반비', '🚚'),
  c('사업비', '차량유지비', 'OUT', '차량유지비', '⛽', '주유 · 정비 · 통행료'),
  c('사업비', '소모품비', 'OUT', '소모품비', '🖇️'),
  c('사업비', '업무추진비', 'OUT', '접대비', '🤝', '학교 인사 관련 비용 등'),
  c('사업비', '보험', 'OUT', '보험료', '🛡️'),
  c('사업비', '기타사업비', 'OUT', '잡비', '➕'),

  // 세금 (OUT) — 사업비와 분리 (PRD 8)
  c('세금', '부가가치세', 'OUT', '부가세예수금', '🏛️'),
  c('세금', '종합소득세', 'OUT', '인출금', '🏛️'),
  c('세금', '지방소득세', 'OUT', '인출금', '🏛️'),
  c('세금', '자동차세', 'OUT', '세금과공과', '🚗'),
  c('세금', '주민세', 'OUT', '세금과공과', '🏠'),
  c('세금', '과태료/범칙금', 'OUT', '잡손실', '🚨', '세금과 구분해서 조회'),
  c('세금', '기타세금', 'OUT', '세금과공과', '➕'),

  // 가계이체 = 사업 밖으로 나간 돈. 사업비와 절대 섞지 않는다 (PRD 9)
  c('가계이체', '정기가계이체', 'OUT', '인출금', '🏠', '은행 적요 "급여". 회계처리는 세무사 판단'),
  c('가계이체', '식비', 'OUT', '인출금', '🍚', '외식 · 장보기 · 카페'),
  c('가계이체', '주거/공과금', 'OUT', '인출금', '💡', '관리비 · 가스 · 전기 · 통신'),
  c('가계이체', '의료/건강', 'OUT', '인출금', '🏥'),
  c('가계이체', '보험료', 'OUT', '인출금', '🛡️'),
  c('가계이체', '교통/차량', 'OUT', '인출금', '🚌', '개인 이동 · 주차 · 하이패스'),
  c('가계이체', '의복/미용', 'OUT', '인출금', '👕'),
  c('가계이체', '문화/여가', 'OUT', '인출금', '🎬'),
  c('가계이체', '경조사', 'OUT', '인출금', '💐', '축의금 · 부의금 · 선물'),
  c('가계이체', '생활용품', 'OUT', '인출금', '🧺'),
  c('가계이체', '교육', 'OUT', '인출금', '📚'),
  c('가계이체', '용돈', 'OUT', '인출금', '💰'),
  c('가계이체', '추가가계이체', 'OUT', '인출금', '🏠'),
  c('가계이체', '기타가계', 'OUT', '인출금', '➕'),

  // 자금이동 (NEUTRAL) — 수입/지출 집계 제외 (PRD 10)
  c('자금이동', '계좌간이동', 'NEUTRAL', '', '🔁'),
  c('자금이동', '현금인출', 'NEUTRAL', '', '💵', 'ATM 인출 → 이후 현금 지출은 결제수단 "현금"으로'),
  c('자금이동', '카드대금결제', 'NEUTRAL', '', '💳', '신용카드 사용분은 쓸 때 이미 지출로 잡힘'),
  c('자금이동', '페이·카드충전', 'NEUTRAL', '', '📱', '동백전 · 페이 충전'),
  c('자금이동', '부가세통장이체', 'NEUTRAL', '', '🏛️', '부가세 납부용 적립. 비용 아님'),
  c('자금이동', '예금가입', 'NEUTRAL', '', '🏦'),
  c('자금이동', '예금만기원금', 'NEUTRAL', '', '🏦', '이자는 기타수입 > 금융수입으로 분리'),
  c('자금이동', '적금납입', 'NEUTRAL', '', '🐷'),
  c('자금이동', '적금만기원금', 'NEUTRAL', '', '🐷', '이자는 기타수입 > 금융수입으로 분리'),
  c('자금이동', '투자계좌이체', 'NEUTRAL', '', '📈'),
  c('자금이동', '펀드원금회수', 'NEUTRAL', '', '📈'),
  c('자금이동', '대여금지급', 'NEUTRAL', '단기대여금', '🤲'),
  c('자금이동', '대여금회수', 'NEUTRAL', '단기대여금', '🤲'),
  c('자금이동', '보증금지급', 'NEUTRAL', '보증금', '🔑'),
  c('자금이동', '보증금회수', 'NEUTRAL', '보증금', '🔑'),
  c('자금이동', '공제부금납입', 'NEUTRAL', '기타자산', '☂️', '노란우산공제 · 국민연금 등 적립'),

  // 기타 (PRD 11, 12)
  c('기타', '금융수입', 'IN', '이자수익', '💹', '예금·적금 이자'),
  c('기타', '보험보상금', 'IN', '잡이익', '🛡️', '실손보험금 등. 매출 아님'),
  c('기타', '세금환급', 'IN', '잡이익', '🏛️'),
  c('기타', '기타수입', 'IN', '잡이익', '➕'),
  c('기타', '기타지출', 'OUT', '잡비', '➕'),
];

/* ── 계좌·결제수단 시드 ─────────────────────────────── */

export interface AccountSeed {
  name: string;
  kind: AccountKind;
  institution?: string;
  memo?: string;
}

export const SEED_ACCOUNTS: AccountSeed[] = [
  { name: 'KB기업 사업통장', kind: '통장', institution: 'KB국민은행', memo: '사업 주거래' },
  { name: '부가세통장', kind: '통장', institution: 'KB국민은행', memo: '부가세 적립' },
  { name: 'KB개인통장', kind: '통장', institution: 'KB국민은행', memo: '가계' },
  { name: '부산은행 통장', kind: '통장', institution: '부산은행' },
  { name: '동백전', kind: '체크카드', institution: '부산시' },
  { name: '오륙도', kind: '체크카드' },
  { name: '부산은행 체크카드', kind: '체크카드', institution: '부산은행' },
  { name: 'KB국민카드', kind: '신용카드', institution: 'KB국민카드' },
  { name: 'KB기업카드', kind: '신용카드', institution: 'KB국민카드' },
  { name: '우리카드', kind: '신용카드', institution: '우리카드' },
  { name: '카드(기타)', kind: '신용카드', memo: '카드사를 모르는 과거 카드 결제' },
  { name: '네이버페이', kind: '페이' },
  { name: '카카오페이', kind: '페이' },
  { name: 'KB페이', kind: '페이' },
  { name: '스마일페이', kind: '페이' },
  { name: '현금(지갑)', kind: '현금' },
  { name: '예금·적금', kind: '저축·투자' },
  { name: '투자계좌', kind: '저축·투자', memo: '주식 · 펀드 · CMA' },
  { name: '대여금', kind: '기타자산', memo: '빌려준 돈' },
  { name: '보증금', kind: '기타자산', memo: '임차보증금' },
  { name: '연금·공제', kind: '기타자산', memo: '노란우산공제 · 국민연금' },
];

export const MAIN_ACCOUNT = 'KB기업 사업통장';

export const DEFAULT_SETTINGS: Record<string, string> = {
  business_name: '',
  owner_name: '',
  biz_no: '',
  large_amount_threshold: '3000000',
  vat_rate: '0.1',
  duplicate_check: 'true',
};
