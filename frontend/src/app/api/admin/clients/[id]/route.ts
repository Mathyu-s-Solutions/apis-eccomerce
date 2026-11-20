import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { forbidden, getAdmin } from '@/lib/admin';
import { normalizePhone } from '@/lib/whatsapp';

const schema = z.object({
  name: z.string().trim().max(80).optional(),
  // Vacío borra el dato.
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(2000).optional(),
});

// Datos del cliente que edita el admin: nombre, WhatsApp y notas internas.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return forbidden();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  const { name, phone: rawPhone, note } = parsed.data;

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ message: 'No existe ese cliente' }, { status: 404 });

  const phone = rawPhone ? normalizePhone(rawPhone) : rawPhone === '' ? null : undefined;
  if (rawPhone && !phone) return NextResponse.json({ message: 'El WhatsApp no parece un número válido (ej. 987 654 321)' }, { status: 400 });

  await prisma.$transaction([
    ...(name !== undefined ? [prisma.user.update({ where: { id }, data: { name: name || null } })] : []),
    ...(phone !== undefined || note !== undefined
      ? [
          prisma.clientProfile.upsert({
            where: { userId: id },
            create: { userId: id, phone: phone ?? null, note: note || null },
            update: { ...(phone !== undefined ? { phone } : {}), ...(note !== undefined ? { note: note || null } : {}) },
          }),
        ]
      : []),
  ]);
  return NextResponse.json({ ok: true, phone: phone ?? null });
}
