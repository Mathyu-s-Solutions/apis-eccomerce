// Gestión de API keys de clientes contra la BD (Neon).
//
//   pnpm key:create -- --name "Tienda X" --limit 5000     (o --limit unlimited)
//   pnpm key:list
//   pnpm key:revoke -- --prefix sk_live_abcd
//
// La key completa se muestra UNA sola vez al crearla; en la BD solo queda su
// SHA-256. Mantener hash/prefijo en sync con src/auth/api-key.hash.ts.
import crypto from 'node:crypto';
import { PrismaClient } from '../generated/prisma/index.js';

const hash = (raw) => crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
const prefixOf = (raw) => raw.slice(0, 12);
const generate = () => `sk_live_${crypto.randomBytes(24).toString('hex')}`;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
const prisma = new PrismaClient();

try {
  if (cmd === 'create') {
    const name = arg('name');
    const limitArg = arg('limit') ?? '5000';
    if (!name) throw new Error('Falta --name');
    const monthlyLimit = limitArg === 'unlimited' ? null : Number(limitArg);
    if (monthlyLimit !== null && (!Number.isInteger(monthlyLimit) || monthlyLimit <= 0)) {
      throw new Error('--limit debe ser un entero positivo o "unlimited"');
    }
    const raw = generate();
    const row = await prisma.apiKey.create({
      data: { keyHash: hash(raw), prefix: prefixOf(raw), name, monthlyLimit },
    });
    console.log('\nAPI key creada. Guárdala ahora: no se puede volver a mostrar.\n');
    console.log(`  key:    ${raw}`);
    console.log(`  id:     ${row.id}`);
    console.log(`  nombre: ${row.name}`);
    console.log(`  límite: ${row.monthlyLimit ?? 'ilimitado'} / mes\n`);
  } else if (cmd === 'list') {
    const period = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const rows = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'asc' },
      include: { counters: { where: { period } } },
    });
    console.table(
      rows.map((r) => ({
        prefix: r.prefix,
        nombre: r.name,
        activa: r.enabled,
        limite: r.monthlyLimit ?? '∞',
        [`uso ${period}`]: r.counters[0]?.used ?? 0,
        creada: r.createdAt.toISOString().slice(0, 10),
      })),
    );
  } else if (cmd === 'revoke') {
    const prefix = arg('prefix');
    if (!prefix) throw new Error('Falta --prefix');
    const res = await prisma.apiKey.updateMany({ where: { prefix }, data: { enabled: false } });
    console.log(res.count ? `Revocada(s): ${res.count}` : `No hay keys con prefijo ${prefix}`);
  } else {
    console.log('Uso: node scripts/api-keys.mjs <create|list|revoke> [--name X] [--limit N|unlimited] [--prefix P]');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
