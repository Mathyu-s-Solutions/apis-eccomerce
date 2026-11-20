import { Module } from '@nestjs/common';
import { SecretBox } from '../../common/crypto/secret-box';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { ShalomController } from './shalom.controller';
import { ShalomService } from './shalom.service';
import { ShalomWebClient } from './shalom-web.client';
import { ShalomGuideCache } from './shalom-guide-cache';
import {
  CAPTCHA_PROVIDER,
  NoneCaptchaProvider,
} from './captcha/captcha.provider';
import { PlaywrightCaptchaProvider } from './captcha/playwright-captcha.provider';
import { ShalomProClient } from './pro/shalom-pro.client';
import { ShalomProController } from './pro/shalom-pro.controller';
import { ShalomProService } from './pro/shalom-pro.service';

@Module({
  controllers: [ShalomController, ShalomProController],
  providers: [
    ShalomService,
    ShalomWebClient,
    ShalomGuideCache,
    // Guías con la cuenta de Shalom Pro del cliente (credenciales cifradas).
    SecretBox,
    ShalomProClient,
    ShalomProService,
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
