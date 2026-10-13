import { DOCUMENT_CODES } from '../core/catalogs';
import { dec, fmt, fmtTrim } from '../core/decimal';
import { el, group, oneLine } from '../core/xml';
import { type DespatchDto, RELATED_DOCUMENTS } from '../dto/despatch.dto';
import { EXTENSIONS, UBL_NAMESPACES, signatureRef } from './invoice-xml';
import type { Issuer } from './model';

const CAT06 = { schemeName: 'Documento de Identidad', schemeAgencyName: 'PE:SUNAT', schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06' };
const sunatList = (name: string, catalog: string) => ({ listAgencyName: 'PE:SUNAT', listName: name, listURI: `urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo${catalog}` });

function party(tag: string, p: { docType: string; docNumber: string; name: string }, extra: string[] = []): string {
  return group(tag, [
    group('cac:Party', [
      group('cac:PartyIdentification', [el('cbc:ID', p.docNumber, { schemeID: p.docType, ...CAT06 })]),
      group('cac:PartyLegalEntity', [el('cbc:RegistrationName', oneLine(p.name)), ...extra]),
    ]),
  ]);
}

function location(tag: string, ubigeo: string, address: string, establishment?: { ruc: string; code: string } | null): string {
  return group(tag, [
    el('cbc:ID', ubigeo, { schemeAgencyName: 'PE:INEI', schemeName: 'Ubigeos' }),
    establishment ? el('cbc:AddressTypeCode', establishment.code, { listID: establishment.ruc, listAgencyName: 'PE:SUNAT', listName: 'Establecimientos anexos' }) : '',
    group('cac:AddressLine', [el('cbc:Line', oneLine(address))]),
  ]);
}

export interface DespatchMeta {
  number: number;
  issueDate: string;
  issueTime: string;
}

/** XML UBL 2.1 (sin firmar) de una guía de remisión de remitente (09) o de transportista (31). */
export function despatchXml(dto: DespatchDto, issuer: Issuer, meta: DespatchMeta): string {
  const type = DOCUMENT_CODES[dto.documento];
  const carrier = dto.documento === 'guia_remision_transportista';
  const mode = carrier ? null : dto.modalidad_de_transporte;

  const recipient = carrier
    ? { docType: dto.destinatario.tipo_de_documento, docNumber: dto.destinatario.numero_de_documento, name: dto.destinatario.denominacion }
    : { docType: dto.destinatario_tipo_de_documento, docNumber: dto.destinatario_numero_de_documento, name: dto.destinatario_denominacion };

  const indicators: string[] = [];
  if (!carrier && dto.indicador_vehiculo_m1_l) indicators.push('SUNAT_Envio_IndicadorTrasladoVehiculoM1L');
  if (carrier && dto.pagador_flete) {
    indicators.push({ remitente: 'SUNAT_Envio_IndicadorPagadorFlete_Remitente', subcontratador: 'SUNAT_Envio_IndicadorPagadorFlete_Subcontratador', tercero: 'SUNAT_Envio_IndicadorPagadorFlete_Tercero' }[dto.pagador_flete]);
  }

  const vehicles = dto.vehiculos ?? [];
  const main = vehicles.find((v) => v.vehiculo === 'principal') ?? vehicles[0];
  const secondary = vehicles.filter((v) => v !== main);
  const tuc = (v: (typeof vehicles)[number]) => v.tarjeta_unica_de_circulacion ?? v.tarjeta_unica_de_cirulacion ?? null;
  const equipment = (tag: string, v: (typeof vehicles)[number], children: string[] = []) =>
    group(tag, [
      el('cbc:ID', v.numero_de_placa),
      tuc(v) ? group('cac:ApplicableTransportMeans', [el('cbc:RegistrationNationalityID', tuc(v))]) : '',
      ...children,
    ]);

  const publicCarrier = !carrier && dto.transportista ? dto.transportista : null;
  const mtc = publicCarrier ? (publicCarrier.numero_registro_MTC ?? publicCarrier.numero_registro_mtc ?? null) : null;

  const handoverDate = !carrier && dto.transportista ? (dto.fecha_entrega_a_transportista ?? dto.fecha_inicio_de_traslado) : null;

  const stage = group('cac:ShipmentStage', [
    mode ? el('cbc:TransportModeCode', mode, sunatList('Modalidad de traslado', '18')) : '',
    // Privado y transportista: fecha de inicio del traslado.
    group('cac:TransitPeriod', [el('cbc:StartDate', dto.fecha_inicio_de_traslado)]),
    publicCarrier
      ? group('cac:CarrierParty', [
          group('cac:PartyIdentification', [el('cbc:ID', publicCarrier.ruc, { schemeID: '6' })]),
          group('cac:PartyLegalEntity', [el('cbc:RegistrationName', oneLine(publicCarrier.denominacion)), el('cbc:CompanyID', mtc)]),
          publicCarrier.numero_autorizacion
            ? group('cac:AgentParty', [
                group('cac:PartyLegalEntity', [
                  el('cbc:CompanyID', publicCarrier.numero_autorizacion, { schemeID: publicCarrier.codigo_entidad_autorizadora ?? undefined, schemeName: 'Entidad Autorizadora', schemeAgencyName: 'PE:SUNAT' }),
                ]),
              ])
            : '',
        ])
      : '',
    // Transporte público: fecha en que se entregan los bienes al transportista.
    group('cac:LoadingTransportEvent', [el('cbc:OccurrenceDate', handoverDate)]),
    ...(dto.conductores ?? []).map((d) =>
      group('cac:DriverPerson', [
        el('cbc:ID', d.numero_de_documento, { schemeID: d.tipo_de_documento, ...CAT06 }),
        el('cbc:FirstName', oneLine(d.nombres)),
        el('cbc:FamilyName', oneLine(d.apellidos)),
        el('cbc:JobTitle', d.conductor === 'principal' ? 'Principal' : 'Secundario'),
        group('cac:IdentityDocumentReference', [el('cbc:ID', d.numero_licencia_conducir)]),
      ]),
    ),
  ]);

  const establishments = !carrier && dto.motivo_de_traslado === '04';
  const delivery = group('cac:Delivery', [
    location(
      'cac:DeliveryAddress',
      dto.punto_de_llegada_ubigeo,
      dto.punto_de_llegada_direccion,
      establishments && !carrier ? { ruc: issuer.ruc, code: dto.punto_de_llegada_codigo_establecimiento ?? '0000' } : null,
    ),
    group('cac:Despatch', [
      location(
        'cac:DespatchAddress',
        dto.punto_de_partida_ubigeo,
        dto.punto_de_partida_direccion,
        establishments && !carrier ? { ruc: issuer.ruc, code: dto.punto_de_partida_codigo_establecimiento ?? '0000' } : null,
      ),
      // Guía de transportista: el remitente de los bienes.
      carrier
        ? group('cac:DespatchParty', [
            group('cac:PartyIdentification', [el('cbc:ID', dto.remitente.numero_de_documento, { schemeID: dto.remitente.tipo_de_documento, ...CAT06 })]),
            group('cac:PartyLegalEntity', [el('cbc:RegistrationName', oneLine(dto.remitente.denominacion))]),
          ])
        : '',
    ]),
  ]);

  const shipment = group('cac:Shipment', [
    el('cbc:ID', 'SUNAT_Envio'),
    carrier ? '' : el('cbc:HandlingCode', dto.motivo_de_traslado, sunatList('Motivo de traslado', '20')),
    carrier ? '' : el('cbc:HandlingInstructions', dto.motivo_de_traslado_descripcion),
    el('cbc:GrossWeightMeasure', fmt(dec(dto.peso_bruto_total), 3), { unitCode: dto.peso_bruto_unidad_de_medida }),
    dto.numero_de_bultos ? el('cbc:TotalTransportHandlingUnitQuantity', dto.numero_de_bultos) : '',
    ...indicators.map((i) => el('cbc:SpecialInstructions', i)),
    // Guía de transportista: la empresa que subcontrata el servicio.
    carrier && dto.subcontratista
      ? group('cac:Consignment', [
          el('cbc:ID', 'SUNAT_Envio'),
          group('cac:LogisticsOperatorParty', [
            group('cac:PartyIdentification', [el('cbc:ID', dto.subcontratista.ruc, { schemeID: '6', ...CAT06 })]),
            group('cac:PartyLegalEntity', [el('cbc:RegistrationName', oneLine(dto.subcontratista.denominacion))]),
          ]),
        ])
      : '',
    stage,
    delivery,
    main ? group('cac:TransportHandlingUnit', [equipment('cac:TransportEquipment', main, secondary.map((v) => equipment('cac:AttachedTransportEquipment', v)))]) : '',
  ]);

  // El esquema exige al menos una línea: sin ítems (guía de transportista que
  // remite a la del remitente) va una sola, que apunta a esos documentos.
  const references = (dto.documentos_relacionados ?? []).map((r) => `${RELATED_DOCUMENTS[r.documento].name} ${r.serie}-${r.numero}`).join(', ');
  const items = dto.items?.length
    ? dto.items
    : [{ codigo_interno: null, codigo_producto_sunat: null, descripcion: `BIENES SEGÚN ${references || 'DOCUMENTOS DEL REMITENTE'}`.toUpperCase(), unidad_de_medida: 'NIU', cantidad: String(dto.numero_de_bultos || 1) }];
  const lines = items.map((item, i) =>
    group('cac:DespatchLine', [
      el('cbc:ID', i + 1),
      el('cbc:DeliveredQuantity', fmtTrim(dec(item.cantidad), 10), { unitCode: item.unidad_de_medida.toUpperCase() }),
      group('cac:OrderLineReference', [el('cbc:LineID', i + 1)]),
      group('cac:Item', [
        el('cbc:Description', oneLine(item.descripcion)),
        item.codigo_interno ? group('cac:SellersItemIdentification', [el('cbc:ID', item.codigo_interno)]) : '',
        item.codigo_producto_sunat
          ? group('cac:CommodityClassification', [el('cbc:ItemClassificationCode', item.codigo_producto_sunat, { listID: 'UNSPSC', listAgencyName: 'GS1 US', listName: 'Item Classification' })])
          : '',
      ]),
    ]),
  );

  const body = [
    EXTENSIONS,
    el('cbc:UBLVersionID', '2.1'),
    el('cbc:CustomizationID', '2.0'),
    el('cbc:ID', `${dto.serie}-${meta.number}`),
    el('cbc:IssueDate', meta.issueDate),
    el('cbc:IssueTime', meta.issueTime),
    el('cbc:DespatchAdviceTypeCode', type, sunatList('Tipo de Documento', '01')),
    el('cbc:Note', dto.observaciones ? oneLine(dto.observaciones) : null),
    ...(dto.documentos_relacionados ?? []).map((r) =>
      group('cac:AdditionalDocumentReference', [
        el('cbc:ID', `${r.serie}-${r.numero}`),
        el('cbc:DocumentTypeCode', RELATED_DOCUMENTS[r.documento].code, sunatList('Documento relacionado al transporte', '61')),
        el('cbc:DocumentType', RELATED_DOCUMENTS[r.documento].name),
        group('cac:IssuerParty', [group('cac:PartyIdentification', [el('cbc:ID', r.ruc_emisor, { schemeID: '6', ...CAT06 })])]),
      ]),
    ),
    signatureRef(issuer),
    party('cac:DespatchSupplierParty', { docType: '6', docNumber: issuer.ruc, name: issuer.razonSocial }, carrier ? [el('cbc:CompanyID', dto.numero_de_registro_mtc)] : []),
    party('cac:DeliveryCustomerParty', recipient),
    // Guía de transportista: el tercero que paga el flete.
    carrier && dto.tercero ? party('cac:OriginatorCustomerParty', { docType: dto.tercero.tipo_de_documento, docNumber: dto.tercero.numero_de_documento, name: dto.tercero.denominacion }) : '',
    shipment,
    ...lines,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"${UBL_NAMESPACES}>${body.join('')}</DespatchAdvice>`;
}
