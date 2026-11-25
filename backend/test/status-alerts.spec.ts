import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { Email, Mailer } from '../src/modules/notifications/mailer';
import type { CheckResult, CheckStatus } from '../src/modules/status/probe';
import { StatusAlerts } from '../src/modules/status/status-alerts';
import { UpstreamError } from '../src/common/errors/upstream.error';

const T0 = Date.parse('2026-11-19T15:30:00Z');
const at = (tick: number) => new Date(T0 + tick * 10 * 60_000);

/** status_checks y sent_emails en memoria, con lo que usa StatusAlerts. */
function setup(opts: { failSend?: boolean } = {}) {
  const checks: Array<{ component: string; status: string; checkedAt: Date }> = [];
  const keys = new Set<string>();
  const sent: Email[] = [];
  let failSend = !!opts.failSend;

  const inRange = (d: Date, w: { lt?: Date; gte?: Date }) => (!w.lt || d < w.lt) && (!w.gte || d >= w.gte);
  const prisma = {
    enabled: true,
    statusCheck: {
      findMany: async ({ where, take }: { where: { component?: string; checkedAt: { lt?: Date; gte?: Date } }; take?: number }) =>
        checks
          .filter((c) => (!where.component || c.component === where.component) && inRange(c.checkedAt, where.checkedAt))
          .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())
          .slice(0, take ?? Infinity),
    },
    sentEmail: {
      findUnique: async ({ where }: { where: { key: string } }) => (keys.has(where.key) ? { key: where.key } : null),
      createMany: async ({ data }: { data: Array<{ key: string }> }) => {
        const fresh = data.filter((d) => !keys.has(d.key));
        fresh.forEach((d) => keys.add(d.key));
        return { count: fresh.length };
      },
      deleteMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        where.key.in.forEach((k) => keys.delete(k));
        return { count: where.key.in.length };
      },
    },
  } as unknown as PrismaService;
  const mailer = {
    enabled: true,
    panelUrl: (path: string) => `https://apis.example.com${path}`,
    send: async (email: Email) => {
      if (failSend) return false;
      sent.push(email);
      return true;
    },
  } as unknown as Mailer;
  const config = { email: { adminEmails: ['admin@example.com'] } } as unknown as AppConfig;
  const alerts = new StatusAlerts(config, prisma, mailer);

  /** Un tick del worker: guarda los chequeos y corre las alertas, como StatusService. */
  async function tick(n: number, statuses: Record<string, CheckStatus>, errors = new Map<string, unknown>()) {
    const checkedAt = at(n);
    const results: CheckResult[] = Object.entries(statuses).map(([component, status]) => ({
      component,
      status,
      latencyMs: status === 'down' ? null : 100,
      detail: status === 'down' ? 'Respondió con un error' : null,
    }));
    checks.push(...results.map((r) => ({ component: r.component, status: r.status, checkedAt })));
    return alerts.notify(results, errors, checkedAt);
  }
  return { tick, sent, setFailSend: (v: boolean) => (failSend = v) };
}

describe('alertas de la página de estado', () => {
  it('avisa una vez cuando lleva 2 chequeos caído, y cuando vuelve', async () => {
    const { tick, sent } = setup();
    const err = new Map([['shalom-tracking', new UpstreamError('shalom', 'Busque nuevamente la orden de servicio.', { status: 400 })]]);
    await tick(0, { 'shalom-tracking': 'up', 'olva-tracking': 'up' });
    expect(await tick(1, { 'shalom-tracking': 'down', 'olva-tracking': 'up' }, err)).toEqual({ down: [], recovered: [] });
    expect(await tick(2, { 'shalom-tracking': 'down', 'olva-tracking': 'up' }, err)).toEqual({ down: ['shalom-tracking'], recovered: [] });
    // Sigue caído: no se repite.
    expect(await tick(3, { 'shalom-tracking': 'down', 'olva-tracking': 'up' }, err)).toEqual({ down: [], recovered: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ['admin@example.com'], subject: '🔴 Caído: Shalom · Rastreo de guías' });
    expect(sent[0].html).toContain('Busque nuevamente la orden de servicio.');

    expect(await tick(4, { 'shalom-tracking': 'up', 'olva-tracking': 'up' })).toEqual({ down: [], recovered: ['shalom-tracking'] });
    expect(sent[1].subject).toBe('✅ Volvió: Shalom · Rastreo de guías');
    expect(sent[1].html).toContain('estuvo caído 30 min');
    expect(await tick(5, { 'shalom-tracking': 'up', 'olva-tracking': 'up' })).toEqual({ down: [], recovered: [] });
    expect(sent).toHaveLength(2);
  });

  it('una falla suelta no avisa (ni su vuelta)', async () => {
    const { tick, sent } = setup();
    await tick(0, { 'sunat-cpe': 'down' });
    await tick(1, { 'sunat-cpe': 'degraded' });
    await tick(2, { 'sunat-cpe': 'down' });
    await tick(3, { 'sunat-cpe': 'up' });
    expect(sent).toHaveLength(0);
  });

  it('varios caídos a la vez van en un solo correo', async () => {
    const { tick, sent } = setup();
    await tick(0, { 'sunat-cpe': 'down', 'sunat-api': 'down', api: 'up' });
    await tick(1, { 'sunat-cpe': 'down', 'sunat-api': 'down', api: 'up' });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('🔴 2 servicios caídos');
  });

  it('si el correo no sale, lo reintenta en el siguiente chequeo', async () => {
    const { tick, sent, setFailSend } = setup({ failSend: true });
    await tick(0, { 'shalom-web': 'down' });
    expect(await tick(1, { 'shalom-web': 'down' })).toEqual({ down: [], recovered: [] });
    setFailSend(false);
    expect(await tick(2, { 'shalom-web': 'down' })).toEqual({ down: ['shalom-web'], recovered: [] });
    expect(sent).toHaveLength(1);
  });

  it('una caída nueva después de volver se avisa de nuevo', async () => {
    const { tick, sent } = setup();
    await tick(0, { 'olva-web': 'down' });
    await tick(1, { 'olva-web': 'down' });
    await tick(2, { 'olva-web': 'up' });
    await tick(3, { 'olva-web': 'down' });
    await tick(4, { 'olva-web': 'down' });
    expect(sent.map((e) => e.subject)).toEqual(['🔴 Caído: Olva · Agencias y cotización', '✅ Volvió: Olva · Agencias y cotización', '🔴 Caído: Olva · Agencias y cotización']);
  });
});
