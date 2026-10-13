import { DOCUMENT_NAMES, IDENTITY_TYPES, TRANSFER_REASONS, TRANSPORT_MODES, UNITS } from '../core/catalogs';
import { dec, fmtTrim } from '../core/decimal';
import { type DespatchDto, RELATED_DOCUMENTS } from '../dto/despatch.dto';
import type { Issuer } from '../ubl/model';
import { COLOR, FONT, dmy, drawQr, render } from './pdf-kit';

export interface DespatchPdfContext {
  number: number;
  hash: string | null;
  status: string;
  environment: string;
  /** Enlace del QR que devuelve SUNAT en el CDR de una guía aceptada. */
  qrUrl?: string | null;
  logo?: Buffer | null;
  phone?: string | null;
  email?: string | null;
}

const docLabel = (type: string) => IDENTITY_TYPES[type]?.split(' ')[0] ?? 'DOC.';

function banner(ctx: DespatchPdfContext): string | null {
  if (ctx.environment !== 'produccion') return 'DOCUMENTO DE PRUEBA - SIN VALIDEZ TRIBUTARIA';
  if (ctx.status === 'RECHAZADO') return 'GUÍA RECHAZADA POR SUNAT - SIN VALIDEZ';
  if (ctx.status === 'PENDIENTE') return 'PENDIENTE DE RESPUESTA DE SUNAT';
  if (ctx.status === 'ANULADO') return 'GUÍA DADA DE BAJA';
  return null;
}

