import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './config/env.validation';
import { AppConfigModule } from './config/config.module';
import { HttpModule } from './common/http/http.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { OlvaModule } from './modules/olva/olva.module';
import { ShalomModule } from './modules/shalom/shalom.module';
import { SunatModule } from './modules/sunat/sunat.module';
import { PublicModule } from './modules/public/public.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { apiKeyTracker } from './auth/throttle';

const CLOUD_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        ...(process.env.NODE_ENV === 'production'
          ? {
              // JSON con `severity` y `message`: Cloud Logging lo clasifica solo.
              messageKey: 'message',
              formatters: {
                level: (label: string) => ({
                  severity: CLOUD_SEVERITY[label] ?? 'DEFAULT',
                }),
              },
            }
          : {
              transport: { target: 'pino-pretty', options: { singleLine: true } },
            }),
        redact: ['req.headers["x-api-key"]', 'req.headers.cookie'],
        autoLogging: true,
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        // Por API key (la cuota mensual del plan es aparte): 1.000 por minuto.
        { name: 'key', ttl: 60_000, limit: 1000, getTracker: apiKeyTracker },
        // Tope por IP: con keys inventadas cada una sería un límite nuevo.
        { name: 'ip', ttl: 60_000, limit: 3000 },
      ],
    }),
    HttpModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    OlvaModule,
    ShalomModule,
    SunatModule,
    PublicModule,
    WebhooksModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
