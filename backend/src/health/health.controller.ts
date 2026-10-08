import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get()
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  ready() {
    return { status: 'ready' };
  }
}
