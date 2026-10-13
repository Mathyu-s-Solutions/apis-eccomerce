import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { sunatPanelFetch } from '@/lib/sunat-api';

/** Lo único que el panel puede pedirle a la API de SUNAT. */
const ALLOWED = /^(companies(\/\d{11}(\/(documents|test))?)?|ruc\/\d{11})$/;

async function forward(request: Request, params: Promise<{ path: string[] }>, method: 'GET' | 'POST' | 'DELETE') {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });
  const path = (await params).path.join('/');
  if (!ALLOWED.test(path)) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });

  const body = method === 'POST' ? await request.text() : undefined;
  const res = await sunatPanelFetch(user.id, path, { method, body: body || undefined, search: new URL(request.url).search });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
}

export function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, params, 'GET');
}

export function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, params, 'POST');
}

export function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, params, 'DELETE');
}
