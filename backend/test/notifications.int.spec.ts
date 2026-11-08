import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { currentPeriod } from '../src/auth/api-key.store';
import type { Email, Mailer } from '../src/modules/notifications/mailer';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { MAX_ATTEMPTS } from '../src/modules/webhooks/webhooks.service';

/**
 * Avisos por correo del worker contra un Postgres real (TEST_DATABASE_URL, nunca
 * el de producción), con el envío a Resend simulado.
 */
const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;

describe.skipIf(!url)('avisos por correo (Postgres)', () => {
  const prisma = new PrismaService({ auth: { databaseUrl: url } } as unknown as AppConfig);
  const tag = `nt${Date.now()}`;

  // Envío simulado: guarda lo que se mandó; con `failing`, Resend "falla".
  let sent: Email[] = [];
  let failing = false;
  const mailer = {
    enabled: true,
    panelUrl: (path: string) => `https://panel.test${path}`,
    send: async (e: Email) => {
      if (failing) return false;
      sent.push(e);
      return true;
    },
  } as unknown as Mailer;
  const service = new NotificationsService(prisma, mailer);

  /** Solo lo que se mandó a los usuarios de este test (la BD puede tener otros). */
  const mine = () => sent.filter((e) => e.to.startsWith(tag));
  const subjects = () => mine().map((e) => e.subject);

  const user = (name: string) => prisma.user.create({ data: { email: `${tag}-${name}@test.local`, name } });
  const usage = (userId: string, product: string, used: number) =>
    prisma.planUsage.upsert({
      where: { userId_product_period: { userId, product, period: currentPeriod() } },
      create: { userId, product, period: currentPeriod(), used },
      update: { used },
    });

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  beforeEach(() => {
    sent = [];
    failing = false;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    // Las claves llevan el id del cliente, de la entrega o de la empresa.
    const deliveries = await prisma.webhookDelivery.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    const companies = await prisma.sunatCompany.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    const refs = [...ids, ...deliveries.map((d) => d.id), ...companies.map((c) => c.id)];
    await prisma.sentEmail.deleteMany({ where: { OR: refs.map((id) => ({ key: { contains: id } })) } });
    await prisma.sunatCompany.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.onModuleDestroy();
  });

  describe('cuota', () => {
    it('avisa al 80% y al 100% del plan gratis, una sola vez cada uno', async () => {
      const u = await user('gratis');
      await usage(u.id, 'shalom', 15);
      await service.quota(new Date());
      expect(subjects()).toEqual([]);

      await usage(u.id, 'shalom', 16);
      await service.quota(new Date());
      await service.quota(new Date());
      expect(subjects()).toEqual(['Usaste el 80% de tu cuota de Shalom este mes']);
      expect(mine()[0].html).toContain('16 de 20 consultas');
      expect(mine()[0].html).toContain('https://panel.test/dashboard/billing?product=shalom');

      await usage(u.id, 'shalom', 20);
      await service.quota(new Date());
      await service.quota(new Date());
      expect(subjects()).toEqual(['Usaste el 80% de tu cuota de Shalom este mes', 'Llegaste al límite de tu cuota de Shalom']);
    });

    it('si pasa el 80% y el 100% de golpe, manda solo el del 100%', async () => {
      const u = await user('golpe');
      await usage(u.id, 'olva', 25);
      await service.quota(new Date());
      await service.quota(new Date());
      expect(subjects()).toEqual(['Llegaste al límite de tu cuota de Olva']);
    });

    it('usa la cuota del plan pagado y no avisa en los ilimitados', async () => {
      const u = await user('pagado');
      await prisma.subscription.createMany({
        data: [
          { userId: u.id, product: 'sunat', plan: 'basico', monthlyLimit: 1000, expiresAt: new Date(Date.now() + 10 * DAY) },
          { userId: u.id, product: 'shalom', plan: 'basico', monthlyLimit: null, expiresAt: new Date(Date.now() + 10 * DAY) },
        ],
      });
      await usage(u.id, 'sunat', 500);
      await usage(u.id, 'shalom', 5000);
      await service.quota(new Date());
      expect(subjects()).toEqual([]);

      await usage(u.id, 'sunat', 850);
      await service.quota(new Date());
      expect(subjects()).toEqual(['Usaste el 80% de tu cuota de SUNAT este mes']);
      expect(mine()[0].html).toContain('850 de 1000 operaciones');
    });

    it('no avisa si el plan pagado venció este mes (ya le llega el aviso de plan vencido)', async () => {
      const u = await user('vencido');
      await prisma.subscription.create({
        data: { userId: u.id, product: 'olva', plan: 'basico', monthlyLimit: null, expiresAt: new Date(Date.now() - 1000) },
      });
      await usage(u.id, 'olva', 300);
      await service.quota(new Date());
      expect(subjects()).toEqual([]);
    });

    it('si Resend falla no anota el aviso y lo reintenta en el siguiente tick', async () => {
      const u = await user('reintento');
      await usage(u.id, 'olva', 17);
      failing = true;
      await service.quota(new Date());
      expect(await prisma.sentEmail.count({ where: { key: { contains: u.id } } })).toBe(0);

      failing = false;
      await service.quota(new Date());
      expect(subjects()).toEqual(['Usaste el 80% de tu cuota de Olva este mes']);
    });
  });

  describe('webhook caído', () => {
    it('avisa las entregas que agotaron sus reintentos, a lo más un correo al día', async () => {
      const u = await user('webhook');
      await prisma.webhook.create({ data: { userId: u.id, url: 'https://cliente.test/hook', secret: 'whsec_x' } });
      const dead = (event = 'tracking.updated') =>
        prisma.webhookDelivery.create({
          data: { userId: u.id, event, payload: {}, status: 'dead', attempts: MAX_ATTEMPTS, lastStatus: 502, lastError: 'Respondió 502' },
        });
      await dead();
      await dead();
      await dead('webhook.test'); // las pruebas no cuentan

      await service.deadWebhooks(new Date());
      expect(subjects()).toEqual(['Tu webhook no está recibiendo los avisos']);
      expect(mine()[0].html).toContain('2 avisos');
      expect(mine()[0].html).toContain('https://cliente.test/hook');
      expect(mine()[0].html).toContain('HTTP 502');

      // Otra entrega muere el mismo día: queda contada, sin otro correo.
      await dead();
      await service.deadWebhooks(new Date());
      expect(mine()).toHaveLength(1);

      // Al día siguiente, una entrega nueva sí avisa (y las de ayer no se repiten).
      await dead();
      await service.deadWebhooks(new Date(Date.now() + DAY));
      expect(mine()).toHaveLength(2);
      expect(mine()[1].html).toContain('1 aviso');
    });

    it('no avisa si el cliente desactivó su webhook', async () => {
      const u = await user('apagado');
      await prisma.webhook.create({ data: { userId: u.id, url: 'https://cliente.test/off', secret: 'whsec_y', enabled: false } });
      await prisma.webhookDelivery.create({
        data: { userId: u.id, event: 'tracking.updated', payload: {}, status: 'dead', attempts: MAX_ATTEMPTS },
      });
      await service.deadWebhooks(new Date());
      expect(subjects()).toEqual([]);
    });
  });

  describe('certificado de SUNAT', () => {
    const company = (userId: string, ruc: string, validTo: Date) =>
      prisma.sunatCompany.create({
        data: {
          userId,
          ruc,
          razonSocial: `EMPRESA ${ruc} SAC`,
          direccion: 'AV. PRUEBA 123',
          certificate: 'cifrado',
          certificateInfo: { subject: 'x', issuer: 'y', serialNumber: '1', validFrom: '2025-01-01T00:00:00.000Z', validTo: validTo.toISOString(), ruc },
        },
      });

    it('avisa a 30 días, a 7 días y al vencer, una vez cada uno', async () => {
      const u = await user('cert');
      const validTo = new Date(Date.now() + 20 * DAY);
      await company(u.id, '20100000001', validTo);

      await service.certificates(new Date());
      await service.certificates(new Date());
      expect(subjects()).toEqual([expect.stringMatching(/^El certificado digital de EMPRESA 20100000001 SAC vence el /)]);
      expect(mine()[0].html).toContain('en 20 días');
      expect(mine()[0].html).toContain('https://panel.test/dashboard/sunat');

      await service.certificates(new Date(validTo.getTime() - 5 * DAY));
      expect(mine()).toHaveLength(2);
      expect(mine()[1].html).toContain('en 5 días');

      await service.certificates(new Date(validTo.getTime() + 1000));
      await service.certificates(new Date(validTo.getTime() + DAY));
      expect(mine()).toHaveLength(3);
      expect(mine()[2].subject).toBe('Venció el certificado digital de EMPRESA 20100000001 SAC');
    });

    it('si ya está a menos de 7 días, manda solo ese aviso', async () => {
      const u = await user('cert7');
      await company(u.id, '20100000002', new Date(Date.now() + 3 * DAY));
      await service.certificates(new Date());
      expect(mine()).toHaveLength(1);
      expect(mine()[0].html).toContain('en 3 días');
    });

    it('no avisa certificados vigentes por más de 30 días ni vencidos hace más de una semana', async () => {
      const u = await user('certok');
      await company(u.id, '20100000003', new Date(Date.now() + 90 * DAY));
      await company(u.id, '20100000004', new Date(Date.now() - 30 * DAY));
      await service.certificates(new Date());
      expect(subjects()).toEqual([]);
    });
  });
});
