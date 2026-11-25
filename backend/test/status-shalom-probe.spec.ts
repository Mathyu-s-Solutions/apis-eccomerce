import { describe, expect, it, vi } from 'vitest';
import { buildConfig } from '../src/config/configuration';
import { envSchema } from '../src/config/env.validation';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { PadronService } from '../src/modules/sunat/consultas/padron.service';
import type { ShalomWebClient } from '../src/modules/shalom/shalom-web.client';
import type { LookupBy, ShalomService } from '../src/modules/shalom/shalom.service';
import { StatusService } from '../src/modules/status/status.service';
import type { StatusAlerts } from '../src/modules/status/status-alerts';

/**
 * El chequeo del rastreo de Shalom en /status. Unos días después de entregada, Shalom ya no
 * muestra una guía (ni por ose_id): eso no es que el rastreo esté caído.
 */
function setup(opts: { guides: string[]; visible: string[]; trackedRecently?: boolean }) {
  const config = buildConfig(envSchema.parse({ SHALOM_CAPTCHA_PROVIDER: 'playwright' }));
  const findMany = vi.fn(async () => opts.guides.map((oseId) => ({ oseId })));
  const prisma = { enabled: true, shalomGuide: { findMany } } as unknown as PrismaService;
  const probe = vi.fn(async (by: LookupBy) => ('oseId' in by && opts.visible.includes(by.oseId) ? {} : null));
  const shalom = { trackedRecently: () => !!opts.trackedRecently, probe } as unknown as ShalomService;
  const service = new StatusService(config, prisma, {} as ShalomWebClient, shalom, {} as PadronService, {} as StatusAlerts);
  const check = service.probes().find((p) => p.id === 'shalom-tracking')!;
  return { run: () => check.run(new AbortController().signal), probe, findMany };
}

describe('chequeo del rastreo de Shalom', () => {
  it('prueba con la última guía que Shalom encontró', async () => {
    const { run, probe, findMany } = setup({ guides: ['2', '1'], visible: ['2', '1'] });
    await expect(run()).resolves.toBeUndefined();
    // Las que Shalom ya no muestra (gone_at) no sirven para probar.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ goneAt: null }) }));
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith({ oseId: '2' }, 25_000);
  });

  it('si esa ya no aparece (entregada), prueba la anterior antes de darlo por caído', async () => {
    const { run, probe } = setup({ guides: ['2', '1'], visible: ['1'] });
    await expect(run()).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('caído si ninguna de las dos aparece', async () => {
    const { run } = setup({ guides: ['2', '1'], visible: [] });
    await expect(run()).rejects.toThrow('No encontró guías que existen');
  });

  it('si un cliente rastreó una guía completa hace poco, no gasta un turno de Shalom', async () => {
    const { run, probe } = setup({ guides: ['2'], visible: [], trackedRecently: true });
    await expect(run()).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });
});
