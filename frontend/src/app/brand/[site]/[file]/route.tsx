import { ImageResponse } from 'next/og';
import { getSiteById, SITE_IDS, type BrandTheme, type Site, type SiteId } from '@/lib/brands';
import { markGlyph, markSvg } from '@/lib/brand-mark';
import { PLANS } from '@/lib/plans';

/**
 * Favicon, íconos e imagen para compartir de cada sitio, generados en el build:
 * /brand/<sitio>/icon.svg, icon.png (32), apple-icon.png (180) y og.png (1200×630).
 */
const FILES = ['icon.svg', 'icon.png', 'apple-icon.png', 'og.png'] as const;
type BrandFile = (typeof FILES)[number];

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_IDS.flatMap((site) => FILES.map((file) => ({ site, file })));
}

const CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

export async function GET(_req: Request, { params }: { params: Promise<{ site: string; file: string }> }) {
  const { site: id, file } = await params;
  if (!SITE_IDS.includes(id as SiteId) || !FILES.includes(file as BrandFile)) {
    return new Response('Not found', { status: 404 });
  }
  const site = getSiteById(id as SiteId);

  switch (file as BrandFile) {
    case 'icon.svg':
      return new Response(markSvg(site.id), { headers: { 'content-type': 'image/svg+xml', 'cache-control': CACHE } });
    case 'icon.png':
      return new ImageResponse(<Mark site={site} size={32} radius={7} />, { width: 32, height: 32, headers: { 'cache-control': CACHE } });
    case 'apple-icon.png':
      // iOS recorta las esquinas: el fondo va a sangre.
      return new ImageResponse(<Mark site={site} size={180} radius={0} />, { width: 180, height: 180, headers: { 'cache-control': CACHE } });
    case 'og.png':
      return ogImage(site);
  }
}

function Glyph({ id, size, color, strokeWidth }: { id: SiteId; size: number; color: string; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {markGlyph(id).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

function Mark({ site, size, radius, ring }: { site: Site; size: number; radius: number; ring?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: site.theme.mark,
        borderRadius: radius,
        ...(ring ? { border: `2px solid ${ring}` } : {}),
      }}
    >
      <Glyph id={site.id} size={Math.round(size * 0.66)} color={site.theme.onMark} strokeWidth={2.2} />
    </div>
  );
}

const FONT_FAMILY: Record<BrandTheme['font'], string> = { fira: 'Fira Sans', inter: 'Inter', roboto: 'Roboto' };

/** TTF de Google Fonts con solo los caracteres de la imagen. Si falla, queda la fuente por defecto. */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`,
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Lo que dice la tarjeta al compartir el link: qué es, desde cuánto y qué incluye. */
function ogCopy(site: Site): { byline: string; title: string; lead: string; chips: string[] } {
  if (site.id === 'hub') {
    return {
      byline: 'Shalom · Olva · SUNAT',
      title: site.heroTitle,
      lead: 'Envíos y facturación electrónica para tu ecommerce en Perú. Un registro, un panel, pagos con Yape o Plin.',
      chips: ['Shalom API', 'Olva API', 'SUNAT API'],
    };
  }
  const from = Math.min(...PLANS[site.id].filter((p) => p.pricedPen > 0).map((p) => p.pricedPen));
  return {
    byline: "by Mathyu's Solutions",
    title: site.heroTitle,
    lead: `Prueba gratis. Planes desde S/ ${from} al mes, con Yape o Plin.`,
    chips: site.features.slice(0, 4).map((f) => f.title),
  };
}

async function ogImage(site: Site) {
  const t = site.theme;
  const copy = ogCopy(site);
  // Franja con el color insignia; en SUNAT es el mismo azul del fondo, así que va clara.
  const stripe = t.signature.toLowerCase() === t.dark.toLowerCase() ? t.tint : t.signature;
  const text = [site.name, copy.byline, copy.title, copy.lead, ...copy.chips].join('');
  const family = FONT_FAMILY[t.font];
  const [regular, bold] = await Promise.all([loadFont(family, 400, text), loadFont(family, 800, text)]);
  const fonts = [
    regular && { name: family, data: regular, weight: 400 as const, style: 'normal' as const },
    bold && { name: family, data: bold, weight: 800 as const, style: 'normal' as const },
  ].filter((f) => !!f);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          padding: '72px 80px 64px',
          background: `linear-gradient(135deg, ${t.dark} 0%, ${t.darker} 100%)`,
          color: '#FFFFFF',
          fontFamily: fonts.length ? family : undefined,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: stripe }} />
        <div style={{ position: 'absolute', right: -70, bottom: -90, display: 'flex', opacity: 0.1 }}>
          <Glyph id={site.id} size={560} color="#FFFFFF" strokeWidth={1.2} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* En la central, Olva y SUNAT el isotipo es del color del fondo: el borde lo despega. */}
          <Mark site={site} size={76} radius={18} ring="rgba(255,255,255,0.28)" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>{site.name}</span>
            <span style={{ fontSize: 22, color: t.onDarkMuted }}>{copy.byline}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 920 }}>
          <span style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{copy.title}</span>
          <span style={{ marginTop: 22, fontSize: 30, lineHeight: 1.35, color: t.onDarkMuted }}>{copy.lead}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 1000 }}>
          {copy.chips.map((c) => (
            <span
              key={c}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                fontSize: 22,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { 'cache-control': CACHE } },
  );
}
