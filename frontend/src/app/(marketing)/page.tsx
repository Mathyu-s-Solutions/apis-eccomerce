import { getBrand } from '@/lib/brand-server';
import { OlvaLanding } from '@/components/landing/olva-landing';
import { ShalomLanding } from '@/components/landing/shalom-landing';
import { SunatLanding } from '@/components/landing/sunat-landing';

export default async function LandingPage() {
  const brand = await getBrand();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

  switch (brand.id) {
    case 'shalom':
      return <ShalomLanding brand={brand} apiUrl={apiUrl} />;
    case 'olva':
      return <OlvaLanding brand={brand} apiUrl={apiUrl} />;
    case 'sunat':
      return <SunatLanding brand={brand} />;
  }
}
