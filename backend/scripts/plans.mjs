// Planes de los clientes del portal (tabla subscriptions), contra la BD (Neon).
//
//   pnpm plan:list
//   pnpm plan:set -- --email cliente@x.com --product shalom --plan basico --limit 5000 --months 1
//   pnpm plan:set -- --email cliente@x.com --product olva --plan basico --limit 5000 --forever
//
// El plan vale para todas las keys del cliente en esa API. --months suma desde
// hoy (o desde el vencimiento actual, si el plan es el mismo y sigue vigente);
// --forever lo deja sin vencimiento. Los límites de cada plan están en
// frontend/src/lib/plans.ts.
import { PrismaClient } from '../generated/prisma/index.js';

const PRODUCTS = ['shalom', 'olva', 'sunat'];
const prisma = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

function addMonths(from, months) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

const cmd = process.argv[2];

try {
  if (cmd === 'set') {
    const email = arg('email')?.toLowerCase();
    const product = arg('product');
    const plan = arg('plan');
    const limitArg = arg('limit');
    if (!email || !product || !plan || !limitArg) throw new Error('Faltan --email, --product, --plan o --limit');
    if (!PRODUCTS.includes(product)) throw new Error(`--product debe ser ${PRODUCTS.join(', ')}`);
    const monthlyLimit = limitArg === 'unlimited' ? null : Number(limitArg);
    if (monthlyLimit !== null && (!Number.isInteger(monthlyLimit) || monthlyLimit <= 0)) {
      throw new Error('--limit debe ser un entero positivo o "unlimited"');
    }
    const forever = flag('forever');
    const months = Number(arg('months') ?? (forever ? 0 : 1));
    if (!forever && (!Number.isInteger(months) || months <= 0)) throw new Error('--months debe ser un entero positivo');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No hay una cuenta del portal con el correo ${email}`);

    const current = await prisma.subscription.findUnique({ where: { userId_product: { userId: user.id, product } } });
    const now = new Date();
    const base = current?.plan === plan && current.expiresAt && current.expiresAt > now ? current.expiresAt : now;
    const expiresAt = forever ? null : addMonths(base, months);

    const row = await prisma.subscription.upsert({
      where: { userId_product: { userId: user.id, product } },
      create: { userId: user.id, product, plan, monthlyLimit, expiresAt },
      update: { plan, monthlyLimit, expiresAt },
    });
    console.log(
      `\n${email} · ${product}: plan ${row.plan}, ${row.monthlyLimit ?? 'ilimitadas'} consultas/mes, ` +
        `${row.expiresAt ? `vence ${row.expiresAt.toISOString().slice(0, 10)}` : 'sin vencimiento'}\n`,
    );
  } else if (cmd === 'list') {
    const rows = await prisma.subscription.findMany({
      orderBy: [{ userId: 'asc' }, { product: 'asc' }],
      include: { user: { select: { email: true } } },
    });
    const now = new Date();
    console.table(
      rows.map((r) => ({
        cliente: r.user.email,
        api: r.product,
        plan: r.plan,
        limite: r.monthlyLimit ?? '∞',
        vence: r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : '—',
        vigente: !r.expiresAt || r.expiresAt > now,
      })),
    );
  } else {
    console.log('Uso: node scripts/plans.mjs <set|list> [--email E --product P --plan X --limit N|unlimited --months N|--forever]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
