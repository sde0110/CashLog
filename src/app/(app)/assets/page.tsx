import type { Metadata } from 'next';
import { ACCOUNT_KIND_INFO, type AccountKind } from '@/lib/domain';
import { monthRange, thisMonthKST } from '@/lib/dates';
import { groupSum } from '@/lib/ledger';
import { accountMovements, getMasters, listTxs } from '@/server/data';
import { won } from '@/lib/format';
import { AdjustBalance } from './adjust-balance';

export const metadata: Metadata = { title: '자산' };

/** 잔액을 직접 관리하는 종류 (카드·페이는 연결 통장으로 합산) */
const BALANCE_KINDS: AccountKind[] = ['통장', '현금', '저축·투자', '기타자산'];
const SPEND_KINDS: AccountKind[] = ['체크카드', '신용카드', '페이'];

export default async function AssetsPage() {
  const ym = thisMonthKST();
  const [from, to] = monthRange(ym);
  const [m, mv, monthTxs] = await Promise.all([getMasters(), accountMovements(), listTxs({ from, to, flow: 'OUT' })]);

  // 체크카드·페이에 연결 통장이 있으면 그 통장에서 빠진 것으로 본다
  const own = new Map<number, number>();
  for (const a of m.accounts) {
    const x = mv.get(a.id) ?? { inflow: 0, outflow: 0 };
    own.set(a.id, a.openingBalance + x.inflow - x.outflow);
  }
  const balance = new Map(own);
  for (const a of m.accounts) {
    if (SPEND_KINDS.includes(a.kind as AccountKind) && a.linkedAccountId && balance.has(a.linkedAccountId)) {
      balance.set(a.linkedAccountId, balance.get(a.linkedAccountId)! + (own.get(a.id) ?? 0) - a.openingBalance);
    }
  }

  const groups = BALANCE_KINDS.map((k) => ({
    kind: k,
    items: m.accounts.filter((a) => a.kind === k && (a.active || balance.get(a.id))),
  })).filter((g) => g.items.length);
  const total = groups.flatMap((g) => g.items).reduce((s, a) => s + (balance.get(a.id) ?? 0), 0);

  const usage = groupSum(monthTxs, (t) => t.fromName);
  const usageOf = (name: string) => usage.find((u) => u.key === name)?.amount ?? 0;
  const spendAccounts = m.accounts.filter((a) => SPEND_KINDS.includes(a.kind as AccountKind) && (a.active || usageOf(a.name)));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">자산</h1>
      <section className="card p-5">
        <p className="text-sm text-muted">기록상 순자산 (통장 · 현금 · 저축 · 기타)</p>
        <p className="text-3xl font-bold num mt-1">{won(total)}<span className="text-lg">원</span></p>
        <p className="text-xs text-muted mt-2 leading-relaxed">
          잔액 = 기초잔액 + 기록된 입금 − 기록된 출금. 실제 통장과 다르면 계좌 옆 <b>[잔액 맞추기]</b>로 오늘 잔액을 넣어 주세요.
        </p>
      </section>

      {groups.map((g) => (
        <section key={g.kind} className="card overflow-hidden">
          <h2 className="px-5 pt-4 pb-2 font-bold">{ACCOUNT_KIND_INFO[g.kind].icon} {g.kind}</h2>
          <ul className="divide-y divide-line">
            {g.items.map((a) => {
              const b = balance.get(a.id) ?? 0;
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.name}{!a.active && <span className="text-xs text-muted"> (숨김)</span>}</p>
                    {a.institution && <p className="text-xs text-muted">{a.institution}</p>}
                  </div>
                  <span className={`num font-bold ${b < 0 ? 'text-out-ink' : ''}`}>{won(b)}원</span>
                  <AdjustBalance id={a.id} name={a.name} current={b} opening={a.openingBalance} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="card overflow-hidden">
        <h2 className="px-5 pt-4 pb-1 font-bold">💳 카드 · 페이 <span className="text-sm font-normal text-muted">이번 달 사용액</span></h2>
        <p className="px-5 pb-2 text-xs text-muted">카드·페이로 쓴 돈은 쓸 때 이미 지출로 잡힙니다. 카드대금이 통장에서 나갈 때는 <b>이체 › 카드대금결제</b>로 적으면 이중으로 잡히지 않습니다.</p>
        <ul className="divide-y divide-line">
          {spendAccounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <span className="text-xs rounded-md bg-surface-2 px-2 py-0.5 text-ink-2 shrink-0">{a.kind}</span>
              <span className="flex-1 truncate font-semibold">{a.name}</span>
              <span className="num font-bold">{won(usageOf(a.name))}원</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
