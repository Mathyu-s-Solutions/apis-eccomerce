import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');
  return <AuthForm mode="login" />;
}
