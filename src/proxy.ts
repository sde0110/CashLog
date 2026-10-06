import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/session';

/** 로그인하지 않은 요청은 /login 으로 보낸다. (서버 액션·API 는 각자 한 번 더 확인한다) */
export async function proxy(request: NextRequest) {
  const ok = await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const url = new URL('/login', request.url);
  if (request.nextUrl.pathname !== '/') url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)'],
};
