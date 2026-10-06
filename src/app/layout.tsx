import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '캐시로그', template: '%s · 캐시로그' },
  description: '1인 사업자 가계부 · 자금관리 장부',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: '캐시로그', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1114' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
