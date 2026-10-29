import { z } from 'zod';
import { AFFECTATIONS, CREDIT_NOTE_TYPES, DEBIT_NOTE_TYPES, IDENTITY_TYPES } from '../core/catalogs';

/**
 * Cuerpo de POST /sunat/documents. Los nombres de campo son los de apisunat.pe
 * (español, con guion bajo): quien venga de ahí solo cambia la URL y la key.
 * Los montos se aceptan como texto o número.
 */

/** Decimal no negativo como texto ("254.237288") o número. */
const decimal = (label: string, maxDecimals = 10) =>
  z
    .union([z.string(), z.number()], { error: `${label} es requerido` })
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .refine((v) => new RegExp(`^\\d{1,12}(\\.\\d{1,${maxDecimals}})?$`).test(v), `${label} debe ser un número no negativo (hasta ${maxDecimals} decimales)`);

const date = (label: string) =>
  z
    .string({ error: `${label} es requerido` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} debe tener el formato AAAA-MM-DD`)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), `${label} no es una fecha válida`);

const text = (label: string, max: number) => z.string({ error: `${label} es requerido` }).trim().min(1, `${label} es requerido`).max(max, `${label} admite hasta ${max} caracteres`);

/** Correlativo: número o texto de dígitos. */
const correlative = z
  .union([z.number().int(), z.string().trim().regex(/^\d{1,8}$/)], { error: 'numero debe ser un entero entre 1 y 99999999' })
  .transform(Number)
  .refine((n) => n >= 1 && n <= 99_999_999, 'numero debe ser un entero entre 1 y 99999999');

export const SALE_DOCUMENTS = ['factura', 'boleta', 'nota_credito', 'nota_debito'] as const;
export type SaleDocumentName = (typeof SALE_DOCUMENTS)[number];

const ItemDiscountSchema = z.object({
  monto: decimal('descuentos.monto', 2),
  codigo: z.enum(['00', '01'], { error: 'descuentos.codigo de un ítem debe ser 00 (afecta la base) o 01 (no la afecta)' }),
});

const ItemSchema = z.object({
  unidad_de_medida: z.string().trim().min(1).max(3).default('NIU'),
  codigo_interno: z.string().trim().max(30).optional().nullable(),
  codigo_producto_sunat: z.string().trim().regex(/^\d{8}$/, 'codigo_producto_sunat tiene 8 dígitos').optional().nullable(),
  descripcion: text('items.descripcion', 500),
  cantidad: decimal('items.cantidad'),
  // El valor sin IGV o, si no viene, el precio con IGV (el de la etiqueta): con el precio, el total del ítem es exacto
  // (precio × cantidad) y el IGV sale por diferencia, así un POS cobra S/ 99.00 y no S/ 99.01. Si vienen los dos (como
  // en los ejemplos de apisunat.pe), manda valor_unitario y el precio se ignora, igual que antes.
  valor_unitario: decimal('items.valor_unitario').optional(),
  precio_unitario: decimal('items.precio_unitario').optional(),
  porcentaje_igv: decimal('items.porcentaje_igv', 2).default('18'),
  codigo_tipo_afectacion_igv: z
    .string()
    .trim()
    .default('10')
    .refine((v) => v in AFFECTATIONS, 'items.codigo_tipo_afectacion_igv no es un código del catálogo 07'),
  // Se acepta por compatibilidad: el tributo sale del tipo de afectación.
  nombre_tributo: z.string().trim().optional().nullable(),
  descuentos: z.array(ItemDiscountSchema).max(5).optional(),
  vehiculo_automotor: z.object({ numero_de_placa: z.string().trim().regex(/^[A-Z0-9-]{5,8}$/i, 'numero_de_placa no es válido') }).optional(),
});
export type ItemDto = z.infer<typeof ItemSchema>;

const AffectedDocumentSchema = z.object({
  documento: z.enum(['factura', 'boleta'], { error: 'documento_afectado.documento debe ser factura o boleta' }),
  serie: z.string().trim().regex(/^[FB][A-Z0-9]{3}$/, 'documento_afectado.serie debe tener 4 caracteres y empezar con F o B'),
  numero: correlative,
});

export const SaleDocumentSchema = z
  .object({
    documento: z.enum(SALE_DOCUMENTS, { error: 'documento debe ser factura, boleta, nota_credito o nota_debito' }),
    serie: z.string({ error: 'El campo serie es requerido' }).trim().toUpperCase().regex(/^[FB][A-Z0-9]{3}$/, 'serie debe tener 4 caracteres y empezar con F (factura) o B (boleta)'),
    // Sin número, toma el siguiente correlativo de la serie.
    numero: correlative.optional(),
    fecha_de_emision: date('fecha_de_emision').optional(),
    hora_de_emision: z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'hora_de_emision debe tener el formato HH:MM:SS').optional().nullable(),
    fecha_de_vencimiento: date('fecha_de_vencimiento').optional().nullable(),
    moneda: z.enum(['PEN', 'USD', 'EUR'], { error: 'moneda debe ser PEN, USD o EUR' }).default('PEN'),
    tipo_operacion: z.string().trim().regex(/^\d{4}$/, 'tipo_operacion es un código de 4 dígitos del catálogo 51').default('0101'),
    orden_compra_servicio: z.string().trim().max(20).optional().nullable(),
    observacion: z.string().trim().max(500).optional().nullable(),
    emisor_codigo_de_anexo: z.string().trim().regex(/^\d{4}$/, 'emisor_codigo_de_anexo tiene 4 dígitos').optional().nullable(),
    emisor_direccion: z.string().trim().max(200).optional().nullable(),
    cliente_tipo_de_documento: z
      .union([z.string(), z.number()], { error: 'El campo cliente_tipo_de_documento es requerido' })
      .transform((v) => String(v).trim().toUpperCase())
      .refine((v) => v in IDENTITY_TYPES, 'cliente_tipo_de_documento no es un código del catálogo 06'),
    cliente_numero_de_documento: z
      .union([z.string(), z.number()], { error: 'El campo cliente_numero_de_documento es requerido' })
      .transform((v) => String(v).trim())
      .refine((v) => v.length >= 1 && v.length <= 15, 'cliente_numero_de_documento admite hasta 15 caracteres'),
    cliente_denominacion: text('cliente_denominacion', 200),
    cliente_direccion: z.string().trim().max(200).optional().nullable(),
    cliente_email: z.string().trim().email('cliente_email no es un correo válido').optional().nullable(),
    items: z.array(ItemSchema, { error: 'El campo items es requerido' }).min(1, 'El comprobante necesita al menos un ítem').max(500, 'Hasta 500 ítems por comprobante'),
    descuentos: z
      .array(z.object({ monto: decimal('descuentos.monto', 2), codigo: z.enum(['02', '03', '62'], { error: 'descuentos.codigo global debe ser 02, 03 o 62 (retención)' }) }))
      .max(5)
      .optional(),
    cuotas: z.array(z.object({ importe: decimal('cuotas.importe', 2), fecha_de_pago: date('cuotas.fecha_de_pago') })).max(60).optional(),
    detraccion: z
      .object({
        detraccion_tipo: z.string().trim().regex(/^\d{3}$/, 'detraccion_tipo es un código de 3 dígitos del catálogo 54'),
        detraccion_porcentaje: decimal('detraccion_porcentaje', 3),
        detraccion_total: decimal('detraccion_total', 2),
        medio_de_pago: z.string().trim().regex(/^\d{3}$/, 'medio_de_pago es un código de 3 dígitos del catálogo 59').default('001'),
        numero_cuenta_banco_nacion: z.string().trim().regex(/^[\d-]{5,20}$/, 'numero_cuenta_banco_nacion no es válido'),
      })
      .optional(),
    anticipos: z
      .array(
        z.object({
          documento: z.enum(['factura', 'boleta']).default('factura'),
          serie: z.string().trim().regex(/^[FB][A-Z0-9]{3}$/, 'anticipos.serie debe tener 4 caracteres'),
          numero: correlative,
          monto: decimal('anticipos.monto', 2),
        }),
      )
      .max(20)
      .optional(),
    // Boletas (y sus notas): no enviarla ahora; se informa después con un resumen diario.
    enviar_en_resumen: z.boolean().optional(),
    // Si viene, se compara con el total calculado (tolerancia de un céntimo).
    total: decimal('total', 2).optional().nullable(),
    nota_credito_codigo_tipo: z.string().trim().optional(),
    nota_credito_motivo: z.string().trim().max(250).optional(),
    nota_debito_codigo_tipo: z.string().trim().optional(),
    nota_debito_motivo: z.string().trim().max(250).optional(),
    documento_afectado: AffectedDocumentSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const isNote = d.documento === 'nota_credito' || d.documento === 'nota_debito';

    if (d.documento === 'factura' && !d.serie.startsWith('F')) issue('serie', 'La serie de una factura empieza con F');
    if (d.documento === 'boleta' && !d.serie.startsWith('B')) issue('serie', 'La serie de una boleta empieza con B');

    if (isNote) {
      if (!d.documento_afectado) return issue('documento_afectado', 'El campo documento_afectado es requerido en una nota');
      const letter = d.documento_afectado.documento === 'factura' ? 'F' : 'B';
      if (!d.documento_afectado.serie.startsWith(letter)) issue('documento_afectado', `La serie de una ${d.documento_afectado.documento} empieza con ${letter}`);
      if (!d.serie.startsWith(letter)) issue('serie', `La nota de una ${d.documento_afectado.documento} usa una serie que empieza con ${letter}`);
    }
    if (d.documento === 'nota_credito') {
      if (!d.nota_credito_codigo_tipo || !(d.nota_credito_codigo_tipo in CREDIT_NOTE_TYPES)) issue('nota_credito_codigo_tipo', 'nota_credito_codigo_tipo debe ser un código del catálogo 09 (01 a 13)');
      if (!d.nota_credito_motivo) issue('nota_credito_motivo', 'El campo nota_credito_motivo es requerido');
    }
    if (d.documento === 'nota_debito') {
      if (!d.nota_debito_codigo_tipo || !(d.nota_debito_codigo_tipo in DEBIT_NOTE_TYPES)) issue('nota_debito_codigo_tipo', 'nota_debito_codigo_tipo debe ser un código del catálogo 10 (01, 02, 03, 11 o 12)');
      if (!d.nota_debito_motivo) issue('nota_debito_motivo', 'El campo nota_debito_motivo es requerido');
    }

    // Una factura va a un RUC, salvo que sea exportación o a un no domiciliado.
    const foreign = /^(02|04)/.test(d.tipo_operacion);
    const targetsInvoice = d.documento === 'factura' || (isNote && d.documento_afectado?.documento === 'factura');
    if (targetsInvoice && !foreign && d.cliente_tipo_de_documento !== '6') issue('cliente_tipo_de_documento', 'Una factura se emite a un cliente con RUC (cliente_tipo_de_documento = 6)');
    if (d.cliente_tipo_de_documento === '6' && !/^\d{11}$/.test(d.cliente_numero_de_documento)) issue('cliente_numero_de_documento', 'El RUC del cliente debe tener 11 dígitos');
    if (d.cliente_tipo_de_documento === '1' && !/^\d{8}$/.test(d.cliente_numero_de_documento)) issue('cliente_numero_de_documento', 'El DNI del cliente debe tener 8 dígitos');

    d.items.forEach((item, i) => {
      if (item.valor_unitario === undefined && item.precio_unitario === undefined) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'valor_unitario'], message: `items[${i}]: falta valor_unitario (sin IGV) o precio_unitario (con IGV)` });
      }
    });

    if (d.enviar_en_resumen && !d.serie.startsWith('B')) issue('enviar_en_resumen', 'Solo las boletas y sus notas (serie B) van en un resumen diario');
    if (d.detraccion && !/^100[1-4]$/.test(d.tipo_operacion)) issue('tipo_operacion', 'Con detracción, tipo_operacion debe ser 1001 (o 1002 a 1004)');
    if (d.cuotas?.length && d.documento === 'boleta') issue('cuotas', 'Las cuotas (venta al crédito) son de facturas');
  });

export type SaleDocumentDto = z.infer<typeof SaleDocumentSchema>;
