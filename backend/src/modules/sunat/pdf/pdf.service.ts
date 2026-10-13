import { Injectable } from '@nestjs/common';
import type { SunatCompany, SunatDocument } from '../../../../generated/prisma';
import { CompaniesService } from '../companies.service';
import { DocumentsService } from '../documents.service';
import { DespatchSchema } from '../dto/despatch.dto';
import { despatchA4 } from './despatch-pdf';
import { saleA4, saleTicket } from './sale-pdf';

/** Representación impresa de un comprobante guardado. Se genera al pedirla: no ocupa espacio en la BD. */
@Injectable()
export class PdfService {
  constructor(
    private readonly documents: DocumentsService,
    private readonly companies: CompaniesService,
  ) {}

  render(doc: SunatDocument & { company: SunatCompany }, format: 'a4' | 'ticket'): Promise<Buffer> {
    const ctx = {
      hash: doc.hash,
      status: doc.status,
      environment: doc.environment,
      logo: doc.company.logo ? Buffer.from(doc.company.logo) : null,
      phone: doc.company.telefono,
      email: doc.company.email,
    };
    if (doc.type === '09' || doc.type === '31') {
      // SUNAT devuelve en el CDR de la guía el enlace que va en su QR.
      const qrUrl = /DocumentDescription>\s*(https?:\/\/[^<\s]+)/i.exec(this.documents.cdrXml(doc) ?? '')?.[1]?.replace(/&amp;/g, '&') ?? null;
      return despatchA4(DespatchSchema.parse(doc.input), this.companies.issuer(doc.company), { ...ctx, number: doc.number, qrUrl });
    }
    const sale = this.documents.rebuild(doc, doc.company);
    // La hora de emisión real está en el pedido guardado.
    sale.issueTime = (doc.input as { hora_de_emision?: string }).hora_de_emision ?? sale.issueTime;
    return format === 'ticket' ? saleTicket(sale, ctx) : saleA4(sale, ctx);
  }
}
