import type { CSSProperties } from 'react';
import type { BrandTheme } from './brands';

/** Paleta de un sitio como variables CSS (las usan Tailwind y los componentes). */
export function themeVars(t: BrandTheme): CSSProperties {
  return {
    '--font-brand': `var(--font-${t.font})`,
    '--foreground': t.foreground,
    '--muted': t.muted,
    '--primary': t.primary,
    '--primary-hover': t.primaryHover,
    '--on-primary': t.onPrimary,
    '--accent': t.accent,
    '--accent-soft': t.accentSoft,
    '--signature': t.signature,
    '--on-signature': t.onSignature,
    '--mark': t.mark,
    '--on-mark': t.onMark,
    '--header': t.header,
    '--on-header': t.onHeader,
    '--dark': t.dark,
    '--darker': t.darker,
    '--on-dark-muted': t.onDarkMuted,
    '--tint': t.tint,
    '--section': t.section,
  } as CSSProperties;
}
