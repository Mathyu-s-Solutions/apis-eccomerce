import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Resuelve un token de reCAPTCHA v3 para una `action` del sitio de Shalom.
 * Implementaciones futuras: pool de navegadores Playwright con IP peruana,
 * o un servicio externo de resolución. Ver docs/investigacion-upstreams.md §5.
 */
export abstract class CaptchaProvider {
  /**
   * `site`: dónde se genera el token. El token v3 lleva el dominio donde se
   * resolvió, así que el login de Shalom Pro se resuelve en pro.shalom.pe.
   */
  abstract getToken(action: string, site?: CaptchaSite): Promise<string>;
}

/** web = shalom.com.pe (rastreo, tarifas); pro = pro.shalom.pe (login de Shalom Pro). */
export type CaptchaSite = 'web' | 'pro';

export const CAPTCHA_PROVIDER = Symbol('CAPTCHA_PROVIDER');

/**
 * Proveedor por defecto: no resuelve captcha. Las operaciones que lo requieren
 * (rastrea/buscar, tarifa/mostrar, login de Shalom Pro) devuelven 501 hasta
 * configurar un proveedor real.
 */
@Injectable()
export class NoneCaptchaProvider extends CaptchaProvider {
  getToken(action: string, _site?: CaptchaSite): Promise<string> {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: 'Captcha Not Configured',
        message: `Esta operación requiere resolver reCAPTCHA (action="${action}"). ` +
          'Configura SHALOM_CAPTCHA_PROVIDER con un proveedor real.',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
