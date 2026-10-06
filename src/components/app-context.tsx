'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Direction } from '@/lib/domain';
import type { TxView } from '@/lib/ledger';

export interface ClientAccount { id: number; name: string; kind: string; institution: string; linkedAccountId: number | null; openingBalance: number; active: boolean; memo: string; sortOrder: number }
export interface ClientCategory { id: number; type: string; name: string; flow: string; icon: string; active: boolean; memo: string }
export interface ClientNamed { id: number; name: string; active: boolean }
export interface ClientMasters {
  accounts: ClientAccount[];
  categories: ClientCategory[];
  vendors: ClientNamed[];
  projects: ClientNamed[];
  settings: Record<string, string>;
}

export type EntryPrefill = Partial<TxView> & { direction?: Direction };

interface Toast { id: number; message: string; tone?: 'ok' | 'error' | 'info'; action?: { label: string; onClick: () => void } }
interface ConfirmOpts { title: string; body?: React.ReactNode; ok?: string; cancel?: string; danger?: boolean }

interface Ctx {
  masters: ClientMasters;
  toast: (message: string, opts?: Omit<Toast, 'id' | 'message'>) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  openEntry: (prefill?: EntryPrefill) => void;
  entry: EntryPrefill | null;
  closeEntry: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider 밖에서 useApp 을 썼습니다.');
  return c;
}

export function AppProvider({ masters, children }: { masters: ClientMasters; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [entry, setEntry] = useState<EntryPrefill | null>(null);
  const seq = useRef(0);

  const toast = useCallback<Ctx['toast']>((message, opts) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 6000 : 3000);
  }, []);

  const confirm = useCallback<Ctx['confirm']>((o) => new Promise((resolve) => setDialog({ ...o, resolve })), []);
  const closeDialog = (v: boolean) => { dialog?.resolve(v); setDialog(null); };

  const value = useMemo<Ctx>(() => ({
    masters, toast, confirm, entry,
    openEntry: (p) => setEntry(p ?? {}),
    closeEntry: () => setEntry(null),
  }), [masters, toast, confirm, entry]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDialog(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <AppCtx.Provider value={value}>
      {children}
      <datalist id="dl-vendors">{masters.vendors.filter((v) => v.active).map((v) => <option key={v.id} value={v.name} />)}</datalist>
      <datalist id="dl-projects">{masters.projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.name} />)}</datalist>

      <div className="fixed left-1/2 bottom-24 md:bottom-8 z-[70] flex flex-col gap-2 w-[min(92vw,420px)] -translate-x-1/2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`anim-toast pointer-events-auto rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 text-white ${t.tone === 'error' ? 'bg-[#c43030]' : 'bg-[#22262b]'}`}>
            <span className="flex-1">{t.tone === 'error' ? '⚠️ ' : t.tone === 'ok' ? '✅ ' : ''}{t.message}</span>
            {t.action && (
              <button className="font-bold text-[#7ee2a8] shrink-0 px-2 py-1" onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4 anim-fade" onClick={() => closeDialog(false)}>
          <div role="alertdialog" aria-modal="true" className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{dialog.title}</h2>
            {dialog.body && <div className="mt-2 text-ink-2">{dialog.body}</div>}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" onClick={() => closeDialog(false)}>{dialog.cancel ?? '취소'}</button>
              <button className={`btn ${dialog.danger ? 'bg-danger text-white' : 'btn-primary'}`} autoFocus onClick={() => closeDialog(true)}>{dialog.ok ?? '확인'}</button>
            </div>
          </div>
        </div>
      )}
    </AppCtx.Provider>
  );
}
