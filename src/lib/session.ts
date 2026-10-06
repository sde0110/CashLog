/**
 * 단일 비밀번호 로그인 세션 — 서명된 쿠키 (Web Crypto, proxy·서버 공용).
 * 쿠키 값: "<만료시각(ms)>.<HMAC-SHA256 서명>"
 */
export const SESSION_COOKIE = 'cl_session';
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경변수가 없습니다.');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Buffer.from(sig).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 서명에 현재 비밀번호를 섞는다 — 비밀번호를 바꾸면 그동안의 로그인이 모두 풀린다 */
const signed = (payload: string) => hmac(`session:${payload}:${process.env.APP_PASSWORD ?? ''}`);

export async function createSessionValue(): Promise<{ value: string; expires: Date }> {
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const payload = String(expires.getTime());
  return { value: `${payload}.${await signed(payload)}`, expires };
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [payload, sig] = value.split('.');
  if (!payload || !sig || Number(payload) < Date.now()) return false;
  try {
    return safeEqual(sig, await signed(payload));
  } catch {
    return false;
  }
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // 길이 차이로 정보가 새지 않도록 서명끼리 비교한다
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${expected}`));
}
