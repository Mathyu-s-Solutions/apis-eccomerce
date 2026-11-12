import type { Metadata } from 'next';
import { getSite } from '@/lib/brand-server';
import { HUB, type Site } from '@/lib/brands';
import { PLANS } from '@/lib/plans';
import { jsonLd, pageMetadata, requestOrigin } from '@/lib/seo';
import { HubLanding } from '@/components/landing/hub-landing';
import { OlvaLanding } from '@/components/landing/olva-landing';
import { ShalomLanding } from '@/components/landing/shalom-landing';
import { SunatLanding } from '@/components/landing/sunat-landing';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return pageMetadata(site, { description: site.heroSubtitle, path: '/' });
}

/** Datos estructurados para buscadores: quién lo ofrece y, en cada API, sus planes. */
function structuredData(site: Site, origin: string) {
  const organization = { '@type': 'Organization', name: "Mathyu's Solutions", url: origin, logo: `${origin}/brand/hub/apple-icon.png` };
  if (site.id === 'hub') {
    return {
      '@context': 'https://schema.org',
      '@graph': [organization, { '@type': 'WebSite', name: HUB.name, url: origin, inLanguage: 'es-PE', description: HUB.heroSubtitle }],
    };
  }
  const paid = PLANS[site.id].filter((p) => p.pricedPen > 0).map((p) => p.pricedPen);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: site.name,
    description: site.heroSubtitle,
    url: origin,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    inLanguage: 'es-PE',
    image: `${origin}/brand/${site.id}/og.png`,
    publisher: organization,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'PEN',
      lowPrice: 0,
      highPrice: Math.max(...paid),
      offerCount: PLANS[site.id].length,
    },
  };
}

export default async function LandingPage() {
  const [site, origin] = await Promise.all([getSite(), requestOrigin()]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(site, origin)) }} />
      {site.id === 'hub' && <HubLanding />}
      {site.id === 'shalom' && <ShalomLanding brand={site} apiUrl={apiUrl} />}
      {site.id === 'olva' && <OlvaLanding brand={site} apiUrl={apiUrl} />}
      {site.id === 'sunat' && <SunatLanding brand={site} />}
    </>
  );
}