/** Representación impresa (A4) de una guía de remisión de remitente o de transportista. */
export function despatchA4(dto: DespatchDto, issuer: Issuer, ctx: DespatchPdfContext): Promise<Buffer> {
  const carrier = dto.documento === 'guia_remision_transportista';
  const title = DOCUMENT_NAMES[carrier ? '31' : '09'];
  const id = `${dto.serie}-${ctx.number}`;

  return render({ size: 'A4', margin: 36, info: { Title: `${title} ${id}`, Author: issuer.razonSocial } }, (pdf) => {
    const left = 36;
    const width = pdf.page.width - 72;
    const right = left + width;
    const boxW = 200;

    let x = left;
    if (ctx.logo) {
      try {
        pdf.image(ctx.logo, left, 36, { fit: [90, 62] });
        x = left + 100;
      } catch {
        // sin logo
      }
    }
    const headW = right - boxW - 12 - x;
    pdf.font(FONT.bold).fontSize(13).fillColor(COLOR.text).text(issuer.nombreComercial || issuer.razonSocial, x, 38, { width: headW });
    pdf.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
    if (issuer.nombreComercial) pdf.text(issuer.razonSocial, { width: headW });
    pdf.text([issuer.direccion, [issuer.distrito, issuer.provincia, issuer.departamento].filter(Boolean).join(' - ')].filter(Boolean).join(', '), { width: headW });
    const contact = [ctx.phone && `Tel. ${ctx.phone}`, ctx.email].filter(Boolean).join('  ·  ');
    if (contact) pdf.text(contact, { width: headW });
    const headBottom = pdf.y;

    pdf.roundedRect(right - boxW, 36, boxW, 78, 6).lineWidth(1.2).strokeColor(COLOR.text).stroke();
    pdf.font(FONT.bold).fontSize(11).fillColor(COLOR.text).text(`RUC ${issuer.ruc}`, right - boxW, 45, { width: boxW, align: 'center' });
    pdf.fontSize(9.5).text(title, right - boxW + 10, 61, { width: boxW - 20, align: 'center' });
    pdf.fontSize(12).text(id, right - boxW, pdf.y + 3, { width: boxW, align: 'center' });

    let y = Math.max(headBottom, 120) + 10;
    const warn = banner(ctx);
    if (warn) {
      pdf.rect(left, y, width, 18).fill('#fdecec');
      pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.warn).text(warn, left, y + 5, { width, align: 'center' });
      y += 26;
    }

    /** Un bloque con título y pares etiqueta: valor. */
    const section = (heading: string, rows: Array<[string, string | null | undefined]>) => {
      const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '') as Array<[string, string]>;
      if (!shown.length) return;
      pdf.font(FONT.regular).fontSize(8.5);
      const height = shown.reduce((s, [, v]) => s + Math.max(pdf.heightOfString(v, { width: width - 150 }), 10) + 3, 0) + 24;
      if (y + height > pdf.page.height - 50) {
        pdf.addPage();
        y = 40;
      }
      pdf.rect(left, y, width, 15).fill(COLOR.fill);
      pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.text).text(heading, left + 6, y + 4);
      y += 20;
      for (const [label, value] of shown) {
        pdf.font(FONT.bold).fontSize(8.5).fillColor(COLOR.text).text(`${label}:`, left + 6, y, { width: 132 });
        pdf.font(FONT.regular).text(value, left + 140, y, { width: width - 150 });
        y = Math.max(pdf.y, y + 10) + 3;
      }
      y += 6;
    };

    const recipient = carrier
      ? { type: dto.destinatario.tipo_de_documento, doc: dto.destinatario.numero_de_documento, name: dto.destinatario.denominacion, address: dto.destinatario.direccion }
      : { type: dto.destinatario_tipo_de_documento, doc: dto.destinatario_numero_de_documento, name: dto.destinatario_denominacion, address: dto.destinatario_direccion };

    section('DATOS DEL TRASLADO', [
      ['Fecha de emisión', dmy(dto.fecha_de_emision)],
      ['Inicio del traslado', dmy(dto.fecha_inicio_de_traslado)],
      ...(!carrier
        ? ([
            ['Entrega al transportista', dmy(dto.fecha_entrega_a_transportista)],
            ['Motivo de traslado', `${TRANSFER_REASONS[dto.motivo_de_traslado] ?? dto.motivo_de_traslado}${dto.motivo_de_traslado_descripcion ? ` - ${dto.motivo_de_traslado_descripcion}` : ''}`],
            ['Modalidad de transporte', TRANSPORT_MODES[dto.modalidad_de_transporte]],
          ] as Array<[string, string]>)
        : []),
      ['Peso bruto total', `${fmtTrim(dec(dto.peso_bruto_total), 3)} ${dto.peso_bruto_unidad_de_medida}`],
      ['Número de bultos', dto.numero_de_bultos ? String(dto.numero_de_bultos) : null],
      ['Punto de partida', `${dto.punto_de_partida_direccion} (ubigeo ${dto.punto_de_partida_ubigeo})`],
      ['Punto de llegada', `${dto.punto_de_llegada_direccion} (ubigeo ${dto.punto_de_llegada_ubigeo})`],
    ]);

    if (carrier) {
      section('REMITENTE', [
        ['Nombre o razón social', dto.remitente.denominacion],
        [docLabel(dto.remitente.tipo_de_documento), dto.remitente.numero_de_documento],
      ]);
    }
    section('DESTINATARIO', [
      ['Nombre o razón social', recipient.name],
      [docLabel(recipient.type), recipient.doc],
      ['Dirección', recipient.address],
    ]);

    if (!carrier && dto.transportista) {
      const t = dto.transportista;
      section('TRANSPORTISTA', [
        ['Razón social', t.denominacion],
        ['RUC', t.ruc],
        ['Registro MTC', t.numero_registro_MTC ?? t.numero_registro_mtc],
        ['Autorización', t.numero_autorizacion],
      ]);
    }
    const vehicles = (dto.vehiculos ?? []).map((v) => `${v.numero_de_placa}${v.tarjeta_unica_de_circulacion ?? v.tarjeta_unica_de_cirulacion ? ` (TUC ${v.tarjeta_unica_de_circulacion ?? v.tarjeta_unica_de_cirulacion})` : ''}${v.vehiculo === 'secundario' ? ' - secundario' : ''}`);
    const drivers = (dto.conductores ?? []).map((d) => `${d.nombres} ${d.apellidos} · ${docLabel(d.tipo_de_documento)} ${d.numero_de_documento} · licencia ${d.numero_licencia_conducir}${d.conductor === 'secundario' ? ' - secundario' : ''}`);
    section('UNIDAD DE TRANSPORTE Y CONDUCTOR', [
      ['Registro MTC', carrier ? dto.numero_de_registro_mtc : null],
      ['Vehículo', !carrier && dto.indicador_vehiculo_m1_l && !vehicles.length ? 'Vehículo de categoría M1 o L' : vehicles.join('\n')],
      ['Conductor', drivers.join('\n')],
      ['Subcontratista', carrier && dto.subcontratista ? `${dto.subcontratista.denominacion} · RUC ${dto.subcontratista.ruc}` : null],
      ['Pagador del flete', carrier && dto.pagador_flete ? dto.pagador_flete.charAt(0).toUpperCase() + dto.pagador_flete.slice(1) : null],
      ['Tercero', carrier && dto.tercero ? `${dto.tercero.denominacion} · ${docLabel(dto.tercero.tipo_de_documento)} ${dto.tercero.numero_de_documento}` : null],
    ]);
    section('DOCUMENTOS RELACIONADOS', [['Documentos', (dto.documentos_relacionados ?? []).map((r) => `${RELATED_DOCUMENTS[r.documento].name} ${r.serie}-${r.numero} (RUC ${r.ruc_emisor})`).join('\n')]]);

    // Bienes.
    const items = dto.items ?? [];
    if (items.length) {
      const cols = [
        { title: 'N°', w: 28, align: 'center' as const },
        { title: 'CÓDIGO', w: 70, align: 'left' as const },
        { title: 'DESCRIPCIÓN', w: 0, align: 'left' as const },
        { title: 'UNIDAD', w: 90, align: 'left' as const },
        { title: 'CANTIDAD', w: 64, align: 'right' as const },
      ];
      cols[2].w = width - cols.reduce((s, c) => s + c.w, 0);
      const header = () => {
        pdf.rect(left, y, width, 16).fill(COLOR.fill);
        let cx = left;
        pdf.font(FONT.bold).fontSize(7.5).fillColor(COLOR.text);
        for (const c of cols) {
          pdf.text(c.title, cx + 3, y + 5, { width: c.w - 6, align: c.align });
          cx += c.w;
        }
        y += 18;
      };
      if (y + 40 > pdf.page.height - 50) {
        pdf.addPage();
        y = 40;
      }
      header();
      items.forEach((item, i) => {
        const cells = [String(i + 1), item.codigo_interno ?? '', item.descripcion, UNITS[item.unidad_de_medida.toUpperCase()] ?? item.unidad_de_medida, fmtTrim(dec(item.cantidad), 4)];
        pdf.font(FONT.regular).fontSize(8);
        const h = Math.max(...cells.map((c, j) => pdf.heightOfString(c, { width: cols[j].w - 6 }))) + 5;
        if (y + h > pdf.page.height - 50) {
          pdf.addPage();
          y = 40;
          header();
        }
        let cx = left;
        pdf.font(FONT.regular).fontSize(8).fillColor(COLOR.text);
        cells.forEach((c, j) => {
          pdf.text(c, cx + 3, y + 2, { width: cols[j].w - 6, align: cols[j].align });
          cx += cols[j].w;
        });
        y += h;
        pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(COLOR.line).stroke();
      });
      y += 10;
    }

    if (y + 120 > pdf.page.height - 40) {
      pdf.addPage();
      y = 40;
    }
    const qr = ctx.qrUrl ?? [issuer.ruc, carrier ? '31' : '09', dto.serie, ctx.number, dto.fecha_de_emision ?? '', ctx.hash ?? ''].join('|');
    drawQr(pdf, qr, left, y, 92);
    pdf.font(FONT.regular).fontSize(8).fillColor(COLOR.text);
    if (dto.observaciones) pdf.text(`Observaciones: ${dto.observaciones}`, left + 104, y, { width: width - 104 });
    pdf.fontSize(7.5).fillColor(COLOR.muted);
    if (ctx.hash) pdf.text(`Valor resumen: ${ctx.hash}`, left + 104, dto.observaciones ? pdf.y + 4 : y, { width: width - 104 });
    pdf.text(`Representación impresa de la ${title}. Verifíquela en www.sunat.gob.pe con el código QR.`, left + 104, pdf.y + 2, { width: width - 104 });
  });
}
