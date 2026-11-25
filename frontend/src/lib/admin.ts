import 'server-only';
import { cache } from 'react';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { getCurrentUser, isAdminEmail, type CurrentUser } from './current-user';
import { currentPeriod } from './period';
import {
  freePlan,
  getPlan,
  groupByBundle,
  isProduct,
  PRODUCT_NAME,
  PRODUCTS,
  purchaseOf,
  type PaymentItem,
  type Product,
} from './plans';
import { grantPlans, paymentItems, paymentLabel } from './subscriptions';
import { upgradeQuote, upgradeTotal } from './upgrade';

/**
 * Datos del panel de admin. Las páginas son del servidor y leen de aquí; las
 * acciones van a /api/admin/*. Todo lo que llega a un componente de cliente va
 * con fechas en ISO (string).
 */

const DAY_MS = 86_400_000;
const LIMA_OFFSET_MS = 5 * 3_600_000;

/** El admin, o null. Para las rutas de /api/admin. */
export async function getAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export const forbidden = () => NextResponse.json({ message: 'Prohibido' }, { status: 403 });

/** Choque de unicidad (p. ej. el cliente se registró con ese correo justo ahora). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Corta si quien pide no es admin. Lo llama cada lectura de este módulo: el layout
 * de /admin no protege las páginas (se renderizan en paralelo y su resultado
 * viajaría igual en el payload RSC), así que el chequeo va junto a los datos.
 */
async function assertAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.isAdmin) redirect('/dashboard');
}

// ---------- Tipos que ven las páginas ----------

export interface SubView {
  product: Product;
  plan: string;
  planName: string;
  monthlyLimit: number | null;
  expiresAt: string | null;
  active: boolean;
  /** Un plan de pago (no el de prueba con una cuota a medida). */
  paid: boolean;
}

export type ClientStatus = 'paid' | 'lapsed' | 'trial';

export interface ClientRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  note: string | null;
  createdAt: string;
  isAdmin: boolean;
  subs: SubView[];
  /** Consumo del mes por API. */
  used: Partial<Record<Product, number>>;
  /** APIs a las que llegan sus keys activas. */
  keyProducts: Product[];
  activeKeys: number;
  status: ClientStatus;
  /** El vencimiento más próximo de sus planes de pago vigentes. */
  nextExpiry: string | null;
  pendingPayments: number;
  /** Total de sus pagos aprobados, en soles. */
  paidTotal: number;
}

export interface PaymentView {
  id: string;
  label: string;
  items: PaymentItem[];
  amountPen: number;
  method: string;
  operationCode: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  proof: 'image' | 'pdf' | null;
  user: { id: string; email: string; name: string | null };
}

// ---------- Planes ----------

function subView(s: { product: string; plan: string; monthlyLimit: number | null; expiresAt: Date | null }, now: Date): SubView | null {
  if (!isProduct(s.product)) return null;
  const plan = getPlan(s.product, s.plan);
  return {
    product: s.product,
    plan: s.plan,
    planName: plan?.name ?? s.plan.charAt(0).toUpperCase() + s.plan.slice(1),
    monthlyLimit: s.monthlyLimit,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    active: !s.expiresAt || s.expiresAt > now,
    paid: s.plan !== 'free',
  };
}

/** Precio de un mes de lo que tiene vigente (un pack completo cuesta lo del pack). Sin los planes sin vencimiento. */
function monthlyValue(subs: SubView[]): number {
  const renewing = subs.filter((s) => s.active && s.paid && s.expiresAt);
  return groupByBundle(renewing).reduce(
    (sum, g) => sum + (g.bundle ? g.bundle.pricedPen : (getPlan(g.subs[0].product, g.subs[0].plan)?.pricedPen ?? 0)),
    0,
  );
}

// ---------- Clientes ----------

