import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../../auth/public.decorator';
import { DocumentsService, fileName } from './documents.service';
import { PdfService } from './pdf/pdf.service';

/**
 * Descarga pública de los archivos de un comprobante. El enlace lleva un token
 * aleatorio propio de cada comprobante: se puede compartir con el cliente final.
 */
@ApiTags('sunat · archivos')
@Public()
@Controller('sunat/files')
export class FilesController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly pdf: PdfService,
  ) {}

  @Get(':token/:name')
  @ApiOperation({
    summary: 'XML firmado, CDR o PDF de un comprobante',
    description: '`<archivo>.xml` (XML firmado), `R-<archivo>.xml` (CDR de SUNAT), `<archivo>.pdf` (A4) o `<archivo>-ticket.pdf` (ticket de 80 mm). Los enlaces vienen en la respuesta de cada comprobante.',
  })
  async file(@Param('token') token: string, @Param('name') name: string, @Res() res: FastifyReply) {
    if (!/^[\w-]{20,40}$/.test(token)) throw new NotFoundException('El archivo no existe.');
    const doc = await this.documents.byToken(token);
    const base = fileName(doc, doc.company.ruc);
    const send = (type: string, body: string | Buffer) =>
      res.header('content-type', type).header('content-disposition', `inline; filename="${name}"`).header('cache-control', 'private, max-age=60').send(body);

    if (name === `${base}.xml`) return send('application/xml; charset=utf-8', this.documents.signedXml(doc));
    if (name === `R-${base}.xml`) {
      const cdr = this.documents.cdrXml(doc);
      if (!cdr) throw new NotFoundException('SUNAT todavía no devolvió la constancia (CDR) de este comprobante.');
      return send('application/xml; charset=utf-8', cdr);
    }
    const printable = doc.type !== 'RC' && doc.type !== 'RA';
    if (printable && name === `${base}.pdf`) return send('application/pdf', await this.pdf.render(doc, 'a4'));
    if (printable && name === `${base}-ticket.pdf`) return send('application/pdf', await this.pdf.render(doc, 'ticket'));
    throw new NotFoundException('El archivo no existe.');
  }
}
