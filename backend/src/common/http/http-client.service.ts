import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_TOKEN, type AppConfig } from '../../config/configuration';
import { UpstreamError } from '../errors/upstream.error';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** Cuerpo: objeto (se serializa JSON), URLSearchParams, FormData o string. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Nombre del upstream para logs y errores. */
  upstream: string;
  timeoutMs?: number;
  retries?: number;
  /** Cómo leer la respuesta. */
  parse?: 'json' | 'text' | 'buffer';
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

/**
 * Wrapper sobre fetch nativo (undici en Node 20+): timeout por AbortController,
 * reintentos con backoff ante errores de red y 5xx, y errores normalizados.
 */
@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  async request<T = unknown>(
    url: string,
    opts: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    const timeoutMs = opts.timeoutMs ?? this.config.http.timeoutMs;
    const maxRetries = opts.retries ?? this.config.http.retries;
    const parse = opts.parse ?? 'json';
    const finalUrl = this.withQuery(url, opts.query);
    const { body, headers } = this.buildBody(opts);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(finalUrl, {
          method: opts.method ?? 'GET',
          headers: { ...headers, ...(opts.headers ?? {}) },
          body,
          signal: ac.signal,
        });

        if (res.status >= 500 && attempt < maxRetries) {
          lastErr = new UpstreamError(
            opts.upstream,
            `HTTP ${res.status} desde ${opts.upstream}`,
            { status: 502 },
          );
          await this.backoff(attempt);
          continue;
        }

        const data = await this.readBody<T>(res, parse);
        return { status: res.status, headers: res.headers, data };
      } catch (err) {
        lastErr = err;
        if (this.isAbort(err)) {
          if (attempt >= maxRetries) throw UpstreamError.timeout(opts.upstream, timeoutMs);
        } else if (attempt >= maxRetries) {
          throw new UpstreamError(
            opts.upstream,
            `Fallo de red hablando con ${opts.upstream}`,
            { cause: err },
          );
        }
        this.logger.warn(
          `Reintento ${attempt + 1}/${maxRetries} a ${opts.upstream}: ${String(err)}`,
        );
        await this.backoff(attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new UpstreamError(opts.upstream, `Agotados los reintentos a ${opts.upstream}`, {
      cause: lastErr,
    });
  }

  private buildBody(opts: HttpRequestOptions): {
    body: string | URLSearchParams | FormData | Uint8Array | undefined;
    headers: Record<string, string>;
  } {
    const { body } = opts;
    if (body === undefined || body === null) return { body: undefined, headers: {} };
    if (
      typeof body === 'string' ||
      body instanceof URLSearchParams ||
      body instanceof FormData ||
      body instanceof Uint8Array
    ) {
      return { body, headers: {} };
    }
    return {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    };
  }

  private async readBody<T>(res: Response, parse: 'json' | 'text' | 'buffer'): Promise<T> {
    if (parse === 'buffer') return Buffer.from(await res.arrayBuffer()) as unknown as T;
    const text = await res.text();
    if (parse === 'text') return text as unknown as T;
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // Algunos upstreams devuelven texto plano con 200; lo pasamos crudo.
      return text as unknown as T;
    }
  }

  private withQuery(
    url: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (!query) return url;
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  private isAbort(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
  }

  private backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * 2 ** attempt, 4000);
    return new Promise((r) => setTimeout(r, ms));
  }
}
