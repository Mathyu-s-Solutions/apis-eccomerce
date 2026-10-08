import { getSite } from '@/lib/brand-server';
import { HubLanding } from '@/components/landing/hub-landing';
import { OlvaLanding } from '@/components/landing/olva-landing';
import { ShalomLanding } from '@/components/landing/shalom-landing';
import { SunatLanding } from '@/components/landing/sunat-landing';

export default async function LandingPage() {
  const site = await getSite();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

  switch (site.id) {
    case 'hub':
      return <HubLanding />;
    case 'shalom':
      return <ShalomLanding brand={site} apiUrl={apiUrl} />;
    case 'olva':
      return <OlvaLanding brand={site} apiUrl={apiUrl} />;
    case 'sunat':
      return <SunatLanding brand={site} />;
  }
}
