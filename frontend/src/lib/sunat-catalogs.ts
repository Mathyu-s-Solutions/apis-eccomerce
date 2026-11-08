import data from '@/data/sunat-catalogs.json';

/**
 * Páginas /catalogos del sitio de SUNAT: cada catálogo de códigos que usa la API, con su tabla,
 * dónde va en el XML UBL 2.1 y qué campo del JSON lo lleva. Los códigos salen de
 * src/data/sunat-catalogs.json, generado desde el backend (scripts/snapshot-sunat-catalogs.mjs).
 */

export interface CatalogColumn {
  key: string;
  label: string;
  mono?: boolean;
}

export interface Catalog {
  number: string;
  slug: string;
  name: string;
  /** Para la meta descripción y el índice. */
  summary: string;
  intro: string[];
  /** Dónde va el código en el XML. */
  ubl: string;
  /** Campo del JSON de la API que lo lleva. */
  field: string;
  example: string;
  columns: CatalogColumn[];
  rows: Record<string, string>[];
  /** Si la tabla no es el catálogo completo de SUNAT, por qué. */
  partial?: string;
  /** Aviso extra (tasas que cambian, etc.). */
  caution?: string;
}

const CODE: CatalogColumn = { key: 'code', label: 'Código', mono: true };
const DESC: CatalogColumn = { key: 'description', label: 'Descripción' };
const yesNo = (b: boolean) => (b ? 'Sí' : 'No');

