import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { forbidden, getAdmin, isUniqueViolation } from '@/lib/admin';
import { isAdminEmail } from '@/lib/current-user';
import { normalizePhone } from '@/lib/whatsapp';

/** Para elegir el cliente al registrar un pago: correo, nombre, WhatsApp y sus planes. */
export async function GET() {
  if (!(await getAdmin())) return forbidden();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      id: true, email: true, name: true,
      profile: { select: { phone: true } },
      subscriptions: { select: { product: true, plan: true, monthlyLimit: true, expiresAt: true } },
    },
  });
  return NextResponse.json({
    clients: users.map((u) => ({ id: u.id, email: u.email, name: u.name, phone: u.profile?.phone ?? null, subs: u.subscriptions })),
  });
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
});

/**
 * Crea un cliente antes de que se registre (p. ej. te pagó por WhatsApp): queda
 * con ese correo y, cuando entre con Google o con ese correo, ve su plan activo.
 */
export async function POST(request: Request) {
  if (!(await getAdmin())) return forbidden();

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Revisa el correo' }, { status: 400 });
  const { email, name, phone: rawPhone } = parsed.data;

  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) return NextResponse.json({ message: 'El WhatsApp no parece un número válido' }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return NextResponse.json({ message: 'Ya hay una cuenta con ese correo', userId: existing.id }, { status: 409 });

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role: isAdminEmail(email) ? 'admin' : 'user',
        ...(phone ? { profile: { create: { phone } } } : {}),
      },
    });
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return NextResponse.json({ message: 'Ya hay una cuenta con ese correo', userId: user?.id }, { status: 409 });
  }
}
