import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RequestLogService } from '../src/common/request-log/request-log.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * El registro de requests con la app completa (guards, límite por minuto, validación y
 * filtro de errores), armada como en main.ts. Sin BD: solo `api_requests` es simulada y
 * las keys van en memoria (DEV_API_KEY). Ninguna ruta de aquí sale a internet.
 */
describe('registro de requests (app completa)', () => {
  const KEY = 'dev-request-log-key';
  const rows: Array<Record<string, unknown>> = [];
  let app: NestFastifyApplication;

  const wait = async (n: number) => {
    // El registro no se espera en la respuesta: se le da un momento.
    for (let i = 0; i < 50 && rows.length < n; i++) await new Promise((r) => setTimeout(r, 10));
  };

  beforeAll(async () => {
    process.env.DEV_API_KEY = KEY;
    process.env.LOG_LEVEL = 'silent';
    delete process.env.DATABASE_URL;
    const prisma = new Proxy(
      { enabled: true, apiRequest: { create: async ({ data }: { data: Record<string, unknown> }) => rows.push(data) }, $connect: async () => {}, $disconnect: async () => {} },
      {
        get(target, prop) {
          if (prop in target) return target[prop as keyof typeof target];
          // Lo que Nest revisa de cualquier provider (onModuleInit…), no es la BD.
          if (prop === 'then' || typeof prop === 'symbol' || /^on[A-Z]|^before|^constructor$/.test(prop)) return undefined;
          throw new Error(`El test no esperaba prisma.${String(prop)}`);
        },
      },
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ trustProxy: true }), { logger: false });
    app.get(RequestLogService).attach(app.getHttpAdapter().getInstance());
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.DEV_API_KEY;
    delete process.env.LOG_LEVEL;
  });

  const inject = (method: 'GET' | 'POST', url: string, body?: unknown, key: string | null = KEY) =>
    app.inject({ method, url, payload: body as object, headers: key ? { 'x-api-key': key } : {} });

  it('una validación fallida: la ruta de Nest con /v1, el 400 y el mensaje', async () => {
    rows.length = 0;
    const res = await inject('POST', '/v1/shalom/track', {});
    expect(res.statusCode).toBe(400);
    await wait(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'POST', route: '/v1/shalom/track', status: 400, product: 'shalom', units: 0, keyPrefix: expect.any(String) });
    expect(rows[0].error).toEqual(expect.any(String));
    expect(rows[0].durationMs).toEqual(expect.any(Number));
  });

  it('una ruta que no existe, con una key válida', async () => {
    rows.length = 0;
    expect((await inject('GET', '/v1/shalom/no-existe')).statusCode).toBe(404);
    await wait(1);
    expect(rows[0]).toMatchObject({ route: '/v1/shalom/no-existe', status: 404, product: 'shalom' });
  });

  it('el límite por minuto (429) también queda, con el cliente', async () => {
    rows.length = 0;
    // /track/batch: 6 por minuto por key.
    for (let i = 0; i < 7; i++) await inject('POST', '/v1/shalom/track/batch', {});
    await wait(7);
    expect(rows.map((r) => r.status)).toEqual([400, 400, 400, 400, 400, 400, 429]);
    expect(rows[6]).toMatchObject({ route: '/v1/shalom/track/batch', error: expect.stringMatching(/Too Many Requests/i) });
  });

  it('sin key, o con una que no existe, no se registra', async () => {
    rows.length = 0;
    expect((await inject('POST', '/v1/shalom/track', {}, null)).statusCode).toBe(401);
    expect((await inject('POST', '/v1/shalom/track', {}, 'no-existe')).statusCode).toBe(401);
    await new Promise((r) => setTimeout(r, 100));
    expect(rows).toHaveLength(0);
  });
});
