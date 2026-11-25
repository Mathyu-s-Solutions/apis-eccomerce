import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractApiKey } from '../../auth/api-key.guard';
import { API_KEY_STORE, type ApiKeyStore } from '../../auth/api-key.store';
import { PrismaService } from '../../prisma/prisma.service';
import { logProps } from './request-log.props';

/** Días que se guarda el registro. */
export const RETENTION_DAYS = 30;
/**
 * Topes de lo que se registra (por instancia de Cloud Run, que son 2 como mucho): la base
 * es la del plan gratis de Neon (0,5 GB). Una fila ocupa ~300 bytes con sus índices; con
 * estos topes, el peor caso (un cliente desbocado) son ~10.000 filas al día, unos 90 MB en
 * 30 días. El uso normal es de cientos por mes.
 */
export const MAX_PER_KEY = { minute: 60, day: 2_000 };
export const MAX_PER_DAY = 5_000;
const MAX_ERROR = 300;

const PRODUCT_RE = /^\/v1\/(shalom|olva|sunat)(\/|$)/;

/** Una ruta que no existe se guarda tal cual, pero sin números largos (DNI, RUC, guías). */
function maskPath(path: string): string {
  return path.replace(/\d{5,}/g, ':n').slice(0, 200);
}

/**
 * Registro de los requests a la API para el panel de admin: cliente, key, endpoint, status,
 * tiempo, cuota cobrada y el error que recibió. Nunca los cuerpos (llevan la clave de las
 * guías de Shalom y datos de personas) ni la query string. Se guarda 30 días.
 *
 * Ve todas las respuestas (es un hook de Fastify): también las que frenan el límite por
 * minuto o una key de otra API antes de llegar al controller.
 */
@Injectable()
export class RequestLogService {
  private readonly logger = new Logger(RequestLogService.name);
  private readonly perKey = new Map<string, { minute: number; perMinute: number; perDay: number }>();
  private total = { day: 0, count: 0 };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
  ) {}

  /** Se engancha antes de que Nest registre las rutas (main.ts, antes de listen). */
  attach(fastify: FastifyInstance): void {
    if (!this.prisma.enabled) return;
    fastify.addHook('onSend', async (req, reply, payload) => {
      // Sin esperarlo, para no demorar la respuesta; pero empieza antes de enviarla: en
      // Cloud Run la CPU solo está asignada mientras dura el request.
      void this.record(req, reply).catch((err) => this.logger.warn(`No se registró ${req.method} ${req.routeOptions?.url ?? ''}: ${String(err)}`));
      return payload;
    });
  }

  async record(req: FastifyRequest, reply: FastifyReply, now = Date.now()): Promise<void> {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/v1/') || path.startsWith('/v1/internal/')) return;
    const props = logProps(req);
    const status = reply.statusCode;

    let key = props.key;
    if (!key) {
      // No pasó por el guard de la key: lo frenó el límite por minuto (429) o la ruta no
      // existe (404). Se busca la key para saber de quién es; cualquier otro caso (sin key,
      // key inválida) no es de ningún cliente.
      if (status !== 429 && status !== 404) return;
      const raw = extractApiKey(req.headers);
      if (!raw || !this.allow(`raw:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`, now)) return;
      key = (await this.store.findByKey(raw)) ?? undefined;
      if (!key) return;
    } else if (!this.allow(key.id, now)) {
      return;
    }

    const route = req.routeOptions?.url;
    await this.prisma.apiRequest.create({
      data: {
        userId: key.userId,
        apiKeyId: key.id,
        keyPrefix: key.prefix,
        product: props.product ?? PRODUCT_RE.exec(path)?.[1] ?? null,
        method: req.method,
        route: route ?? maskPath(path),
        status,
        durationMs: Math.round(reply.elapsedTime),
        units: status < 400 ? (props.units ?? 0) : 0,
        error: status >= 400 && props.error ? props.error.message.slice(0, MAX_ERROR) : null,
        upstream: status >= 400 ? (props.error?.upstream ?? null) : null,
      },
    });
  }

  /** Borra lo de más de 30 días (lo llama el worker). */
  async prune(now = new Date()): Promise<number> {
    if (!this.prisma.enabled) return 0;
    const { count } = await this.prisma.apiRequest.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
    return count;
  }

  /** Cuenta la fila si entra en los topes (por key por minuto y por día, y de toda la instancia por día). */
  private allow(id: string, now: number): boolean {
    const minute = Math.floor(now / 60_000);
    const day = Math.floor(now / 86_400_000);
    if (this.total.day !== day) {
      this.total = { day, count: 0 };
      this.perKey.clear();
    }
    let slot = this.perKey.get(id);
    if (!slot) this.perKey.set(id, (slot = { minute, perMinute: 0, perDay: 0 }));
    if (slot.minute !== minute) Object.assign(slot, { minute, perMinute: 0 });
    if (slot.perMinute >= MAX_PER_KEY.minute || slot.perDay >= MAX_PER_KEY.day || this.total.count >= MAX_PER_DAY) return false;
    slot.perMinute++;
    slot.perDay++;
    this.total.count++;
    return true;
  }
}
