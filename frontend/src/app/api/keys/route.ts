import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '@/lib/apikey';
import { freePlan } from '@/lib/plans';
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

  // La cuota es la del plan del cliente en cada API (la comparten todas sus keys).
  // El límite propio de la key solo rige si algún día queda sin dueño: el gratis.
  const freeLimit = freePlan(product === 'all' ? 'shalom' : product).monthlyLimit;

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
