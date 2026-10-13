/**
 * Catálogos de SUNAT (Anexo 8 de la R.S. 340-2017/SUNAT y modificatorias) que
 * usa la API. Los nombres de documento (`factura`, `boleta`…) son los mismos que
 * usa apisunat.pe, para que un cliente pueda migrar sin tocar su JSON.
 */

/** Documento de la API → código del catálogo 01. */
export const DOCUMENT_CODES = {
  factura: '01',
  boleta: '03',
  nota_credito: '07',
  nota_debito: '08',
  guia_remision_remitente: '09',
  guia_remision_transportista: '31',
} as const;
export type DocumentName = keyof typeof DOCUMENT_CODES;
export type DocumentCode = (typeof DOCUMENT_CODES)[DocumentName];

export const DOCUMENT_NAMES: Record<string, string> = {
  '01': 'FACTURA ELECTRÓNICA',
  '03': 'BOLETA DE VENTA ELECTRÓNICA',
  '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '08': 'NOTA DE DÉBITO ELECTRÓNICA',
  '09': 'GUÍA DE REMISIÓN REMITENTE ELECTRÓNICA',
  '31': 'GUÍA DE REMISIÓN TRANSPORTISTA ELECTRÓNICA',
  RC: 'RESUMEN DIARIO',
  RA: 'COMUNICACIÓN DE BAJA',
};

export function documentName(code: string): DocumentName | undefined {
  return (Object.keys(DOCUMENT_CODES) as DocumentName[]).find((k) => DOCUMENT_CODES[k] === code);
}

/** Catálogo 06: tipo de documento de identidad. */
export const IDENTITY_TYPES: Record<string, string> = {
  '0': 'DOC.TRIB.NO.DOM.SIN.RUC',
  '1': 'DNI',
  '4': 'CARNET DE EXTRANJERÍA',
  '6': 'RUC',
  '7': 'PASAPORTE',
  A: 'CÉDULA DIPLOMÁTICA DE IDENTIDAD',
  B: 'DOC.IDENT.PAÍS.RESIDENCIA-NO.D',
  C: 'TAX IDENTIFICATION NUMBER - TIN',
  D: 'IDENTIFICATION NUMBER - IN',
  E: 'TAM - TARJETA ANDINA DE MIGRACIÓN',
  F: 'PERMISO TEMPORAL DE PERMANENCIA - PTP',
  G: 'SALVOCONDUCTO',
  '-': 'VARIOS',
};

/** Tributo de cada tipo de afectación del IGV (catálogo 07 → catálogo 05). */
export interface TaxScheme {
  id: string;
  name: string;
  code: string;
}
export const TAX_SCHEMES: Record<string, TaxScheme> = {
  IGV: { id: '1000', name: 'IGV', code: 'VAT' },
  IVAP: { id: '1016', name: 'IVAP', code: 'VAT' },
  ISC: { id: '2000', name: 'ISC', code: 'EXC' },
  ICBPER: { id: '7152', name: 'ICBPER', code: 'OTH' },
  EXP: { id: '9995', name: 'EXP', code: 'FRE' },
  GRA: { id: '9996', name: 'GRA', code: 'FRE' },
  EXO: { id: '9997', name: 'EXO', code: 'VAT' },
  INA: { id: '9998', name: 'INA', code: 'FRE' },
  OTROS: { id: '9999', name: 'OTROS', code: 'OTH' },
};

/** Clase de operación de cada código del catálogo 07. */
export type AffectationKind = 'gravado' | 'ivap' | 'exonerado' | 'inafecto' | 'exportacion';
export interface Affectation {
  kind: AffectationKind;
  /** Transferencia gratuita / retiro: no se cobra, se informa con valor referencial. */
  free: boolean;
  scheme: TaxScheme;
  description: string;
}

const aff = (kind: AffectationKind, free: boolean, scheme: TaxScheme, description: string): Affectation => ({
  kind,
  free,
  scheme,
  description,
});

