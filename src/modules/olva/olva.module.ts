import { Module } from '@nestjs/common';
import { OlvaController } from './olva.controller';
import { OlvaService } from './olva.service';
import { OlvaUpstream } from './olva.upstream';

@Module({
  controllers: [OlvaController],
  providers: [OlvaService, OlvaUpstream],
  exports: [OlvaService],
})
export class OlvaModule {}