const clientSelect = (now: Date) =>
  ({
    id: true,
    email: true,
    name: true,
    role: true,
    createdAt: true,
    profile: { select: { phone: true, note: true } },
    subscriptions: { select: { product: true, plan: true, monthlyLimit: true, expiresAt: true } },
    apiKeys: { where: { enabled: true }, select: { product: true } },
    planUsage: { where: { period: currentPeriod(now) }, select: { product: true, used: true } },
    payments: { select: { status: true, amountPen: true } },
  }) satisfies Prisma.UserSelect;

type ClientRecord = Prisma.UserGetPayload<{ select: ReturnType<typeof clientSelect> }>;

function clientRow(u: ClientRecord, now: Date): ClientRow {
  const subs = u.subscriptions.map((s) => subView(s, now)).filter((s): s is SubView => s !== null);
  subs.sort((a, b) => PRODUCTS.indexOf(a.product) - PRODUCTS.indexOf(b.product));
  const activePaid = subs.filter((s) => s.paid && s.active);
  const status: ClientStatus = activePaid.length ? 'paid' : subs.some((s) => s.paid) ? 'lapsed' : 'trial';
  const expiries = activePaid.flatMap((s) => (s.expiresAt ? [s.expiresAt] : [])).sort();
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.profile?.phone ?? null,
    note: u.profile?.note ?? null,
    createdAt: u.createdAt.toISOString(),
    isAdmin: u.role === 'admin' || isAdminEmail(u.email),
    subs,
    used: Object.fromEntries(u.planUsage.filter((x) => isProduct(x.product)).map((x) => [x.product, x.used])),
    keyProducts: PRODUCTS.filter((p) => u.apiKeys.some((k) => k.product === p || k.product === 'all')),
    activeKeys: u.apiKeys.length,
    status,
    nextExpiry: expiries[0] ?? null,
    pendingPayments: u.payments.filter((p) => p.status === 'pending').length,
    paidTotal: u.payments.filter((p) => p.status === 'approved').reduce((sum, p) => sum + p.amountPen, 0),
  };
}

/** Todos los clientes, de más nuevo a más antiguo. */
export async function listClients(now = new Date()): Promise<ClientRow[]> {
  await assertAdmin();
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 2000, select: clientSelect(now) });
  return users.map((u) => clientRow(u, now));
}

export interface ClientKey {
  id: string;
  prefix: string;
  name: string;
  product: string;
  enabled: boolean;
  used: number;
  createdAt: string;
}

export interface ClientDetail extends ClientRow {
  keys: ClientKey[];
  payments: PaymentView[];
  /** Consumo de los últimos meses por API: periodo YYYYMM → uso. */
  history: { period: string; used: Partial<Record<Product, number>> }[];
}

/** Un cliente con sus keys, pagos y consumo. Una sola lectura por request (título y página). */
export const getClient = cache(async (id: string): Promise<ClientDetail | null> => {
  await assertAdmin();
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id }, select: clientSelect(now) });
  if (!user) return null;
  const periods = Array.from({ length: 6 }, (_, i) => currentPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const [keys, payments, usage] = await Promise.all([
    prisma.apiKey.findMany({
      where: { userId: id },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
      include: { counters: { where: { period: currentPeriod(now) } } },
    }),
    prisma.payment.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      omit: { proofData: true },
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.planUsage.findMany({ where: { userId: id, period: { in: periods } } }),
  ]);
  return {
    ...clientRow(user, now),
    keys: keys.map((k) => ({
      id: k.id, prefix: k.prefix, name: k.name, product: k.product, enabled: k.enabled,
      used: k.counters[0]?.used ?? 0, createdAt: k.createdAt.toISOString(),
    })),
    payments: payments.map(paymentView),
    history: periods.reverse().map((period) => ({
      period,
      used: Object.fromEntries(usage.filter((u) => u.period === period && isProduct(u.product)).map((u) => [u.product, u.used])),
    })),
  };
});

// ---------- Requests a la API (api_requests, 30 días) ----------

/** Días que guarda el backend (src/common/request-log). */
export const REQUEST_LOG_DAYS = 30;

export interface EndpointStat {
  method: string;
  route: string;
  product: string | null;
  total: number;
  errors: number;
  units: number;
  avgMs: number;
  lastAt: string;
  /** El último error de este endpoint. */
  lastError: { status: number; message: string | null; at: string } | null;
}

