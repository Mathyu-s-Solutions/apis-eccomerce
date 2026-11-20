export const PRODUCTS = ['shalom', 'olva', 'sunat'] as const;
export type Product = (typeof PRODUCTS)[number];
export const PRODUCT_NAME: Record<Product, string> = { shalom: 'Shalom', olva: 'Olva', sunat: 'SUNAT' };

export interface Plan {
  id: string;
  name: string;
  pricedPen: number; // soles/mes (0 = gratis)
  monthlyLimit: number | null; // null = ilimitado
  highlight?: boolean;
  features: string[];
}

// Planes por API. El precio es de cada API; la cuota es del plan y la comparten
// todas las keys del cliente para esa API. "Ilimitadas" = sin cuota mensual, con
// el límite por minuto de la API (FAIR_USE). Los límites del plan "free" están
// también en backend/src/auth/plan-quota.ts (FREE_MONTHLY_LIMIT): mantenerlos en sync.
export const PLANS: Record<Product, Plan[]> = {
  shalom: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 20, features: ['20 consultas/mes para probar', 'Agencias sin costo', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 25, monthlyLimit: null, highlight: true, features: ['Consultas ilimitadas (uso razonable)', 'Rastreo, lote, agencias y cotización', 'Webhooks de estado', 'Soporte prioritario'] },
    { id: 'plataforma', name: 'Plataforma', pricedPen: 49, monthlyLimit: null, features: ['Todo lo del Básico', 'Hasta 20 cuentas de Shalom Pro (una por negocio)', 'Eliges con qué cuenta crear cada guía', 'Para plataformas y agencias con varios negocios'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Todo lo del Plataforma', 'Hasta 100 cuentas de Shalom Pro', 'Integración a medida', 'Soporte dedicado y SLA'] },
  ],
  olva: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 20, features: ['20 consultas/mes para probar', 'Agencias sin costo', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 25, monthlyLimit: null, highlight: true, features: ['Consultas ilimitadas (uso razonable)', 'Rastreo, lote, agencias y cotización', 'Webhooks de estado', 'Soporte prioritario'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Todo lo del Básico', 'Integración a medida', 'Soporte dedicado y SLA'] },
  ],
  sunat: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 20, features: ['Pruebas ilimitadas en SUNAT beta', 'PDF, XML y CDR de cada comprobante', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 20, monthlyLimit: 1000, highlight: true, features: ['Factura, boleta, notas, bajas y guías', 'Consultas RUC y DNI incluidas', 'Varias empresas (RUC) sin costo extra'] },
    { id: 'pro', name: 'Pro', pricedPen: 59, monthlyLimit: 5000, features: ['Todo lo del Básico', 'Validez de comprobantes y SIRE incluidos', 'Soporte prioritario'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 149, monthlyLimit: 20000, features: ['Todo lo del Pro', 'Integración a medida', 'Soporte dedicado y SLA'] },
  ],
};

/** Uso razonable de los planes ilimitados (los límites por minuto del backend). */
export function fairUse(product: Product): string {
  const base = 'Ilimitadas con uso razonable: hasta 1.000 consultas por minuto por key.';
  return product === 'shalom' ? `${base} En Shalom, 60 rastreos o cotizaciones por minuto (cada guía nueva resuelve un captcha; las ya consultadas no).` : base;
}

/** "Consultas ilimitadas" / "Comprobantes ilimitados". */
export function unlimitedLabel(product: Product): string {
  return product === 'sunat' ? 'Comprobantes ilimitados' : 'Consultas ilimitadas';
}

export function isProduct(value: unknown): value is Product {
  return typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value);
}

export function getPlan(product: string, planId: string): Plan | undefined {
  return isProduct(product) ? PLANS[product].find((p) => p.id === planId) : undefined;
}

export function freePlan(product: Product): Plan {
  return PLANS[product].find((p) => p.id === 'free')!;
}

/** Promoción: varias APIs juntas a un precio menor que por separado. */
export interface Bundle {
  id: string;
  name: string;
  description: string;
  pricedPen: number; // soles/mes
  items: { product: Product; plan: string }[];
}

// De más APIs a menos: al agrupar los planes de un cliente (groupByBundle) y al
// ver qué pack tiene (panel), manda el primero que calza. Ningún pack debe costar
// más que sus planes por separado (bundleListPrice).
export const BUNDLES: Bundle[] = [
  {
    id: 'completo-basico',
    name: 'Pack Completo',
    description: 'Shalom Básico + Olva Básico + SUNAT Básico',
    pricedPen: 59,
    items: [
      { product: 'shalom', plan: 'basico' },
      { product: 'olva', plan: 'basico' },
      { product: 'sunat', plan: 'basico' },
    ],
  },
  {
    id: 'couriers-basico',
    name: 'Pack Couriers',
    description: 'Shalom Básico + Olva Básico',
    pricedPen: 45,
    items: [
      { product: 'shalom', plan: 'basico' },
      { product: 'olva', plan: 'basico' },
    ],
  },
  {
    // Para plataformas con varios negocios: una cuenta de Shalom Pro por negocio.
    id: 'couriers-plataforma',
    name: 'Pack Plataforma',
    description: 'Shalom Plataforma + Olva Básico',
    pricedPen: 65,
    items: [
      { product: 'shalom', plan: 'plataforma' },
      { product: 'olva', plan: 'basico' },
    ],
  },
];

export function getBundle(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/** Lo que costarían por separado los planes del pack. */
export function bundleListPrice(bundle: Bundle): number {
  return bundle.items.reduce((sum, i) => sum + (getPlan(i.product, i.plan)?.pricedPen ?? 0), 0);
}

export function bundlesWith(product: Product): Bundle[] {
  return BUNDLES.filter((b) => b.items.some((i) => i.product === product));
}

/**
 * Planes de un cliente agrupados como los compra: cada pack que tiene completo
 * (todas sus APIs en el plan del pack) va junto, y el resto, uno por API.
 */
export function groupByBundle<T extends { product: string; plan: string }>(subs: T[]): { bundle?: Bundle; subs: T[] }[] {
  let left = [...subs];
  const groups: { bundle?: Bundle; subs: T[] }[] = [];
  for (const bundle of BUNDLES) {
    const members = bundle.items.map((i) => left.find((s) => s.product === i.product && s.plan === i.plan));
    if (members.every((m) => m !== undefined)) {
      groups.push({ bundle, subs: members as T[] });
      left = left.filter((s) => !members.includes(s));
    }
  }
  const order = (s: T) => (PRODUCTS as readonly string[]).indexOf(s.product);
  for (const s of left.sort((a, b) => order(a) - order(b))) groups.push({ subs: [s] });
  return groups;
}

/** Lo que activa un pago: un plan de una API o los de un pack. Se guarda en `payments.items`. */
export interface PaymentItem {
  product: Product;
  plan: string;
  monthlyLimit: number | null;
  /** Meses que paga (los que registra el admin pueden ser varios); sin el campo, uno. */
  months?: number;
}

/**
 * Algo que se compra: `plan:<api>:<plan>` (el plan de una API) o `bundle:<pack>`.
 * Lo usan el admin al registrar un pago o asignar un plan, y el formulario del cliente.
 */
export interface Purchase {
  value: string;
  /** "Pack Couriers" o "Shalom Básico". */
  name: string;
  /** Precio de un mes en soles. */
  pricedPen: number;
  bundle?: Bundle;
  items: { product: Product; plan: string }[];
}

export function purchaseOf(value: string): Purchase | undefined {
  const [kind, a, b] = value.split(':');
  if (kind === 'bundle') {
    const bundle = getBundle(a);
    return bundle && { value, name: bundle.name, pricedPen: bundle.pricedPen, bundle, items: bundle.items };
  }
  if (kind === 'plan' && isProduct(a)) {
    const plan = getPlan(a, b);
    return plan && plan.id !== 'free' ? { value, name: `${PRODUCT_NAME[a]} ${plan.name}`, pricedPen: plan.pricedPen, items: [{ product: a, plan: plan.id }] } : undefined;
  }
  return undefined;
}

/** Todo lo que se puede comprar: los packs y los planes de pago de cada API. */
export function allPurchases(): Purchase[] {
  return [
    ...BUNDLES.map((b) => purchaseOf(`bundle:${b.id}`)!),
    ...PRODUCTS.flatMap((p) => PLANS[p].filter((plan) => plan.pricedPen > 0).map((plan) => purchaseOf(`plan:${p}:${plan.id}`)!)),
  ];
}

/** La compra con la que se renueva lo que ya tiene: su pack completo, o el plan de esa API. */
export function renewalPurchase(subs: { product: string; plan: string }[], product?: string): string | undefined {
  const groups = groupByBundle(subs).filter((g) => !product || g.subs.some((s) => s.product === product));
  const g = groups.find((x) => x.bundle) ?? groups.find((x) => x.subs[0].plan !== 'free');
  if (!g) return undefined;
  return g.bundle ? `bundle:${g.bundle.id}` : `plan:${g.subs[0].product}:${g.subs[0].plan}`;
}

/**
 * Cómo pagó. El cliente paga con Yape o Plin (un solo número y un QR que sirve en las
 * dos apps) y sube el comprobante; el admin registra también los demás.
 */
export const PAYMENT_METHODS: Record<string, string> = {
  yape_plin: 'Yape / Plin',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
};

/** Pagos de antes de unir Yape y Plin: solo para mostrarlos. */
const LEGACY_PAYMENT_METHODS: Record<string, string> = { yape: 'Yape', plin: 'Plin' };

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS[method] ?? LEGACY_PAYMENT_METHODS[method] ?? method;
}
