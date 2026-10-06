import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '../reports/report-client';

export const metadata: Metadata = { title: '사용설명서' };

/**
 * 사이트 안의 사용설명서.
 * 기능을 추가하거나 바꾸면 이 파일도 같이 고친다 — 맨 위 CHANGES 에 한 줄 추가하고 해당 장을 고칠 것.
 * 화면 예시는 실제 데이터가 아니라 앱의 버튼·칩 모양을 그대로 그린 것이다 (공개 저장소에 개인 데이터를 넣지 않기 위해).
 */
const UPDATED = '2026년 10월 7일';
const CHANGES: { date: string; text: React.ReactNode }[] = [
  { date: '10월 7일', text: <>사용설명서를 사이트 안에서 볼 수 있게 되었습니다 (이 화면).</> },
  { date: '10월 7일', text: <><b>엑셀 장부 받기</b> — 세무사님께 보낼 엑셀 파일을 기간별로 받습니다. <A href="#excel">8장</A></> },
  { date: '10월 7일', text: <>네이버 가계부 <b>엑셀(.xls)</b> 파일도 가져올 수 있고, 이미 입력한 거래와 겹치면 <b>자동으로 걸러집니다</b>. <A href="#data">10장</A></> },
  { date: '10월 7일', text: <>노란우산공제 납입은 비용이 아니라 <b>이체 › 공제부금납입</b>으로 정리했습니다.</> },
];

const TOC = [
  ['start', '시작하기'], ['rules', '원칙 세 가지'], ['entry', '거래 입력'], ['edit', '고치기·지우기'],
  ['book', '가계부 보기'], ['fixed', '고정지출'], ['assets', '자산'], ['reports', '보고서·엑셀'],
  ['search', '검색'], ['settings', '설정'], ['cheat', '상황별 정리표'], ['faq', '자주 묻는 질문'],
] as const;

/* ── 작은 부품 ─────────────────────────────────────── */

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="text-brand-ink font-semibold underline underline-offset-2">{children}</a>;
}
/** 화면의 초록 버튼처럼 */
const G = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-lg bg-brand text-white font-bold px-2 py-0.5 text-[0.88em] whitespace-nowrap align-baseline">{children}</span>
);
/** 화면의 회색 버튼처럼 */
const L = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-lg bg-surface-2 border border-line font-semibold px-2 py-0.5 text-[0.88em] whitespace-nowrap align-baseline">{children}</span>
);
const Out = ({ children = '지출' }: { children?: React.ReactNode }) => <b className="text-out-ink">{children}</b>;
const In = ({ children = '수입' }: { children?: React.ReactNode }) => <b className="text-in-ink">{children}</b>;
const Mv = ({ children = '이체' }: { children?: React.ReactNode }) => <b className="text-ink-2">{children}</b>;

function Box({ tone, title, children }: { tone: 'tip' | 'warn' | 'key' | 'note'; title?: string; children: React.ReactNode }) {
  const cls = {
    tip: 'bg-brand-soft border-brand',
    warn: 'bg-warn-soft border-[#e0a100]',
    key: 'bg-in-soft border-in',
    note: 'bg-surface-2 border-neutral',
  }[tone];
  const icon = { tip: '💡', warn: '⚠️', key: '🔑', note: 'ℹ️' }[tone];
  return (
    <div className={`rounded-2xl border-l-4 p-4 my-4 break-inside-avoid ${cls}`}>
      {title && <p className="font-bold mb-1">{icon} {title}</p>}
      <div className="text-[0.95rem] leading-relaxed [&>p+p]:mt-2">{children}</div>
    </div>
  );
}

function Steps({ children, start = 1 }: { children: React.ReactNode; start?: number }) {
  return <ol start={start} className="help-steps flex flex-col gap-3 my-3" style={{ counterReset: `s ${start - 1}` }}>{children}</ol>;
}

