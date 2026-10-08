import { describe, expect, it } from 'vitest';
import { withRaw, RawQuerySchema } from '../src/common/courier/raw-query';
import { mapStore } from '../src/modules/olva/olva.mapper';
import type { OlvaStore } from '../src/modules/olva/olva.upstream';
import { mapShalomAgency } from '../src/modules/shalom/shalom.mapper';

/** Forma real de agencias/listar (campos que usamos). */
const shalomRaw = {
  ter_id: 3,
  nombre: 'AMAZONAS / CHACHAPOYAS / CHACHAPOYAS / CHACHAPOYAS CO DOS DE MAYO',
  lugar_over: 'CHACHAPOYAS CO DOS DE MAYO',
  zona: 'CHACHAPOYAS',
  departamento: 'AMAZONAS',
  provincia: 'CHACHAPOYAS',
  direccion: 'JR. DOS DE MAYO CDRA. 15 S/N',
  latitud: '-6.2386732901495',
  longitud: '-77.868008265336',
  ubi_id: 10101,
  destino: 1,
  hora_atencion: 'LUNES A VIERNES - 8:00 AM A 8:00 PM',
  horario_atencion_lunes_inicio: '08:00:00',
  horario_atencion_lunes_fin: '20:00:00',
  horario_atencion_sabado_inicio: '08:00:00',
  horario_atencion_sabado_fin: '20:00:00',
  horario_atencion_domingo_inicio: null,
  horario_atencion_domingo_fin: null,
};

describe('mapShalomAgency', () => {
  it('nombre del lugar, distrito, ubigeo del INEI y horario por día', () => {
    const a = mapShalomAgency(shalomRaw);
    expect(a).toMatchObject({
      code: '3',
      name: 'CHACHAPOYAS CO DOS DE MAYO',
      department: 'AMAZONAS',
      province: 'CHACHAPOYAS',
      district: 'CHACHAPOYAS',
      ubigeo: '010101',
      latitude: -6.2386732901495,
      receivesShipments: true,
    });
    expect(a.schedule?.friday).toEqual({ open: '08:00', close: '20:00' });
    expect(a.schedule?.saturday).toEqual({ open: '08:00', close: '20:00' });
    expect(a.schedule?.sunday).toEqual({ open: null, close: null });
  });

  it('las que no reciben envíos quedan marcadas; sin horario = null', () => {
    const a = mapShalomAgency({ ...shalomRaw, destino: 0, horario_atencion_lunes_inicio: null });
    expect(a.receivesShipments).toBe(false);
    expect(a.schedule).toBeNull();
  });
});

describe('mapStore (Olva)', () => {
  const store = {
    office_id: '579',
    nombres: 'TIENDA CHACHAPOYAS - JR. ORTIZ ARRIETA Nº 270 S/N',
    tipo: 'TIENDAS',
    ubigeo: '010101',
    partner: '',
    direccion: 'JR. ORTIZ ARRIETA Nº 270 S/N',
    lat: '-6.226970099021466',
    lng: '-77.87291566856221',
    department: 'AMAZONAS',
    province: 'CHACHAPOYAS',
    district: 'CHACHAPOYAS',
    horario: {
      monday: { open: '08:00', close: '19:00' },
      saturday: { open: '08:00', close: '14:30' },
      sunday: { open: null, close: null },
    },
  } satisfies OlvaStore;

  it('expone el horario de Olva con los 7 días', () => {
    const a = mapStore(store);
    expect(a.receivesShipments).toBe(true);
    expect(a.schedule).toMatchObject({
      monday: { open: '08:00', close: '19:00' },
      tuesday: { open: null, close: null },
      saturday: { open: '08:00', close: '14:30' },
    });
    expect(mapStore({ ...store, horario: null }).schedule).toBeNull();
  });
});

describe('raw opcional', () => {
  it('?raw=1 o true lo incluye; por defecto no', () => {
    expect(RawQuerySchema.parse({}).raw).toBe(false);
    expect(RawQuerySchema.parse({ raw: '1' }).raw).toBe(true);
    expect(RawQuerySchema.parse({ raw: 'false' }).raw).toBe(false);
    expect(RawQuerySchema.safeParse({ raw: 'si' }).success).toBe(false);
    expect(withRaw({ code: '1', raw: { x: 1 } }, false)).toEqual({ code: '1' });
    expect(withRaw({ code: '1', raw: { x: 1 } }, true)).toEqual({ code: '1', raw: { x: 1 } });
  });
});
