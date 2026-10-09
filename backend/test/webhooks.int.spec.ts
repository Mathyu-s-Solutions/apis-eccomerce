import { createHmac } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ApiKeyRecord } from '../src/auth/api-key.store';
import { ShipmentStatus, type TrackingResult } from '../src/common/courier/tracking.model';
import { TrackingSubscriptionsService } from '../src/modules/webhooks/tracking-subscriptions.service';
import { MAX_ATTEMPTS, WebhooksService } from '../src/modules/webhooks/webhooks.service';
import type { WebhookSender } from '../src/modules/webhooks/webhook-sender';
import type { ShalomService } from '../src/modules/shalom/shalom.service';
import type { OlvaService } from '../src/modules/olva/olva.service';

/**
 * Webhooks y suscripciones contra un Postgres real (TEST_DATABASE_URL, nunca el
 * de producción) con los couriers y el envío HTTP simulados.
 */
const url = process.env.TEST_DATABASE_URL;

const tracking = (status: ShipmentStatus, events: string[]): TrackingResult => ({
  carrier: 'olva',
  trackingNumber: 'x',
  status,
  delivered: status === ShipmentStatus.DELIVERED,
  deliveredAt: null,
  transitTime: null,
  destination: 'HUARI',
  events: events.map((rawStatus, i) => ({ status, rawStatus, at: `2026-09-${10 + i}` })),
  raw: { consignado: 'PERSONA DE PRUEBA' },
});

