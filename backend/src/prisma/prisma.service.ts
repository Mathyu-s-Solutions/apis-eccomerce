import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { CONFIG_TOKEN, type AppConfig } from '../config/configuration';

/**
 * Cliente Prisma gestionado por Nest. Solo conecta si hay DATABASE_URL, así la
 * app sigue arrancando sin BD (store de API keys en memoria).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {
    super(
      config.auth.databaseUrl
        ? { datasourceUrl: config.auth.databaseUrl }
        : {},
    );
  }

  get enabled(): boolean {
    return !!this.config.auth.databaseUrl;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    await this.$connect();
    this.logger.log('Conectado a Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.enabled) await this.$disconnect();
  }
}
