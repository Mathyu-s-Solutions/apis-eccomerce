import { Module } from '@nestjs/common';
import { CaptchaModule } from '../../common/captcha/captcha.module';
import { SecretBox } from '../../common/crypto/secret-box';
import { ShalomController } from './shalom.controller';
import { ShalomService } from './shalom.service';
import { ShalomWebClient } from './shalom-web.client';
import { ShalomGuideCache } from './shalom-guide-cache';
import { ShalomProClient } from './pro/shalom-pro.client';
import { ShalomProController } from './pro/shalom-pro.controller';
import { ShalomProService } from './pro/shalom-pro.service';

@Module({
  imports: [CaptchaModule],
  controllers: [ShalomController, ShalomProController],
  providers: [
    ShalomService,
    ShalomWebClient,
    ShalomGuideCache,
    // Guías con la cuenta de Shalom Pro del cliente (credenciales cifradas).
    SecretBox,
    ShalomProClient,
    ShalomProService,
  ],
  exports: [ShalomService],
})
export class ShalomModule {}
