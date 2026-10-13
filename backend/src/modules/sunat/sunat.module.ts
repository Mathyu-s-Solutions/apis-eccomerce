import { Module } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyGuard } from './company.guard';
import { CompanyQueriesController } from './consultas/company-queries.controller';
import { ConsultasController } from './consultas/consultas.controller';
import { SireService } from './consultas/sire.service';
import { ValidityService } from './consultas/validity.service';
import { ExchangeRateService } from './consultas/exchange-rate.service';
import { PadronService } from './consultas/padron.service';
import { DocumentsService } from './documents.service';
import { FilesController } from './files.controller';
import { PdfService } from './pdf/pdf.service';
import { PortalController } from './portal.controller';
import { SecretBox } from './secret-box';
import { SunatController } from './sunat.controller';
import { BillServiceClient } from './transport/bill-service';
import { GreApiClient } from './transport/gre-api';
import { SunatRestClient } from './transport/sunat-rest';

@Module({
  controllers: [SunatController, CompaniesController, ConsultasController, CompanyQueriesController, FilesController, PortalController],
  providers: [
    SecretBox,
    CompaniesService,
    CompanyGuard,
    DocumentsService,
    PdfService,
    PadronService,
    ExchangeRateService,
    ValidityService,
    SireService,
    { provide: BillServiceClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new BillServiceClient({ timeoutMs: config.sunat.timeoutMs }) },
    { provide: GreApiClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new GreApiClient({ timeoutMs: config.sunat.timeoutMs }) },
    { provide: SunatRestClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new SunatRestClient({ timeoutMs: config.sunat.timeoutMs }) },
  ],
  exports: [DocumentsService],
})
export class SunatModule {}
