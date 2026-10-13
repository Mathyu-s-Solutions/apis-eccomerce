import { z } from 'zod';
import { isValidRuc } from '../core/ruc';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

/** Archivo en base64 (con o sin el prefijo `data:...;base64,`). */
const base64File = (label: string, maxBytes: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''))
    .refine((v) => v.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v), `${label} debe venir en base64`)
    .refine((v) => v.length * 0.75 <= maxBytes, `${label} supera el tamaño máximo`);

/**
 * Alta o cambio de una empresa emisora. Lo que no se manda no cambia; las
 * credenciales (clave SOL, certificado, secreto de la API) nunca se devuelven.
 */
export const CompanySchema = z.object({
  ruc: z.string({ error: 'El campo ruc es requerido' }).trim().refine(isValidRuc, 'ruc no es un RUC válido'),
  razon_social: z.string().trim().min(1).max(200).optional(),
  nombre_comercial: optionalText(200),
  direccion: z.string().trim().min(1).max(200).optional(),
  ubigeo: z.string().trim().regex(/^\d{6}$/, 'ubigeo tiene 6 dígitos').optional().nullable(),
  departamento: optionalText(60),
  provincia: optionalText(60),
  distrito: optionalText(60),
  urbanizacion: optionalText(60),
  telefono: optionalText(30),
  email: z.string().trim().email('email no es un correo válido').optional().nullable(),
  ambiente: z.enum(['beta', 'produccion'], { error: 'ambiente debe ser beta o produccion' }).optional(),
  sol_usuario: z.string().trim().min(3).max(20).toUpperCase().optional().nullable(),
  sol_clave: z.string().min(1).max(60).optional().nullable(),
  // .pfx/.p12 en base64, o el PEM (llave privada + certificado) como texto.
  certificado: z.string().trim().min(100, 'certificado: el .pfx/.p12 en base64 o el PEM como texto').max(100_000).optional().nullable(),
  certificado_clave: z.string().max(100).optional().nullable(),
  api_client_id: z.string().trim().min(8).max(80).optional().nullable(),
  api_client_secret: z.string().trim().min(8).max(120).optional().nullable(),
  // PNG o JPG en base64, hasta 300 KB. `null` lo quita.
  logo: base64File('logo', 300_000).optional().nullable(),
});
export type CompanyDto = z.infer<typeof CompanySchema>;
