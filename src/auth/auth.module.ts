import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CONFIG_TOKEN, type AppConfig } from '../config/configuration';
import { API_KEY_STORE } from './api-key.store';
import { InMemoryApiKeyStore } from './in-memory-api-key.store';
import { PrismaApiKeyStore } from './prisma-api-key.store';
import { ApiKeyGuard } from './api-key.guard';
import { QuotaInterceptor } from './quota.interceptor';
import { AuthController } from './auth.controller';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    InMemoryApiKeyStore,
    PrismaApiKeyStore,
    {
      // Con DATABASE_URL -> Postgres; sin ella -> memoria (dev/tests).
      provide: API_KEY_STORE,
      inject: [CONFIG_TOKEN, InMemoryApiKeyStore, PrismaApiKeyStore],
      useFactory: (
        config: AppConfig,
        memory: InMemoryApiKeyStore,
        prisma: PrismaApiKeyStore,
      ) => (config.auth.databaseUrl ? prisma : memory),
    },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_INTERCEPTOR, useClass: QuotaInterceptor },
  ],
  exports: [API_KEY_STORE],
})
export class AuthModule {}
