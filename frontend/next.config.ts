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