function Section({ id, no, title, lead, go, children }: {
  id: string; no: number; title: string; lead?: React.ReactNode; go?: { href: string; label: string }; children: React.ReactNode;
}) {
  return (
    <section id={id} className="card p-5 md:p-7 scroll-mt-20 help-section">
      <div className="flex items-start gap-3 flex-wrap">
        <h2 className="text-xl md:text-2xl font-extrabold flex items-center gap-3 flex-1">
          <span className="rounded-lg bg-brand text-white text-base px-2.5 py-0.5">{no}</span>{title}
        </h2>
        {go && <Link href={go.href} className="btn btn-ghost btn-sm no-print">{go.label} →</Link>}
      </div>
      {lead && <p className="text-ink-2 mt-2 pb-4 border-b-2 border-brand">{lead}</p>}
      <div className="mt-4 leading-relaxed help-body">{children}</div>
    </section>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-lg font-bold mt-6 mb-2 first:mt-0">{children}</h3>;

function Table({ head, rows, className = '' }: { head: React.ReactNode[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-line">
      <table className={`w-full text-[0.92rem] ${className}`}>
        <thead className="bg-surface-2"><tr>{head.map((h, i) => <th key={i} className="text-left font-bold px-3 py-2 border-b border-line whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** 입력 창 생김새 예시 (실제 데이터 아님) */
function EntryMock({ tab = 'OUT' }: { tab?: 'OUT' | 'IN' | 'NEUTRAL' }) {
  return (
    <div className="rounded-2xl border border-line p-3 bg-surface max-w-sm my-3 select-none" aria-hidden>
      <div className="seg text-sm">
        {(['OUT', 'IN', 'NEUTRAL'] as const).map((d) => (
          <span key={d} className={`flex-1 text-center rounded-[9px] py-2 font-semibold ${tab === d ? 'bg-surface shadow-sm ' + (d === 'IN' ? 'text-in-ink' : d === 'OUT' ? 'text-out-ink' : 'text-ink') : 'text-muted'}`}>
            {d === 'OUT' ? '지출' : d === 'IN' ? '수입' : '이체'}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-xl border-2 border-brand px-3 py-2 flex items-center justify-between">
        <span className={`text-2xl font-bold num ${tab === 'IN' ? 'text-in-ink' : tab === 'OUT' ? 'text-out-ink' : ''}`}>{tab === 'NEUTRAL' ? '100,000' : '12,000'}</span>
        <span className="text-muted">원</span>
      </div>
      <p className="text-xs text-muted mt-3 mb-1 font-semibold">{tab === 'NEUTRAL' ? '분류' : '생활비 (가계이체)'}</p>
      <div className="flex flex-wrap gap-1.5">
        {(tab === 'NEUTRAL' ? ['🔁 계좌간이동', '💵 현금인출', '💳 카드대금결제'] : ['🍚 식비', '💡 주거/공과금', '🏥 의료/건강']).map((c, i) => (
          <span key={c} className="chip !min-h-[34px] text-sm" aria-pressed={i === (tab === 'NEUTRAL' ? 1 : 0)}>{c}</span>
        ))}
      </div>
      <p className="text-xs text-muted mt-3 mb-1 font-semibold">{tab === 'NEUTRAL' ? '보내는 곳 → 받는 곳' : '결제수단'}</p>
      <div className="flex flex-wrap gap-1.5">
        {(tab === 'NEUTRAL' ? ['KB기업 사업통장', '→', '현금(지갑)'] : ['동백전', '오륙도', '현금(지갑)']).map((c, i) => (
          c === '→' ? <span key={i} className="self-center text-muted">→</span>
            : <span key={i} className="chip !min-h-[34px] text-sm" aria-pressed={tab === 'NEUTRAL' || i === 0}>{c}</span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <span className="btn btn-ghost btn-sm">저장 후 계속</span><span className="btn btn-primary btn-sm">저장</span>
      </div>
    </div>
  );
}

/* ── 페이지 ────────────────────────────────────────── */

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4 help-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">📖 사용설명서</h1>
          <p className="text-sm text-muted">마지막 업데이트 {UPDATED} · 기능이 바뀌면 이 화면도 함께 바뀝니다</p>
        </div>
        <PrintButton />
      </div>

      <nav aria-label="목차" className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur md:static md:mx-0 md:p-0 md:bg-transparent no-print">
        <ol className="flex gap-2 scroll-x md:flex-wrap">
          {TOC.map(([id, label], i) => (
            <li key={id}><a href={`#${id}`} className="chip !min-h-[38px] text-sm"><span className="text-brand-ink font-bold">{i + 1}</span>{label}</a></li>
          ))}
        </ol>
      </nav>

      <section className="card p-5 bg-brand-soft/60">
        <h2 className="font-bold mb-2">🆕 최근 바뀐 점</h2>
        <ul className="flex flex-col gap-1.5 text-[0.95rem]">
          {CHANGES.map((c, i) => <li key={i} className="flex gap-3"><span className="text-muted num shrink-0 whitespace-nowrap">{c.date}</span><span>{c.text}</span></li>)}
        </ul>
      </section>

      {/* 1 */}
      <Section id="start" no={1} title="시작하기" lead="휴대폰이든 컴퓨터든 인터넷 주소만 열면 바로 쓸 수 있습니다. 따로 설치할 프로그램은 없습니다.">
        <H3>휴대폰 홈 화면에 추가하기 (앱처럼 쓰기)</H3>
        <Table head={['휴대폰', '방법']} rows={[
          ['아이폰 (사파리)', <>아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → <b>추가</b></>],
          ['갤럭시 (삼성 인터넷)', <>아래쪽 <b>≡ 메뉴</b> → <b>현재 페이지 추가</b> → <b>홈 화면</b></>],
          ['갤럭시 (크롬)', <>오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b></>],
        ]} />
        <H3>로그인</H3>
        <p>비밀번호를 넣고 <G>들어가기</G>를 누릅니다. <b>한 번 로그인하면 30일 동안 유지</b>됩니다.</p>
        <Box tone="warn" title="비밀번호를 여러 번 틀리면 잠깁니다">
          15분 안에 10번 틀리면 15분 동안, 하루에 30번 틀리면 하루 동안 로그인이 막힙니다. 시간이 지나면 저절로 풀립니다.
        </Box>
        <H3>화면 구성</H3>
        <p>휴대폰은 화면 <b>맨 아래</b>, 컴퓨터는 <b>왼쪽</b>에 메뉴가 있습니다. 오른쪽 아래 초록색 <G>+ 입력</G> 버튼은 어느 화면에서든 떠 있습니다.</p>
        <Table head={['메뉴', '하는 일']} rows={[
          ['📒 가계부', '이번 달 수입·지출 요약과 날짜별 내역. 가장 많이 보는 화면'],
          ['🏦 자산', '통장·현금·저축 잔액, 카드·페이 사용액'],
          ['📊 보고서', '사장님 월간 보고, 연간 정리, 학교별 손익, 엑셀 장부 받기'],
          ['🔁 고정지출', '관리비·보험료처럼 매달 나가는 돈을 한 번에 넣는 곳'],
          ['⚙️ 설정', '결제수단·분류·거래처 관리, 데이터 가져오기, 백업'],
          ['❓ 도움말', '이 사용설명서'],
          ['🔍 검색', <>가계부 화면 오른쪽 위 <L>🔍 검색</L> (컴퓨터는 왼쪽 메뉴)</>],
        ]} />
      </Section>

      {/* 2 */}
      <Section id="rules" no={2} title="꼭 알아야 할 원칙 세 가지" lead="이 장부의 숫자가 정확한 이유는 딱 세 가지 원칙 덕분입니다.">
        <H3>원칙 1. 모든 돈은 셋 중 하나입니다</H3>
        <div className="grid sm:grid-cols-3 gap-3 my-3">
          <div className="rounded-2xl bg-out-soft p-4"><p className="text-xl font-extrabold text-out-ink">지출</p><p className="text-sm mt-1">내 손을 떠나 <b>남에게 간 돈</b>. 식비, 물건값, 주유비, 세금, 생활비</p></div>
          <div className="rounded-2xl bg-in-soft p-4"><p className="text-xl font-extrabold text-in-ink">수입</p><p className="text-sm mt-1">남에게서 <b>새로 들어온 돈</b>. 납품 대금, 설치비, 이자, 보험금</p></div>
          <div className="rounded-2xl bg-surface-2 p-4"><p className="text-xl font-extrabold text-ink-2">이체</p><p className="text-sm mt-1"><b>내 돈이 자리만 옮긴 것</b>. 통장→예금, 현금 인출, 카드대금, 적금</p></div>
        </div>
        <Box tone="key" title="이체는 수입도 지출도 아닙니다">
          <p>사업통장에서 적금으로 100만 원을 옮겨도 내 돈은 그대로입니다. 지출로 적으면 "100만 원 썼다"고 잘못 나옵니다. 그래서 이런 돈은 <Mv />로 적고, 이체는 <b>수입·지출 합계에서 자동으로 빠집니다.</b></p>
        </Box>
        <H3>원칙 2. 지출은 사업비 · 생활비 · 세금으로 나눕니다</H3>
        <Table head={['구분', '무엇인가요', '예']} rows={[
          [<b key="a">사업비</b>, '사업을 하느라 쓴 돈', '상품 매입, 설치 외주비, 주유비, 세무사 수수료'],
          [<b key="b">생활비 (가계이체)</b>, '사업과 상관없는 개인·가정의 돈', '집으로 보내는 생활비, 식비, 병원비, 관리비'],
          [<b key="c">세금</b>, '나라에 내는 돈', '부가가치세, 종합소득세, 자동차세'],
        ]} />
        <p>사업통장에서 매달 집으로 보내는 생활비(은행 적요 "급여")는 <b>생활비 › 정기가계이체</b>입니다.</p>
        <H3>원칙 3. "어디서 냈는지"(결제수단)를 고릅니다</H3>
        <Table head={['종류', '예']} rows={[
          ['💳 체크카드', '동백전, 오륙도, 부산은행 체크카드'],
          ['💳 신용카드', 'KB국민카드, KB기업카드, 우리카드'],
          ['📱 페이', '네이버페이, 카카오페이, KB페이, 스마일페이'],
          ['💵 현금', '현금(지갑)'],
          ['🏦 통장', 'KB기업 사업통장, 부가세통장, KB개인통장, 부산은행 통장'],
        ]} />
        <p className="text-sm text-muted">목록에 없는 카드·페이는 <A href="#settings">설정</A>에서 추가합니다.</p>
      </Section>

      {/* 3 */}
      <Section id="entry" no={3} title="거래 입력하기" lead={<>어느 화면에서든 <G>+ 입력</G>을 누릅니다. 순서는 늘 같습니다: <b>탭 → 금액 → 분류 → 결제수단 → 저장</b></>}>
        <H3>가장 흔한 경우: 지출 (점심 12,000원을 동백전으로)</H3>
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <Steps>
            <li><G>+ 입력</G>을 누릅니다. 맨 위 탭은 처음부터 <Out />이 선택되어 있습니다.</li>
            <li><b>금액</b>에 12000을 누릅니다. 쉼표는 저절로 들어갑니다. 아래 <L>+1만</L> <L>+5만</L> 버튼도 쓸 수 있습니다.</li>
            <li><b>날짜</b>는 오늘입니다. 다른 날이면 눌러서 바꿉니다.</li>
            <li><b>분류</b>에서 <b>생활비 › 식비</b>를 누릅니다.</li>
            <li><b>결제수단</b>에서 <b>동백전</b>을 누릅니다. 지난번에 쓴 것이 미리 골라져 있습니다.</li>
            <li>필요하면 <b>내용</b>("점심 식사")과 <b>사용처</b>(가게 이름)를 적습니다.</li>
            <li><G>저장</G>. 여러 건을 연달아 넣을 때는 <L>저장 후 계속</L>.</li>
          </Steps>
          <EntryMock tab="OUT" />
        </div>
        <Box tone="note" title="현금으로 냈다면?">
          결제수단에서 <b>현금(지갑)</b>을 고르세요. 통장에서 ATM으로 현금을 <b>뽑은 일</b>은 지출이 아니라 <Mv>이체 › 현금인출</Mv>입니다.
        </Box>

        <H3>사업비와 부가세</H3>
        <p>분류에서 <b>사업비</b>(상품매입·외주/설치비·차량유지비 등)를 고르면 <b>부가세</b>와 <b>거래처 · 학교/프로젝트</b> 칸이 나타납니다.</p>
        <ul className="list-disc pl-5 my-2 flex flex-col gap-1">
          <li><b>10% 포함</b>(기본): 금액만 넣으면 공급가액·부가세가 자동으로 나뉩니다. 1,100,000원 → 1,000,000 + 100,000</li>
          <li><b>없음</b>: 부가세가 없는 거래 · <b>직접</b>: 세금계산서 금액이 다를 때</li>
        </ul>
        <p><b>학교/프로젝트</b>를 적어 두면 보고서에서 학교별 매출·비용·이익을 볼 수 있습니다.</p>

        <H3>수입 (납품 대금 · 설치비 · 이자)</H3>
        <Steps>
          <li>탭에서 <In />을 누릅니다.</li>
          <li>분류에서 <b>사업매출</b>(학교납품·설치비·용역비) 또는 <b>기타수입</b>(금융수입·보험보상금·세금환급)을 고릅니다.</li>
          <li><b>입금된 곳</b>(통장)을 고르고 거래처·학교를 적습니다.</li>
          <li>아직 돈을 못 받았으면 <b>입금 여부 › 미입금</b>. 첫 화면에 ⏳ 알림이 뜹니다.</li>
        </Steps>
        <Box tone="warn" title="이것은 매출이 아닙니다">
          보험금은 <b>기타수입 › 보험보상금</b>, 세금 돌려받은 것은 <b>기타수입 › 세금환급</b>, 예금 이자는 <b>기타수입 › 금융수입</b>입니다.
        </Box>

        <H3>이체 (내 돈의 자리만 바뀔 때)</H3>
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <Steps>
              <li>탭에서 <Mv />를 누릅니다.</li>
              <li>금액을 넣고 분류를 고릅니다.</li>
              <li><b>보내는 곳</b>과 <b>받는 곳</b>을 각각 고르고 <G>저장</G>.</li>
            </Steps>
            <Table head={['이런 일', '분류', '보내는 곳 → 받는 곳']} rows={[
              ['ATM 현금 인출', '현금인출', '통장 → 현금(지갑)'],
              ['신용카드 대금 출금', '카드대금결제', '통장 → 그 신용카드'],
              ['동백전 충전', '페이·카드충전', '통장 → 동백전'],
              ['부가세 모아두기', '부가세통장이체', '사업통장 → 부가세통장'],
              ['적금 · 노란우산공제', '적금납입 · 공제부금납입', '통장 → 예금·적금 / 연금·공제'],
            ]} />
          </div>
          <EntryMock tab="NEUTRAL" />
        </div>
        <Box tone="key" title="신용카드는 '쓸 때' 지출, '대금이 나갈 때'는 이체">
          카드로 밥을 먹은 날 <Out>지출 › 식비</Out>(결제수단: 그 카드)로 적고, 다음 달 통장에서 카드대금이 빠지면 <Mv>이체 › 카드대금결제</Mv>로 적습니다. 같은 돈이 두 번 지출로 잡히지 않습니다.
        </Box>

        <H3>예금 · 적금 만기 (원금과 이자 나누기)</H3>
        <p><Mv /> › <b>적금만기원금</b>을 고르고 금액에는 <b>원금만</b> 넣습니다. 새로 나타나는 <b>이자</b> 칸에 이자를 넣으면, 원금은 이체·이자는 기타수입으로 <b>두 건</b>이 저절로 생깁니다.</p>

        <H3>저장할 때 확인 창이 뜨면</H3>
        <Table head={['창', '뜻']} rows={[
          ['"금액이 큽니다"', <>300만 원 이상입니다. 0을 더 누르지 않았는지 보고, 맞으면 <G>그대로 저장</G></>],
          ['"같은 날 같은 금액의 거래가 이미 있습니다"', <>같은 걸 두 번 넣지 않았는지 확인. 정말 두 번이면 <G>그대로 저장</G></>],
        ]} />
        <Box tone="tip" title="매달 나가는 돈이라면">
          입력 창 아래 <b>"매달 나가는 고정지출이에요"</b>를 체크하면 <A href="#fixed">고정지출</A>에도 등록되어 다음 달부터 버튼 한 번으로 넣을 수 있습니다.
        </Box>
      </Section>

      {/* 4 */}
      <Section id="edit" no={4} title="고치기 · 지우기" lead="잘못 넣어도 걱정하지 마세요. 언제든 고칠 수 있고, 지운 것도 되돌릴 수 있습니다.">
        <Steps>
          <li>가계부 내역이나 검색 결과에서 거래를 <b>한 번 누릅니다.</b> "거래 수정" 창이 열립니다.</li>
          <li>금액·날짜·분류·결제수단을 고치고 <G>수정 완료</G>.</li>
          <li>지우려면 왼쪽 아래 빨간 <b className="text-danger">삭제</b>. 화면 아래 <b className="text-brand-ink">되돌리기</b>가 6초 동안 보이니 실수였다면 바로 누르세요.</li>
        </Steps>
        <p className="text-sm text-muted">지출↔수입처럼 맨 위 탭은 바꿀 수 없습니다. 그럴 때는 지우고 새로 넣으세요. 만기 원금·이자처럼 함께 생긴 거래는 같이 지워집니다.</p>
      </Section>

      {/* 5 */}
      <Section id="book" no={5} title="가계부 보기" go={{ href: '/', label: '가계부 열기' }} lead={<>첫 화면입니다. 맨 위 <b>‹ 2026년 9월 ›</b> 화살표로 다른 달로 갑니다.</>}>
        <Table head={['칸', '뜻']} rows={[
          [<In key="i" />, '사업매출 + 기타수입 (이체 제외)'],
          [<b key="o">지출</b>, '사업비 + 세금 + 생활비 (이체 제외). 지난달보다 더/덜 쓴 금액도 표시'],
          [<b key="n">남은 돈</b>, '수입 − 지출. 초록이면 남음, 주황이면 모자람'],
          ['작은 칸 4개', '사업비 · 세금 · 생활비 · 이체(합계에서 빠진 돈)'],
        ]} />
        <p><b>▸ 계산 방법 보기</b>를 누르면 숫자가 어떻게 나왔는지 풀어서 보여 줍니다.</p>
        <H3>내역 · 달력 · 분석</H3>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>내역</b> — 날짜별로 묶은 목록과 그날 합계</li>
          <li><b>달력</b> — 날짜마다 +수입 −지출. 날짜를 누르면 그날 내역과 <L>+ ○월 ○일에 입력</L> 버튼</li>
          <li><b>분석</b> — 어디에 썼나(분류별) · 무엇으로 냈나(결제수단별) · 어디서 벌었나</li>
        </ul>
        <Box tone="tip" title="알림 카드">이번 달 고정지출을 아직 안 넣었거나 못 받은 매출이 있으면 요약 아래에 알림이 뜹니다. 누르면 해당 화면으로 갑니다.</Box>
      </Section>

      {/* 6 */}
      <Section id="fixed" no={6} title="고정지출" go={{ href: '/fixed', label: '고정지출 열기' }} lead={<>관리비·보험료·세무사 수수료·매달 보내는 생활비처럼 <b>매달 같은 날 반복되는 돈</b>을 한 번 등록해 두고, 매달 버튼 한 번으로 넣습니다.</>}>
        <H3>등록</H3>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>거래 입력 때 <b>"매달 나가는 고정지출이에요"</b> 체크, 또는</li>
          <li>고정지출 화면 아래 <L>+ 고정지출 등록</L>에서 이름·금액·매월 며칠·분류·결제수단 입력</li>
        </ul>
        <H3>매달 넣기</H3>
        <Steps>
          <li>[🔁 고정지출]을 엽니다. 이번 달에 아직 안 넣은 것은 <b className="text-warn-ink">아직 안 넣음</b>으로 체크되어 있습니다.</li>
          <li>이번 달에 뺄 것은 체크를 풉니다.</li>
          <li><G>선택한 ○건 ○월에 넣기</G>를 누릅니다.</li>
        </Steps>
        <Box tone="note">자동으로 들어가지 않고, 같은 달에 두 번 들어가지도 않습니다. 이번 달만 금액이 다르면 넣은 뒤 가계부에서 그 거래를 고치세요.</Box>
      </Section>

      {/* 7 */}
      <Section id="assets" no={7} title="자산과 잔액 맞추기" go={{ href: '/assets', label: '자산 열기' }} lead="통장·현금·저축에 지금 얼마가 있는지, 카드·페이로 이번 달 얼마를 썼는지 봅니다.">
        <p><b>잔액 = 처음 잔액(기초잔액) + 기록된 입금 − 기록된 출금</b>. 기록하지 않은 입출금이 있으면 실제 통장과 달라집니다.</p>
        <H3>잔액 맞추기</H3>
        <Steps>
          <li>통장 앱에서 <b>오늘 실제 잔액</b>을 확인합니다.</li>
          <li>자산 화면에서 그 통장 옆 <L>잔액 맞추기</L>를 누릅니다.</li>
          <li>실제 잔액을 넣고 <G>맞추기</G>. 거래 기록은 그대로 두고 처음 잔액만 조정합니다.</li>
        </Steps>
        <Box tone="tip">한 달에 한 번쯤 맞춰 두면 좋습니다. 데이터를 다시 가져와도 맞춘 잔액은 바뀌지 않습니다.</Box>
      </Section>

      {/* 8 */}
      <Section id="reports" no={8} title="보고서 · 엑셀 장부" go={{ href: '/reports', label: '보고서 열기' }} lead="사장님께 보여드리거나 세무사님께 보낼 자료를 만듭니다.">
        <Table head={['보고서', '내용']} rows={[
          [<b key="m">월간 보고</b>, '한 줄 요약, 매출·사업비·세금·가계이체·순현금흐름(지난달 대비), 사업비 TOP 5, 거래처별·학교별, 못 받은 매출'],
          [<b key="y">연간</b>, <>한 해 합계와 <b>월평균</b>, 월별 그래프. 항목 체크를 풀면 그 항목(한 번뿐인 큰 지출)을 뺀 월평균도 계산</>],
          [<b key="p">학교별</b>, '학교(프로젝트)별 매출 · 비용 · 이익'],
          [<b key="j">분개장 · 시산표</b>, '입력한 내용으로 자동 작성되는 회계 장부'],
        ]} />
        <p><L>🖨 인쇄 · PDF 저장</L>을 누르면 메뉴가 빠진 깔끔한 보고서로 인쇄되고, "PDF로 저장"을 고르면 파일이 됩니다.</p>

        <div id="excel" className="scroll-mt-20" />
        <H3>📗 엑셀 장부 받기 (세무사 제출용)</H3>
        <Steps>
          <li>보고서 화면 오른쪽 위(또는 설정 › 데이터) <L>📗 엑셀 장부 받기</L>를 누릅니다.</li>
          <li>기간을 고릅니다.</li>
          <li><G>⬇ 내려받기</G>. 휴대폰이면 카카오톡·메일로 바로 보낼 수 있습니다.</li>
        </Steps>
        <Table head={['기간 버튼', '쓰임']} rows={[
          [<b key="a">작년 1년</b>, '5월 종합소득세 신고'],
          [<b key="b">부가세 1기 (1~6월) · 2기 (7~12월)</b>, '7월 · 1월 부가세 신고 — 가장 최근에 끝난 기간이 잡혀 있습니다'],
          ['올해 · 지난달 · 이번 달 · 전체 · 직접 지정', '그 밖에'],
        ]} />
        <Table head={['파일 안의 시트', '내용']} rows={[
          ['요약', '상호·사업자번호, 기간 합계, 부가세 집계(매출세액 − 매입세액), 월별 표'],
          ['전체내역', '모든 거래 — 계정과목·거래처·공급가액·부가세·결제수단'],
          ['매출 / 매입·경비', '사업매출 / 사업비만. 거래처 사업자번호, 세금계산서, 결제수단 종류'],
          ['세금·공과 · 계정별 월합계', '납부한 세금, 계정과목 × 월 표'],
          ['분개장 · 합계잔액시산표', '복식부기 장부'],
        ]} />
        <Box tone="tip" title="보내기 전에">
          <A href="/settings?tab=business">설정 › 사업자</A>에 상호·대표자·사업자번호를, <A href="/settings?tab=vendors">설정 › 거래처</A>에 자주 거래하는 곳의 사업자번호를 넣어 두면 엑셀에 함께 나옵니다.
        </Box>
      </Section>

      {/* 9 */}
      <Section id="search" no={9} title="검색과 한꺼번에 고치기" go={{ href: '/search', label: '검색 열기' }} lead={<>가계부 화면 오른쪽 위 <L>🔍 검색</L></>}>
        <Steps>
          <li>검색칸에 <b>주유, 마트, 학교 이름</b>처럼 찾을 말을 넣습니다. 내용·거래처·학교·메모·분류에서 모두 찾습니다.</li>
          <li>기간을 정하고, <b>상세 조건</b>으로 분류·결제수단·금액·미입금만 등을 더합니다.</li>
          <li>결과 위에 <b>건수와 합계</b>가 나옵니다. "올해 주유비가 얼마였지?"에 바로 답이 나옵니다.</li>
        </Steps>
        <H3>한꺼번에 고치기</H3>
        <p>거래 왼쪽 네모를 체크(<b>전체 선택</b>도 있음)하면 아래에 막대가 나타납니다. <b>결제수단 바꾸기 · 분류 바꾸기 · 삭제</b>를 한 번에 할 수 있습니다.</p>
        <Box tone="tip" title="예전 카드 결제 정리">네이버 가계부에서 옮겨온 카드 결제 중 카드사를 모르는 것은 <b>카드(기타)</b>입니다. 결제수단을 "카드(기타)"로 검색해 골라 맞는 카드로 바꿀 수 있습니다.</Box>
      </Section>

      {/* 10 */}
      <Section id="settings" no={10} title="설정" go={{ href: '/settings', label: '설정 열기' }} lead="처음에 한 번, 그리고 새 카드나 통장이 생겼을 때 들어오는 곳입니다.">
        <H3>새 카드 · 페이 · 통장 추가</H3>
        <Steps>
          <li>[설정] → <b>결제수단·계좌</b>에서 종류(예: 페이) 옆 <L>+ 추가</L>.</li>
          <li>이름(예: 토스페이)과 종류를 확인하고 <G>저장</G>.</li>
          <li>체크카드·페이는 <b>돈이 빠져나가는 통장</b>을 고를 수 있습니다. 고르면 자산 화면의 그 통장 잔액에 반영됩니다.</li>
        </Steps>
        <p>안 쓰는 카드는 지우지 말고 <b>사용</b> 체크를 끄세요. 입력 화면에서만 숨겨지고 예전 기록은 남습니다.</p>
        <Table head={['탭', '할 수 있는 일']} rows={[
          ['분류', '이름·아이콘·설명 바꾸기, 새 분류 추가, 숨기기'],
          ['거래처 · 학교', '이름 고치기, 사업자번호 넣기, 숨기기 (입력 때 새 이름을 적으면 자동 추가)'],
          ['사업자', '상호·대표자·사업자번호(보고서·엑셀에 표시), 큰 금액 확인 기준, 부가세율, 중복 경고'],
          ['데이터', '데이터 현황, 가져오기, 엑셀 장부, 전체 백업(CSV)'],
        ]} />

        <div id="data" className="scroll-mt-20" />
        <H3>데이터 가져오기와 중복 걱정</H3>
        <p>[설정 › 데이터 › 데이터 가져오기]에서 파일을 고르고 <G>가져오기</G>를 누릅니다. 네이버 가계부 <b>수입현황·지출현황</b>(CSV 또는 엑셀 .xls)과 예전 구글시트 엑셀을 읽습니다.</p>
        <Table head={['이런 경우', '어떻게 되나요']} rows={[
          ['같은 파일을 또 올림 · 기간이 겹치는 파일', <b key="1">한 번만 들어갑니다</b>],
          ['앱에 이미 직접 입력한 거래가 파일에도 있음 (같은 날 · 같은 금액)', <><b>건너뜁니다</b> — 직접 입력한 쪽을 남깁니다</>],
          ['같은 날 같은 곳인데 금액만 조금 다름 (오타)', <><b>넣지 않고 "금액 확인 필요"</b>로 알려 줍니다</>],
          ['금액은 같은데 날짜가 1~2일 다름', <>넣고 <b>"중복인지 확인해 보세요"</b>로 알려 줍니다</>],
          ['네이버의 전월이월(통장잔고)', <>수입이 아니라 <b>통장의 처음 잔액</b>으로 들어갑니다</>],
        ]} />
        <Box tone="tip" title="💾 한 달에 한 번 백업">[설정 › 데이터] 맨 아래 <L>⬇ 전체 거래 CSV 내려받기</L>로 모든 거래를 파일로 받아 두세요.</Box>
      </Section>

      {/* 11 */}
      <Section id="cheat" no={11} title="이럴 땐 이렇게 입력하세요" lead="헷갈릴 때 이 표만 보세요.">
        <Table className="text-[0.88rem]" head={['이런 일이 있으면', '탭', '분류', '결제수단 / 계좌']} rows={[
          ['동백전으로 점심', <Out key="1" />, '생활비 › 식비', '동백전'],
          ['현금으로 장보기', <Out key="2" />, '생활비 › 식비', '현금(지갑)'],
          ['병원 · 약국', <Out key="3" />, '생활비 › 의료/건강', '쓴 카드·페이'],
          ['관리비 · 가스비', <Out key="4" />, '생활비 › 주거/공과금', '빠져나간 통장·카드'],
          ['매달 집으로 보내는 생활비 ("급여")', <Out key="5" />, '생활비 › 정기가계이체', 'KB기업 사업통장'],
          ['축의금 · 부의금', <Out key="6" />, '생활비 › 경조사', '낸 방법'],
          ['거래처 물건값 송금', <Out key="7" />, '사업비 › 상품매입', '사업통장 (+거래처·학교)'],
          ['업무용 차 주유', <Out key="8" />, '사업비 › 차량유지비', '쓴 카드'],
          ['세무사 수수료', <Out key="9" />, '사업비 › 세무사수수료', '사업통장'],
          ['학교 인사 관련 비용', <Out key="10" />, '사업비 › 업무추진비', '쓴 방법'],
          ['부가세 · 종합소득세 납부', <Out key="11" />, '세금 › 해당 세금', '낸 통장'],
          ['주차위반 과태료', <Out key="12" />, '세금 › 과태료/범칙금', '낸 방법'],
          ['학교 납품 대금 입금', <In key="13" />, '사업매출 › 학교납품', '들어온 통장'],
          ['설치비 입금', <In key="14" />, '사업매출 › 설치비', '들어온 통장'],
          ['납품했는데 아직 못 받음', <In key="15" />, '사업매출 (입금 여부: 미입금)', '받을 통장'],
          ['실손보험금', <In key="16" />, '기타수입 › 보험보상금', '들어온 통장'],
          ['예금 이자', <In key="17" />, '기타수입 › 금융수입', '들어온 통장'],
          ['세금 환급', <In key="18" />, '기타수입 › 세금환급', '들어온 통장'],
          ['ATM 현금 인출', <Mv key="19" />, '현금인출', '통장 → 현금(지갑)'],
          ['신용카드 대금 출금', <Mv key="20" />, '카드대금결제', '통장 → 그 신용카드'],
          ['동백전 · 페이 충전', <Mv key="21" />, '페이·카드충전', '통장 → 동백전/페이'],
          ['부가세통장으로 옮기기', <Mv key="22" />, '부가세통장이체', '사업통장 → 부가세통장'],
          ['적금 납입', <Mv key="23" />, '적금납입', '통장 → 예금·적금'],
          ['적금 만기 (원금+이자)', <Mv key="24" />, '적금만기원금 (이자 칸 따로)', '예금·적금 → 통장'],
          ['주식 · 펀드 계좌로', <Mv key="25" />, '투자계좌이체', '통장 → 투자계좌'],
          ['노란우산공제 · 국민연금', <Mv key="26" />, '공제부금납입', '통장 → 연금·공제'],
          ['내 통장끼리 옮기기', <Mv key="27" />, '계좌간이동', '보낸 통장 → 받은 통장'],
          ['돈을 빌려줌 / 돌려받음', <Mv key="28" />, '대여금지급 / 대여금회수', '통장 ↔ 대여금'],
        ]} />
      </Section>

      {/* 12 */}
      <Section id="faq" no={12} title="자주 묻는 질문">
        <dl className="flex flex-col gap-4">
          {([
            ['현금으로 쓴 돈은 어디에 적나요?', <>평소처럼 <Out />로 적고 결제수단에서 <b>현금(지갑)</b>. 통장에서 현금을 뽑을 때는 <Mv>이체 › 현금인출</Mv>입니다.</>],
            ['"고정지출"은 무엇인가요?', <>매달 같은 날 나가는 돈을 미리 등록해 두고 매달 버튼 한 번으로 넣는 기능입니다. 자동으로 들어가지 않습니다. (<A href="#fixed">6장</A>)</>],
            ['사업비인지 생활비인지 애매해요.', <>"이 돈을 안 썼으면 사업에 지장이 있었나?"를 생각해 보세요. 애매하면 메모를 남기고, 나중에 세무사님과 상의해 검색 화면에서 한꺼번에 바꿀 수 있습니다.</>],
            ['신용카드 대금이 통장에서 빠져나갔어요. 지출인가요?', <>아니요. 쓸 때 이미 지출로 적었으니 대금은 <Mv>이체 › 카드대금결제</Mv>입니다.</>],
            ['지난달 것을 깜빡했어요.', <>입력 창의 날짜를 그날로 바꿔 넣거나, 달력에서 그 날짜를 눌러 <L>+ ○월 ○일에 입력</L>을 쓰세요.</>],
            ['실수로 지웠어요.', <>지운 직후 화면 아래 <b>되돌리기</b>. 이미 사라졌다면 관리하는 분께 알려 주세요. 기록이 남아 있어 되살릴 수 있습니다.</>],
            ['자산 화면 잔액이 실제 통장과 달라요.', <>그 통장 옆 <L>잔액 맞추기</L>에 오늘 실제 잔액을 넣으세요. (<A href="#assets">7장</A>)</>],
            ['네이버 가계부 파일을 올렸는데 직접 넣은 것과 겹치지 않나요?', <>같은 날 같은 금액이면 자동으로 걸러지고, 금액이 조금 다르면 알려 줍니다. (<A href="#data">10장</A>)</>],
            ['세무사님이 장부를 달래요.', <>보고서 › <L>📗 엑셀 장부 받기</L>에서 기간(작년 1년, 부가세 1기·2기)을 골라 받으면 됩니다. (<A href="#excel">8장</A>)</>],
            ['로그인이 "잠겼습니다"라고 나와요.', <>비밀번호를 여러 번 틀려서입니다. 15분 뒤(많이 틀렸으면 다음 날) 다시 해 보세요.</>],
            ['다른 휴대폰이나 컴퓨터에서 써도 되나요?', <>네. 기록은 인터넷 서버에 있어서 어느 기기에서든 로그인하면 똑같이 보이고, 동시에 써도 됩니다.</>],
          ] as [string, React.ReactNode][]).map(([q, a]) => (
            <div key={q} className="break-inside-avoid">
              <dt className="font-bold"><span className="text-brand-ink">Q.</span> {q}</dt>
              <dd className="mt-1 pl-6 text-ink-2"><b className="text-ink -ml-6 mr-2">A.</b>{a}</dd>
            </div>
          ))}
        </dl>
        <Box tone="note" title="도움이 필요하면">화면이 이상하거나 기능이 더 필요하면, 어느 화면에서 무엇을 눌렀는지 휴대폰 화면을 캡처해서 관리하는 분께 보내 주세요.</Box>
      </Section>
    </div>
  );
}
