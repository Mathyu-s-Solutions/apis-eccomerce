import { Module } from '@nestjs/common';
import { ShalomModule } from '../shalom/shalom.module';
import { OlvaModule } from '../olva/olva.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ShalomModule, OlvaModule],
  controllers: [PublicController],
})
export class PublicModule {}
