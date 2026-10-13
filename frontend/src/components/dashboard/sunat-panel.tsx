'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, FileText, Loader2, Plus, Search, ShieldCheck, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, Input, Label } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

interface Company {
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  telefono: string | null;
  email: string | null;
  ambiente: 'beta' | 'produccion';
  sol_usuario: string | null;
  tiene_sol_clave: boolean;
  certificado: { titular: string; emisor: string; valido_desde: string; valido_hasta: string; vencido: boolean } | null;
  api_client_id: string | null;
  tiene_api_client_secret: boolean;
  tiene_logo: boolean;
  listo_para_produccion: boolean;
  faltantes_para_produccion: string[];
}

interface Doc {
  documento: string;
  serie: string;
  numero: number;
  fecha_de_emision: string;
  cliente_denominacion: string | null;
  moneda: string | null;
  total: string | null;
  estado: 'ACEPTADO' | 'PENDIENTE' | 'RECHAZADO' | 'ANULADO';
  xml: string;
  cdr: string | null;
  pdf?: { a4: string; ticket?: string };
  sunat: { codigo: string | null; descripcion: string | null; observaciones: string[] };
}

const DOC_LABEL: Record<string, string> = {
  factura: 'Factura',
  boleta: 'Boleta',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  guia_remision_remitente: 'Guía remitente',
  guia_remision_transportista: 'Guía transportista',
  resumen_diario: 'Resumen diario',
  comunicacion_baja: 'Baja',
};
const STATE_TONE = { ACEPTADO: 'success', PENDIENTE: 'warning', RECHAZADO: 'danger', ANULADO: 'neutral' } as const;

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/sunat/${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields = data?.payload && typeof data.payload === 'object' ? Object.values(data.payload as Record<string, string[]>).flat() : [];
    throw new Error([data?.message ?? 'No se pudo completar la operación', ...fields.filter((f) => typeof f === 'string' && f !== data?.message)].join(' · '));
  }
  return data as T;
}

/** Archivo → base64 (o texto, si es un PEM). */
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const pem = /\.(pem|crt|key)$/i.test(file.name);
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(pem ? result : result.replace(/^data:[^,]*,/, ''));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    if (pem) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function SunatPanel() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (select?: string) => {
    try {
      const data = await api<{ companies: Company[] }>('companies');
      setCompanies(data.companies);
      setLoadError(null);
      setSelected((current) => select ?? (current && current !== 'new' && data.companies.some((c) => c.ruc === current) ? current : (data.companies[0]?.ruc ?? 'new')));
    } catch (e) {
      setLoadError((e as Error).message);
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (companies === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} className="animate-spin" /> Cargando tus empresas…
      </div>
    );
  }
  if (loadError) return <Alert tone="error">{loadError}</Alert>;

  const company = companies.find((c) => c.ruc === selected) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {companies.map((c) => (
          <button
            key={c.ruc}
            onClick={() => setSelected(c.ruc)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-sm transition-colors',
              c.ruc === selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-white hover:bg-[var(--surface)]',
            )}
          >
            <Building2 size={16} />
            <span className="flex flex-col">
              <span className="font-medium">{c.nombre_comercial || c.razon_social}</span>
              <span className="text-xs text-[var(--muted)]">
                {c.ruc} · {c.ambiente === 'produccion' ? 'Producción' : 'Beta'}
              </span>
            </span>
          </button>
        ))}
        <Button variant={selected === 'new' ? 'primary' : 'outline'} size="sm" onClick={() => setSelected('new')}>
          <Plus size={15} /> Nueva empresa
        </Button>
      </div>

      {selected === 'new' && <NewCompany onCreated={(ruc) => load(ruc)} first={companies.length === 0} />}
      {company && <CompanyView key={company.ruc} company={company} onChanged={() => load(company.ruc)} onDeleted={() => load()} />}
    </div>
  );
}

// ------------------------------------------------------------------ alta

