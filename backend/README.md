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
| Olva | `POST /v1/olva/track`, `/track/batch` (hasta 50, 1 consulta) | ✅ |
| Olva | `GET /v1/olva/agencies`, `/agencies/search`, `/locations/*`, `/locations/ubigeos` | ✅ |
| Olva | `POST /v1/olva/quote` | ✅ (cotización real) |
| Shalom | `GET /v1/shalom/agencies`, `/agencies/search`, `/locations/*` | ✅ (proxy web + descifrado AES) |
| Shalom | `POST /v1/shalom/track/status` (por ose_id) | ✅ (endpoint abierto) |
| Shalom | `POST /v1/shalom/track`, `/track/batch` (hasta 20, 1 por guía) | ✅ con `SHALOM_CAPTCHA_PROVIDER=playwright` (si no, 501) |
| Shalom | `POST /v1/shalom/quote` (terrestre o aéreo, recargo a domicilio) | ✅ captcha `tarifa_mostrar`, una vez por ruta cada 6 h |
| Webhooks | `/v1/webhooks`, `/v1/{shalom,olva}/tracking/subscriptions` | ✅ worker cada 10 min (Cloud Scheduler) |
| Demo | `GET /v1/public/{shalom,olva}/agencies?q=` (sin key, 30/min por IP) | ✅ |
| SUNAT | `/v1/sunat/*` | 🚧 stub (501), ver doc §3 |
| Auth | `GET /v1/validate` | ✅ valida key y cuota |

Límite por minuto: 1.000 requests por API key (y 3.000 por IP), aparte de la cuota mensual del plan.
Los planes Básico de Shalom y Olva son **ilimitados** (sin cuota mensual): el uso razonable lo
ponen estos límites. En Shalom, lo caro es el captcha, así que `/track`, `/quote` y la suscripción
van a 60 por minuto por key y `/track/batch` a 6.

**Captcha una vez por guía:** la primera consulta de una guía de Shalom resuelve el captcha y
guarda su `ose_id` en `shalom_guides` (con un hash scrypt de guía + clave; la clave nunca se
guarda). Las siguientes van directo a `rastrea/estados`, sin captcha. Además, el estado de una
guía (Shalom y Olva) se guarda 60 s en memoria.
Agencias, ubigeos y ubicaciones se guardan en memoria (6 h y 24 h): los endpoints gratuitos no le pegan a las webs de los couriers en cada request.

### Agencias y ubicaciones

- `GET /agencies?q=&department=&province=&district=` filtra por nombre (sin tildes).
- `GET /agencies/search?near=lat,lng&radiusKm=&air=1&limit=` ordena por distancia
  (`distanceKm`); por defecto solo las que reciben envíos. `air` solo lo informa Shalom.
- `GET /locations/departments` → `/departments/{dep}/provinces` → `/provinces/{prov}/districts`:
  `id` es el ubigeo del INEI (2, 4 y 6 dígitos), igual en Shalom y Olva; `15` o `1501` / `01` valen.

### Cotización de Shalom

`POST /v1/shalom/quote {"origin":"220","destination":"7","air":false,"homeDelivery":false}`:
`origin` y `destination` son el `code` de las agencias. Devuelve `minimumCharge` (mínimo por
carga), `packages` (sobre, XXS a L), `leadTime` y `distanceKm`; con `homeDelivery` suma
`homeDelivery` (recargo a domicilio por tamaño, de `tarifa/reparto`, sin captcha). Se valida que
el origen despache y el destino reciba (y acepte aéreo) antes de gastar un captcha.

### Webhooks y guías vigiladas

1. `PUT /v1/webhooks {"url":"https://…"}`: el webhook es de la cuenta (una key con
   dueño). La primera vez, o con `"rotateSecret": true`, devuelve el secreto `whsec_…`
   completo: no se vuelve a mostrar. Solo https a hosts públicos (se bloquean IPs
   privadas y de metadatos al guardar y al enviar).
2. `POST /v1/{shalom,olva}/tracking/subscriptions {"orderNumber","orderCode"}` (1 consulta):
   valida la guía y la vigila hasta que se entrega o devuelve (máx. 60 días). Shalom
   resuelve el captcha una sola vez: se guarda el `ose_id`, **no la clave**. Plan gratis:
   5 guías a la vez por API.
3. El worker (`POST /v1/internal/cron/tick` con `x-cron-secret`, Cloud Scheduler cada
   10 min) revisa cada guía según su estado (30 min a 2 h) y, si cambió, manda
   `tracking.updated` con el seguimiento normalizado (sin datos personales).
4. Reintentos: 1 min, 5 min, 30 min, 2 h y 12 h; después queda `dead`.
   `GET /v1/webhooks/deliveries` muestra el historial y
   `POST /v1/webhooks/deliveries/{id}/redeliver` lo reenvía. `POST /v1/webhooks/test` prueba la URL.

Verificar la firma en el receptor (Node):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
// rawBody: el cuerpo tal como llegó (sin parsear); header: x-mathyu-signature
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // más de 5 min: reenvío
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

### API keys, planes y cuota

- Cada key es de una API (`shalom`, `olva`, `sunat`) o de todas (`all`). Una key
  de otra API recibe **403**.
- La **cuota es del plan del cliente en cada API**, no de la key: la comparten
  todas sus keys (`subscriptions` = plan y vencimiento, `plan_usage` = consumo del
  mes, contado de forma atómica). Sin plan, o vencido, rige el gratis
  (`FREE_MONTHLY_LIMIT` en `src/auth/plan-quota.ts`, igual que en
  `frontend/src/lib/plans.ts`). `usage_counters` sigue contando por key (informativo).
- Una key **sin dueño** (creada a mano sin `--email`) usa su propio límite.
- `GET /v1/validate` devuelve el plan y el consumo de la API de la key (o de cada
  API en una key de todas).
- Planes a mano: `pnpm plan:list` y `pnpm plan:set -- --email E --product P --plan X --limit N [--months N | --forever]`
  (o desde el admin del portal). Los pagos aprobados en el portal los activan solos.
- Test contra Postgres real: `TEST_DATABASE_URL=… pnpm test` (corre
  `test/prisma-store.int.spec.ts`; sin la variable se salta).

### Contrato común de Shalom y Olva

- **Agencias** (`GET /agencies`): `code`, `name`, `department`, `province`,
  `district`, `address`, `ubigeo` (INEI), `latitude`, `longitude`,
  `schedule` (`{ monday: { open: "08:00", close: "20:00" }, … }` o `null`) y
  `receivesShipments` (en Shalom ~60 agencias solo despachan: no sirven como destino).
- **Rastreo** (`POST /track`): `status` normalizado, `delivered`, `deliveredAt`,
  `transitTime` (Shalom: "24 horas"), `destination` (Olva) y `events` del más
  antiguo al más reciente (`status`, `rawStatus`, `location`, `at` en hora de Lima).
  **404** si el courier no tiene la guía (no gasta cuota). En `/olva/track/batch`,
  esas guías salen como `null`, en el mismo orden.
- **`?raw=1`** agrega la respuesta cruda del courier. Va apagado por defecto: la
  lista de Shalom pasa de ~0,35 MB a ~3 MB y en el rastreo trae nombres y
  documentos del remitente y del destinatario.

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
| Imágenes | Artifact Registry `apis`; conserva las 3 últimas y `latest`, borra las de +7 días (~350 MB por imagen, capas compartidas; límite gratis 0,5 GB) |
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
