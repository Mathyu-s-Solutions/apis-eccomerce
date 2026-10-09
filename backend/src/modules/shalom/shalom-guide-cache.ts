import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}

/**
 * Guías de Shalom ya encontradas → su ose_id. Así cada guía resuelve un solo
 * captcha (lo caro de la API): las consultas siguientes van sin captcha. En
 * Postgres (compartido entre instancias) o en memoria si no hay BD.
 */
@Injectable()
export class ShalomGuideCache {
  private readonly memory = new Map<string, CachedGuide>();

  constructor(private readonly prisma: PrismaService) {}

  async find(key: string): Promise<CachedGuide | null> {
    if (!this.prisma.enabled) return this.memory.get(key) ?? null;
    const row = await this.prisma.shalomGuide.findUnique({ where: { keyHash: key } });
    if (!row) return null;
    // Uso reciente: sirve para limpiar las que nadie consulta.
    void this.prisma.shalomGuide.update({ where: { keyHash: key }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return { oseId: row.oseId, transitTime: row.transitTime };
  }

  async save(key: string, guide: CachedGuide): Promise<void> {
    if (!this.prisma.enabled) {
      this.memory.set(key, guide);
      return;
    }
    await this.prisma.shalomGuide.upsert({
      where: { keyHash: key },
      create: { keyHash: key, oseId: guide.oseId, transitTime: guide.transitTime },
      update: { oseId: guide.oseId, transitTime: guide.transitTime, lastUsedAt: new Date() },
    });
  }
}
