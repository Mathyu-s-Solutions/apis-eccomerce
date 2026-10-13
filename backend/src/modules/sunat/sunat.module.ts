import { Module } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyGuard } from './company.guard';
import { ConsultasController } from './consultas/consultas.controller';
import { ExchangeRateService } from './consultas/exchange-rate.service';
import { PadronService } from './consultas/padron.service';
import { DocumentsService } from './documents.service';
import { FilesController } from './files.controller';
import { PdfService } from './pdf/pdf.service';
import { SecretBox } from './secret-box';
import { SunatController } from './sunat.controller';
import { BillServiceClient } from './transport/bill-service';
import { GreApiClient } from './transport/gre-api';

@Module({
  controllers: [SunatController, CompaniesController, ConsultasController, FilesController],
  providers: [
    SecretBox,
    CompaniesService,
    CompanyGuard,
    DocumentsService,
    PdfService,
    PadronService,
    ExchangeRateService,
    { provide: BillServiceClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new BillServiceClient({ timeoutMs: config.sunat.timeoutMs }) },
    { provide: GreApiClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new GreApiClient({ timeoutMs: config.sunat.timeoutMs }) },
  ],
  exports: [DocumentsService],
})
export class SunatModule {}
