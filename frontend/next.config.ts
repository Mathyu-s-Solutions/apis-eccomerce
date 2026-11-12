import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // App multi-marca por dominio + sesión por cookie: el render es dinámico por
  // naturaleza, así que no usamos Cache Components (prerender estricto).
  cacheComponents: false,
  // Las guías (content/guias/*.md) se leen del disco en cada página: que viajen con el deploy.
  outputFileTracingIncludes: {
    '/': ['./content/guias/**/*.md'],
    '/**': ['./content/guias/**/*.md'],
  },
  // La API se publica en el dominio del panel (https://apis.mathyusolutions.com/v1/...):
  // /v1/* se reenvía al backend en Cloud Run. Ver src/lib/api-url.ts.
  async rewrites() {
    const trim = (url?: string) => (url ?? '').replace(/\/+$/, '');
    const backend = trim(process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL);
    // Sin backend, o si apunta al propio panel, reenviar sería un bucle.
    if (!backend || backend === trim(process.env.NEXT_PUBLIC_PANEL_URL)) return [];
    return [{ source: '/v1/:path*', destination: `${backend}/v1/:path*` }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
