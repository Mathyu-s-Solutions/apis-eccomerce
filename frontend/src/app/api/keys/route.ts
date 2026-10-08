import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '@/lib/apikey';
import { getPlan } from '@/lib/plans';
import { currentPeriod } from '@/lib/period';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { counters: { where: { period: currentPeriod() } } },
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      name: k.name,
      product: k.product,
      monthlyLimit: k.monthlyLimit,
      enabled: k.enabled,
      used: k.counters[0]?.used ?? 0,
      createdAt: k.createdAt,
    })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  product: z.enum(['shalom', 'olva', 'sunat', 'all']),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'No autenticado' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Datos inválidos' }, { status: 400 });
  }
  const { name, product } = parsed.data;

  // Límite de la key nueva: plan gratis del producto (se amplía al aprobar un pago).
  const planProduct = product === 'all' ? 'shalom' : product;
  const freeLimit = getPlan(planProduct, 'free')?.monthlyLimit ?? 100;

  const raw = generateApiKey();
  await prisma.apiKey.create({
    data: {
      keyHash: hashApiKey(raw),
      prefix: apiKeyPrefix(raw),
      name,
      product,
      monthlyLimit: freeLimit,
      userId: user.id,
    },
  });

  // La key en claro se devuelve UNA sola vez.
  return NextResponse.json({ key: raw });
}
