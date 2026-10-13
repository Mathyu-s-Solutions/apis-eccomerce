import { z } from 'zod';
import { IDENTITY_TYPES, TRANSFER_REASONS } from '../core/catalogs';
import { isValidRuc } from '../core/ruc';

/**
 * Guías de remisión electrónicas (remitente y transportista), con los campos de
 * apisunat.pe. Van por la API REST de SUNAT: necesitan las credenciales de API
 * de la empresa (salvo en beta).
 */

const date = (label: string) =>
  z
    .string({ error: `${label} es requerido` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} debe tener el formato AAAA-MM-DD`);

const decimal = (label: string) =>
  z
    .union([z.string(), z.number()], { error: `${label} es requerido` })
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,12}(\.\d{1,10})?$/.test(v), `${label} debe ser un número`);

const correlative = z
  .union([z.number().int(), z.string().trim().regex(/^\d{1,8}$/)], { error: 'numero debe ser un entero entre 1 y 99999999' })
  .transform(Number)
  .refine((n) => n >= 1 && n <= 99_999_999, 'numero debe ser un entero entre 1 y 99999999');

const docType = (label: string) =>
  z
    .union([z.string(), z.number()], { error: `${label} es requerido` })
    .transform((v) => String(v).trim().toUpperCase())
    .refine((v) => v in IDENTITY_TYPES, `${label} no es un código del catálogo 06`);

const ubigeo = (label: string) => z.string({ error: `${label} es requerido` }).trim().regex(/^\d{6}$/, `${label} tiene 6 dígitos`);
const address = (label: string) => z.string({ error: `${label} es requerido` }).trim().min(1, `${label} es requerido`).max(500);
const ruc = (label: string) => z.string({ error: `${label} es requerido` }).trim().refine(isValidRuc, `${label} no es un RUC válido`);
const plate = z
  .string({ error: 'numero_de_placa es requerido' })
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/-/g, ''))
  .refine((v) => /^[A-Z0-9]{6,8}$/.test(v), 'numero_de_placa: 6 a 8 letras o números, sin guion');

const PartySchema = z.object({
  tipo_de_documento: docType('tipo_de_documento'),
  numero_de_documento: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  denominacion: z.string().trim().min(1).max(250),
  direccion: z.string().trim().max(500).optional().nullable(),
});

const ItemSchema = z.object({
  codigo_interno: z.string().trim().max(30).optional().nullable(),
  codigo_producto_sunat: z.string().trim().regex(/^\d{8}$/).optional().nullable(),
  descripcion: z.string({ error: 'items.descripcion es requerido' }).trim().min(1).max(500),
  unidad_de_medida: z.string().trim().min(1).max(3).default('NIU'),
  cantidad: decimal('items.cantidad'),
});

const DriverSchema = z.object({
  conductor: z.enum(['principal', 'secundario']).default('principal'),
  tipo_de_documento: docType('conductores.tipo_de_documento').default('1'),
  numero_de_documento: z.union([z.string(), z.number()], { error: 'conductores.numero_de_documento es requerido' }).transform((v) => String(v).trim()),
  nombres: z.string({ error: 'conductores.nombres es requerido' }).trim().min(1).max(250),
  apellidos: z.string({ error: 'conductores.apellidos es requerido' }).trim().min(1).max(250),
  numero_licencia_conducir: z.string({ error: 'conductores.numero_licencia_conducir es requerido' }).trim().toUpperCase().regex(/^[A-Z0-9]{9,10}$/, 'numero_licencia_conducir: 9 o 10 letras y números'),
});

const VehicleSchema = z.object({
  vehiculo: z.enum(['principal', 'secundario']).default('principal'),
  numero_de_placa: plate,
  // apisunat.pe lo escribe "cirulacion"; se aceptan los dos.
  tarjeta_unica_de_circulacion: z.string().trim().max(15).optional().nullable(),
  tarjeta_unica_de_cirulacion: z.string().trim().max(15).optional().nullable(),
});

/** Documento relacionado → catálogo 61. */
export const RELATED_DOCUMENTS: Record<string, { code: string; name: string }> = {
  factura: { code: '01', name: 'Factura' },
  boleta: { code: '03', name: 'Boleta de Venta' },
  liquidacion_de_compra: { code: '04', name: 'Liquidación de Compra' },
  guia_remision: { code: '09', name: 'Guía de Remisión Remitente' },
  guia_remision_remitente: { code: '09', name: 'Guía de Remisión Remitente' },
  guia_remision_transportista: { code: '31', name: 'Guía de Remisión Transportista' },
};

const RelatedSchema = z.object({
  documento: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v in RELATED_DOCUMENTS, `documentos_relacionados.documento debe ser ${Object.keys(RELATED_DOCUMENTS).join(', ')}`),
  serie: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/, 'documentos_relacionados.serie tiene 4 caracteres'),
  numero: correlative,
  ruc_emisor: ruc('documentos_relacionados.ruc_emisor'),
});

const common = {
  serie: z.string({ error: 'El campo serie es requerido' }).trim().toUpperCase(),
  numero: correlative.optional(),
  fecha_de_emision: date('fecha_de_emision').optional(),
  hora_de_emision: z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'hora_de_emision debe tener el formato HH:MM:SS').optional().nullable(),
  observaciones: z.string().trim().max(250).optional().nullable(),
  punto_de_partida_ubigeo: ubigeo('punto_de_partida_ubigeo'),
  punto_de_partida_direccion: address('punto_de_partida_direccion'),
  punto_de_llegada_ubigeo: ubigeo('punto_de_llegada_ubigeo'),
  punto_de_llegada_direccion: address('punto_de_llegada_direccion'),
  peso_bruto_total: decimal('peso_bruto_total'),
  peso_bruto_unidad_de_medida: z.enum(['KGM', 'TNE'], { error: 'peso_bruto_unidad_de_medida debe ser KGM o TNE' }).default('KGM'),
  numero_de_bultos: z.coerce.number().int().min(0).max(999_999).optional().nullable(),
  documentos_relacionados: z.array(RelatedSchema).max(50).optional(),
  conductores: z.array(DriverSchema).max(3).optional(),
  vehiculos: z.array(VehicleSchema).max(3).optional(),
};

/** apisunat.pe documenta dos nombres para estos campos: se aceptan los dos. */
const ALIASES: Record<string, string> = {
  tipo_transporte: 'modalidad_de_transporte',
  motivo_traslado: 'motivo_de_traslado',
  motivo_traslado_descripcion: 'motivo_de_traslado_descripcion',
};
function withAliases(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (out[name] === undefined && out[alias] !== undefined) out[name] = out[alias];
  }
  return out;
}

const SenderDespatchObject = z
  .object({
    documento: z.literal('guia_remision_remitente'),
    ...common,
    serie: common.serie.regex(/^T[A-Z0-9]{3}$/, 'La serie de una guía de remitente tiene 4 caracteres y empieza con T'),
    motivo_de_traslado: z
      .string({ error: 'El campo motivo_de_traslado es requerido' })
      .trim()
      .refine((v) => v in TRANSFER_REASONS, 'motivo_de_traslado no es un código del catálogo 20'),
    motivo_de_traslado_descripcion: z.string().trim().max(100).optional().nullable(),
    modalidad_de_transporte: z.enum(['01', '02'], { error: 'modalidad_de_transporte debe ser 01 (público) o 02 (privado)' }),
    fecha_inicio_de_traslado: date('fecha_inicio_de_traslado').optional().nullable(),
    fecha_entrega_a_transportista: date('fecha_entrega_a_transportista').optional().nullable(),
    destinatario_tipo_de_documento: docType('destinatario_tipo_de_documento'),
    destinatario_numero_de_documento: z.union([z.string(), z.number()], { error: 'El campo destinatario_numero_de_documento es requerido' }).transform((v) => String(v).trim()),
    destinatario_denominacion: z.string({ error: 'El campo destinatario_denominacion es requerido' }).trim().min(1).max(250),
    destinatario_direccion: z.string().trim().max(500).optional().nullable(),
    // Traslado entre establecimientos de la misma empresa (motivo 04): código de cada local.
    punto_de_partida_codigo_establecimiento: z.string().trim().regex(/^\d{4}$/).optional().nullable(),
    punto_de_llegada_codigo_establecimiento: z.string().trim().regex(/^\d{4}$/).optional().nullable(),
    // Vehículo de categoría M1 o L (auto, moto): no exige placa ni conductor.
    indicador_vehiculo_m1_l: z.boolean().optional(),
    transportista: z
      .object({
        ruc: ruc('transportista.ruc'),
        denominacion: z.string({ error: 'transportista.denominacion es requerido' }).trim().min(1).max(250),
        numero_registro_MTC: z.string().trim().max(20).optional().nullable(),
        numero_registro_mtc: z.string().trim().max(20).optional().nullable(),
        numero_autorizacion: z.string().trim().max(50).optional().nullable(),
        codigo_entidad_autorizadora: z.string().trim().max(2).optional().nullable(),
      })
      .optional(),
    items: z.array(ItemSchema, { error: 'El campo items es requerido' }).min(1, 'La guía necesita al menos un ítem').max(500),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.modalidad_de_transporte === '01') {
      if (!d.transportista) issue('transportista', 'En transporte público (01) el campo transportista es requerido');
      if (!d.fecha_entrega_a_transportista && !d.fecha_inicio_de_traslado) issue('fecha_entrega_a_transportista', 'En transporte público (01) fecha_entrega_a_transportista es requerido');
    } else {
      if (!d.fecha_inicio_de_traslado) issue('fecha_inicio_de_traslado', 'En transporte privado (02) fecha_inicio_de_traslado es requerido');
      if (!d.indicador_vehiculo_m1_l) {
        if (!d.vehiculos?.length) issue('vehiculos', 'En transporte privado (02) hace falta el vehículo (o indicador_vehiculo_m1_l)');
        if (!d.conductores?.length) issue('conductores', 'En transporte privado (02) hace falta el conductor (o indicador_vehiculo_m1_l)');
      }
    }
    if (d.motivo_de_traslado === '13' && !d.motivo_de_traslado_descripcion) issue('motivo_de_traslado_descripcion', 'Con el motivo 13 (otros) describe el motivo en motivo_de_traslado_descripcion');
  });
export const SenderDespatchSchema = z.preprocess(withAliases, SenderDespatchObject);
export type SenderDespatchDto = z.infer<typeof SenderDespatchObject>;

export const CarrierDespatchSchema = z
  .object({
    documento: z.literal('guia_remision_transportista'),
    ...common,
    serie: common.serie.regex(/^V[A-Z0-9]{3}$/, 'La serie de una guía de transportista tiene 4 caracteres y empieza con V'),
    fecha_inicio_de_traslado: date('fecha_inicio_de_traslado'),
    numero_de_registro_mtc: z.string().trim().max(20).optional().nullable(),
    destinatario: PartySchema,
    remitente: PartySchema,
    items: z.array(ItemSchema).max(500).optional(),
    pagador_flete: z.enum(['remitente', 'subcontratador', 'tercero']).optional().nullable(),
    subcontratista: z.object({ ruc: ruc('subcontratista.ruc'), denominacion: z.string().trim().min(1).max(250) }).optional(),
    tercero: PartySchema.optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.vehiculos?.length) ctx.addIssue({ code: 'custom', path: ['vehiculos'], message: 'El campo vehiculos es requerido' });
    if (!d.conductores?.length) ctx.addIssue({ code: 'custom', path: ['conductores'], message: 'El campo conductores es requerido' });
  });
export type CarrierDespatchDto = z.infer<typeof CarrierDespatchSchema>;

export type DespatchDto = SenderDespatchDto | CarrierDespatchDto;

/** Cuerpo de POST /sunat/dispatches: el esquema sale del campo `documento`. */
export const DespatchSchema = z.preprocess(
  withAliases,
  z.discriminatedUnion('documento', [SenderDespatchObject, CarrierDespatchSchema], { error: 'documento debe ser guia_remision_remitente o guia_remision_transportista' }),
);