export interface RequestRow {
  id: string;
  at: string;
  method: string;
  route: string;
  product: string | null;
  status: number;
  durationMs: number;
  units: number;
  error: string | null;
  upstream: string | null;
  keyPrefix: string;
}

export interface ClientRequests {
  total: number;
  errors: number;
  endpoints: EndpointStat[];
  /** Los últimos requests, con el filtro aplicado. */
  recent: RequestRow[];
}

export interface RequestFilter {
  route?: string;
  errorsOnly?: boolean;
}

const RECENT_LIMIT = 100;

/** Qué endpoints usa un cliente, cuántos le fallan y sus últimos requests. */
export async function getClientRequests(userId: string, filter: RequestFilter = {}): Promise<ClientRequests> {
  await assertAdmin();
  const since = new Date(Date.now() - REQUEST_LOG_DAYS * 86_400_000);
  const where = { userId, createdAt: { gte: since } };
  const [all, failed, lastErrors, recent] = await Promise.all([
    prisma.apiRequest.groupBy({
      by: ['method', 'route', 'product'],
      where,
      _count: { _all: true },
      _sum: { units: true },
      _avg: { durationMs: true },
      _max: { createdAt: true },
    }),
    prisma.apiRequest.groupBy({ by: ['method', 'route'], where: { ...where, status: { gte: 400 } }, _count: { _all: true } }),
    prisma.$queryRaw<{ method: string; route: string; status: number; error: string | null; createdAt: Date }[]>`
      SELECT DISTINCT ON (method, route) method, route, status, error, created_at AS "createdAt"
      FROM api_requests
      WHERE user_id = ${userId} AND created_at >= ${since} AND status >= 400
      ORDER BY method, route, created_at DESC`,
    prisma.apiRequest.findMany({
      where: { ...where, ...(filter.route ? { route: filter.route } : {}), ...(filter.errorsOnly ? { status: { gte: 400 } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    }),
  ]);
  const id = (r: { method: string; route: string }) => `${r.method} ${r.route}`;
  const errorsBy = new Map(failed.map((f) => [id(f), f._count._all]));
  const lastBy = new Map(lastErrors.map((e) => [id(e), e]));
  const endpoints = all
    .map((e): EndpointStat => {
      const last = lastBy.get(id(e));
      return {
        method: e.method,
        route: e.route,
        product: e.product,
        total: e._count._all,
        errors: errorsBy.get(id(e)) ?? 0,
        units: e._sum.units ?? 0,
        avgMs: Math.round(e._avg.durationMs ?? 0),
        lastAt: (e._max.createdAt ?? since).toISOString(),
        lastError: last ? { status: last.status, message: last.error, at: last.createdAt.toISOString() } : null,
      };
    })
    .sort((a, b) => b.total - a.total);
  return {
    total: endpoints.reduce((s, e) => s + e.total, 0),
    errors: endpoints.reduce((s, e) => s + e.errors, 0),
    endpoints,
    recent: recent.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      method: r.method,
      route: r.route,
      product: r.product,
      status: r.status,
      durationMs: r.durationMs,
      units: r.units,
      error: r.error,
      upstream: r.upstream,
      keyPrefix: r.keyPrefix,
    })),
  };
}

export interface FailureGroup {
  method: string;
  route: string;
  status: number;
  error: string | null;
  upstream: string | null;
  count: number;
  clients: number;
  lastAt: string;
  /** El cliente del último. */
  lastClient: { id: string; name: string | null; email: string } | null;
}

/**
 * Fallas de todos los clientes en las últimas 24 h: errores del servidor (5xx), de un
 * courier o SUNAT, y el límite por minuto (429). Sin los 4xx de uso normal (una guía que
 * no existe, un dato mal escrito), que no son un problema nuestro.
 */
