import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Las marcas de guías que Shalom nunca encontró se borran pasado este tiempo. */
const MISSING_KEEP_MS = 24 * 60 * 60 * 1000;

const scryptAsync = promisify(scrypt) as (input: string, salt: string, keylen: number, options: { N: number }) => Promise<Buffer>;

/**
 * Hash de guía + clave. Lento a propósito (scrypt, ~30 ms): con la guía (8
 * dígitos) y la clave (4 caracteres) un hash rápido se adivinaría por fuerza
 * bruta si se filtrara la tabla, y con la clave se retira el paquete.
 */
export async function guideKey(orderNumber: string, orderCode: string): Promise<string> {
  const input = `${orderNumber.trim()}:${orderCode.trim().toUpperCase()}`;
  return (await scryptAsync(input, 'mathyu-apis/shalom-guide/v1', 32, { N: 16384 })).toString('hex');
}

export interface CachedGuide {
  oseId: string;
  transitTime: string | null;
  /** Desde cuándo Shalom ya no la muestra (la encontró antes y ahora no). */
  goneAt?: Date | null;
}

/**
 * Guías de Shalom ya encontradas → su ose_id. Así cada guía resuelve un solo
 * captcha (lo caro de la API): las consultas siguientes van sin captcha. En
 * Postgres (compartido entre instancias) o en memoria si no hay BD.
 */
@Injectable()
export class ShalomGuideCache {
  private readonly memory = new Map<string, CachedGuide>();
  /** Guías que Shalom nunca encontró → cuándo se buscaron (sin BD). */
  private readonly missingMemory = new Map<string, Date>();
  private lastPrune = 0;

  constructor(private readonly prisma: PrismaService) {}

  async find(key: string): Promise<CachedGuide | null> {
    if (!this.prisma.enabled) return this.memory.get(key) ?? null;
    const row = await this.prisma.shalomGuide.findUnique({ where: { keyHash: key } });
    if (!row) return null;
    return { oseId: row.oseId, transitTime: row.transitTime, goneAt: row.goneAt };
  }

  /**
   * Shalom la volvió a encontrar (lastUsedAt). No se marca al consultarla: unos días después
   * de entregada Shalom ya no la muestra, y /status prueba con la última marcada.
   */
  touch(key: string): void {
    this.mark(key, { lastUsedAt: new Date(), goneAt: null });
  }

  /** Shalom la encontró antes y ahora no: unos días después de entregada la quita del rastreo. */
  markGone(key: string): void {
    this.mark(key, { goneAt: new Date() });
  }

  private mark(key: string, data: { lastUsedAt?: Date; goneAt: Date | null }): void {
    if (!this.prisma.enabled) {
      const guide = this.memory.get(key);
      if (guide) guide.goneAt = data.goneAt;
      return;
    }
    void this.prisma.shalomGuide.update({ where: { keyHash: key }, data }).catch(() => {});
  }

  async save(key: string, guide: CachedGuide): Promise<void> {
    if (!this.prisma.enabled) {
      this.memory.set(key, { ...guide, goneAt: null });
      this.missingMemory.delete(key);
      return;
    }
    await this.prisma.shalomGuide.upsert({
      where: { keyHash: key },
      create: { keyHash: key, oseId: guide.oseId, transitTime: guide.transitTime },
      update: { oseId: guide.oseId, transitTime: guide.transitTime, lastUsedAt: new Date(), goneAt: null },
    });
    void this.prisma.shalomMissingGuide.deleteMany({ where: { keyHash: key } }).catch(() => {});
  }

  /** Cuándo se buscó por última vez esta guía sin que Shalom la encontrara (nunca la encontró). */
  async missingSince(key: string): Promise<Date | null> {
    if (!this.prisma.enabled) return this.missingMemory.get(key) ?? null;
    const row = await this.prisma.shalomMissingGuide.findUnique({ where: { keyHash: key } });
    return row?.checkedAt ?? null;
  }

  /** Shalom no la encontró (y nunca la había encontrado). */
  markMissing(key: string): void {
    const now = new Date();
    if (!this.prisma.enabled) {
      this.missingMemory.set(key, now);
      return;
    }
    void this.prisma.shalomMissingGuide
      .upsert({ where: { keyHash: key }, create: { keyHash: key, checkedAt: now }, update: { checkedAt: now } })
      .catch(() => {});
    // De paso, a lo más una vez por hora, se borran las de más de un día.
    if (now.getTime() - this.lastPrune > 60 * 60 * 1000) {
      this.lastPrune = now.getTime();
      void this.prisma.shalomMissingGuide.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - MISSING_KEEP_MS) } } }).catch(() => {});
    }
  }
}
