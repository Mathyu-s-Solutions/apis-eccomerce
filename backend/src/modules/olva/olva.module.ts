import { Module } from '@nestjs/common';
import { CaptchaModule } from '../../common/captcha/captcha.module';
import { OlvaController } from './olva.controller';
import { OlvaService } from './olva.service';
import { OlvaUpstream } from './olva.upstream';
import { OlvaRegistroClient } from './shipments/olva-registro.client';
import { OlvaShipmentsController } from './shipments/olva-shipments.controller';
import { OlvaShipmentsService } from './shipments/olva-shipments.service';

@Module({
  imports: [CaptchaModule],
  controllers: [OlvaController, OlvaShipmentsController],
  providers: [OlvaService, OlvaUpstream, OlvaRegistroClient, OlvaShipmentsService],
  exports: [OlvaService],
})
export class OlvaModule {}
