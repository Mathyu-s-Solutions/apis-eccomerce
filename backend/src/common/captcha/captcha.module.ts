import { Module } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { CAPTCHA_PROVIDER, NoneCaptchaProvider } from './captcha.provider';
import { PlaywrightCaptchaProvider } from './playwright-captcha.provider';

/**
 * Captcha compartido por Shalom y Olva: un solo Chromium para los dos. El
 * proveedor sale de SHALOM_CAPTCHA_PROVIDER (none | playwright).
 */
@Module({
  providers: [
    // Ambos se registran para que Nest gestione su ciclo de vida (p. ej. cerrar
    // el navegador en shutdown). Playwright no lanza Chromium hasta el 1er token.
    NoneCaptchaProvider,
    PlaywrightCaptchaProvider,
    {
      provide: CAPTCHA_PROVIDER,
      inject: [CONFIG_TOKEN, NoneCaptchaProvider, PlaywrightCaptchaProvider],
      useFactory: (config: AppConfig, none: NoneCaptchaProvider, playwright: PlaywrightCaptchaProvider) =>
        config.shalom.captchaProvider === 'playwright' ? playwright : none,
    },
  ],
  exports: [CAPTCHA_PROVIDER],
})
export class CaptchaModule {}
