export default function Loading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="불러오는 중">
      <div className="h-9 w-48 rounded-xl bg-line/70" />
      <div className="card h-48" />
      <div className="card h-24" />
      <div className="card h-64" />
    </div>
  );
}
