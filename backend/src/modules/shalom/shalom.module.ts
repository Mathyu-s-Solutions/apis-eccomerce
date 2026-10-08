import { Module } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { ShalomController } from './shalom.controller';
import { ShalomService } from './shalom.service';
import { ShalomWebClient } from './shalom-web.client';
import {
  CAPTCHA_PROVIDER,
  NoneCaptchaProvider,
} from './captcha/captcha.provider';
import { PlaywrightCaptchaProvider } from './captcha/playwright-captcha.provider';

@Module({
  controllers: [ShalomController],
  providers: [
    ShalomService,
    ShalomWebClient,
    // Ambos se registran para que Nest gestione su ciclo de vida (p. ej. cerrar
    // el navegador en shutdown). Playwright no lanza Chromium hasta el 1er token.
    NoneCaptchaProvider,
    PlaywrightCaptchaProvider,
    {
      provide: CAPTCHA_PROVIDER,
      inject: [CONFIG_TOKEN, NoneCaptchaProvider, PlaywrightCaptchaProvider],
      useFactory: (
        config: AppConfig,
        none: NoneCaptchaProvider,
        playwright: PlaywrightCaptchaProvider,
      ) => (config.shalom.captchaProvider === 'playwright' ? playwright : none),
    },
  ],
  exports: [ShalomService],
})
export class ShalomModule {}
