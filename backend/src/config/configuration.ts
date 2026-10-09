import type { Env } from './env.validation';

/**
 * Config tipada y namespaced que consume la app. Se construye desde el entorno
 * ya validado por `validateEnv`.
 */
export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  logLevel: Env['LOG_LEVEL'];
  http: {
    timeoutMs: number;
    retries: number;
  };
  cron: {
    secret?: string;
  };
  auth: {
    databaseUrl?: string;
    devApiKey?: string;
    devApiKeyMonthlyLimit: number;
    apiKeysJson?: string;
  };
  olva: {
    wpBase: string;
    trackingBase: string;
    trackingApiKey: string;
  };
  shalom: {
    webBase: string;
    recaptchaSiteKey: string;
    captchaProvider: Env['SHALOM_CAPTCHA_PROVIDER'];
    captcha: {
      headless: boolean;
      poolSize: number;
      navTimeoutMs: number;
      tokenTimeoutMs: number;
      pageTtlMs: number;
    };
  };
}

export function buildConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    http: {
      timeoutMs: env.HTTP_TIMEOUT_MS,
      retries: env.HTTP_RETRIES,
    },
    cron: {
      secret: env.CRON_SECRET,
    },
    auth: {
      databaseUrl: env.DATABASE_URL,
      devApiKey: env.DEV_API_KEY,
      devApiKeyMonthlyLimit: env.DEV_API_KEY_MONTHLY_LIMIT,
      apiKeysJson: env.API_KEYS,
    },
    olva: {
      wpBase: env.OLVA_WP_BASE,
      trackingBase: env.OLVA_TRACKING_BASE,
      trackingApiKey: env.OLVA_TRACKING_APIKEY,
    },
    shalom: {
      webBase: env.SHALOM_WEB_BASE,
      recaptchaSiteKey: env.SHALOM_RECAPTCHA_SITEKEY,
      captchaProvider: env.SHALOM_CAPTCHA_PROVIDER,
      captcha: {
        headless: env.SHALOM_CAPTCHA_HEADLESS,
        poolSize: env.SHALOM_CAPTCHA_POOL_SIZE,
        navTimeoutMs: env.SHALOM_CAPTCHA_NAV_TIMEOUT_MS,
        tokenTimeoutMs: env.SHALOM_CAPTCHA_TOKEN_TIMEOUT_MS,
        pageTtlMs: env.SHALOM_CAPTCHA_PAGE_TTL_MS,
      },
    },
  };
}

export const CONFIG_TOKEN = 'APP_CONFIG';
