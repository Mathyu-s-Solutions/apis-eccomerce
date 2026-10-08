import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createSession } from '@/lib/session';
import { isAdminEmail } from '@/lib/current-user';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Correo o contraseña inválidos' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ message: 'Correo o contraseña incorrectos' }, { status: 401 });
  }

  const role = user.role === 'admin' || isAdminEmail(user.email) ? 'admin' : 'user';
  await createSession({ userId: user.id, email: user.email, role });
  return NextResponse.json({ ok: true });
}