export async function getRecentFailures(hours = 24): Promise<FailureGroup[]> {
  await assertAdmin();
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.$queryRaw<
    { method: string; route: string; status: number; error: string | null; upstream: string | null; count: number; clients: number; lastAt: Date; lastUser: string | null }[]
  >`
    SELECT method, route, status, error, max(upstream) AS upstream, count(*)::int AS count,
           count(DISTINCT user_id)::int AS clients, max(created_at) AS "lastAt",
           (array_agg(user_id ORDER BY created_at DESC))[1] AS "lastUser"
    FROM api_requests
    WHERE created_at >= ${since} AND (status >= 500 OR status = 429 OR (status >= 400 AND upstream IS NOT NULL))
    GROUP BY method, route, status, error
    ORDER BY count(*) DESC
    LIMIT 10`;
  const ids = [...new Set(rows.map((r) => r.lastUser).filter((u): u is string => !!u))];
  const users = new Map(
    (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]),
  );
  return rows.map((r) => ({
    method: r.method,
    route: r.route,
    status: r.status,
    error: r.error,
    upstream: r.upstream,
    count: r.count,
    clients: r.clients,
    lastAt: r.lastAt.toISOString(),
    lastClient: r.lastUser ? (users.get(r.lastUser) ?? null) : null,
  }));
}

// ---------- Pagos ----------

function paymentView(p: {
  id: string; product: string; plan: string; amountPen: number; monthlyLimit: number | null; items: Prisma.JsonValue;
  method: string; operationCode: string | null; status: string; note: string | null; createdAt: Date;
  reviewedAt: Date | null; reviewedBy: string | null; proofMime: string;
  user: { id: string; email: string; name: string | null };
}): PaymentView {
  return {
    id: p.id,
    label: paymentLabel(p),
    items: paymentItems(p),
    amountPen: p.amountPen,
    method: p.method,
    operationCode: p.operationCode,
    status: p.status,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewedBy: p.reviewedBy,
    // Los que registra el admin a mano pueden no traer comprobante.
    proof: !p.proofMime ? null : p.proofMime === 'application/pdf' ? 'pdf' : 'image',
    user: p.user,
  };
}

export type PaymentFilter = 'pending' | 'approved' | 'rejected' | 'all';

