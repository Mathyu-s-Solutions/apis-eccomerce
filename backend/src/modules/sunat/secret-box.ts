import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';

const VERSION = 'v1';

/**
 * Cifra en reposo las credenciales de los clientes (clave SOL, certificado,
 * secreto de la API de SUNAT) con AES-256-GCM. La llave sale de
 * SUNAT_SECRETS_KEY y no vive en la base de datos.
 */
@Injectable()
export class SecretBox {
  private readonly key?: Buffer;

  constructor(@Inject(CONFIG_TOKEN) config: AppConfig) {
    const secret = config.sunat.secretsKey;
    this.key = secret ? createHash('sha256').update(secret).digest() : undefined;
  }

  get available(): boolean {
    return !!this.key;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException('El servidor no tiene configurada la llave para guardar credenciales (SUNAT_SECRETS_KEY).');
    }
    return this.key;
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }

  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Secreto con formato desconocido');
    const decipher = createDecipheriv('aes-256-gcm', this.requireKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }
}
