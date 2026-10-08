# Mathyu's APIs — Couriers & SUNAT

API propia (gateway) para integrar **Shalom**, **Olva** y **SUNAT** desde los
ecommerce de Mathyu's Solutions, y para venderla como servicio a terceros.

Monolito modular en **NestJS 12 + Fastify 5**, gestionado con **pnpm**.

- Investigación de los upstreams: [docs/investigacion-upstreams.md](docs/investigacion-upstreams.md)
- Arquitectura y roadmap: [docs/arquitectura.md](docs/arquitectura.md)

## Requisitos

- Node.js ≥ 20 (probado en 26)
- pnpm 11

## Puesta en marcha

```bash
pnpm install             # también genera el cliente Prisma (postinstall)
cp .env.example .env     # local: store en memoria + DEV_API_KEY
pnpm start:dev           # desarrollo con watch
```

**Dos archivos de entorno, ambos fuera de git:**

| Archivo | Para qué | Base de datos |
|---|---|---|
| `.env` | correr la app en local | ninguna (store en memoria) o una rama `dev` de Neon |
| `.env.prod` | scripts de administración (`key:*`, `db:*`) | Neon producción |

El `.env` local **nunca** apunta a la base de producción: así una key de prueba
no puede terminar siendo válida en la API pública.

## API keys de clientes (producción)

```bash
pnpm key:create -- --name "Tienda X" --limit 5000   # o --limit unlimited
pnpm key:list                                       # uso del mes por key
pnpm key:revoke -- --prefix sk_live_abcd            # corta el acceso al instante
pnpm db:status                                      # estado de migraciones
```

La key completa se muestra **una sola vez** al crearla. En la BD solo se guarda
su SHA-256 y un prefijo visible: si la BD se filtrara, las keys no quedan expuestas.

**Cuota:** cada endpoint declara su costo con `@Cost(n)`. La unidad se reserva
antes de ejecutar (si no hay saldo → 429 sin llamar al upstream) y se devuelve
si la operación falla: solo se cobran respuestas exitosas. El conteo es atómico
en Postgres (verificado: 10 requests simultáneos contra límite 3 → exactamente 3 pasan).

- API: `http://localhost:3000/v1`
- Swagger: `http://localhost:3000/docs`
- Health (sin auth): `http://localhost:3000/health`

Todas las rutas bajo `/v1` requieren la cabecera `x-api-key`.

## Estado de los módulos

| Módulo | Endpoint | Estado |
|---|---|---|
| Olva | `POST /v1/olva/track`, `/track/batch` | ✅ funciona (tracking público) |
| Olva | `GET /v1/olva/agencies`, `/locations/ubigeos` | ✅ |
| Olva | `POST /v1/olva/quote` | ✅ (cotización real) |
| Shalom | `GET /v1/shalom/agencies` | ✅ (proxy web + descifrado AES) |
| Shalom | `POST /v1/shalom/track/status` (por ose_id) | ✅ (endpoint abierto) |
| Shalom | `POST /v1/shalom/track` (guía + clave) | ✅ con `SHALOM_CAPTCHA_PROVIDER=playwright` (si no, 501) |
| SUNAT | `/v1/sunat/*` | 🚧 stub (501), ver doc §3 |
| Auth | `GET /v1/validate` | ✅ valida key y cuota |

> **Captcha de Shalom**: el tracking por guía resuelve reCAPTCHA v3 con un
> Chromium headless (Playwright) que carga una página real de shalom.com.pe —
> el token v3 está atado a ese dominio. Para activarlo:
> ```bash
> pnpm exec playwright install chromium   # una vez
> SHALOM_CAPTCHA_PROVIDER=playwright pnpm start
> ```
> Con `none` (por defecto) esos endpoints devuelven 501. Verificado end-to-end:
> `scripts/probes/captcha-probe.mjs`.

## Prueba rápida

```bash
curl -H "x-api-key: dev-local-key" \
  "http://localhost:3000/v1/olva/agencies?province=AREQUIPA"

curl -H "x-api-key: dev-local-key" -H 'content-type: application/json' \
  -d '{"origin":"150101","destination":"040101","shipmentType":1,"weight":0.5}' \
  http://localhost:3000/v1/olva/quote
```

## Despliegue (GCP Cloud Run, capa gratuita)

Cada push a `main` dispara [deploy.yml](.github/workflows/deploy.yml):
CI → migraciones Prisma en Neon → imagen → Cloud Run → smoke test de `/health`.
Los PRs solo corren [ci.yml](.github/workflows/ci.yml).

| Pieza | Configuración |
|---|---|
| Proyecto | `mathyu-apis`, región `southamerica-east1` (misma ciudad que Neon `sa-east-1`) |
| Cloud Run | servicio `mathyu-apis`, 1 vCPU / 1 GiB, facturación por request, 0–2 instancias |
| Imágenes | Artifact Registry `apis`; conserva solo las 2 últimas (límite gratis 0,5 GB) |
| Secretos | Secret Manager `database-url` y `direct-database-url` (réplica única) |
| Auth CI→GCP | Workload Identity Federation, sin llaves JSON; solo `refs/heads/main` de este repo |
| Costos | Presupuesto de 1 USD con alertas al 50/90/100 % (avisa, no corta) |

URL: https://mathyu-apis-vzuxpxsama-rj.a.run.app (docs en `/docs`).
Desplegar a mano sin push: *Actions → Deploy → Run workflow*.

Latencias medidas en producción: cotización Olva < 1 s; tracking Shalom con
captcha ~9 s si Chromium arranca en frío y ~2,3 s en caliente.

Las migraciones nuevas (`prisma/migrations/`) las aplica el CD antes de cada
despliegue. En producción **no** se define `DEV_API_KEY`.

> Sin Redis/BullMQ para mantenernos en capa gratis: la caché vive en memoria de
> cada instancia y el estado durable en Postgres. Tareas periódicas futuras
> (refresco de tracking, webhooks) irán por Cloud Scheduler → endpoint interno.

## Scripts

- `pnpm start:dev` — desarrollo con recarga
- `pnpm build` / `pnpm start` — compilar y correr
- `pnpm test` — tests (vitest)
- `pnpm typecheck` — chequeo de tipos
- `pnpm db:migrate` / `pnpm db:status` — migraciones Prisma
- `pnpm key:create|list|revoke` — gestión de API keys

## Diseño (resumen)

```
Cliente ──x-api-key──> Gateway (auth, cuota, rate-limit, swagger)
                           │
         ┌─────────────────┼──────────────────┐
     OlvaModule        ShalomModule        SunatModule
   (upstream WP +    (proxy web AES +     (UBL+firma+SOAP,
    tracking +        captcha seam)         por implementar)
    cotización)
```

Cada courier implementa `CourierAdapter` (`src/common/courier/`), lo que permite
extraer un módulo a su propio servicio más adelante sin tocar a los consumidores.

### Pendiente antes de producción

- **Persistencia**: ✅ Postgres (Neon) con Prisma 6, keys hasheadas y cuota atómica.
  Para producción: quitar `DEV_API_KEY` del entorno y rotar la contraseña de Neon
  si la connection string se compartió por canales no seguros.
- **Captcha**: ✅ implementado con Playwright. Pendiente para producción: correrlo
  desde una **IP peruana** (mejor score reCAPTCHA) y vigilar el consumo de RAM.
- **Caché y workers**: Redis + BullMQ para cachear agencias/tarifas y refrescar
  tracking con webhooks.
- **Legal / datos personales**: ver [docs/investigacion-upstreams.md](docs/investigacion-upstreams.md) §4.
