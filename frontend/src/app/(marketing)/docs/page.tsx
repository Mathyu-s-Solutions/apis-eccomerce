import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getSite } from '@/lib/brand-server';
import { BRAND_IDS, BRANDS } from '@/lib/brands';
import { panelHref, siteHref } from '@/lib/urls';
import { Card, Badge } from '@/components/ui/primitives';
import { CodeBlock } from '@/components/ui/code-block';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Documentación' };

const methodTone: Record<string, string> = {
  GET: 'bg-green-100 text-green-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default async function DocsPage() {
  const site = await getSite();
  // Sitio central: cada API tiene su documentación en su landing.
  if (site.id === 'hub') return <DocsIndex />;
  const brand = site;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight">Documentación de {brand.name}</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        API REST. Todas las rutas van bajo <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">{apiUrl}{brand.apiPrefix}</code> y
        requieren tu API key en el header <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">x-api-key</code>.
      </p>

      {/* Auth */}
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Autenticación</h2>
        <p className="mt-2 text-[var(--muted)]">
          Crea una API key de {brand.product} (o una de todas las APIs) en tu panel y envíala en cada petición.
          La cuota es la de tu plan de {brand.product}: la comparten todas tus keys.
        </p>
        <div className="mt-4">
          <CodeBlock
            label="header"
            code={`x-api-key: sk_live_tu_api_key`}
          />
        </div>
        <div className="mt-4">
          <ButtonLink href={panelHref(`/dashboard/keys?product=${brand.id}`)} size="sm">Crear mi API key</ButtonLink>
        </div>
      </section>

      {/* Quickstart */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Inicio rápido</h2>
        <div className="mt-4 space-y-5">
          {brand.quickstart.map((q) => (
            <div key={q.label}>
              <p className="mb-2 text-sm font-medium">{q.label}</p>
              <CodeBlock code={q.code} />
            </div>
          ))}
        </div>
      </section>

      {/* Endpoints */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Endpoints</h2>
        <div className="mt-5 space-y-8">
          {brand.docs.map((section) => (
            <div key={section.title}>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <p className="text-sm text-[var(--muted)]">{section.description}</p>
              <Card className="mt-3 divide-y divide-[var(--border)]">
                {section.endpoints.map((e) => (
                  <div key={e.method + e.path} className="flex items-center gap-4 p-4">
                    <span className={`inline-flex w-16 justify-center rounded-md px-2 py-1 text-xs font-bold ${methodTone[e.method]}`}>
                      {e.method}
                    </span>
                    <code className="flex-1 text-sm">{brand.apiPrefix}{e.path}</code>
                    <span className="hidden text-sm text-[var(--muted)] sm:block">{e.summary}</span>
                    {e.cost && <Badge tone={e.cost === 'gratis' ? 'success' : 'accent'}>{e.cost}</Badge>}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Respuestas y errores</h2>
        <p className="mt-2 text-[var(--muted)]">
          Las respuestas son JSON. Los errores devuelven un código HTTP y un cuerpo con <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">message</code>.
          Si agotas la cuota de tu plan recibes <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">429</code>; si la key es inválida, <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">401</code>;
          si la key es de otra API, <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">403</code>.
        </p>
      </section>
    </div>
  );
}

function DocsIndex() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight">Documentación</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Todas las APIs usan la misma cuenta y el mismo header <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">x-api-key</code>. Elige una:
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {BRAND_IDS.map((id) => (
          <Link key={id} href={siteHref(id, '/docs')} className="group">
            <Card className="h-full p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
              <span className="block h-1.5 w-10 rounded-full" style={{ background: BRANDS[id].theme.signature }} />
              <h2 className="mt-4 text-lg font-semibold">{BRANDS[id].name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{BRANDS[id].tagline}</p>
              <code className="mt-4 block text-xs text-[var(--muted)]">{BRANDS[id].apiPrefix}</code>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
                Ver documentación <ArrowRight size={14} />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
