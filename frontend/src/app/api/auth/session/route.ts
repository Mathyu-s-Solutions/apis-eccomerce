import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/session';
import { isAdminEmail } from '@/lib/current-user';
import { verifyFirebaseIdToken } from '@/lib/firebase-token';

// Login y registro: el navegador se autentica con Firebase (Google o
// correo/contraseña) y envía su ID token; aquí se valida, se crea el usuario la
// primera vez (enlazado por correo) y se emite nuestra cookie de sesión.

const schema = z.object({ idToken: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  }

  const identity = await verifyFirebaseIdToken(parsed.data.idToken);
  if (!identity) {
    return NextResponse.json({ message: 'No se pudo validar tu ingreso. Inténtalo de nuevo.' }, { status: 401 });
  }
  // Sin correo verificado cualquiera podría registrar un correo ajeno (p. ej.
  // uno de ADMIN_EMAILS). Google siempre llega verificado.
  if (!identity.emailVerified) {
    return NextResponse.json({ message: 'Confirma tu correo antes de ingresar.' }, { status: 403 });
  }

  const { email, name } = identity;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role: isAdminEmail(email) ? 'admin' : 'user' },
    update: {},
  });
  if (!user.name && name) {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
  }

  const role = user.role === 'admin' || isAdminEmail(user.email) ? 'admin' : 'user';
  await createSession({ userId: user.id, email: user.email, role });
  return NextResponse.json({ ok: true });
}
