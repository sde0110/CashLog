'use client';

import { useMemo, useState } from 'react';
import { lastDayOfMonth, shiftYm, thisMonthKST, todayKST } from '@/lib/dates';

interface Preset { key: string; label: string; hint: string; from: string; to: string }

function presets(): Preset[] {
  const today = todayKST();
  const y = Number(today.slice(0, 4));
  const ym = thisMonthKST();
  const prev = shiftYm(ym, -1);
  const end = (m: string) => `${m}-${String(lastDayOfMonth(m)).padStart(2, '0')}`;
  // 부가세: 1~6월은 7월에, 7~12월은 다음 해 1월에 신고한다 → 지금 시점에서 가장 최근에 끝난 기를 먼저 보여 준다
  const vatYear1 = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
  const vatYear2 = y - 1;
  return [
    { key: 'lastYear', label: `작년 1년 (${y - 1}년)`, hint: '종합소득세 신고용', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { key: 'vat1', label: `부가세 1기 (${vatYear1}년 1~6월)`, hint: '7월 부가세 신고용', from: `${vatYear1}-01-01`, to: `${vatYear1}-06-30` },
    { key: 'vat2', label: `부가세 2기 (${vatYear2}년 7~12월)`, hint: '1월 부가세 신고용', from: `${vatYear2}-07-01`, to: `${vatYear2}-12-31` },
    { key: 'thisYear', label: `올해 (${y}년)`, hint: '1월 1일 ~ 오늘', from: `${y}-01-01`, to: today },
    { key: 'lastMonth', label: `지난달 (${Number(prev.slice(5))}월)`, hint: '', from: `${prev}-01`, to: end(prev) },
    { key: 'thisMonth', label: `이번 달 (${Number(ym.slice(5))}월)`, hint: '', from: `${ym}-01`, to: today },
    { key: 'all', label: '전체 기간', hint: '모든 거래', from: '', to: '' },
  ];
}

/** 세무사 제출용 엑셀 장부 내려받기 — 버튼을 누르면 기간을 고르는 창이 열린다 */
export function ExportButton({ className = 'btn btn-ghost btn-sm' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>📗 엑셀 장부 받기</button>
      {open && <ExportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const list = useMemo(presets, []);
  const [key, setKey] = useState('lastYear');
  const [from, setFrom] = useState(list[0].from);
  const [to, setTo] = useState(list[0].to);
  const custom = key === 'custom';
  const p = list.find((x) => x.key === key);
  const f = custom ? from : p?.from ?? '';
  const t = custom ? to : p?.to ?? '';
  const invalid = custom && (!from || !to || from > to);
  const href = `/api/export/xlsx?${new URLSearchParams({ ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) })}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center no-print" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="엑셀 장부 받기" className="anim-sheet bg-surface w-full md:max-w-md max-h-[94dvh] rounded-t-3xl md:rounded-3xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold flex-1">📗 엑셀 장부 받기</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </header>
        <div className="overflow-y-auto px-5 pb-4 flex flex-col gap-3">
          <p className="text-sm text-muted">세무사님께 그대로 보낼 수 있는 엑셀 파일입니다. 요약 · 전체내역 · 매출 · 매입·경비 · 세금 · 계정별 월합계 · 분개장 · 시산표가 시트별로 들어 있습니다.</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="기간">
            {[...list, { key: 'custom', label: '직접 지정', hint: '', from: '', to: '' }].map((x) => (
              <label key={x.key} className={`flex items-center gap-3 rounded-xl border-2 px-4 min-h-[52px] cursor-pointer ${key === x.key ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                <input type="radio" name="period" className="h-5 w-5 accent-[var(--brand)]" checked={key === x.key} onChange={() => setKey(x.key)} />
                <span className="flex-1 font-semibold">{x.label}</span>
                {x.hint && <span className="text-xs text-muted">{x.hint}</span>}
              </label>
            ))}
          </div>
          {custom && (
            <div className="grid grid-cols-2 gap-2">
              <label className="field"><span>시작일</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="field"><span>종료일</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
          {invalid && <p className="text-danger text-sm">시작일과 종료일을 확인해 주세요.</p>}
        </div>
        <footer className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <a href={invalid ? undefined : href} aria-disabled={invalid} onClick={() => !invalid && setTimeout(onClose, 300)}
            className={`btn btn-primary w-full text-lg ${invalid ? 'opacity-50 pointer-events-none' : ''}`}>
            ⬇ 내려받기{f && t ? ` (${f} ~ ${t})` : ''}
          </a>
          <p className="text-xs text-muted text-center mt-2">휴대폰에서는 받은 파일을 카카오톡·메일로 바로 보낼 수 있습니다.</p>
        </footer>
      </div>
    </div>
  );
}