export const AFFECTATIONS: Record<string, Affectation> = {
  '10': aff('gravado', false, TAX_SCHEMES.IGV!, 'Gravado - Operación Onerosa'),
  '11': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Retiro por premio'),
  '12': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Retiro por donación'),
  '13': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Retiro'),
  '14': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Retiro por publicidad'),
  '15': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Bonificaciones'),
  '16': aff('gravado', true, TAX_SCHEMES.GRA!, 'Gravado - Retiro por entrega a trabajadores'),
  '17': aff('ivap', false, TAX_SCHEMES.IVAP!, 'Gravado - IVAP'),
  '20': aff('exonerado', false, TAX_SCHEMES.EXO!, 'Exonerado - Operación Onerosa'),
  '21': aff('exonerado', true, TAX_SCHEMES.GRA!, 'Exonerado - Transferencia gratuita'),
  '30': aff('inafecto', false, TAX_SCHEMES.INA!, 'Inafecto - Operación Onerosa'),
  '31': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro por bonificación'),
  '32': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro'),
  '33': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro por muestras médicas'),
  '34': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro por convenio colectivo'),
  '35': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro por premio'),
  '36': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Retiro por publicidad'),
  '37': aff('inafecto', true, TAX_SCHEMES.GRA!, 'Inafecto - Transferencia gratuita'),
  '40': aff('exportacion', false, TAX_SCHEMES.EXP!, 'Exportación de Bienes o Servicios'),
};

/** Catálogo 09: tipos de nota de crédito. */
export const CREDIT_NOTE_TYPES: Record<string, string> = {
  '01': 'Anulación de la operación',
  '02': 'Anulación por error en el RUC',
  '03': 'Corrección por error en la descripción',
  '04': 'Descuento global',
  '05': 'Descuento por ítem',
  '06': 'Devolución total',
  '07': 'Devolución por ítem',
  '08': 'Bonificación',
  '09': 'Disminución en el valor',
  '10': 'Otros conceptos',
  '11': 'Ajustes de operaciones de exportación',
  '12': 'Ajustes afectos al IVAP',
  '13': 'Corrección del monto neto pendiente de pago y/o la(s) fechas(s) de vencimiento del pago único o de las cuotas',
};

/** Catálogo 10: tipos de nota de débito. */
export const DEBIT_NOTE_TYPES: Record<string, string> = {
  '01': 'Intereses por mora',
  '02': 'Aumento en el valor',
  '03': 'Penalidades/ otros conceptos',
  '11': 'Ajustes de operaciones de exportación',
  '12': 'Ajustes afectos al IVAP',
};

/** Catálogo 51: tipo de operación (los de uso común). */
export const OPERATION_TYPES: Record<string, string> = {
  '0101': 'Venta interna',
  '0102': 'Venta interna - Anticipos',
  '0104': 'Venta interna - Itinerante',
  '0112': 'Venta interna - Sustenta gastos deducibles persona natural',
  '0113': 'Venta interna - NRUS',
  '0200': 'Exportación de bienes',
  '0201': 'Exportación de servicios - prestación en el país',
  '0202': 'Exportación de servicios - hospedaje no domiciliados',
  '0203': 'Exportación de servicios - transporte de navieras',
  '0204': 'Exportación de servicios - a naves y aeronaves de bandera extranjera',
  '0205': 'Exportación de servicios - paquete turístico',
  '0206': 'Exportación de servicios - complementarios al transporte de carga',
  '0207': 'Exportación de servicios - suministro de energía eléctrica a ZED',
  '0208': 'Exportación de servicios - prestación parcialmente en el extranjero',
  '0301': 'Operaciones con carta porte aéreo',
  '0302': 'Operaciones de transporte ferroviario de pasajeros',
  '0303': 'Operaciones de pago de regalía petrolera',
  '0401': 'Ventas no domiciliados que no califican como exportación',
  '1001': 'Operación sujeta a detracción',
  '1002': 'Operación sujeta a detracción - Recursos hidrobiológicos',
  '1003': 'Operación sujeta a detracción - Servicios de transporte pasajeros',
  '1004': 'Operación sujeta a detracción - Servicios de transporte carga',
  '2001': 'Operación sujeta a percepción',
};

