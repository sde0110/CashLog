import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '캐시로그',
    short_name: '캐시로그',
    description: '1인 사업자 가계부 · 자금관리 장부',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f5f7',
    theme_color: '#00a04a',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