function NewCompany({ onCreated, first }: { onCreated: (ruc: string) => void; first: boolean }) {
  const [form, setForm] = useState({ ruc: '', razon_social: '', nombre_comercial: '', direccion: '', ubigeo: '' });
  const [busy, setBusy] = useState<'lookup' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function lookup() {
    setError(null);
    setFound(null);
    setBusy('lookup');
    try {
      const t = await api<{ razon_social: string; direccion: string | null; ubigeo: string | null; estado: string; condicion: string }>(`ruc/${form.ruc.trim()}`);
      setForm((f) => ({ ...f, razon_social: t.razon_social, direccion: t.direccion ?? f.direccion, ubigeo: t.ubigeo ?? f.ubigeo }));
      setFound(`${t.estado} · ${t.condicion}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('save');
    try {
      await api('companies', {
        method: 'POST',
        body: { ruc: form.ruc.trim(), razon_social: form.razon_social, nombre_comercial: form.nombre_comercial || null, direccion: form.direccion, ubigeo: form.ubigeo || null },
      });
      onCreated(form.ruc.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{first ? 'Registra tu empresa emisora' : 'Nueva empresa'}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Queda en <strong>beta</strong>: ya puedes emitir contra SUNAT beta (sin validez tributaria y sin gastar cuota). Para comprobantes reales, después cargas tu clave SOL y tu certificado.
      </p>
      <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="ruc">RUC</Label>
          <div className="flex gap-2">
            <Input id="ruc" inputMode="numeric" maxLength={11} placeholder="20123456789" value={form.ruc} onChange={set('ruc')} required />
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={lookup} disabled={form.ruc.trim().length !== 11 || busy !== null}>
              {busy === 'lookup' ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar en SUNAT
            </Button>
          </div>
          {found && <p className="mt-1.5 text-xs text-green-700">Encontrado en el padrón de SUNAT: {found}</p>}
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="razon">Razón social</Label>
          <Input id="razon" value={form.razon_social} onChange={set('razon_social')} required />
        </div>
        <div>
          <Label htmlFor="comercial">Nombre comercial (opcional)</Label>
          <Input id="comercial" value={form.nombre_comercial} onChange={set('nombre_comercial')} />
        </div>
        <div>
          <Label htmlFor="ubigeo">Ubigeo</Label>
          <Input id="ubigeo" inputMode="numeric" maxLength={6} placeholder="150101" value={form.ubigeo} onChange={set('ubigeo')} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="direccion">Dirección fiscal</Label>
          <Input id="direccion" value={form.direccion} onChange={set('direccion')} required />
        </div>
        {error && (
          <div className="md:col-span-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy !== null}>
            {busy === 'save' && <Loader2 size={15} className="animate-spin" />} Registrar empresa
          </Button>
        </div>
      </form>
    </Card>
  );
}

// --------------------------------------------------------------- empresa

function CompanyView({ company, onChanged, onDeleted }: { company: Company; onChanged: () => void; onDeleted: () => void }) {
  const [docsVersion, setDocsVersion] = useState(0);
  const production = company.ambiente === 'produccion';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{company.razon_social}</h2>
            <p className="text-sm text-[var(--muted)]">
              RUC {company.ruc} · {company.direccion}
              {company.distrito ? `, ${company.distrito}` : ''}
            </p>
          </div>
          <Badge tone={production ? 'success' : 'warning'}>{production ? 'Producción: comprobantes reales' : 'Beta: pruebas sin validez'}</Badge>
        </div>
        <Environment company={company} onChanged={onChanged} />
      </Card>

      <Credentials company={company} onChanged={onChanged} />

      {!production && <TestEmission ruc={company.ruc} onDone={() => setDocsVersion((v) => v + 1)} />}

      <Documents ruc={company.ruc} version={docsVersion} />

      <DangerZone company={company} onDeleted={onDeleted} />
    </div>
  );
}

function Environment({ company, onChanged }: { company: Company; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const production = company.ambiente === 'produccion';

  async function switchTo(ambiente: 'beta' | 'produccion') {
    if (ambiente === 'produccion' && !confirm('Desde ahora los comprobantes de esta empresa se envían a SUNAT de verdad y cuentan en tu plan. ¿Pasar a producción?')) return;
    setBusy(true);
    setError(null);
    try {
      await api('companies', { method: 'POST', body: { ruc: company.ruc, ambiente } });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-5">
      {production ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">Los comprobantes se envían a SUNAT con tu usuario SOL y tu certificado.</p>
          <Button variant="outline" size="sm" onClick={() => switchTo('beta')} disabled={busy}>
            Volver a beta
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {company.listo_para_produccion ? (
            <p className="text-sm text-green-700">Tienes todo para emitir comprobantes reales.</p>
          ) : (
            <div className="text-sm">
              <p className="font-medium">Para pasar a producción falta:</p>
              <ul className="mt-1 list-inside list-disc text-[var(--muted)]">
                {company.faltantes_para_produccion.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <Button size="sm" onClick={() => switchTo('produccion')} disabled={busy || !company.listo_para_produccion}>
            {busy && <Loader2 size={15} className="animate-spin" />} Pasar a producción
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', ok ? 'text-green-700' : 'text-[var(--muted)]')}>
      {ok ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
      {children}
    </span>
  );
}

function Credentials({ company, onChanged }: { company: Company; onChanged: () => void }) {
  const [sol, setSol] = useState({ user: company.sol_usuario ?? '', password: '' });
  const [cert, setCert] = useState<{ file: File | null; password: string }>({ file: null, password: '' });
  const [apiCred, setApiCred] = useState({ id: company.api_client_id ?? '', secret: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function save(section: string, body: Record<string, unknown>) {
    setBusy(section);
    setMsg(null);
    try {
      await api('companies', { method: 'POST', body: { ruc: company.ruc, ...body } });
      setMsg({ tone: 'success', text: 'Guardado. Las credenciales se guardan cifradas y no se vuelven a mostrar.' });
      onChanged();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} />
        <h3 className="font-semibold">Credenciales de SUNAT</h3>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">Se guardan cifradas. Las necesitas para producción; en beta no hacen falta.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save('sol', { sol_usuario: sol.user, ...(sol.password ? { sol_clave: sol.password } : {}) });
          }}
        >
          <p className="text-sm font-medium">Usuario secundario SOL</p>
          <Status ok={!!company.sol_usuario && company.tiene_sol_clave}>{company.tiene_sol_clave ? `Cargado (${company.sol_usuario})` : 'Falta'}</Status>
          <Input placeholder="Usuario (p. ej. FACTURA1)" value={sol.user} onChange={(e) => setSol({ ...sol, user: e.target.value })} required />
          <Input type="password" placeholder={company.tiene_sol_clave ? 'Clave (déjala vacía para no cambiarla)' : 'Clave SOL'} value={sol.password} onChange={(e) => setSol({ ...sol, password: e.target.value })} autoComplete="new-password" />
          <Button size="sm" type="submit" disabled={busy !== null}>
            {busy === 'sol' && <Loader2 size={15} className="animate-spin" />} Guardar usuario SOL
          </Button>
        </form>

        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cert.file) return;
            try {
              const content = await readFile(cert.file);
              await save('cert', { certificado: content, certificado_clave: cert.password });
              setCert({ file: null, password: '' });
            } catch (err) {
              setMsg({ tone: 'error', text: (err as Error).message });
            }
          }}
        >
          <p className="text-sm font-medium">Certificado digital</p>
          {company.certificado ? (
            <Status ok={!company.certificado.vencido}>
              {company.certificado.vencido ? 'Vencido el' : 'Vigente hasta el'} {dmy(company.certificado.valido_hasta)}
            </Status>
          ) : (
            <Status ok={false}>Falta (.pfx o .p12)</Status>
          )}
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-white px-3.5 text-sm hover:bg-[var(--surface)]">
            <Upload size={15} className="shrink-0" />
            <span className={cn('truncate', !cert.file && 'text-[var(--muted)]')}>{cert.file ? cert.file.name : 'Elegir archivo .pfx o .p12'}</span>
            <input type="file" accept=".pfx,.p12,.pem" className="sr-only" onChange={(e) => setCert({ ...cert, file: e.target.files?.[0] ?? null })} />
          </label>
          <Input type="password" placeholder="Clave del certificado" value={cert.password} onChange={(e) => setCert({ ...cert, password: e.target.value })} autoComplete="new-password" />
          <Button size="sm" type="submit" disabled={busy !== null || !cert.file}>
            {busy === 'cert' && <Loader2 size={15} className="animate-spin" />} Subir certificado
          </Button>
        </form>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save('api', { api_client_id: apiCred.id, ...(apiCred.secret ? { api_client_secret: apiCred.secret } : {}) });
          }}
        >
          <p className="text-sm font-medium">Credenciales de API</p>
          <Status ok={!!company.api_client_id && company.tiene_api_client_secret}>
            {company.tiene_api_client_secret ? 'Cargadas' : 'Opcional: guías, SIRE y validez'}
          </Status>
          <Input placeholder="client_id" value={apiCred.id} onChange={(e) => setApiCred({ ...apiCred, id: e.target.value })} required />
          <Input type="password" placeholder={company.tiene_api_client_secret ? 'client_secret (vacío = no cambiar)' : 'client_secret'} value={apiCred.secret} onChange={(e) => setApiCred({ ...apiCred, secret: e.target.value })} autoComplete="new-password" />
          <Button size="sm" type="submit" disabled={busy !== null}>
            {busy === 'api' && <Loader2 size={15} className="animate-spin" />} Guardar credenciales
          </Button>
        </form>
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        Las credenciales de API se generan en SUNAT Operaciones en Línea → Empresas → Credenciales de API SUNAT. El usuario secundario SOL necesita el perfil de emisión electrónica.
      </p>
      {msg && (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}

function TestEmission({ ruc, onDone }: { ruc: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; payload: { estado: string; serie: string; numero: number; pdf?: { a4: string; ticket?: string }; xml: string; cdr: string | null } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api(`companies/${ruc}/test`, { method: 'POST' }));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Prueba el flujo completo</h3>
          <p className="text-sm text-[var(--muted)]">Emite una boleta de prueba en SUNAT beta (serie B999) y mira el PDF, el XML firmado y la respuesta de SUNAT.</p>
        </div>
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Emitir boleta de prueba
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {result && (
        <div className="mt-4">
          <Alert tone={result.payload.estado === 'ACEPTADO' ? 'success' : 'error'}>
            <p className="font-medium">
              Boleta {result.payload.serie}-{result.payload.numero}: {result.message}
            </p>
            <p className="mt-1 flex flex-wrap gap-3">
              {result.payload.pdf?.a4 && <FileLink href={result.payload.pdf.a4}>PDF A4</FileLink>}
              {result.payload.pdf?.ticket && <FileLink href={result.payload.pdf.ticket}>Ticket</FileLink>}
              <FileLink href={result.payload.xml}>XML</FileLink>
              {result.payload.cdr && <FileLink href={result.payload.cdr}>CDR</FileLink>}
            </p>
          </Alert>
        </div>
      )}
    </Card>
  );
}

function FileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline">
      {children} <ExternalLink size={13} />
    </a>
  );
}

function Documents({ ruc, version }: { ruc: string; version: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ paginate: { page: number; total_pages: number; total_items: number }; items: Doc[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ paginate: { page: number; total_pages: number; total_items: number }; items: Doc[] }>(`companies/${ruc}/documents`.concat(`?per_page=15&page=${page}`))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [ruc, page, version]);

  return (
    <Card className="p-6">
      <h3 className="font-semibold">Comprobantes</h3>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Cargando…</p>
      ) : data.items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Todavía no emites comprobantes con esta empresa (en este ambiente).</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-[var(--border)] sm:hidden">
            {data.items.map((d) => (
              <li key={`${d.documento}-${d.serie}-${d.numero}`} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {DOC_LABEL[d.documento] ?? d.documento} <span className="font-mono text-xs text-[var(--muted)]">{d.serie}-{d.numero}</span>
                    </p>
                    <p className="truncate text-[var(--muted)]">
                      {dmy(d.fecha_de_emision)}
                      {d.cliente_denominacion ? ` · ${d.cliente_denominacion}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATE_TONE[d.estado]}>{d.estado}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {d.total && <span className="font-mono">{d.moneda === 'USD' ? '$' : 'S/'} {d.total}</span>}
                  {d.pdf?.a4 && <FileLink href={d.pdf.a4}>PDF</FileLink>}
                  <FileLink href={d.xml}>XML</FileLink>
                  {d.cdr && <FileLink href={d.cdr}>CDR</FileLink>}
                </div>
                {d.estado === 'RECHAZADO' && d.sunat.descripcion && <p className="mt-1 text-xs text-red-700">{d.sunat.descripcion}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Comprobante</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Archivos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.items.map((d) => (
                  <tr key={`${d.documento}-${d.serie}-${d.numero}`} className="align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{DOC_LABEL[d.documento] ?? d.documento}</span>
                      <span className="block font-mono text-xs text-[var(--muted)]">
                        {d.serie}-{d.numero}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">{dmy(d.fecha_de_emision)}</td>
                    <td className="max-w-[200px] truncate py-2.5 pr-3">{d.cliente_denominacion ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{d.total ? `${d.moneda === 'USD' ? '$' : 'S/'} ${d.total}` : '—'}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={STATE_TONE[d.estado]}>{d.estado}</Badge>
                      {d.estado === 'RECHAZADO' && d.sunat.descripcion && <span className="mt-1 block max-w-[220px] text-xs text-red-700">{d.sunat.descripcion}</span>}
                    </td>
                    <td className="py-2.5">
                      <span className="flex flex-wrap gap-2">
                        {d.pdf?.a4 && <FileLink href={d.pdf.a4}>PDF</FileLink>}
                        <FileLink href={d.xml}>XML</FileLink>
                        {d.cdr && <FileLink href={d.cdr}>CDR</FileLink>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.paginate.total_pages > 1 && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-[var(--muted)]">
                Página {data.paginate.page} de {data.paginate.total_pages} · {data.paginate.total_items} en total
              </span>
              <Button size="sm" variant="outline" disabled={page >= data.paginate.total_pages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function DangerZone({ company, onDeleted }: { company: Company; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`¿Borrar la empresa ${company.ruc}? Se borran también sus comprobantes de prueba.`)) return;
    setError(null);
    try {
      await api(`companies/${company.ruc}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border)] p-4">
      <p className="text-sm text-[var(--muted)]">Una empresa con comprobantes de producción no se puede borrar.</p>
      <Button variant="ghost" size="sm" onClick={remove} className="text-red-600">
        <Trash2 size={15} /> Borrar empresa
      </Button>
      {error && (
        <div className="w-full">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
