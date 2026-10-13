import { Module } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyGuard } from './company.guard';
import { DocumentsService } from './documents.service';
import { FilesController } from './files.controller';
import { PdfService } from './pdf/pdf.service';
import { SecretBox } from './secret-box';
import { SunatController } from './sunat.controller';
import { BillServiceClient } from './transport/bill-service';

@Module({
  controllers: [SunatController, CompaniesController, FilesController],
  providers: [
    SecretBox,
    CompaniesService,
    CompanyGuard,
    DocumentsService,
    PdfService,
    { provide: BillServiceClient, inject: [CONFIG_TOKEN], useFactory: (config: AppConfig) => new BillServiceClient({ timeoutMs: config.sunat.timeoutMs }) },
  ],
  exports: [DocumentsService],
})
export class SunatModule {}
