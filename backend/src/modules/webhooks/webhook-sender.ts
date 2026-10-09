import { createHmac, randomBytes } from 'node:crypto';
import { request } from 'node:https';
import { Injectable } from '@nestjs/common';
import { publicLookup } from './url-guard';

/** Secreto nuevo de un webhook. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/**
 * Cabecera `x-mathyu-signature`: `t=<unix>,v1=<hex>`, con
 * v1 = HMAC-SHA256(secreto, `${t}.${cuerpo}`). El cliente la recalcula con el
 * cuerpo crudo y rechaza las de más de 5 minutos (evita reenvíos).
 */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Envía un webhook por HTTPS a un host público. No sigue redirecciones. */
@Injectable()
export class WebhookSender {
  send(url: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'POST',
          lookup: publicLookup as never,
          timeout: timeoutMs,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
        },
        (res) => {
          res.resume(); // no leemos la respuesta: solo importa el código
          res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error(`El webhook no respondió en ${timeoutMs / 1000} s.`)));
      req.on('error', reject);
      req.end(body);
    });
  }
}
