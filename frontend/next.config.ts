import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // App multi-marca por dominio + sesión por cookie: el render es dinámico por
  // naturaleza, así que no usamos Cache Components (prerender estricto).
  cacheComponents: false,
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
