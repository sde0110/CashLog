'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-3">
      <p className="text-4xl">😥</p>
      <h2 className="text-xl font-bold">화면을 불러오지 못했습니다</h2>
      <p className="text-muted">인터넷 연결을 확인한 뒤 다시 시도해 주세요. 계속되면 잠시 후 다시 열어 주세요.</p>
      {error.digest && <p className="text-xs text-muted">오류 코드: {error.digest}</p>}
      <button className="btn btn-primary" onClick={reset}>다시 시도</button>
    </div>
  );
}