describe.skipIf(!url)('webhooks y suscripciones (Postgres)', () => {
  const prisma = new PrismaService({ auth: { databaseUrl: url } } as unknown as AppConfig);
  const tag = `wh${Date.now()}`;
  let userId = '';
  let record: ApiKeyRecord;

  // Couriers simulados: cada guía devuelve lo que diga `state`.
  const state = new Map<string, TrackingResult | null>();
  const olva = { track: async (q: { orderNumber: string }) => state.get(q.orderNumber) ?? null } as unknown as OlvaService;
  const shalom = {
    findGuide: async (q: { orderNumber: string }) => (state.get(q.orderNumber) ? { oseId: `ose-${q.orderNumber}`, search: {} } : null),
    statusByOseId: async (oseId: string) => state.get(oseId.replace('ose-', '')) ?? null,
  } as unknown as ShalomService;

  // Envío simulado: guarda lo que se mandó y responde `nextStatus`.
  const sent: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  let nextStatus = 200;
  const sender = { send: async (u: string, body: string, headers: Record<string, string>) => { sent.push({ url: u, body, headers }); return { status: nextStatus }; } } as unknown as WebhookSender;

  const webhooks = new WebhooksService(prisma, sender);
  const subs = new TrackingSubscriptionsService(prisma, shalom, olva, webhooks);
  const due = (orderNumber: string) =>
    prisma.trackingSubscription.updateMany({ where: { userId, orderNumber }, data: { nextCheckAt: new Date(Date.now() - 1000) } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${tag}@test.local` } });
    userId = user.id;
    record = { id: 'k', prefix: 'k', name: 'k', monthlyLimit: null, enabled: true, product: 'all', userId, plans: {} };
  });
  beforeEach(() => { sent.length = 0; nextStatus = 200; });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('el webhook es de la cuenta: el secreto se ve una sola vez', async () => {
    const first = await webhooks.setConfig(userId, { url: 'https://hooks.example.com/olva' });
    expect(first.secret).toMatch(/^whsec_/);
    const again = await webhooks.setConfig(userId, { url: 'https://hooks.example.com/v2' });
    expect(again.secret).toBeUndefined();
    expect(again.secretHint).toBe(first.secretHint);
    expect((await webhooks.setConfig(userId, { url: 'https://hooks.example.com/v2', rotateSecret: true })).secret).not.toBe(first.secret);
  });

  it('una key sin cuenta no puede suscribirse', async () => {
    await expect(subs.subscribe({ ...record, userId: null }, 'olva', { orderNumber: '111111' })).rejects.toThrow(ForbiddenException);
  });

  it('suscribirse valida la guía; Shalom guarda el ose_id y no la clave', async () => {
    await expect(subs.subscribe(record, 'olva', { orderNumber: '999999', orderCode: '26' })).rejects.toThrow(NotFoundException);
    state.set('2000001', tracking(ShipmentStatus.REGISTERED, ['REGISTRADO']));
    const r = await subs.subscribe(record, 'shalom', { orderNumber: '2000001', orderCode: 'AB12' });
    expect(r.subscription).toMatchObject({ carrier: 'shalom', status: 'REGISTERED', active: true });
    expect(JSON.stringify(r)).not.toContain('PERSONA DE PRUEBA');
    const row = await prisma.trackingSubscription.findFirstOrThrow({ where: { userId, orderNumber: '2000001' } });
    expect(row).toMatchObject({ upstreamRef: 'ose-2000001', orderCode: null });
  });

  it('un cambio de estado encola un aviso firmado, sin datos personales, y se entrega', async () => {
    state.set('1000001', tracking(ShipmentStatus.REGISTERED, ['REGISTRADO']));
    await subs.subscribe(record, 'olva', { orderNumber: '1000001', orderCode: '26' });

    await due('1000001');
    expect((await subs.pollDue()).changed).toBe(0); // sin cambios, sin aviso

    state.set('1000001', tracking(ShipmentStatus.IN_TRANSIT, ['REGISTRADO', 'DESPACHADO']));
    await due('1000001');
    // Dos workers a la vez: la guía se revisa una sola vez.
    const [a, b] = await Promise.all([subs.pollDue(), subs.pollDue()]);
    expect(a.checked + b.checked).toBe(1);
    expect(a.changed + b.changed).toBe(1);

    const res = await webhooks.dispatchDue();
    expect(res).toEqual({ delivered: 1, failed: 0 });
    const msg = sent[0];
    const body = JSON.parse(msg.body);
    expect(body).toMatchObject({ type: 'tracking.updated', data: { carrier: 'olva', status: 'IN_TRANSIT', previousStatus: 'REGISTERED' } });
    expect(msg.body).not.toContain('PERSONA DE PRUEBA');
    const secret = (await prisma.webhook.findUniqueOrThrow({ where: { userId } })).secret;
    const [, t, v1] = msg.headers['x-mathyu-signature'].match(/^t=(\d+),v1=([0-9a-f]+)$/)!;
    expect(createHmac('sha256', secret).update(`${t}.${msg.body}`).digest('hex')).toBe(v1);
  });

  it('si el webhook falla, reintenta con espera y al final la da por perdida (se puede reenviar)', async () => {
    nextStatus = 500;
    const test = await webhooks.test(userId);
    expect(test).toMatchObject({ status: 'pending', attempts: 1, lastStatus: 500 });
    expect(test.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    for (let i = 2; i <= MAX_ATTEMPTS; i++) await webhooks.dispatchOne(test.id);
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: test.id } })).toMatchObject({ status: 'dead', attempts: MAX_ATTEMPTS });
    nextStatus = 204;
    expect(await webhooks.redeliver(userId, test.id)).toMatchObject({ status: 'delivered' });
  });

  it('entregada la guía, deja de vigilarse', async () => {
    state.set('1000001', tracking(ShipmentStatus.DELIVERED, ['REGISTRADO', 'DESPACHADO', 'ENTREGADO']));
    await due('1000001');
    await subs.pollDue();
    expect((await prisma.trackingSubscription.findFirstOrThrow({ where: { userId, orderNumber: '1000001' } })).active).toBe(false);
  });

  it('el plan gratis vigila hasta 5 guías por API', async () => {
    for (let n = 3000001; n <= 3000005; n++) {
      state.set(String(n), tracking(ShipmentStatus.REGISTERED, ['REGISTRADO']));
    }
    // Ya hay 0 activas de Olva (la anterior se entregó): entran 5 y la 6ª no.
    for (let n = 3000001; n <= 3000005; n++) await subs.subscribe(record, 'olva', { orderNumber: String(n) });
    state.set('3000006', tracking(ShipmentStatus.REGISTERED, ['REGISTRADO']));
    await expect(subs.subscribe(record, 'olva', { orderNumber: '3000006' })).rejects.toThrow(ConflictException);
    await subs.unsubscribe(record, 'olva', '3000001');
    await expect(subs.subscribe(record, 'olva', { orderNumber: '3000006' })).resolves.toBeTruthy();
  });
});
