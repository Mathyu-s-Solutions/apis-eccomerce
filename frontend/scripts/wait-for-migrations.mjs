// Build de producción en Vercel: espera a que la base tenga todas las migraciones
// del repo antes de compilar. Las aplica el CD del backend (backend-deploy.yml) después
// de su CI, que tarda más que el build de Vercel: sin esta espera, un frontend que usa
// una tabla nueva saldría antes que la tabla. Si no llegan a tiempo (p. ej. falló el CI
// del backend), el build falla y queda en línea la versión anterior.
//
// Solo corre con VERCEL_ENV=production: el CI de GitHub y los previews no esperan.
// MIGRATIONS_WAIT_SECONDS cambia el tope (1200 por defecto).
import { existsSync, readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

if (process.env.VERCEL_ENV !== 'production') {
  console.log('[migraciones] No es un build de producción: no se espera.');
  process.exit(0);
}

const dir = new URL('../../backend/prisma/migrations/', import.meta.url);
if (!existsSync(dir)) {
  // Vercel no copió las carpetas fuera de frontend/ ("Include files outside the Root Directory").
  console.warn('[migraciones] ⚠ No está backend/prisma/migrations: no se puede verificar, se sigue sin esperar.');
  process.exit(0);
}

const expected = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const deadline = Date.now() + Number(process.env.MIGRATIONS_WAIT_SECONDS ?? 1200) * 1000;
const prisma = new PrismaClient();

try {
  for (let attempt = 1; ; attempt++) {
    const rows = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((r) => r.migration_name));
    const missing = expected.filter((m) => !applied.has(m));
    if (missing.length === 0) {
      console.log(`[migraciones] ✓ La base tiene las ${expected.length} migraciones del repo.`);
      break;
    }
    if (Date.now() > deadline) {
      console.error(`[migraciones] ✗ Siguen sin aplicarse: ${missing.join(', ')}. Revisa el workflow "Backend Deploy".`);
      process.exitCode = 1;
      break;
    }
    if (attempt === 1) console.log(`[migraciones] Esperando que el CD del backend aplique: ${missing.join(', ')}`);
    await sleep(20_000);
  }
} finally {
  await prisma.$disconnect();
}
