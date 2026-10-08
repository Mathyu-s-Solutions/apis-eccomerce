import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * SUNAT NO es ingeniería inversa: se integra con servicios oficiales.
 * Plan (ver docs/investigacion-upstreams.md §3):
 *  - Emisión CPE: construir XML UBL 2.1 -> firmar (XMLDSig con cert del emisor)
 *    -> SOAP sendBill a e-factura.sunat.gob.pe (beta: e-beta...). Guardar CDR y PDF.
 *  - GRE: REST api-cpe.sunat.gob.pe con OAuth2 (api-seguridad.sunat.gob.pe).
 *  - Validez CPE / SIRE: REST con OAuth2.
 *  - Consulta RUC: importar el padrón reducido (zip diario de SUNAT) a BD propia.
 *  - Consulta DNI: no hay fuente oficial gratuita (ver §4, datos personales).
 * Referencia de librería: Greenter (PHP). En Node: xml-crypto + node-forge + SOAP.
 */
@Injectable()
export class SunatService {
  private notImplemented(feature: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: 'Not Implemented',
        message: `SUNAT: ${feature} aún no implementado. Ver docs/investigacion-upstreams.md §3.`,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  emitDocument(): never {
    this.notImplemented('emisión de comprobantes (factura/boleta)');
  }

  getStatus(): never {
    this.notImplemented('consulta de estado de comprobante');
  }

  consultaRuc(_ruc: string): never {
    this.notImplemented('consulta RUC (requiere importar el padrón)');
  }
}
