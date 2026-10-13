import { describe, expect, it } from 'vitest';
import type { SunatCompany } from '../generated/prisma';
import type { CompaniesService } from '../src/modules/sunat/companies.service';
import { SireService, sireItem } from '../src/modules/sunat/consultas/sire.service';
import { ValidityService } from '../src/modules/sunat/consultas/validity.service';
import { SireQuerySchema, ValiditySchema } from '../src/modules/sunat/dto/consultas.dto';
import { SunatRestClient } from '../src/modules/sunat/transport/sunat-rest';

const COMPANY = { id: 'c1', ruc: '20000000001', razonSocial: 'EMPRESA DE PRUEBAS S.A.C.' } as SunatCompany;
const companies = {
  clientCredentials: () => ({ clientId: 'cid', clientSecret: 'secret' }),
  apiCredentials: () => ({ clientId: 'cid', clientSecret: 'secret', sol: { ruc: '20000000001', user: 'USER1', password: 'pw' } }),
} as unknown as CompaniesService;

/** fetch simulado: responde por URL y guarda lo que se pidió. */
function fakeFetch(route: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = route(url, init);
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}
const TOKEN = { status: 200, body: { access_token: 'tok', token_type: 'JWT', expires_in: 3600 } };

describe('consulta de validez', () => {
  it('arma el pedido del manual de SUNAT y traduce los códigos', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.includes('oauth2')
        ? TOKEN
        : { status: 200, body: { success: true, message: 'Operation Success! ', data: { estadoCp: '1', estadoRuc: '00', condDomiRuc: '00', observaciones: ['- Fecha de emisión ingresada no coincide con la registrada en la SUNAT.'] } } },
    );
    const service = new ValidityService(companies, new SunatRestClient({ fetch }));
    const dto = ValiditySchema.parse({ documento: 'factura', ruc_emisor: '20553300429', serie: 'ff01', numero: '2259', fecha_de_emision: '12/07/2024', total: 3411.38 });
    const result = await service.check(COMPANY, dto);
    expect(result).toMatchObject({
      valido: true,
      estado_comprobante: { codigo: '1', descripcion: 'ACEPTADO' },
      estado_ruc: { codigo: '00', descripcion: 'ACTIVO' },
      condicion_domicilio: { codigo: '00', descripcion: 'HABIDO' },
      observaciones: ['Fecha de emisión ingresada no coincide con la registrada en la SUNAT.'],
    });
    expect(calls[0].url).toBe('https://api-seguridad.sunat.gob.pe/v1/clientesextranet/cid/oauth2/token/');
    expect(String(calls[0].init.body)).toContain('grant_type=client_credentials');
    expect(String(calls[0].init.body)).toContain('scope=https%3A%2F%2Fapi.sunat.gob.pe%2Fv1%2Fcontribuyente%2Fcontribuyentes');
    expect(calls[1].url).toBe('https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/20000000001/validarcomprobante');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ numRuc: '20553300429', codComp: '01', numeroSerie: 'FF01', numero: '2259', fechaEmision: '12/07/2024', monto: '3411.38' });
  });

  it('acepta el código del comprobante y rechaza tipos desconocidos', () => {
    expect(ValiditySchema.parse({ tipo_documento: 'R1', ruc_emisor: '20553300429', serie: 'E001', numero: 1, fecha_de_emision: '2026-01-02' })).toMatchObject({ code: 'R1', issueDate: '2026-01-02', total: null });
    expect(ValiditySchema.safeParse({ documento: 'ticket', ruc_emisor: '20553300429', serie: 'E001', numero: 1, fecha_de_emision: '2026-01-02' }).success).toBe(false);
  });
});