export async function listPayments(filter: PaymentFilter, q = '', take = 300): Promise<PaymentView[]> {
  await assertAdmin();
  const search = q.trim();
  const payments = await prisma.payment.findMany({
    where: {
      ...(filter === 'all' ? {} : { status: filter }),
      ...(search
        ? {
            OR: [
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { name: { contains: search, mode: 'insensitive' } } },
              { operationCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    // Los pendientes, del más antiguo (el que más espera) al más nuevo.
    orderBy: { createdAt: filter === 'pending' ? 'asc' : 'desc' },
    omit: { proofData: true },
    include: { user: { select: { id: true, email: true, name: true } } },
    take,
  });
  return payments.map(paymentView);
}

export async function paymentCounts(): Promise<Record<PaymentFilter, number>> {
  await assertAdmin();
  const rows = await prisma.payment.groupBy({ by: ['status'], _count: { _all: true } });
  const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { pending: count('pending'), approved: count('approved'), rejected: count('rejected'), all: rows.reduce((n, r) => n + r._count._all, 0) };
}

export async function pendingCount(): Promise<number> {
  await assertAdmin();
  return prisma.payment.count({ where: { status: 'pending' } });
}

// ---------- Resumen ----------

/** Inicio del mes de Lima que contiene `date`, desplazado `offset` meses. */
function limaMonthStart(date: Date, offset = 0): Date {
  const lima = new Date(date.getTime() - LIMA_OFFSET_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() + offset, 1) + LIMA_OFFSET_MS);
}

export interface Overview {
  revenue: { month: number; prevMonth: number; payments: number; series: { month: string; total: number }[] };
  /** Lo que se cobraría en un mes si todos renuevan lo que tienen. */
  recurring: number;
  clients: { total: number; paid: number; trialUsing: number; newThisMonth: number; lapsed: number };
  pending: PaymentView[];
  pendingTotal: number;
  /** Planes de pago que vencen en 7 días o vencieron en los últimos 10. */
  expiring: { client: ClientRow; purchase: string | undefined; name: string; expiresAt: string; overdue: boolean }[];
  /** Clientes en prueba que ya usaron 70% o más de su cuota: posibles ventas. */
  trialHot: { client: ClientRow; product: Product; used: number; limit: number }[];
  recent: ClientRow[];
}

export async function getOverview(now = new Date()): Promise<Overview> {
  await assertAdmin();
  const since = limaMonthStart(now, -5);
  const [clients, approved, pending, pendingTotal] = await Promise.all([
    listClients(now),
    prisma.payment.findMany({
      where: { status: 'approved', OR: [{ reviewedAt: { gte: since } }, { reviewedAt: null, createdAt: { gte: since } }] },
      select: { amountPen: true, reviewedAt: true, createdAt: true },
    }),
    listPayments('pending', '', 5),
    pendingCount(),
  ]);

  // Ingresos por mes de Lima (cuenta el día que se aprobó).
  const series = Array.from({ length: 6 }, (_, i) => {
    const start = limaMonthStart(now, i - 5);
    const end = limaMonthStart(now, i - 4);
    const total = approved
      .filter((p) => { const at = p.reviewedAt ?? p.createdAt; return at >= start && at < end; })
      .reduce((sum, p) => sum + p.amountPen, 0);
    return { month: start.toISOString(), total };
  });
  const monthStart = limaMonthStart(now);
  const thisMonth = approved.filter((p) => (p.reviewedAt ?? p.createdAt) >= monthStart);

  const expiring: Overview['expiring'] = [];
  for (const client of clients) {
    const paid = client.subs.filter((s) => s.paid && s.expiresAt);
    for (const g of groupByBundle(paid)) {
      const expiresAt = g.subs.map((s) => s.expiresAt!).sort()[0];
      const at = new Date(expiresAt).getTime();
      if (at > now.getTime() + 7 * DAY_MS || at < now.getTime() - 10 * DAY_MS) continue;
      // Si ya renovó otra cosa que lo cubre (p. ej. pasó a un pack), no avisa.
      if (at <= now.getTime() && client.subs.some((s) => g.subs.some((x) => x.product === s.product) && s.active && s.paid)) continue;
      expiring.push({
        client,
        purchase: g.bundle ? `bundle:${g.bundle.id}` : purchaseOf(`plan:${g.subs[0].product}:${g.subs[0].plan}`)?.value,
        name: g.bundle ? g.bundle.name : `${PRODUCT_NAME[g.subs[0].product]} ${g.subs[0].planName}`,
        expiresAt,
        overdue: at <= now.getTime(),
      });
    }
  }
  expiring.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  const trialHot: Overview['trialHot'] = [];
  for (const client of clients) {
    if (client.isAdmin) continue;
    for (const product of PRODUCTS) {
      const sub = client.subs.find((s) => s.product === product && s.active);
      // De pago, o con el plan vencido (ese va en "Vencen pronto": se renueva, no se le sube la prueba).
      if (sub?.paid || client.subs.some((s) => s.product === product && s.paid && !s.active)) continue;
      const limit = sub ? sub.monthlyLimit : freePlan(product).monthlyLimit;
      const used = client.used[product] ?? 0;
      if (limit && used / limit >= 0.7) trialHot.push({ client, product, used, limit });
    }
  }
  trialHot.sort((a, b) => b.used / b.limit - a.used / a.limit);

  const customers = clients.filter((c) => !c.isAdmin);
  return {
    revenue: {
      month: thisMonth.reduce((sum, p) => sum + p.amountPen, 0),
      prevMonth: series[4].total,
      payments: thisMonth.length,
      series,
    },
    recurring: customers.reduce((sum, c) => sum + monthlyValue(c.subs), 0),
    clients: {
      total: customers.length,
      paid: customers.filter((c) => c.status === 'paid').length,
      lapsed: customers.filter((c) => c.status === 'lapsed').length,
      trialUsing: customers.filter((c) => c.status === 'trial' && (c.activeKeys > 0 || Object.values(c.used).some(Boolean))).length,
      newThisMonth: customers.filter((c) => new Date(c.createdAt) >= monthStart).length,
    },
    pending,
    pendingTotal,
    expiring,
    trialHot: trialHot.slice(0, 8),
    recent: customers.slice(0, 6),
  };
}

// ---------- Registrar un pago hecho por fuera ----------

export interface RegisterPaymentInput {
  /** Un cliente existente, o un correo: si no tiene cuenta, se crea (la verá al entrar con ese correo). */
  userId?: string;
  email?: string;
  name?: string;
  purchase: string;
  months: number;
  amountPen: number;
  method: string;
  operationCode?: string;
  note?: string;
  proof?: { mime: string; data: Uint8Array<ArrayBuffer> };
  /** Si es un cambio a un plan mayor: cobra la diferencia y mantiene su vencimiento (lib/upgrade.ts). */
  prorate?: boolean;
}

/**
 * Pago que el cliente hizo por fuera (Yape por WhatsApp, transferencia, efectivo):
 * queda aprobado en su historial y activa o renueva sus planes esos meses, con la
 * misma regla que al aprobar un comprobante (mismo día de vencimiento, ver renewal.ts).
 */
export async function registerPayment(admin: CurrentUser, input: RegisterPaymentInput, now = new Date()) {
  const purchase = purchaseOf(input.purchase);
  if (!purchase) return { error: 'Elige un plan o un pack válido' } as const;

  return prisma.$transaction(async (tx) => {
    let user = input.userId
      ? await tx.user.findUnique({ where: { id: input.userId }, include: { subscriptions: true } })
      : await tx.user.findUnique({ where: { email: input.email! }, include: { subscriptions: true } });
    let created = false;
    if (!user && input.email) {
      user = await tx.user.create({
        data: { email: input.email, name: input.name || null, role: isAdminEmail(input.email) ? 'admin' : 'user' },
        include: { subscriptions: true },
      });
      created = true;
    }
    if (!user) return { error: 'No existe ese cliente' } as const;
    const client = user;

    // Cambio a un plan mayor a mitad del periodo: todos vencen cuando vencían sus planes (más los meses extra).
    const quote = input.prorate ? upgradeQuote(client.subscriptions, purchase, now) : null;
    const until = quote ? upgradeTotal(quote, purchase, input.months).expiresAt.toISOString() : null;

    // Si sigue en el mismo plan conserva su cuota (pudo ajustarse a mano); si no, la del catálogo.
    const items: PaymentItem[] = purchase.items.map((i) => {
      const current = client.subscriptions.find((s) => s.product === i.product);
      const monthlyLimit = current?.plan === i.plan ? current.monthlyLimit : (getPlan(i.product, i.plan)?.monthlyLimit ?? null);
      return { ...i, monthlyLimit, ...(input.months > 1 ? { months: input.months } : {}), ...(until ? { expiresAt: until } : {}) };
    });

    const payment = await tx.payment.create({
      data: {
        userId: client.id,
        product: purchase.bundle ? 'bundle' : purchase.items[0].product,
        plan: purchase.bundle ? purchase.bundle.id : purchase.items[0].plan,
        amountPen: input.amountPen,
        monthlyLimit: purchase.bundle ? null : items[0].monthlyLimit,
        items: items as unknown as Prisma.InputJsonValue,
        method: input.method,
        operationCode: input.operationCode || null,
        note: input.note || null,
        proofMime: input.proof?.mime ?? '',
        proofData: input.proof?.data ?? new Uint8Array(0),
        status: 'approved',
        reviewedBy: admin.email,
        reviewedAt: now,
      },
    });
    await grantPlans(tx, client.id, items, now);
    return { paymentId: payment.id, userId: client.id, created } as const;
  });
}

/** Lo que necesita el formulario de "Registrar pago" de un cliente. */
export function clientOption(c: ClientRow) {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    subs: c.subs.map((s) => ({ product: s.product, plan: s.plan, monthlyLimit: s.monthlyLimit, expiresAt: s.expiresAt })),
  };
}

// ---------- Shalom Pro: cuentas conectadas e historial ----------

/** Cuentas de Shalom Pro a la vez por plan (backend: PRO_ACCOUNTS_LIMIT en shalom-pro.service.ts). */
export const PRO_ACCOUNTS_LIMIT = { base: 1, plataforma: 20, empresarial: 100 } as const;
/** Ventana en la que se cuentan las cuentas distintas que conectó (para ver si turna negocios). */
export const PRO_HISTORY_DAYS = 30;

export interface ProAccountView {
  ref: string;
  email: string;
  /** Remitente que devolvió Shalom al conectar (nombre y tipo de documento, sin el número). */
  sender: string | null;
  connectedAt: string;
  /** Letra de la cuenta en el historial (null: conectada antes de que existiera el historial). */
  label: string | null;
}

export interface ProConnectionView {
  at: string;
  ref: string;
  action: 'connect' | 'disconnect';
  /** "A", "B"…: la misma letra es la misma cuenta (por la huella del correo de la cuenta). */
  label: string;
}

export interface ClientShalomPro {
  accounts: ProAccountView[];
  history: ProConnectionView[];
  /** Cuentas distintas que conectó en los últimos PRO_HISTORY_DAYS días. */
  recentDistinct: number;
}

function senderLabel(sender: Prisma.JsonValue | null): string | null {
  if (!sender || typeof sender !== 'object' || Array.isArray(sender)) return null;
  const s = sender as Record<string, unknown>;
  const name = [s.name, s.paternalSurname].filter((v) => typeof v === 'string' && v.trim()).join(' ');
  return name ? `${name}${typeof s.documentType === 'string' ? ` (${s.documentType})` : ''}` : null;
}

/** Sus cuentas de Shalom Pro y el historial de conexiones (solo huellas: sin correos ni documentos). */
export async function getClientShalomPro(userId: string, now = new Date()): Promise<ClientShalomPro> {
  await assertAdmin();
  const [accounts, rows] = await Promise.all([
    prisma.shalomProAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    // Sin la tabla todavía (Vercel desplegó antes que la migración del backend): sin historial.
    prisma.shalomProConnection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 1000 }).catch(() => []),
  ]);
  const labels = new Map<string, string>();
  const labelOf = (hash: string) => {
    if (!labels.has(hash)) labels.set(hash, labels.size < 26 ? String.fromCharCode(65 + labels.size) : `#${labels.size + 1}`);
    return labels.get(hash)!;
  };
  const history: ProConnectionView[] = rows.map((r) => ({
    at: r.createdAt.toISOString(),
    ref: r.ref,
    action: r.action === 'disconnect' ? 'disconnect' : 'connect',
    label: labelOf(r.accountHash),
  }));
  const since = now.getTime() - PRO_HISTORY_DAYS * 86_400_000;
  const recentDistinct = new Set(rows.filter((r) => r.action === 'connect' && r.createdAt.getTime() >= since).map((r) => r.accountHash)).size;
  return {
    accounts: accounts.map((a) => {
      // La cuenta de ese identificador es la de su última conexión.
      const last = history.findLast((h) => h.ref === a.ref && h.action === 'connect');
      return { ref: a.ref, email: a.email, sender: senderLabel(a.sender), connectedAt: a.createdAt.toISOString(), label: last?.label ?? null };
    }),
    history: [...history].reverse(),
    recentDistinct,
  };
}

/** Cuántas cuentas de Shalom Pro puede tener conectadas a la vez con su plan de Shalom vigente. */
export function proAccountsLimit(subs: SubView[]): number {
  const plan = subs.find((s) => s.product === 'shalom' && s.active)?.plan;
  return plan === 'plataforma' ? PRO_ACCOUNTS_LIMIT.plataforma : plan === 'empresarial' ? PRO_ACCOUNTS_LIMIT.empresarial : PRO_ACCOUNTS_LIMIT.base;
}
