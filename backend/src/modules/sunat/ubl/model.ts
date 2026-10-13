import type { Dec } from '../core/decimal';
import type { Affectation } from '../core/catalogs';

/** Emisor del comprobante (la empresa del cliente). */
export interface Issuer {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  direccion: string;
  ubigeo?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  urbanizacion?: string | null;
  /** Código del establecimiento anexo (0000 = domicilio fiscal). */
  codigoAnexo: string;
}

export interface Party {
  docType: string;
  docNumber: string;
  name: string;
  address?: string | null;
}

/** Cargo o descuento ya calculado (catálogo 53). */
export interface Allowance {
  code: string;
  /** Factor sobre la base (5 decimales). */
  factor: Dec;
  amount: Dec;
  base: Dec;
}

export interface Line {
  index: number;
  unit: string;
  code?: string | null;
  sunatCode?: string | null;
  description: string;
  quantity: Dec;
  affectationCode: string;
  affectation: Affectation;
  igvPercent: Dec;
  /** Valor unitario sin impuestos (0 en gratuitas: va el referencial). */
  unitValue: Dec;
  /** Precio unitario con impuestos (o valor referencial en gratuitas). */
  unitPrice: Dec;
  /** Valor de venta del ítem (cbc:LineExtensionAmount). */
  value: Dec;
  igv: Dec;
  /** Lo que suma el ítem al total a pagar. */
  total: Dec;
  discounts: Allowance[];
  plate?: string | null;
}

export interface Totals {
  gravadas: Dec;
  exoneradas: Dec;
  inafectas: Dec;
  exportacion: Dec;
  ivap: Dec;
  gratuitas: Dec;
  igvGratuitas: Dec;
  igv: Dec;
  igvIvap: Dec;
  /** cac:TaxTotal/cbc:TaxAmount */
  taxes: Dec;
  /** cbc:LineExtensionAmount: total valor de venta. */
  value: Dec;
  /** cbc:TaxInclusiveAmount: total precio de venta. */
  priceWithTaxes: Dec;
  /** cbc:AllowanceTotalAmount: descuentos que no afectan la base. */
  discounts: Dec;
  /** cbc:PrepaidAmount: total de anticipos. */
  prepaid: Dec;
  /** cbc:PayableAmount: importe total. */
  payable: Dec;
}

export interface Installment {
  amount: Dec;
  dueDate: string;
}

export interface SaleDocument {
  /** 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito. */
  type: '01' | '03' | '07' | '08';
  series: string;
  number: number;
  issueDate: string;
  issueTime: string;
  dueDate?: string | null;
  currency: string;
  operationType: string;
  purchaseOrder?: string | null;
  observation?: string | null;
  issuer: Issuer;
  customer: Party;
  lines: Line[];
  /** Descuentos globales, incluidos los de anticipos (04-06) y la retención (62). */
  allowances: Allowance[];
  totals: Totals;
  /** Tasa única del IGV del comprobante (18, 10.5…). */
  igvPercent: Dec;
  payment?: { type: 'Contado' | 'Credito'; pending?: Dec; installments: Installment[] };
  detraction?: { code: string; percent: Dec; amount: Dec; paymentMeans: string; account: string };
  retention?: { amount: Dec; percent: Dec };
  prepayments: Array<{ docType: string; id: string; amount: Dec }>;
  /** Notas: tipo (catálogo 09/10), motivo y documento que modifica. */
  note?: { code: string; reason: string; affectedType: '01' | '03'; affectedId: string };
  legends: Array<{ code: string; value: string }>;
}
