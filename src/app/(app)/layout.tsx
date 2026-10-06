import { getMasters } from '@/server/data';
import { AppProvider, type ClientMasters } from '@/components/app-context';
import { EntrySheet } from '@/components/entry-sheet';
import { Nav, Fab } from '@/components/nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const m = await getMasters();

  const masters: ClientMasters = {
    accounts: m.accounts.map(({ id, name, kind, institution, linkedAccountId, openingBalance, active, memo, sortOrder }) =>
      ({ id, name, kind, institution, linkedAccountId, openingBalance, active, memo, sortOrder })),
    categories: m.categories.map(({ id, type, name, flow, icon, active, memo }) => ({ id, type, name, flow, icon, active, memo })),
    vendors: m.vendors.map(({ id, name, active, bizNo }) => ({ id, name, active, bizNo })),
    projects: m.projects.map(({ id, name, active }) => ({ id, name, active })),
    settings: m.settings,
  };

  return (
    <AppProvider masters={masters}>
      <div className="md:pl-60">
        <Nav businessName={m.settings.business_name} />
        <main className="mx-auto max-w-5xl px-4 pt-4 pb-32 md:px-8 md:pt-8 md:pb-16">{children}</main>
      </div>
      <Fab />
      <EntrySheet />
    </AppProvider>
  );
}