describe('SIRE', () => {
  const RCE_ROW = {
    perTributario: '202609',
    codCar: '2055330042901FF010000002259',
    codTipoCDP: '01',
    numSerieCDP: 'FF01',
    numCDP: '2259',
    fecEmision: '12/09/2026',
    fecVencPag: '',
    codTipoDocIdentidadProveedor: '6',
    numDocIdentidadProveedor: '20553300429',
    desRazonSocialProveedor: 'TECNIGAS CORPORACION S.A.',
    codMoneda: 'PEN',
    tipoCambio: { mtoTipoCambio: '1.000' },
    montos: { mtoBIGravadaDG: 100, mtoIgvIpmDG: 18, mtoBIGravadaDGNG: 50, mtoIgvIpmDGNG: 9, mtoValorAdqNG: 5, mtoTotalCp: 182 },
  };

  it('normaliza un comprobante de compras (montos anidados, fecha dd/mm/aaaa)', () => {
    const item = sireItem('rce', RCE_ROW, COMPANY);
    expect(item.emisor).toEqual({ ruc: '20553300429', razon_social: 'TECNIGAS CORPORACION S.A.' });
    expect(item.cliente).toEqual({ tipo_documento: '6', numero_documento: '20000000001', nombre_cliente: 'EMPRESA DE PRUEBAS S.A.C.' });
    expect(item.detalle).toMatchObject({ periodo: '202609', tipo_comprobante: '01', nombre_comprobante: 'Factura', serie: 'FF01', numero: '2259', fecha_emision: '2026-09-12', fecha_vencimiento: null, tipo_cambio: '1.000' });
    expect(item.totales).toMatchObject({ base_imponible: '150.00', igv: '27.00', base_imponible_dgng: '50.00', no_gravado: '5.00', total: '182.00' });
  });

  it('normaliza una venta restando los descuentos', () => {
    const item = sireItem('rvie', { perPeriodoTributario: '202609', codTipoCDP: '03', numSerieCDP: 'B001', numCDP: '15', fecEmision: '2026-09-03', codTipoDocIdentidad: '1', numDocIdentidad: '75413811', nomRazonSocialCliente: 'CLIENTE', mtoBIGravada: 110, mtoDsctoBI: 10, mtoIGV: 19.8, mtoDsctoIGV: 1.8, mtoTotalCP: 118 }, COMPANY);
    expect(item.cliente).toEqual({ tipo_documento: '1', numero_documento: '75413811', nombre_cliente: 'CLIENTE' });
    expect(item.totales).toMatchObject({ base_imponible: '100.00', igv: '18.00', total: '118.00' });
    expect(item.detalle.fecha_emision).toBe('2026-09-03');
  });

  it('recorre las páginas de SUNAT, filtra y pagina; 422 es "sin propuesta"', async () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ ...RCE_ROW, numCDP: String(i + 1), codTipoCDP: i % 10 === 0 ? '07' : '01' }));
    const { fetch, calls } = fakeFetch((url) => {
      if (url.includes('oauth2')) return TOKEN;
      if (url.includes('/202608/')) return { status: 422, body: { cod: '422', msg: 'No existe propuesta' } };
      const page = Number(new URL(url).searchParams.get('page'));
      return { status: 200, body: { paginacion: { page, perPage: 100, totalRegistros: rows.length }, registros: rows.slice((page - 1) * 100, page * 100) } };
    });
    const sire = new SireService(companies, new SunatRestClient({ fetch }));
    const report = await sire.report(COMPANY, 'rce', SireQuerySchema.parse({ period: '202609', per_page: '20', page: '2' }));
    expect(report.paginate).toEqual({ page: 2, total_pages: 7, per_page: 20, items: 20, total_items: 130 });
    expect(report.items[0].detalle.numero).toBe('21');
    expect(calls.filter((c) => c.url.includes('/busqueda'))).toHaveLength(2);
    expect(calls[1].url).toContain('/rce/propuesta/web/propuesta/202609/busqueda?codTipoOpe=1&page=1&perPage=100');
    expect(String(calls[0].init.body)).toContain('username=20000000001USER1');

    // Filtros sobre lo que ya está en caché: no vuelve a llamar a SUNAT.
    const notes = await sire.report(COMPANY, 'rce', SireQuerySchema.parse({ period: '202609', document_type: '07' }));
    expect(notes.paginate.total_items).toBe(13);
    expect(calls.filter((c) => c.url.includes('/busqueda'))).toHaveLength(2);

    const empty = await sire.report(COMPANY, 'rce', SireQuerySchema.parse({ period: '202608' }));
    expect(empty.paginate.total_items).toBe(0);
  });

  it('valida el periodo', () => {
    expect(SireQuerySchema.safeParse({ period: '202613' }).success).toBe(false);
    expect(SireQuerySchema.safeParse({ period: '2026-09' }).success).toBe(false);
  });
});
