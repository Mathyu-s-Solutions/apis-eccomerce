import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { forbidden, getAdmin } from '@/lib/admin';

// Solo desactivar: una key desactivada pudo revocarla el cliente (p. ej. porque se filtró), así
// que el admin no la reactiva; si hace falta, el cliente crea otra.
const schema = z.object({ enabled: z.literal(false) });

// Desactiva una key de un cliente (p. ej. por abuso). La API deja de aceptarla al instante.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return forbidden();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });

  const { id } = await params;
  const { count } = await prisma.apiKey.updateMany({ where: { id }, data: { enabled: parsed.data.enabled } });
  if (count === 0) return NextResponse.json({ message: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
