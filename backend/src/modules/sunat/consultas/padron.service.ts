import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../../config/configuration';
import { rucFromDni } from '../core/ruc';
import { ubigeoNames } from '../core/ubigeos';
import { blobSourceFrom } from './blob-source';
import { type PadronRecord, PadronReader } from './padron.reader';

/** El padrón recorta estado y condición a 20 caracteres: aquí van completos. */
const FULL_NAMES: Record<string, string> = {
  'BAJA PROV. POR OFICI': 'BAJA PROVISIONAL POR OFICIO',
  'BAJA MULT.INSCR. Y O': 'BAJA MULTIPLE INSCRIPCION Y OTROS',
  'ANULACION - ERROR SU': 'ANULACION - ERROR SUNAT',
  'NO HALLADO SE MUDO D': 'NO HALLADO SE MUDO DE DOMICILIO',
  'NO HALLADO OTROS MOT': 'NO HALLADO OTROS MOTIVOS',
  'NO HALLADO NRO.PUERT': 'NO HALLADO NRO.PUERTA NO EXISTE',
  'NO HALLADO DESTINATA': 'NO HALLADO DESTINATARIO DESCONOCIDO',
  'NO HALLADO NO EXISTE': 'NO HALLADO NO EXISTE DOMICILIO',
};

const TAXPAYER_TYPES: Record<string, string> = {
  '10': 'PERSONA NATURAL',
  '15': 'PERSONA NATURAL (DOCUMENTO DISTINTO AL DNI)',
  '16': 'PERSONA NATURAL (DOCUMENTO DISTINTO AL DNI)',
  '17': 'PERSONA NATURAL (DOCUMENTO DISTINTO AL DNI)',
  '20': 'PERSONA JURIDICA',
};

export interface Taxpayer {
  ruc: string;
  razon_social: string;
  estado: string;
  condicion: string;
  tipo_contribuyente: string;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

/**
 * Consulta RUC sobre el padrón reducido que SUNAT publica a diario
 * (www2.sunat.gob.pe/padron_reducido_ruc.zip): es la fuente oficial y abierta,
 * sin depender de la web de consulta (protegida contra automatización).
 */
@Injectable()
export class PadronService {
  private readonly logger = new Logger(PadronService.name);
  private readonly reader?: PadronReader;

  constructor(@Inject(CONFIG_TOKEN) config: AppConfig) {
    const url = config.sunat.padronUrl;
    if (url) this.reader = new PadronReader(blobSourceFrom(url, { token: process.env.PADRON_GCS_TOKEN }));
    else this.logger.warn('Sin PADRON_URL: las consultas de RUC y DNI no están disponibles.');
  }

  private require(): PadronReader {
    if (!this.reader) throw new ServiceUnavailableException('La consulta de RUC no está configurada en este servidor (PADRON_URL).');
    return this.reader;
  }

  private async read<T>(fn: (reader: PadronReader) => Promise<T>): Promise<T> {
    const reader = this.require();
    try {
      return await fn(reader);
    } catch (e) {
      this.logger.error(`No se pudo leer el padrón: ${String(e)}`);
      throw new ServiceUnavailableException('El padrón del RUC no está disponible en este momento. Inténtalo de nuevo en unos minutos.');
    }
  }

  /** Fecha del padrón cargado y cuántos RUC trae. */
  info(): Promise<{ version: string; records: number }> {
    return this.read((r) => r.info());
  }

  async ruc(ruc: string): Promise<Taxpayer | null> {
    const record = await this.read((r) => r.find(ruc));
    return record ? toTaxpayer(record) : null;
  }

  /** Solo existen en el padrón las personas con RUC (10 + DNI + dígito verificador). */
  dni(dni: string): Promise<Taxpayer | null> {
    return this.ruc(rucFromDni(dni));
  }
}

function toTaxpayer(r: PadronRecord): Taxpayer {
  const place = ubigeoNames(r.ubigeo);
  const address = r.direccion && place ? `${r.direccion} ${place.departamento} - ${place.provincia} - ${place.distrito}` : r.direccion;
  return {
    ruc: r.ruc,
    razon_social: r.nombre,
    estado: FULL_NAMES[r.estado] ?? r.estado,
    condicion: FULL_NAMES[r.condicion] ?? r.condicion,
    tipo_contribuyente: TAXPAYER_TYPES[r.ruc.slice(0, 2)] ?? 'OTRO',
    direccion_fiscal: address,
    ubigeo: r.ubigeo,
    departamento: place?.departamento ?? null,
    provincia: place?.provincia ?? null,
    distrito: place?.distrito ?? null,
  };
}
