import { Injectable } from '@nestjs/common';
import type { SunatCompany, SunatDocument } from '../../../../generated/prisma';
import { DocumentsService } from '../documents.service';
import { saleA4, saleTicket } from './sale-pdf';

/** Representación impresa de un comprobante guardado. Se genera al pedirla: no ocupa espacio en la BD. */
@Injectable()
export class PdfService {
  constructor(private readonly documents: DocumentsService) {}

  render(doc: SunatDocument & { company: SunatCompany }, format: 'a4' | 'ticket'): Promise<Buffer> {
    const sale = this.documents.rebuild(doc, doc.company);
    // La hora de emisión real está en el pedido guardado.
    sale.issueTime = (doc.input as { hora_de_emision?: string }).hora_de_emision ?? sale.issueTime;
    const ctx = {
      hash: doc.hash,
      status: doc.status,
      environment: doc.environment,
      logo: doc.company.logo ? Buffer.from(doc.company.logo) : null,
      phone: doc.company.telefono,
      email: doc.company.email,
    };
    return format === 'ticket' ? saleTicket(sale, ctx) : saleA4(sale, ctx);
  }
}
