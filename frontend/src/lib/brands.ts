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

/**
 * Paleta de cada marca, tomada de los colores oficiales de su web. Se expone como variables
 * CSS en el layout raíz (ver themeVars). Donde el color oficial no llega a contraste AA con
 * texto blanco o sobre blanco, se usa una variante más oscura (primary/accent).
 */
export interface BrandTheme {
  font: 'fira' | 'inter' | 'roboto';
  foreground: string;
  muted: string;
  /** Botón principal. */
  primary: string;
  primaryHover: string;
  onPrimary: string;
  /** Acento legible sobre blanco (texto, íconos) y su fondo suave. */
  accent: string;
  accentSoft: string;
  /** Color insignia de la marca y el texto que va encima. */
  signature: string;
  onSignature: string;
  /** Isotipo del header. */
  mark: string;
  onMark: string;
  header: string;
  onHeader: string;
  /** Secciones oscuras (hero, footer) y su texto secundario. */
  dark: string;
  darker: string;
  onDarkMuted: string;
  /** Color secundario de la marca en tono claro. */
  tint: string;
  /** Fondo de secciones alternas. */
  section: string;
}

export interface Brand {
  id: BrandId;
  name: string; // "Shalom API"
  product: string; // "Shalom"
  /** Con quién NO estamos afiliados, para el aviso legal. */
  owner: string;
  // Host de producción (para resolver la marca por dominio). Ajustable luego.
  hosts: string[];
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  theme: BrandTheme;
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
    owner: 'Shalom Empresarial',
    hosts: ['shalom.mathyu.dev', 'api-shalom.mathyu.dev'],
    tagline: 'Integra Shalom en tu ecommerce',
    heroTitle: 'Tu ecommerce, conectado a Shalom',
    heroSubtitle:
      'Rastrea envíos, consulta agencias y cotiza tarifas de Shalom con una API REST simple, rápida y con tu propia cuota. Sin complicaciones.',
    theme: {
      font: 'fira',
      foreground: '#222F5C',
      muted: '#5B5B5B',
      primary: '#D41F25',
      primaryHover: '#B9171C',
      onPrimary: '#FFFFFF',
      accent: '#D41F25',
      accentSoft: '#FDECEC',
      signature: '#EE2A2F',
      onSignature: '#FFFFFF',
      mark: '#EE2A2F',
      onMark: '#FFFFFF',
      header: '#FFFFFF',
      onHeader: '#222F5C',
      dark: '#222F5C',
      darker: '#19234A',
      onDarkMuted: '#C9CFE6',
      tint: '#DDF2FB',
      section: '#F4F4F4',
    },
    apiPrefix: '/v1/shalom',
    features: [
      { icon: 'MapPin', title: 'Rastreo de envíos', description: 'Consulta el estado de una guía por número y clave, o por su id interno, con estados normalizados.' },
      { icon: 'Building2', title: 'Agencias', description: 'Más de 550 agencias de Shalom con dirección, horarios y coordenadas, filtrables por departamento y provincia.' },
      { icon: 'Calculator', title: 'Cotización', description: 'Calcula tarifas entre agencias antes de registrar el envío.' },
      { icon: 'Webhook', title: 'Webhooks', description: 'Recibe un aviso cuando una guía cambia de estado, sin hacer polling.' },
      { icon: 'Gauge', title: 'Un panel para todo', description: 'La cuota de tu plan, compartida por todas tus keys, y tus otras APIs en el mismo panel.' },
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
    owner: 'Olva Courier',
    hosts: ['olva.mathyu.dev', 'api-olva.mathyu.dev'],
    tagline: 'Integra Olva Courier en tu ecommerce',
    heroTitle: 'La API de Olva Courier, lista para tu tienda',
    heroSubtitle:
      'Tracking, agencias, ubigeos y cotización de Olva en una sola API REST. Empieza en minutos y paga solo por lo que usas.',
    theme: {
      font: 'inter',
      foreground: '#020617',
      muted: '#475569',
      primary: '#020617',
      primaryHover: '#1E293B',
      onPrimary: '#FFFFFF',
      accent: '#2546BB',
      accentSoft: '#FFF6DF',
      signature: '#F9B52F',
      onSignature: '#020617',
      mark: '#020617',
      onMark: '#F9B52F',
      header: '#F9B52F',
      onHeader: '#020617',
      dark: '#020617',
      darker: '#0F172A',
      onDarkMuted: '#CBD5E1',
      tint: '#FFF6DF',
      section: '#F8FAFC',
    },
    apiPrefix: '/v1/olva',
    features: [
      { icon: 'MapPin', title: 'Rastreo de envíos', description: 'Consulta el estado de una guía por emisión y número, con historial de eventos normalizado.' },
      { icon: 'Layers', title: 'Rastreo en lote', description: 'Hasta 50 guías en una sola llamada.' },
      { icon: 'Building2', title: 'Agencias y ubigeos', description: 'Todas las oficinas de Olva y el catálogo de ubigeos del Perú.' },
      { icon: 'Calculator', title: 'Cotización', description: 'Calcula el costo de un envío por ubigeo de origen y destino.' },
      { icon: 'Gauge', title: 'Un panel para todo', description: 'La cuota de tu plan, compartida por todas tus keys, y tus otras APIs en el mismo panel.' },
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
    owner: 'la SUNAT ni al Estado peruano',
    hosts: ['sunat.mathyu.dev', 'api-sunat.mathyu.dev'],
    tagline: 'Facturación electrónica y consultas SUNAT',
    heroTitle: 'Emite comprobantes y consulta SUNAT por API',
    heroSubtitle:
      'Factura y boleta electrónica, notas, guías de remisión y consulta de RUC/DNI. Una API REST sobre los servicios oficiales de SUNAT.',
    theme: {
      font: 'roboto',
      foreground: '#26292E',
      muted: '#4A515C',
      primary: '#0056AC',
      primaryHover: '#00468C',
      onPrimary: '#FFFFFF',
      accent: '#0056AC',
      accentSoft: '#E6F2F8',
      signature: '#0056AC',
      onSignature: '#FFFFFF',
      mark: '#0056AC',
      onMark: '#FFFFFF',
      header: '#FFFFFF',
      onHeader: '#26292E',
      dark: '#0056AC',
      darker: '#26292E',
      onDarkMuted: '#DEE3EA',
      tint: '#E6F2F8',
      section: '#EDF0F4',
    },
    apiPrefix: '/v1/sunat',
    features: [
      { icon: 'FileText', title: 'Comprobantes electrónicos', description: 'Factura, boleta, notas de crédito y débito firmadas y enviadas a SUNAT.' },
      { icon: 'Search', title: 'Consulta RUC y DNI', description: 'Datos de empresas y personas al instante para completar tus comprobantes.' },
      { icon: 'Truck', title: 'Guías de remisión', description: 'Emite guías de remisión remitente y transportista.' },
      { icon: 'FileCheck2', title: 'Estado y CDR', description: 'Consulta el estado del comprobante y descarga el XML firmado y el CDR.' },
      { icon: 'Gauge', title: 'Un panel para todo', description: 'La cuota de tu plan, compartida por todas tus keys, y tus otras APIs en el mismo panel.' },
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

export const BRAND_IDS: BrandId[] = ['shalom', 'olva', 'sunat'];

/**
 * Sitio central: landing de todas las APIs y el panel único (cuenta, keys y
 * pagos). Las landings de cada API siguen en sus dominios y mandan al panel.
 */
export interface HubSite {
  id: 'hub';
  name: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  hosts: string[];
  theme: BrandTheme;
}

export type SiteId = BrandId | 'hub';
export type Site = Brand | HubSite;

export const HUB: HubSite = {
  id: 'hub',
  name: "Mathyu's APIs",
  tagline: 'Envíos y facturación para tu ecommerce en Perú',
  heroTitle: 'Las APIs de tu ecommerce, en una sola cuenta',
  heroSubtitle:
    'Shalom, Olva y SUNAT con un solo registro, un solo panel y pagos con Yape o Plin. Pagas solo por las APIs que usas.',
  hosts: ['mathyu.dev', 'www.mathyu.dev', 'app.mathyu.dev'],
  theme: {
    font: 'inter',
    foreground: '#0F172A',
    muted: '#475569',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    onPrimary: '#FFFFFF',
    accent: '#4F46E5',
    accentSoft: '#EEF2FF',
    signature: '#4F46E5',
    onSignature: '#FFFFFF',
    mark: '#0F172A',
    onMark: '#FFFFFF',
    header: '#FFFFFF',
    onHeader: '#0F172A',
    dark: '#0F172A',
    darker: '#020617',
    onDarkMuted: '#CBD5E1',
    tint: '#E0E7FF',
    section: '#F8FAFC',
  },
};

export const SITE_IDS: SiteId[] = ['hub', ...BRAND_IDS];
/** Sin dominio propio ni cookie (preview en un solo dominio): la landing central. */
export const DEFAULT_SITE: SiteId = 'hub';

export function getSiteById(id: SiteId): Site {
  return id === 'hub' ? HUB : BRANDS[id];
}

export function siteByHost(host?: string | null): SiteId | null {
  if (!host) return null;
  const h = host.split(':')[0].toLowerCase();
  return SITE_IDS.find((id) => getSiteById(id).hosts.includes(h)) ?? null;
}
