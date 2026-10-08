export interface Plan {
  id: string;
  name: string;
  pricedPen: number; // soles/mes (0 = gratis)
  monthlyLimit: number | null; // null = ilimitado
  highlight?: boolean;
  features: string[];
}

// Planes por producto. El límite se traduce en la cuota mensual de la API key.
export const PLANS: Record<string, Plan[]> = {
  shalom: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 100, features: ['100 consultas/mes', 'Tracking y agencias', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 49, monthlyLimit: 5000, highlight: true, features: ['5,000 consultas/mes', 'Tracking, agencias y cotización', 'Webhooks de estado', 'Soporte prioritario'] },
    { id: 'pro', name: 'Pro', pricedPen: 149, monthlyLimit: 50000, features: ['50,000 consultas/mes', 'Todo lo del Básico', 'Rastreo por guía con captcha', 'SLA de disponibilidad'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Consultas ilimitadas', 'Integración a medida', 'Soporte dedicado'] },
  ],
  olva: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 100, features: ['100 consultas/mes', 'Tracking y agencias', 'Soporte por correo'] },
    { id: 'basico', name: 'Básico', pricedPen: 49, monthlyLimit: 5000, highlight: true, features: ['5,000 consultas/mes', 'Tracking, agencias y cotización', 'Webhooks de estado', 'Soporte prioritario'] },
    { id: 'pro', name: 'Pro', pricedPen: 149, monthlyLimit: 50000, features: ['50,000 consultas/mes', 'Todo lo del Básico', 'Cotización por ubigeo', 'SLA de disponibilidad'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 399, monthlyLimit: null, features: ['Consultas ilimitadas', 'Integración a medida', 'Soporte dedicado'] },
  ],
  sunat: [
    { id: 'free', name: 'Prueba', pricedPen: 0, monthlyLimit: 50, features: ['50 comprobantes/mes', 'Consulta RUC y DNI', 'Entorno de pruebas'] },
    { id: 'basico', name: 'Básico', pricedPen: 69, monthlyLimit: 2000, highlight: true, features: ['2,000 comprobantes/mes', 'Factura y boleta electrónica', 'Consulta RUC/DNI', 'Soporte prioritario'] },
    { id: 'pro', name: 'Pro', pricedPen: 199, monthlyLimit: 20000, features: ['20,000 comprobantes/mes', 'Notas de crédito/débito', 'Guías de remisión', 'SLA de disponibilidad'] },
    { id: 'empresarial', name: 'Empresarial', pricedPen: 499, monthlyLimit: null, features: ['Comprobantes ilimitados', 'Integración a medida', 'Soporte dedicado'] },
  ],
};

export function getPlan(product: string, planId: string): Plan | undefined {
  return PLANS[product]?.find((p) => p.id === planId);
}
