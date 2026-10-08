import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

// Revoca (desactiva) una key del usuario. No la borra para conservar su historial.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== user.id) {
    return NextResponse.json({ message: 'No encontrada' }, { status: 404 });
  }
  await prisma.apiKey.update({ where: { id }, data: { enabled: false } });
  return NextResponse.json({ ok: true });
}
