import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSession } from '@/lib/session';
import { isAdminEmail } from '@/lib/current-user';

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: 'Ya existe una cuenta con ese correo' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash: await hashPassword(password),
      role: isAdminEmail(email) ? 'admin' : 'user',
    },
  });

  await createSession({ userId: user.id, email: user.email, role: user.role });
  return NextResponse.json({ ok: true });
}
