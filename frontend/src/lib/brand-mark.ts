import { getSiteById, type SiteId } from './brands';

/**
 * Trazos del isotipo del header (íconos Boxes y Package de lucide, viewBox 24×24), para
 * dibujarlo fuera de React: favicon SVG, íconos PNG e imagen para compartir.
 */
const GLYPHS: Record<'hub' | 'brand', string[]> = {
  hub: [
    'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z',
    'm7 16.5-4.74-2.85',
    'm7 16.5 5-3',
    'M7 16.5v5.17',
    'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z',
    'm17 16.5-5-3',
    'm17 16.5 4.74-2.85',
    'M17 16.5v5.17',
    'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z',
    'M12 8 7.26 5.15',
    'm12 8 4.74-2.85',
    'M12 13.5V8',
  ],
  brand: [
    'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    'M12 22V12',
    'M3.29 7 12 12 20.71 7',
    'm7.5 4.27 9 5.15',
  ],
};

export function markGlyph(id: SiteId): string[] {
  return GLYPHS[id === 'hub' ? 'hub' : 'brand'];
}

/** Isotipo como SVG: el fondo y el trazo del `.brand-mark` del header. */
export function markSvg(id: SiteId): string {
  const { mark, onMark } = getSiteById(id).theme;
  const paths = markGlyph(id).map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${mark}"/>` +
    `<g transform="translate(5 5) scale(0.9167)" fill="none" stroke="${onMark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
    `</svg>`
  );
}
