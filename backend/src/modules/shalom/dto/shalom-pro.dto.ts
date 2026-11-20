import { z } from 'zod';

/** Cuenta de Shalom Pro (pro.shalom.pe) del cliente: con ella se crean las guías. */
export const ShalomProAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email('email no es un correo válido'),
  password: z.string().min(1, 'password es requerido').max(200),
});
export type ShalomProAccountDto = z.infer<typeof ShalomProAccountSchema>;

/** Cuenta de PUT /shalom/pro/account (la única, salvo con varias conectadas). */
export const DEFAULT_PRO_ACCOUNT = 'default';

/** Identificador de una cuenta de Shalom Pro que elige el cliente (p. ej. el id de su negocio). */
export const PRO_ACCOUNT_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export const PRO_ACCOUNT_REF_HINT = 'account: el identificador de la cuenta de Shalom Pro (letras, números, "_", "." o "-"; hasta 64)';

/** Tamaños de Shalom: los mismos de POST /quote, más `custom` (otra medida, por peso o volumen). */
export const SHALOM_PACKAGES = ['envelope', 'xxs', 'xs', 's', 'm', 'l', 'custom'] as const;
export type ShalomPackage = (typeof SHALOM_PACKAGES)[number];

/** Lo que Shalom deja declarar (solo persona natural y con guías de remisión). */
export const SHALOM_DECLARATIONS = {
  personal: 'Articulos de uso personal',
  documents: 'Documentos',
  clothes: 'Ropa',
  appliances: 'Electrodomesticos',
} as const;

/** Claves que Shalom Pro no acepta (números repetidos o consecutivos), más 0000 y 0123. */
export const WEAK_SECURITY_CODES = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '0123', '1234', '2345', '3456', '4567', '5678', '6789'];

/** Tipo de documento por su largo, como en Shalom Pro. */
export function documentType(document: string): 'DNI' | 'CE' | 'RUC' | 'PS' | null {
  if (!/^\d+$/.test(document)) return null;
  if (document.length === 8) return 'DNI';
  if (document.length === 9) return 'CE';
  if (document.length === 11) return /^(10|20)/.test(document) ? 'RUC' : null;
  if (document.length === 12) return 'PS';
  return null;
}

const phone = z.string().trim().regex(/^9\d{8}$/, 'debe ser un celular de 9 dígitos');
const agencyCode = (field: string) => z.string().trim().regex(/^\d{1,6}$/, `${field}: el code de la agencia (GET /v1/shalom/agencies)`);
const measure = (max: number) => z.number().positive().max(max).optional();

export const ShalomShipmentSchema = z
  .object({
    /** Con qué cuenta de Shalom Pro se crea (su identificador); hace falta si hay varias conectadas. */
    account: z.string().trim().regex(PRO_ACCOUNT_REF, PRO_ACCOUNT_REF_HINT).optional(),
    origin: agencyCode('origin'),
    destination: agencyCode('destination'),
    air: z.boolean().optional(),
    package: z.enum(SHALOM_PACKAGES, { error: `package debe ser uno de: ${SHALOM_PACKAGES.join(', ')}` }),
    quantity: z.number().int().min(1).max(99).default(1),
    /** Solo con `package: "custom"`: el peso o las tres medidas. */
    weightKg: measure(1000),
    lengthCm: measure(500),
    widthCm: measure(500),
    heightCm: measure(500),
    /** Quién paga el flete: el remitente (al dejarlo en la agencia) o el destinatario (al recogerlo). */
    payer: z.enum(['sender', 'recipient']).default('sender'),
    recipient: z.object({
      document: z.string().trim().regex(/^\d{8,12}$/, 'recipient.document: DNI (8), CE (9), RUC (11) o pasaporte (12)'),
      /** Nombres, o la razón social si es RUC. */
      name: z.string().trim().min(1, 'recipient.name es requerido').max(120),
      paternalSurname: z.string().trim().max(60).optional(),
      maternalSurname: z.string().trim().max(60).optional(),
      phone,
      email: z.string().trim().email('recipient.email no es un correo válido').optional(),
    }),
    /** Celular del remitente si no quieres el de tu cuenta de Shalom Pro. */
    senderPhone: phone.optional(),
    /** Clave de 4 dígitos para recoger el envío; si no la mandas, se genera una. */
    securityCode: z.string().trim().regex(/^\d{4}$/, 'securityCode: 4 dígitos').optional(),
    /** Guías de remisión que acompañan la carga. */
    referralGuides: z
      .array(z.object({ series: z.string().trim().min(1).max(10), number: z.string().trim().min(1).max(20) }))
      .max(10)
      .optional(),
    declaration: z.enum(Object.keys(SHALOM_DECLARATIONS) as [keyof typeof SHALOM_DECLARATIONS, ...Array<keyof typeof SHALOM_DECLARATIONS>]).optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (v.origin === v.destination) issue(['destination'], 'El destino debe ser otra agencia.');
    if (v.package === 'custom') {
      const volume = v.lengthCm && v.widthCm && v.heightCm;
      if (!v.weightKg && !volume) issue(['weightKg'], 'Con package "custom" manda weightKg o las tres medidas (lengthCm, widthCm, heightCm).');
    }
    const type = documentType(v.recipient.document);
    if (!type) issue(['recipient', 'document'], 'recipient.document no es un DNI, CE, RUC (10/20) ni pasaporte válido.');
    if (type && type !== 'RUC') {
      if (!v.recipient.paternalSurname) issue(['recipient', 'paternalSurname'], 'recipient.paternalSurname es requerido (salvo RUC).');
      if (!v.recipient.maternalSurname) issue(['recipient', 'maternalSurname'], 'recipient.maternalSurname es requerido (salvo RUC).');
    }
    if (v.securityCode && WEAK_SECURITY_CODES.includes(v.securityCode)) {
      issue(['securityCode'], 'Por seguridad la clave no puede tener números repetidos ni consecutivos.');
    }
    if (v.declaration) {
      if (!v.referralGuides?.length) issue(['declaration'], 'La declaración jurada va con al menos una guía de remisión (referralGuides).');
      if (type === 'RUC') issue(['declaration'], 'La declaración jurada solo es para persona natural.');
    }
  });
export type ShalomShipmentDto = z.infer<typeof ShalomShipmentSchema>;
