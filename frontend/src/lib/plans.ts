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
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Todo lo del Básico', 'Integración a medida', 'Soporte dedicado y SLA'] },
  ],
  olva: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 20, features: ['20 consultas/mes para probar', 'Agencias sin costo', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 25, monthlyLimit: null, highlight: true, features: ['Consultas ilimitadas (uso razonable)', 'Rastreo, lote, agencias y cotización', 'Webhooks de estado', 'Soporte prioritario'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Todo lo del Básico', 'Integración a medida', 'Soporte dedicado y SLA'] },
  ],
  sunat: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 10, features: ['10 comprobantes/mes para probar', 'Consulta RUC y DNI', 'Entorno de pruebas'] },
    { id: 'basico', name: 'Básico', pricedPen: 69, monthlyLimit: 2000, highlight: true, features: ['2,000 comprobantes/mes', 'Factura y boleta electrónica', 'Consulta RUC/DNI', 'Soporte prioritario'] },
    { id: 'pro', name: 'Pro', pricedPen: 199, monthlyLimit: 20000, features: ['20,000 comprobantes/mes', 'Notas de crédito/débito', 'Guías de remisión', 'SLA de disponibilidad'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 499, monthlyLimit: null, features: ['Comprobantes ilimitados', 'Integración a medida', 'Soporte dedicado'] },
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

export const BUNDLES: Bundle[] = [
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

/** Lo que activa un pago: un plan de una API o los de un pack. Se guarda en `payments.items`. */
export interface PaymentItem {
  product: Product;
  plan: string;
  monthlyLimit: number | null;
}
