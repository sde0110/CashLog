'use client';

import { ACCOUNT_KIND_INFO, GROUPS_BY_DIRECTION, type AccountKind, type Direction } from '@/lib/domain';
import type { ClientAccount, ClientCategory } from './app-context';

/** 결제수단·계좌 선택 — 종류별로 묶어서 칩으로 보여준다 (피드백 1) */
export function AccountPicker({
  accounts, value, onChange, kinds, exclude,
}: {
  accounts: ClientAccount[];
  value: number | null;
  onChange: (id: number | null) => void;
  kinds: readonly string[];
  exclude?: number | null;
}) {
  const groups = kinds
    .map((k) => ({ kind: k, items: accounts.filter((a) => a.kind === k && (a.active || a.id === value) && a.id !== exclude) }))
    .filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.kind}>
          <div className="text-xs font-semibold text-muted mb-1.5">
            {ACCOUNT_KIND_INFO[g.kind as AccountKind]?.icon} {g.kind}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((a) => (
              <button key={a.id} type="button" className="chip" aria-pressed={value === a.id}
                onClick={() => onChange(value === a.id ? null : a.id)}>
                {a.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 분류 선택 — 대분류 묶음(사업비 / 생활비 / 세금 …) 아래에 세부 분류 칩 */
export function CategoryPicker({
  categories, direction, value, onChange,
}: {
  categories: ClientCategory[];
  direction: Direction;
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS_BY_DIRECTION[direction].map((g) => {
        const items = categories.filter((c) => c.type === g.type && c.flow === direction && (c.active || c.id === value));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-sm font-bold">{g.label}</span>
              {g.hint && <span className="text-xs text-muted">{g.hint}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={value === c.id} onClick={() => onChange(c.id)} title={c.memo || undefined}>
                  {c.icon && <span aria-hidden>{c.icon}</span>}{c.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 금액 입력 — 천 단위 쉼표, 숫자 키패드 */
export function AmountInput({ value, onChange, className = '', ...rest }: {
  value: string; onChange: (v: string) => void; className?: string; ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      className={`input num ${className}`}
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        const d = e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 13);
        onChange(d ? Number(d).toLocaleString('ko-KR') : '');
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}

export const toNum = (s: string | number | null | undefined) => Number(String(s ?? '').replace(/[^0-9]/g, '')) || 0;
export const fmt = (n: number) => (n ? n.toLocaleString('ko-KR') : '');
