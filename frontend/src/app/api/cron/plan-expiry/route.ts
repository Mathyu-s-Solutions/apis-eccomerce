import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { notifyPlanExpiry } from '@/lib/plan-expiry';

export const maxDuration = 60;

/**
 * Cron diario de Vercel (vercel.json): avisa por correo a quien se le vence un
 * plan en 3 días y a quien ya se le venció. Vercel manda
 * `Authorization: Bearer $CRON_SECRET`; sin la variable, la ruta no existe.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });

  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const result = await notifyPlanExpiry();
  console.log(`[cron] plan-expiry ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