/** Catálogo 53: cargos y descuentos que usa la API. */
export const ALLOWANCE_CODES: Record<string, { level: 'item' | 'global'; affectsBase: boolean; description: string }> = {
  '00': { level: 'item', affectsBase: true, description: 'Descuento que afecta la base imponible del IGV/IVAP' },
  '01': { level: 'item', affectsBase: false, description: 'Descuento que no afecta la base imponible del IGV/IVAP' },
  '02': { level: 'global', affectsBase: true, description: 'Descuento global que afecta la base imponible del IGV/IVAP' },
  '03': { level: 'global', affectsBase: false, description: 'Descuento global que no afecta la base imponible del IGV/IVAP' },
  '04': { level: 'global', affectsBase: true, description: 'Descuento global por anticipos gravados que afecta la base imponible del IGV/IVAP' },
  '05': { level: 'global', affectsBase: false, description: 'Descuento global por anticipos exonerados' },
  '06': { level: 'global', affectsBase: false, description: 'Descuento global por anticipos inafectos' },
  '62': { level: 'global', affectsBase: false, description: 'Retención del IGV' },
};

/** Catálogo 59: medios de pago (los que pide la detracción). */
export const PAYMENT_MEANS: Record<string, string> = {
  '001': 'Depósito en cuenta',
  '002': 'Giro',
  '003': 'Cheque',
  '004': 'Tarjeta de crédito',
  '005': 'Tarjeta de débito',
};

/** Catálogo 54: bienes y servicios sujetos a detracción, con su tasa y monto mínimo. */
export const DETRACTIONS: Record<string, { description: string; percent: string; minimum: string }> = {
  '001': { description: 'Azúcar y melaza de caña', percent: '10', minimum: '2750' },
  '003': { description: 'Alcohol etílico', percent: '10', minimum: '2750' },
  '004': { description: 'Recursos hidrobiológicos', percent: '4', minimum: '700' },
  '005': { description: 'Maíz amarillo duro', percent: '4', minimum: '700' },
  '007': { description: 'Caña de azúcar', percent: '10', minimum: '700' },
  '008': { description: 'Madera', percent: '4', minimum: '700' },
  '009': { description: 'Arena y piedra', percent: '10', minimum: '700' },
  '010': { description: 'Residuos, subproductos, desechos, recortes y desperdicios', percent: '15', minimum: '700' },
  '011': { description: 'Bienes gravados con IGV por renuncia a la exoneración', percent: '10', minimum: '700' },
  '012': { description: 'Intermediación laboral y tercerización', percent: '12', minimum: '700' },
  '013': { description: 'Animales vivos', percent: '4', minimum: '700' },
  '014': { description: 'Carnes y despojos comestibles', percent: '4', minimum: '700' },
  '015': { description: 'Abonos, cueros y pieles de origen animal', percent: '10', minimum: '700' },
  '016': { description: 'Aceite de pescado', percent: '10', minimum: '700' },
  '017': { description: 'Harina, polvo y pellets de pescado, crustáceos, moluscos y similares', percent: '4', minimum: '700' },
  '019': { description: 'Arrendamiento de bienes', percent: '10', minimum: '700' },
  '020': { description: 'Mantenimiento y reparación de bienes muebles', percent: '12', minimum: '700' },
  '021': { description: 'Movimiento de carga', percent: '10', minimum: '700' },
  '022': { description: 'Otros servicios empresariales', percent: '12', minimum: '700' },
  '023': { description: 'Leche', percent: '4', minimum: '700' },
  '024': { description: 'Comisión mercantil', percent: '10', minimum: '700' },
  '025': { description: 'Fabricación de bienes por encargo', percent: '10', minimum: '700' },
  '026': { description: 'Servicio de transporte de personas', percent: '10', minimum: '700' },
  '027': { description: 'Servicio de transporte de bienes', percent: '4', minimum: '400' },
  '030': { description: 'Contratos de construcción', percent: '4', minimum: '700' },
  '031': { description: 'Oro gravado con IGV', percent: '10', minimum: '700' },
  '032': { description: 'Páprika y otros frutos de capsicum o pimienta', percent: '10', minimum: '700' },
  '034': { description: 'Minerales metálicos no auríferos', percent: '10', minimum: '700' },
  '035': { description: 'Bienes exonerados del IGV', percent: '1.5', minimum: '700' },
  '036': { description: 'Oro y demás minerales metálicos exonerados del IGV', percent: '1.5', minimum: '700' },
  '037': { description: 'Demás servicios gravados con IGV', percent: '12', minimum: '700' },
  '039': { description: 'Minerales no metálicos', percent: '10', minimum: '700' },
  '040': { description: 'Bien inmueble gravado con IGV', percent: '4', minimum: '700' },
  '041': { description: 'Plomo', percent: '15', minimum: '700' },
  '044': { description: 'Servicio de beneficio de minerales metálicos gravado con IGV', percent: '12', minimum: '700' },
  '045': { description: 'Minerales de oro y sus concentrados gravados con IGV', percent: '10', minimum: '700' },
};

