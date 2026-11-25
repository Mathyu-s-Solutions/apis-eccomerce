import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config/configuration';
import { envSchema } from '../src/config/env.validation';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { PadronService } from '../src/modules/sunat/consultas/padron.service';
import { ShalomWebClient } from '../src/modules/shalom/shalom-web.client';
import type { ShalomService } from '../src/modules/shalom/shalom.service';
import { StatusService } from '../src/modules/status/status.service';
import type { StatusAlerts } from '../src/modules/status/status-alerts';
import { runProbe } from '../src/modules/status/probe';

/**
 * Los chequeos de la página de estado contra los servicios reales (Shalom, Olva, SUNAT, BCRP).
 * Solo corre con STATUS_LIVE=1: depende de la red. Sin BD ni padrón (esos no salen de aquí).
 */
const enabled = process.env.STATUS_LIVE === '1';

describe.skipIf(!enabled)('página de estado: chequeos reales', () => {
  const config = buildConfig(envSchema.parse({}));
  const prisma = { enabled: true, $queryRaw: async () => [{ '?column?': 1 }] } as unknown as PrismaService;
  // Sin captcha (SHALOM_CAPTCHA_PROVIDER=none): el rastreo de Shalom no se prueba aquí.
  const service = new StatusService(config, prisma, new ShalomWebClient(config), {} as ShalomService, {} as PadronService, {} as StatusAlerts);

  for (const probe of service.probes()) {
    it(`${probe.id} responde`, { timeout: 30_000 }, async () => {
      const result = await runProbe(probe, { onError: (_, e) => console.warn(probe.id, e) });
      console.log(probe.id, result.status, `${result.latencyMs} ms`, result.detail ?? '');
      expect(result.status).not.toBe('down');
    });
  }
});
