import { z } from 'zod';

/** Tipos de documento del registro de Olva (`passport` va como "pas"). */
export const OLVA_DOCUMENT_TYPES = { dni: 'dni', ruc: 'ruc', ce: 'ce', passport: 'pas' } as const;
export type OlvaDocumentType = keyof typeof OLVA_DOCUMENT_TYPES;

/** Tope del valor declarado: desde S/ 500 Olva pide declaración jurada (aún no soportada). */
export const OLVA_MAX_DECLARED_VALUE = 500;

/** Clave débil para Olva: repetidos, consecutivos (subiendo o bajando) o solo dos dígitos distintos. */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  const sequence = (step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step);
  return sequence || new Set(d).size <= 2;
}

const DOC_LENGTH: Record<OlvaDocumentType, [number, number]> = { dni: [8, 8], ruc: [11, 11], ce: [8, 12], passport: [8, 12] };

const phone = z.string().trim().regex(/^9\d{8}$/, 'debe ser un celular de 9 dígitos');
const person = z.object({
  documentType: z.enum(Object.keys(OLVA_DOCUMENT_TYPES) as [OlvaDocumentType, ...OlvaDocumentType[]], { error: 'documentType: dni, ruc, ce o passport' }),
  document: z.string().trim().regex(/^[A-Za-z0-9]{8,12}$/, 'document: de 8 a 12 caracteres'),
  /** Nombres (o razón social si es RUC). */
  firstNames: z.string().trim().min(1, 'firstNames es requerido').max(120),
  /** Apellidos (paterno y materno). No va con RUC. */
  lastName: z.string().trim().max(120).optional(),
  phone,
  email: z.string().trim().email('email no es un correo válido').optional(),
});

function checkPerson(p: z.infer<typeof person>, path: string, ctx: z.RefinementCtx) {
  const [min, max] = DOC_LENGTH[p.documentType];
  const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [path, field], message });
  if (p.document.length < min || p.document.length > max) issue('document', `${path}.document: un ${p.documentType} tiene ${min === max ? min : `${min} a ${max}`} caracteres.`);
  if ((p.documentType === 'dni' || p.documentType === 'ruc') && !/^\d+$/.test(p.document)) issue('document', `${path}.document: solo dígitos.`);
  if (p.documentType === 'ruc' && !/^(10|20)/.test(p.document)) issue('document', `${path}.document: el RUC empieza con 10 o 20.`);
  if (p.documentType !== 'ruc' && !p.lastName) issue('lastName', `${path}.lastName es requerido (salvo RUC).`);
}

export const OlvaShipmentSchema = z
  .object({
    /** Sede de origen: el `id` de GET /v1/olva/shipments/origins. */
    origin: z.string().trim().regex(/^\d{1,6}$/, 'origin: el id de la sede (GET /v1/olva/shipments/origins)'),
    /**
     * store = pagas al dejarlo en la tienda de Olva; destination = paga el destinatario al
     * recibirlo; pagoefectivo = se paga un código CIP (banca, agentes, billeteras) antes de dejarlo.
     */
    payment: z.enum(['store', 'destination', 'pagoefectivo'], { error: 'payment: store, destination o pagoefectivo' }),
    sender: person.extend({ email: z.string().trim().email('sender.email no es un correo válido') }),
    recipient: person.extend({
      /** Persona de contacto si el destinatario es una empresa. (Su email solo se envía con pago en destino.) */
      contactName: z.string().trim().max(120).optional(),
    }),
    destination: z.discriminatedUnion(
      'type',
      [
        /** Recojo en una tienda de Olva: `officeId` de GET /v1/olva/shipments/destinations?type=store. */
        z.object({ type: z.literal('store'), officeId: z.string().trim().regex(/^\d{1,8}$/, 'destination.officeId: el officeId de la tienda') }),
        /** Entrega a domicilio: ubigeo INEI del distrito, dirección y referencia. */
        z.object({
          type: z.literal('home'),
          ubigeo: z.string().trim().regex(/^\d{6}$/, 'destination.ubigeo: ubigeo INEI de 6 dígitos'),
          address: z.string().trim().min(5, 'destination.address: la dirección completa').max(200),
          reference: z.string().trim().min(5, 'destination.reference: al menos 5 caracteres').max(200),
        }),
      ],
      { error: 'destination.type: store o home' },
    ),
    package: z.object({
      weightKg: z.number().positive().max(200),
      lengthCm: z.number().positive().max(300),
      widthCm: z.number().positive().max(300),
      heightCm: z.number().positive().max(300),
      /** Contenido: `id` de GET /v1/olva/shipments/categories (p. ej. 227 = ropa y accesorios). */
      categoryId: z.number({ error: 'package.categoryId: el id de GET /v1/olva/shipments/categories' }).int().positive(),
      declaredValue: z.number().min(0).max(OLVA_MAX_DECLARED_VALUE, `declaredValue: hasta S/ ${OLVA_MAX_DECLARED_VALUE} (más pide declaración jurada)`),
      fragile: z.boolean().default(false),
      /** Seguro de Olva (solo en sedes que lo ofrecen). */
      insurance: z.boolean().default(false),
    }),
    /** Clave de 4 dígitos para recoger en tienda; si no la mandas, se genera. */
    pin: z.string().trim().regex(/^\d{4}$/, 'pin: 4 dígitos').optional(),
  })
  .superRefine((v, ctx) => {
    checkPerson(v.sender, 'sender', ctx);
    checkPerson(v.recipient, 'recipient', ctx);
    if (v.pin && isWeakPin(v.pin)) ctx.addIssue({ code: 'custom', path: ['pin'], message: 'pin: sin números repetidos, consecutivos ni patrones simples.' });
  });
export type OlvaShipmentDto = z.infer<typeof OlvaShipmentSchema>;

export const OlvaDestinationsQuerySchema = z.object({
  origin: z.string().trim().regex(/^\d{1,6}$/, 'origin: el id de la sede (GET /v1/olva/shipments/origins)'),
  type: z.enum(['store', 'home']).default('store'),
  payment: z.enum(['store', 'destination', 'pagoefectivo']).default('pagoefectivo'),
  q: z.string().trim().max(80).optional(),
  department: z.string().trim().max(60).optional(),
  province: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type OlvaDestinationsQueryDto = z.infer<typeof OlvaDestinationsQuerySchema>;
