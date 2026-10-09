import { z } from 'zod';

/** `VAR=` vacío en el .env cuenta como no definida. */
const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional(),
);

/** Esquema de variables de entorno. Falla el arranque si algo es inválido. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Si está definida, Auth persiste en Postgres (Prisma). Si no, store en memoria.
  DATABASE_URL: optionalUrl,
  // Solo la usa la CLI de Prisma para migraciones; aquí se valida si existe.
  DIRECT_DATABASE_URL: optionalUrl,

  DEV_API_KEY: z.string().optional(),
  // Secreto del worker (Cloud Scheduler → POST /v1/internal/cron/tick). Sin él, el worker no corre.
  CRON_SECRET: z.string().min(24).optional(),
  DEV_API_KEY_MONTHLY_LIMIT: z.coerce.number().int().positive().default(100000),
  API_KEYS: z.string().optional(),

  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  HTTP_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  OLVA_WP_BASE: z.string().url().default('https://www.olvacourier.com'),
  OLVA_TRACKING_BASE: z.string().url().default('https://reports.olvaexpress.pe'),
  OLVA_TRACKING_APIKEY: z
    .string()
    .default(
      'a82e5d192fae9bbfee43a964024498e87dfecb884b67c7e95865a3bb07b607dd',
    ),

  SHALOM_WEB_BASE: z.string().url().default('https://shalom.com.pe'),
  SHALOM_RECAPTCHA_SITEKEY: z
    .string()
    .default('6LeGp5EtAAAAADF5427odqjDKEoxPudnerojGTt2'),
  SHALOM_CAPTCHA_PROVIDER: z.enum(['none', 'playwright']).default('none'),
  SHALOM_CAPTCHA_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SHALOM_CAPTCHA_POOL_SIZE: z.coerce.number().int().min(1).max(8).default(1),
  SHALOM_CAPTCHA_NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  SHALOM_CAPTCHA_TOKEN_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  SHALOM_CAPTCHA_PAGE_TTL_MS: z.coerce.number().int().positive().default(600000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return parsed.data;
}
