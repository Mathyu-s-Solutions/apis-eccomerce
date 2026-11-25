import { afterAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config/configuration';
import { PrismaService } from '../src/prisma/prisma.service';
import { guideKey, ShalomGuideCache } from '../src/modules/shalom/shalom-guide-cache';

/**
 * Las marcas de guías de Shalom contra un Postgres real (TEST_DATABASE_URL, nunca la de
 * producción). Las escrituras no se esperan y sus errores se tragan: aquí se ve que llegan.
 */
const url = process.env.TEST_DATABASE_URL;
const settle = () => new Promise((r) => setTimeout(r, 150));

describe.skipIf(!url)('caché de guías de Shalom (Postgres)', () => {
  const prisma = new PrismaService({ auth: { databaseUrl: url } } as unknown as AppConfig);
  const cache = new ShalomGuideCache(prisma);
  const tag = String(Date.now()).slice(-6);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('una guía encontrada que deja de aparecer se marca gone_at; al reaparecer se desmarca', async () => {
    const key = await guideKey(`77${tag}`, 'AB12');
    await cache.save(key, { oseId: `9${tag}`, transitTime: null });
    cache.markGone(key);
    await settle();
    expect((await cache.find(key))?.goneAt).toBeInstanceOf(Date);
    cache.touch(key);
    await settle();
    expect((await cache.find(key))?.goneAt).toBeNull();
  });

  it('una guía que nunca apareció se marca aparte; al encontrarla se borra la marca', async () => {
    const key = await guideKey(`78${tag}`, 'CD34');
    expect(await cache.missingSince(key)).toBeNull();
    cache.markMissing(key);
    await settle();
    const first = await cache.missingSince(key);
    expect(first).toBeInstanceOf(Date);
    cache.markMissing(key);
    await settle();
    expect((await cache.missingSince(key))!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    await cache.save(key, { oseId: `8${tag}`, transitTime: '24 horas' });
    await settle();
    expect(await cache.missingSince(key)).toBeNull();
    expect(await cache.find(key)).toMatchObject({ oseId: `8${tag}`, goneAt: null });
  });

  it('las marcas de más de un día se borran', async () => {
    const key = await guideKey(`79${tag}`, 'EF56');
    await prisma.shalomMissingGuide.create({ data: { keyHash: key, checkedAt: new Date(Date.now() - 25 * 3_600_000) } });
    // Se poda a lo más una vez por hora por instancia: una recién creada poda en su primera marca.
    new ShalomGuideCache(prisma).markMissing(await guideKey(`80${tag}`, 'GH78'));
    await settle();
    expect(await cache.missingSince(key)).toBeNull();
  });
});
