'use client';

import { useRouter } from 'next/navigation';

export function PrintButton() {
  return <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨 인쇄 · PDF 저장</button>;
}

/** 연간 보고: 항목을 월평균에서 빼기 (일회성 비용 제외, PRD 21) */
export function ExcludeToggle({ year, ym, rows }: { year: string; ym: string; rows: { key: string; label: string; amount: number; avg: number; excluded: boolean }[] }) {
  const router = useRouter();
  const excluded = rows.filter((r) => r.excluded).map((r) => r.key);
  function toggle(key: string, include: boolean) {
    const next = include ? excluded.filter((k) => k !== key) : [...excluded, key];
    const p = new URLSearchParams({ tab: 'yearly', year, ym });
    if (next.length) p.set('ex', next.join('|'));
    router.replace(`/reports?${p}`, { scroll: false });
  }
  if (!rows.length) return <p className="text-muted text-sm">기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-muted text-left border-b border-line"><th className="p-2 w-10">포함</th><th className="p-2">항목</th><th className="p-2 text-right">연간 합계</th><th className="p-2 text-right">월평균</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key} className={r.excluded ? 'opacity-45' : ''}>
              <td className="p-2"><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={!r.excluded} onChange={(e) => toggle(r.key, e.target.checked)} aria-label={`${r.label} 포함`} /></td>
              <td className="p-2">{r.label}</td>
              <td className="p-2 text-right num">{r.amount.toLocaleString('ko-KR')}</td>
              <td className="p-2 text-right num font-semibold">{r.avg.toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