export const CATALOGS: Catalog[] = [
  {
    number: '01',
    slug: '01-tipo-de-documento',
    name: 'Tipo de documento',
    summary: 'Códigos de factura (01), boleta (03), nota de crédito (07), nota de débito (08) y guías de remisión (09 y 31).',
    intro: [
      'El catálogo N.° 01 identifica el tipo de comprobante o documento electrónico: 01 es factura, 03 boleta de venta, 07 nota de crédito, 08 nota de débito, 09 guía de remisión remitente y 31 guía de remisión transportista.',
      'El código también forma parte del nombre del archivo XML que se envía a SUNAT (RUC-tipo-serie-número), por ejemplo 20123456789-01-F001-1.',
      'En la API no escribes el código: indicas el documento por su nombre en el campo documento y la API pone el código que corresponde.',
    ],
    ubl: 'cbc:InvoiceTypeCode (factura y boleta) · cbc:DespatchAdviceTypeCode (guías)',
    field: 'documento',
    example: `{\n  "documento": "factura",\n  "serie": "F001"\n}`,
    columns: [CODE, DESC, { key: 'api', label: 'Valor en la API', mono: true }],
    rows: data.documents,
    partial: 'Solo los documentos que emite la API. El catálogo de SUNAT incluye otros (recibos por servicios públicos, comprobantes de retención y percepción, etc.).',
  },
  {
    number: '03',
    slug: '03-unidades-de-medida',
    name: 'Unidades de medida',
    summary: 'Códigos de unidad de medida para los ítems: NIU (bienes), ZZ (servicios), KGM, LTR, MTR, BX y más.',
    intro: [
      'Cada ítem de un comprobante o de una guía de remisión lleva su unidad de medida. SUNAT usa los códigos de la Recomendación 20 de UN/ECE (la norma internacional de unidades para comercio).',
      'Los más usados: NIU (unidad, para bienes) y ZZ (unidad, para servicios). Para productos a granel, KGM (kilogramo), LTR (litro) o MTR (metro).',
      'Si no envías la unidad, la API usa NIU.',
    ],
    ubl: 'Atributo unitCode de cbc:InvoicedQuantity, cbc:CreditedQuantity, cbc:DebitedQuantity y cbc:DeliveredQuantity',
    field: 'items[].unidad_de_medida',
    example: `"items": [\n  { "descripcion": "Polo algodón", "cantidad": "2", "unidad_de_medida": "NIU", "precio_unitario": "50.00" },\n  { "descripcion": "Servicio de bordado", "cantidad": "1", "unidad_de_medida": "ZZ", "precio_unitario": "20.00" }\n]`,
    columns: [CODE, DESC],
    rows: data.units,
    partial: 'Las unidades de uso común. SUNAT acepta cualquier código de la Recomendación 20 de UN/ECE.',
  },
  {
    number: '06',
    slug: '06-tipo-de-documento-de-identidad',
    name: 'Tipo de documento de identidad',
    summary: 'Códigos del documento del cliente: 1 DNI, 6 RUC, 4 carné de extranjería, 7 pasaporte y más.',
    intro: [
      'Identifica qué documento tiene el cliente (o el destinatario, en una guía de remisión): 1 es DNI, 6 es RUC, 4 carné de extranjería, 7 pasaporte y 0 para no domiciliados sin RUC.',
      'Una factura se emite a un cliente con RUC (código 6), salvo en exportación. Una boleta se emite normalmente con DNI (código 1).',
      'La API valida el número según el tipo: 11 dígitos para RUC y 8 para DNI.',
    ],
    ubl: 'Atributo schemeID de cac:PartyIdentification/cbc:ID',
    field: 'cliente_tipo_de_documento',
    example: `{\n  "cliente_tipo_de_documento": "6",\n  "cliente_numero_de_documento": "20100066603",\n  "cliente_denominacion": "EMPRESA CLIENTE S.A.C."\n}`,
    columns: [CODE, DESC],
    rows: data.identityTypes,
  },
  {
    number: '07',
    slug: '07-tipo-de-afectacion-del-igv',
    name: 'Tipo de afectación del IGV',
    summary: 'Códigos de afectación del IGV por ítem: 10 gravado, 20 exonerado, 30 inafecto, 40 exportación y transferencias gratuitas.',
    intro: [
      'Dice cómo trata el IGV a cada ítem del comprobante. El más común es 10 (gravado, operación onerosa): el ítem paga IGV. 20 es exonerado, 30 inafecto y 40 exportación.',
      'Los códigos 11 a 16, 21 y 31 a 37 son transferencias gratuitas o retiros: no se cobran al cliente, se informan con un valor referencial y su tributo es el 9996 (GRA).',
      'Cada código determina el tributo del catálogo 05 que va en el XML (1000 IGV, 9997 EXO, 9998 INA, 9995 EXP…). En la API solo envías el código de afectación; el tributo lo pone la API. Si no lo envías, usa 10.',
    ],
    ubl: 'cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode',
    field: 'items[].codigo_tipo_afectacion_igv',
    example: `"items": [\n  { "descripcion": "Laptop", "cantidad": "1", "precio_unitario": "2360.00", "codigo_tipo_afectacion_igv": "10" },\n  { "descripcion": "Libro", "cantidad": "1", "valor_unitario": "45.00", "codigo_tipo_afectacion_igv": "20" }\n]`,
    columns: [CODE, DESC, { key: 'scheme', label: 'Tributo (cat. 05)' }, { key: 'free', label: 'Gratuita' }],
    rows: data.affectations.map((a) => ({ ...a, free: yesNo(a.free) })),
  },
  {
    number: '09',
    slug: '09-tipo-de-nota-de-credito',
    name: 'Tipo de nota de crédito',
    summary: 'Motivos de la nota de crédito: 01 anulación, 04 descuento global, 06 devolución total, 13 corrección de cuotas y más.',
    intro: [
      'Toda nota de crédito indica por qué se emite. El motivo más usado es 01 (anulación de la operación); para devoluciones, 06 (total) o 07 (por ítem); para descuentos posteriores, 04 o 05.',
      'El 13 corrige el monto pendiente de pago o las fechas de vencimiento de una venta al crédito con cuotas.',
      'Además del código, la nota lleva una descripción del motivo y el comprobante que modifica.',
    ],
    ubl: 'cac:DiscrepancyResponse/cbc:ResponseCode',
    field: 'nota_credito_codigo_tipo',
    example: `{\n  "documento": "nota_credito",\n  "serie": "F001",\n  "nota_credito_codigo_tipo": "01",\n  "nota_credito_motivo": "Anulación de la operación",\n  "documento_afectado": { "documento": "factura", "serie": "F001", "numero": 123 }\n}`,
    columns: [CODE, { key: 'description', label: 'Motivo' }],
    rows: data.creditNoteTypes,
  },
  {
    number: '10',
    slug: '10-tipo-de-nota-de-debito',
    name: 'Tipo de nota de débito',
    summary: 'Motivos de la nota de débito: 01 intereses por mora, 02 aumento en el valor, 03 penalidades y ajustes.',
    intro: [
      'La nota de débito aumenta el valor de un comprobante ya emitido. Su motivo va en el catálogo 10: 01 intereses por mora, 02 aumento en el valor y 03 penalidades u otros conceptos.',
      'Los códigos 11 y 12 son ajustes de operaciones de exportación y de operaciones afectas al IVAP.',
    ],
    ubl: 'cac:DiscrepancyResponse/cbc:ResponseCode',
    field: 'nota_debito_codigo_tipo',
    example: `{\n  "documento": "nota_debito",\n  "serie": "F001",\n  "nota_debito_codigo_tipo": "01",\n  "nota_debito_motivo": "Intereses por pago fuera de plazo",\n  "documento_afectado": { "documento": "factura", "serie": "F001", "numero": 123 }\n}`,
    columns: [CODE, { key: 'description', label: 'Motivo' }],
    rows: data.debitNoteTypes,
  },
  {
    number: '18',
    slug: '18-modalidad-de-transporte',
    name: 'Modalidad de transporte',
    summary: 'Modalidad de traslado en la guía de remisión: 01 transporte público y 02 transporte privado.',
    intro: [
      'En la guía de remisión remitente indica quién hace el traslado: 01 transporte público (contratas a una empresa de transporte, que se identifica con su RUC) o 02 transporte privado (lo trasladas con tus propios vehículos y conductores).',
      'Con transporte privado, la guía lleva la placa del vehículo y los datos del conductor.',
    ],
    ubl: 'cac:ShipmentStage/cbc:TransportModeCode',
    field: 'modalidad_de_transporte',
    example: `{\n  "documento": "guia_remision_remitente",\n  "serie": "T001",\n  "motivo_de_traslado": "01",\n  "modalidad_de_transporte": "02"\n}`,
    columns: [CODE, { key: 'description', label: 'Modalidad' }],
    rows: data.transportModes,
  },
  {
    number: '20',
    slug: '20-motivo-de-traslado',
    name: 'Motivo de traslado',
    summary: 'Motivos de traslado de la guía de remisión: 01 venta, 02 compra, 04 entre establecimientos, 13 otros y más.',
    intro: [
      'La guía de remisión remitente dice por qué se trasladan los bienes. El más común es 01 (venta); 04 es el traslado entre establecimientos de la misma empresa y 13 (otros) se acompaña de una descripción del motivo.',
      'En el traslado entre establecimientos (04), la API acepta el código de establecimiento anexo de los puntos de partida y llegada.',
    ],
    ubl: 'cac:Shipment/cbc:HandlingCode',
    field: 'motivo_de_traslado',
    example: `{\n  "documento": "guia_remision_remitente",\n  "serie": "T001",\n  "motivo_de_traslado": "13",\n  "motivo_de_traslado_descripcion": "Traslado a feria comercial"\n}`,
    columns: [CODE, { key: 'description', label: 'Motivo' }],
    rows: data.transferReasons,
  },
  {
    number: '51',
    slug: '51-tipo-de-operacion',
    name: 'Tipo de operación',
    summary: 'Tipo de operación de facturas y boletas: 0101 venta interna, 0200 exportación, 1001 sujeta a detracción y más.',
    intro: [
      'Describe la operación del comprobante. Casi siempre es 0101 (venta interna), que es el valor por defecto en la API.',
      'Las exportaciones usan 0200 (bienes) y 0201 a 0208 (servicios). Una factura con detracción debe ir con 1001, o con 1002 a 1004 en los casos especiales (recursos hidrobiológicos y transporte de pasajeros o de carga). 2001 es una operación sujeta a percepción.',
    ],
    ubl: 'Atributo listID de cbc:InvoiceTypeCode',
    field: 'tipo_operacion',
    example: `{\n  "documento": "factura",\n  "serie": "F001",\n  "tipo_operacion": "0101"\n}`,
    columns: [CODE, DESC],
    rows: data.operationTypes,
    partial: 'Los tipos de operación de uso común que acepta la API.',
  },
  {
    number: '53',
    slug: '53-cargos-y-descuentos',
    name: 'Cargos y descuentos',
    summary: 'Códigos de descuentos por ítem (00, 01), globales (02, 03), por anticipos (04 a 06) y retención del IGV (62).',
    intro: [
      'Los descuentos y cargos llevan un código que dice si son por ítem o globales y si afectan la base imponible del IGV.',
      'Por ítem: 00 si el descuento reduce la base del IGV y 01 si no la reduce. Globales: 02 y 03, con el mismo criterio. Los anticipos usan 04 a 06, y 62 es la retención del IGV.',
      'En la API, los descuentos de un ítem van en items[].descuentos y los globales en descuentos.',
    ],
    ubl: 'cac:AllowanceCharge/cbc:AllowanceChargeReasonCode',
    field: 'items[].descuentos[].codigo · descuentos[].codigo',
    example: `{\n  "items": [\n    { "descripcion": "Zapatillas", "cantidad": "1", "precio_unitario": "250.00",\n      "descuentos": [{ "codigo": "00", "monto": "20.00" }] }\n  ],\n  "descuentos": [{ "codigo": "02", "monto": "10.00" }]\n}`,
    columns: [CODE, DESC, { key: 'level', label: 'Nivel' }, { key: 'affectsBase', label: 'Afecta la base' }],
    rows: data.allowances.map((a) => ({ ...a, level: a.level === 'item' ? 'Ítem' : 'Global', affectsBase: yesNo(a.affectsBase) })),
    partial: 'Los códigos que usa la API.',
  },
  {
    number: '54',
    slug: '54-bienes-y-servicios-sujetos-a-detraccion',
    name: 'Bienes y servicios sujetos a detracción',
    summary: 'Códigos de detracción con su porcentaje: 037 demás servicios (12%), 027 transporte de bienes (4%), 019 arrendamiento (10%) y más.',
    intro: [
      'Cuando una factura está sujeta al SPOT (detracciones), lleva el código del bien o servicio de este catálogo, el porcentaje, el monto detraído y la cuenta del Banco de la Nación del proveedor.',
      'Los más usados en servicios son 037 (demás servicios gravados con IGV), 022 (otros servicios empresariales), 019 (arrendamiento de bienes), 020 (mantenimiento y reparación) y 027 (transporte de bienes).',
      'En la API, la detracción va en el objeto detraccion y la factura debe usar el tipo de operación 1001.',
    ],
    ubl: 'cac:PaymentTerms/cbc:PaymentMeansID (código del bien) · cac:PaymentMeans (cuenta y medio de pago)',
    field: 'detraccion.detraccion_tipo',
    example: `{\n  "tipo_operacion": "1001",\n  "detraccion": {\n    "detraccion_tipo": "037",\n    "detraccion_porcentaje": "12",\n    "detraccion_total": "141.60",\n    "medio_de_pago": "001",\n    "numero_cuenta_banco_nacion": "00-123-456789"\n  }\n}`,
    columns: [CODE, { key: 'description', label: 'Bien o servicio' }, { key: 'percent', label: 'Porcentaje' }, { key: 'minimum', label: 'Desde (S/)' }],
    rows: data.detractions.map((d) => ({ ...d, percent: `${d.percent}%` })),
    caution:
      'Porcentajes y montos mínimos de referencia que usa la API. SUNAT los modifica de tanto en tanto y algunos montos dependen de la UIT del año: verifica la tasa vigente antes de emitir.',
  },
  {
    number: '59',
    slug: '59-medios-de-pago',
    name: 'Medios de pago',
    summary: 'Medios de pago del comprobante: 001 depósito en cuenta, 002 giro, 003 cheque, 004 y 005 tarjetas.',
    intro: [
      'Indica el medio de pago. En la API se usa en la detracción: con qué medio se deposita en la cuenta del Banco de la Nación. Si no lo envías, va 001 (depósito en cuenta).',
    ],
    ubl: 'cac:PaymentMeans/cbc:PaymentMeansCode',
    field: 'detraccion.medio_de_pago',
    example: `"detraccion": {\n  "detraccion_tipo": "037",\n  "medio_de_pago": "001"\n}`,
    columns: [CODE, { key: 'description', label: 'Medio de pago' }],
    rows: data.paymentMeans,
    partial: 'Los medios de pago que acepta la API. El catálogo de SUNAT tiene más códigos.',
  },
];

export function findCatalog(slug: string): Catalog | undefined {
  return CATALOGS.find((c) => c.slug === slug);
}

export const catalogPath = (c?: Catalog) => (c ? `/catalogos/${c.slug}` : '/catalogos');
