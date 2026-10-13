import 'server-only';

/**
 * El panel de SUNAT habla con la API (no con la BD): las credenciales de las
 * empresas se cifran allá. Rutas /v1/internal/portal/sunat/* con el secreto
 * compartido PORTAL_API_SECRET y el usuario de la sesión.
 */
const API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export function sunatPanelConfigured(): boolean {
  return !!API_URL && !!process.env.PORTAL_API_SECRET;
}

export async function sunatPanelFetch(userId: string, path: string, init: { method?: string; body?: string; search?: string } = {}): Promise<Response> {
  const secret = process.env.PORTAL_API_SECRET;
  if (!API_URL || !secret) {
    return Response.json({ message: 'El panel de SUNAT no está configurado (PORTAL_API_SECRET).' }, { status: 503 });
  }
  try {
    return await fetch(`${API_URL}/v1/internal/portal/sunat/${path}${init.search ?? ''}`, {
      method: init.method ?? 'GET',
      headers: {
        'x-portal-secret': secret,
        'x-portal-user': userId,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body,
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return Response.json({ message: 'La API no respondió. Inténtalo de nuevo en unos segundos.' }, { status: 502 });
  }
}
