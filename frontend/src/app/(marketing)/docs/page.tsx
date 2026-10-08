import type { Metadata } from 'next';
import { getBrand } from '@/lib/brand-server';
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
  const brand = await getBrand();
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
          Crea una API key en tu panel y envíala en cada petición. Cada key tiene su cuota mensual.
        </p>
        <div className="mt-4">
          <CodeBlock
            label="header"
            code={`x-api-key: sk_live_tu_api_key`}
          />
        </div>
        <div className="mt-4">
          <ButtonLink href="/dashboard/keys" size="sm">Crear mi API key</ButtonLink>
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
          Si agotas tu cuota recibes <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">429</code>; si la key es inválida, <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-sm">401</code>.
        </p>
      </section>
    </div>
  );
}