/** Catálogo 03: unidades de medida (las de uso común; SUNAT acepta todo UN/ECE rec 20). */
export const UNITS: Record<string, string> = {
  NIU: 'UNIDAD (BIENES)',
  ZZ: 'UNIDAD (SERVICIOS)',
  '4A': 'BOBINAS',
  BJ: 'BALDE',
  BLL: 'BARRILES',
  BG: 'BOLSA',
  BO: 'BOTELLAS',
  BX: 'CAJA',
  CT: 'CARTONES',
  CMK: 'CENTIMETRO CUADRADO',
  CMQ: 'CENTIMETRO CUBICO',
  CMT: 'CENTIMETRO LINEAL',
  CEN: 'CIENTO DE UNIDADES',
  CY: 'CILINDRO',
  CJ: 'CONOS',
  DZN: 'DOCENA',
  DZP: 'DOCENA POR 10**6',
  BE: 'FARDO',
  GLI: 'GALON INGLES (4,545956L)',
  GRM: 'GRAMO',
  GRO: 'GRUESA',
  HLT: 'HECTOLITRO',
  LEF: 'HOJA',
  SET: 'JUEGO',
  KGM: 'KILOGRAMO',
  KTM: 'KILOMETRO',
  KWH: 'KILOVATIO HORA',
  KT: 'KIT',
  CA: 'LATAS',
  LBR: 'LIBRAS',
  LTR: 'LITRO',
  MWH: 'MEGAWATT HORA',
  MTR: 'METRO',
  MTK: 'METRO CUADRADO',
  MTQ: 'METRO CUBICO',
  MGM: 'MILIGRAMOS',
  MLT: 'MILILITRO',
  MMT: 'MILIMETRO',
  MMK: 'MILIMETRO CUADRADO',
  MMQ: 'MILIMETRO CUBICO',
  MLL: 'MILLARES',
  UM: 'MILLON DE UNIDADES',
  ONZ: 'ONZAS',
  PF: 'PALETAS',
  PK: 'PAQUETE',
  PR: 'PAR',
  FOT: 'PIES',
  FTK: 'PIES CUADRADOS',
  FTQ: 'PIES CUBICOS',
  C62: 'PIEZAS',
  PG: 'PLACAS',
  ST: 'PLIEGO',
  INH: 'PULGADAS',
  RM: 'RESMA',
  DR: 'TAMBOR',
  STN: 'TONELADA CORTA',
  LTN: 'TONELADA LARGA',
  TNE: 'TONELADAS',
  TU: 'TUBOS',
  GLL: 'US GALON (3,7843 L)',
  YRD: 'YARDA',
  YDK: 'YARDA CUADRADA',
  HUR: 'HORA',
  DAY: 'DÍA',
  MON: 'MES',
};

/** Catálogo 20: motivos de traslado (GRE). */
export const TRANSFER_REASONS: Record<string, string> = {
  '01': 'Venta',
  '02': 'Compra',
  '03': 'Venta con entrega a terceros',
  '04': 'Traslado entre establecimientos de la misma empresa',
  '05': 'Consignación',
  '06': 'Devolución',
  '07': 'Recojo de bienes transformados',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
  '14': 'Venta sujeta a confirmación del comprador',
  '17': 'Traslado de bienes para transformación',
  '18': 'Traslado emisor itinerante CP',
  '19': 'Traslado a zona primaria',
};

/** Catálogo 18: modalidad de transporte (GRE). */
export const TRANSPORT_MODES: Record<string, string> = {
  '01': 'Transporte público',
  '02': 'Transporte privado',
};

/** Leyendas (catálogo 52) que agrega la API. */
export const LEGENDS = {
  amountInWords: '1000',
  freeTransfer: '1002',
  detraction: '2006',
} as const;
