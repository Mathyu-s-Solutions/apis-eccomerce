import 'server-only';
import { prisma } from './db';
import { getSession } from './session';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isAdmin: boolean;
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

/** Usuario autenticado (o null). El rol admin sale del DB o de ADMIN_EMAILS. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const isAdmin = user.role === 'admin' || isAdminEmail(user.email);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: isAdmin ? 'admin' : user.role,
    isAdmin,
  };
}
