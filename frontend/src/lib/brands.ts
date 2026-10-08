export type BrandId = 'shalom' | 'olva' | 'sunat';

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  cost?: string;
}

export interface DocSection {
  title: string;
  description: string;
  endpoints: Endpoint[];
}

export interface Feature {
  icon: string; // clave mapeada a un ícono de lucide en el componente
  title: string;
  description: string;
}

export interface Brand {
  id: BrandId;
  name: string; // "Shalom API"
  product: string; // "Shalom"
  // Host de producción (para resolver la marca por dominio). Ajustable luego.
  hosts: string[];
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  // Tema
  accent: string;
  accentSoft: string;
  gradientFrom: string;
  gradientTo: string;
  // API
  apiPrefix: string; // "/v1/olva"
  features: Feature[];
  docs: DocSection[];
  quickstart: { label: string; code: string }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.mathyu.dev';

function curl(prefix: string, method: string, path: string, body?: string): string {
  const url = `${API_URL}${prefix}${path}`;
  if (method === 'GET') {
    return `curl "${url}" \\\n  -H "x-api-key: $MATHYU_API_KEY"`;
  }
  return `curl -X ${method} "${url}" \\\n  -H "x-api-key: $MATHYU_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d '${body ?? '{}'}'`;
}

export const BRANDS: Record<BrandId, Brand> = {
  shalom: {
    id: 'shalom',
    name: 'Shalom API',
    product: 'Shalom',
    hosts: ['shalom.mathyu.dev', 'api-shalom.mathyu.dev'],
    tagline: 'Integra Shalom en tu ecommerce',
    heroTitle: 'La API de Shalom que tu ecommerce necesita',
    heroSubtitle:
      'Rastrea envíos, consulta agencias y cotiza tarifas de Shalom con una API REST simple, rápida y con tu propia cuota. Sin complicaciones.',
    accent: '#F25C05',
    accentSoft: '#FFF1E8',
    gradientFrom: '#FF7A18',
    gradientTo: '#F25C05',
    apiPrefix: '/v1/shalom',
    features: [
      { icon: 'MapPin', title: 'Rastreo de envíos', description: 'Consulta el estado de una guía por número y clave, o por su id interno, con estados normalizados.' },
      { icon: 'Building2', title: 'Agencias', description: 'Las 500+ agencias de Shalom con dirección, horarios y coordenadas, filtrables por departamento y provincia.' },
      { icon: 'Calculator', title: 'Cotización', description: 'Calcula tarifas entre agencias antes de registrar el envío.' },
      { icon: 'Webhook', title: 'Webhooks', description: 'Recibe un aviso cuando una guía cambia de estado, sin hacer polling.' },
      { icon: 'Gauge', title: 'Tu propia cuota', description: 'Cada API key tiene su límite mensual y lo ves en tiempo real en tu panel.' },
      { icon: 'ShieldCheck', title: 'Estable y monitoreado', description: 'Nos encargamos de los cambios en Shalom para que tu integración no se rompa.' },
    ],
    docs: [
      {
        title: 'Rastreo',
        description: 'Sigue un envío de Shalom.',
        endpoints: [
          { method: 'POST', path: '/track', summary: 'Rastrea por número de guía y clave', cost: '1 consulta' },
          { method: 'POST', path: '/track/status', summary: 'Estado por id interno (ose_id)', cost: 'gratis' },
        ],
      },
      {
        title: 'Agencias',
        description: 'Catálogo de agencias.',
        endpoints: [
          { method: 'GET', path: '/agencies', summary: 'Lista agencias (filtros: q, department, province)', cost: 'gratis' },
        ],
      },
    ],
    quickstart: [
      { label: 'Rastrear una guía', code: curl('/v1/shalom', 'POST', '/track', '{"orderNumber":"12345678","orderCode":"AB12"}') },
      { label: 'Buscar agencias en Arequipa', code: curl('/v1/shalom', 'GET', '/agencies?department=AREQUIPA') },
    ],
  },
  olva: {
    id: 'olva',
    name: 'Olva API',
    product: 'Olva',
    hosts: ['olva.mathyu.dev', 'api-olva.mathyu.dev'],
    tagline: 'Integra Olva Courier en tu ecommerce',
    heroTitle: 'La API de Olva Courier, lista para tu tienda',
    heroSubtitle:
      'Tracking, agencias, ubigeos y cotización de Olva en una sola API REST. Empieza en minutos y paga solo por lo que usas.',
    accent: '#00A651',
    accentSoft: '#E8F8EF',
    gradientFrom: '#2BD576',
    gradientTo: '#00A651',
    apiPrefix: '/v1/olva',
    features: [
      { icon: 'MapPin', title: 'Rastreo de envíos', description: 'Consulta el estado de una guía por emisión y número, con historial de eventos normalizado.' },
      { icon: 'Layers', title: 'Rastreo en lote', description: 'Hasta 50 guías en una sola llamada.' },
      { icon: 'Building2', title: 'Agencias y ubigeos', description: 'Todas las oficinas de Olva y el catálogo de ubigeos del Perú.' },
      { icon: 'Calculator', title: 'Cotización', description: 'Calcula el costo de un envío por ubigeo de origen y destino.' },
      { icon: 'Gauge', title: 'Tu propia cuota', description: 'Cada API key tiene su límite mensual visible en tu panel.' },
      { icon: 'ShieldCheck', title: 'Estable y monitoreado', description: 'Vigilamos los cambios de Olva para que tu integración siga funcionando.' },
    ],
    docs: [
      {
        title: 'Rastreo',
        description: 'Sigue uno o varios envíos.',
        endpoints: [
          { method: 'POST', path: '/track', summary: 'Rastrea una guía', cost: '1 consulta' },
          { method: 'POST', path: '/track/batch', summary: 'Rastrea hasta 50 guías', cost: '1 consulta' },
        ],
      },
      {
        title: 'Catálogos',
        description: 'Agencias y ubigeos.',
        endpoints: [
          { method: 'GET', path: '/agencies', summary: 'Lista agencias (filtros: q, department, province)', cost: 'gratis' },
          { method: 'GET', path: '/locations/ubigeos', summary: 'Catálogo de ubigeos', cost: 'gratis' },
        ],
      },
      {
        title: 'Cotización',
        description: 'Calcula tarifas.',
        endpoints: [
          { method: 'POST', path: '/quote', summary: 'Cotiza un envío por ubigeo', cost: '1 consulta' },
        ],
      },
    ],
    quickstart: [
      { label: 'Cotizar Lima → Arequipa', code: curl('/v1/olva', 'POST', '/quote', '{"origin":"150101","destination":"040101","shipmentType":1,"weight":0.5}') },
      { label: 'Rastrear una guía', code: curl('/v1/olva', 'POST', '/track', '{"orderNumber":"1234567890","orderCode":"26"}') },
    ],
  },
  sunat: {
    id: 'sunat',
    name: 'SUNAT API',
    product: 'SUNAT',
    hosts: ['sunat.mathyu.dev', 'api-sunat.mathyu.dev'],
    tagline: 'Facturación electrónica y consultas SUNAT',
    heroTitle: 'Emite comprobantes y consulta SUNAT por API',
    heroSubtitle:
      'Factura y boleta electrónica, notas, guías de remisión y consulta de RUC/DNI. Una API REST sobre los servicios oficiales de SUNAT.',
    accent: '#0B5FA5',
    accentSoft: '#E7F1FA',
    gradientFrom: '#2E8BD6',
    gradientTo: '#0B5FA5',
    apiPrefix: '/v1/sunat',
    features: [
      { icon: 'FileText', title: 'Comprobantes electrónicos', description: 'Factura, boleta, notas de crédito y débito firmadas y enviadas a SUNAT.' },
      { icon: 'Search', title: 'Consulta RUC y DNI', description: 'Datos de empresas y personas al instante para completar tus comprobantes.' },
      { icon: 'Truck', title: 'Guías de remisión', description: 'Emite guías de remisión remitente y transportista.' },
      { icon: 'FileCheck2', title: 'Estado y CDR', description: 'Consulta el estado del comprobante y descarga el XML firmado y el CDR.' },
      { icon: 'Gauge', title: 'Tu propia cuota', description: 'Cada API key tiene su límite mensual visible en tu panel.' },
      { icon: 'ShieldCheck', title: 'Sobre servicios oficiales', description: 'Construida sobre los web services oficiales de SUNAT.' },
    ],
    docs: [
      {
        title: 'Comprobantes',
        description: 'Emisión y estado.',
        endpoints: [
          { method: 'POST', path: '/documents', summary: 'Emite factura o boleta', cost: '1 comprobante' },
          { method: 'POST', path: '/status', summary: 'Consulta el estado de un comprobante', cost: 'gratis' },
        ],
      },
      {
        title: 'Consultas',
        description: 'Padrón y validación.',
        endpoints: [
          { method: 'GET', path: '/ruc/{ruc}', summary: 'Consulta datos por RUC', cost: 'gratis' },
        ],
      },
    ],
    quickstart: [
      { label: 'Consultar un RUC', code: curl('/v1/sunat', 'GET', '/ruc/20100066603') },
    ],
  },
};

export const DEFAULT_BRAND: BrandId = 'shalom';
export const BRAND_IDS: BrandId[] = ['shalom', 'olva', 'sunat'];

export function brandByHost(host?: string | null): BrandId | null {
  if (!host) return null;
  const h = host.split(':')[0].toLowerCase();
  for (const id of BRAND_IDS) {
    if (BRANDS[id].hosts.some((bh) => bh === h)) return id;
  }
  return null;
}
