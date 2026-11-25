# Frontend — Portal de Mathyu's APIs

Portal web de **Mathyu's APIs** en **Next.js 16** (App Router). Una sola app sirve,
según el dominio, el **sitio central** (todas las APIs) y la landing de cada API
(Shalom, Olva, SUNAT). La cuenta, el panel, los pagos y el admin son uno solo.

- Landing central + landing, documentación y precios de cada API.
- Registro / login **solo con Google o correo/contraseña** (Firebase Auth); luego
  la sesión es propia, con cookie firmada. Una cuenta sirve para todas las APIs.
- Panel del cliente: una tarjeta por API con su plan, vencimiento y consumo del mes;
  API keys (de una API o de todas) y pagos.
- **Planes por API** (precio individual) y **packs** de promoción (Pack Couriers:
  Shalom + Olva Básico a S/ 45; Pack Completo: las tres en Básico a S/ 59). La cuota es del plan, no de la key: la comparten todas las
  keys del cliente para esa API (`subscriptions` + `plan_usage`, ver backend).
- Pagos con **Yape/Plin**: el cliente sube la foto, al dueño le llega un correo con
  el comprobante adjunto y valida desde el admin; al aprobar, se activan por un mes
  los planes comprados (si es el mismo plan y sigue vigente, se suma un mes). El
  admin también puede asignar o quitar un plan a mano.

## Panel de admin (`/admin`)

Entra quien está en `ADMIN_EMAILS` (o tiene `role = admin`). Cada lectura de
[`src/lib/admin.ts`](src/lib/admin.ts) vuelve a verificar que sea admin: el layout no
protege las páginas (se renderizan en paralelo), y las rutas de `/api/admin` hacen lo mismo.

| Página | Qué se hace |
|---|---|
| **Resumen** | Ingresos del mes (y los últimos 6), recurrente estimado, pagos por validar, **fallas de la API de las últimas 24 h** (errores del servidor, de un courier o SUNAT y límites por minuto, agrupados por endpoint y mensaje, con cuántos clientes y el último), planes que vencen en 7 días o vencieron hace poco (con "Recordar" por WhatsApp y "Renovar") y clientes en prueba que ya usaron 70% o más de su cuota (posibles ventas). |
| **Pagos** | Validar comprobantes (vista previa, aprobar en un clic, rechazar con motivo que le llega por correo), filtrar, buscar por cliente o N° de operación y exportar a CSV. |
| **Clientes** | Todos, con su plan y consumo del mes; filtros (de pago, vencen en 7 días, vencidos, en prueba) y "Nuevo cliente" para alguien que aún no se registra. |
| **Ficha de un cliente** | Por API: renovar o activar con un pago, asignar un plan sin pago (cortesía), extender días, ajustar la cuota (la del plan, o la de prueba si no tiene plan), reiniciar el consumo del mes y quitar el plan. Además **el uso de la API de los últimos 30 días** (qué endpoints llama, cuántos le fallan con su último error, cuota cobrada y tiempo medio, y sus últimos 100 requests con filtro por endpoint y por errores), su WhatsApp y notas internas (`client_profiles`), sus pagos, su consumo de 6 meses y sus API keys (el admin puede desactivar una, no reactivarla: pudo revocarla el cliente). |

El uso de la API sale de `api_requests`, que escribe el backend (ver "Registro de requests"
en `backend/README.md`): endpoint, status, tiempo, cuota y el error que recibió el cliente,
nunca los cuerpos.

**Registrar pago** (botón arriba a la derecha, en todo el admin) es para cuando el
cliente paga por fuera, p. ej. Yape por WhatsApp: se elige el cliente (o se escribe un
correo nuevo y se crea la cuenta; al entrar con ese correo la encuentra con su plan), el
plan o pack, los meses (1, 3, 6 o 12), el monto, el N° de operación y, opcional, la captura
(se puede pegar con Ctrl+V). Queda aprobado, activa o renueva el plan con la misma regla
que un comprobante (`renewedExpiry` en `src/lib/renewal.ts`) y, si se marca, le llega el
correo de pago confirmado.

**Cambio a un plan mayor** (`src/lib/upgrade.ts`): si el cliente ya tiene un plan pagado
vigente en esas APIs (todas vencen el mismo día) y elige un plan o pack que cuesta más que
lo que paga hoy por ellas, paga solo la diferencia por los días que le quedan (en soles
enteros, hacia arriba) y sus planes siguen venciendo ese día: no se renuevan. Un pack que
tiene se reparte entre sus APIs según el precio de lista. Ej.: Pack Couriers (S/ 45) →
Pack Plataforma (S/ 65) el primer día del periodo = S/ 20. En "Pagos y planes" el cliente
ve ese monto y el servidor lo vuelve a calcular al subir el comprobante; el pago guarda el
vencimiento en `items[].expiresAt` y `grantPlans` lo usa al aprobarlo. En "Registrar
pago" va marcado "Cambio de plan" (se puede desmarcar para la regla de siempre); con más
de un mes, los meses extra van a precio de lista. Renovar lo mismo, bajar de plan, planes
sin vencimiento o con vencimientos distintos siguen la regla de siempre.

- **Cuota de prueba a medida:** sin plan de pago, subirle la cuota crea una fila
  `subscriptions` con `plan = 'free'` y esa cuota, sin vencimiento. El backend la respeta
  (`quotaScope`) y la sigue tratando como prueba (RUC/DNI cobran, límites de seguimiento
  del plan gratis); el cron de vencimientos no la avisa. Volver a la estándar borra la fila.
- **Cuota del plan a medida:** se conserva al renovar el mismo plan (con un pago registrado
  o con un comprobante aprobado); al cambiar de plan, rige la del catálogo.

## Correos (Resend)

Salen de `avisos@mathyusolutions.com`; el dominio está verificado en Resend
(región `sa-east-1`) con sus registros DKIM/SPF/DMARC en Vercel DNS. Las
plantillas están en [`src/lib/email-templates.ts`](src/lib/email-templates.ts).

| Correo | A quién | Cuándo |
|---|---|---|
| Pago por validar (con el comprobante adjunto) | Dueño (`OWNER_EMAIL`) | El cliente sube un pago con Yape/Plin. |
| Pago confirmado / no validado | Cliente | El admin aprueba o rechaza (la nota va como motivo), o registra un pago hecho por fuera. |
| Tu plan vence pronto | Cliente | 3 días antes, si no tiene un pago por validar. |
| Tu plan venció | Cliente | El día siguiente; si ya pagó, le dice que lo estamos validando. |

Los dos últimos los manda el cron diario de Vercel (`vercel.json`, 8:00 de Lima)
en `/api/cron/plan-expiry`: un correo por cliente (un pack va junto). Cada aviso
queda en `sent_emails` para no repetirlo, y si Resend falla se reintenta al día
siguiente. Los avisos de cuota, webhook caído y certificado de SUNAT salen del
worker del backend (ver su README).

Con el [CLI de Resend](https://github.com/resend/resend-cli) (`npm i -g resend-cli`):

```bash
resend login                        # una key con acceso completo para administrar
resend domains list                 # estado del dominio
resend emails list                  # últimos envíos y si llegaron (delivered, bounced…)
```

Usa la **misma base Neon** que el backend (Prisma). No corre migraciones: el
dueño del esquema es `backend/` (ver su README). Si cambias modelos, migra en el
backend y copia el schema aquí.

Las aplica el CD del backend (`backend-deploy.yml`) al hacer push a `main`, después de su
CI. Como Vercel compila el frontend en paralelo y más rápido, el **build de producción
espera** a que la base tenga todas las migraciones de `backend/prisma/migrations`
([`scripts/wait-for-migrations.mjs`](scripts/wait-for-migrations.mjs), hasta 20 min): así un
frontend que usa una tabla nueva nunca sale antes que la tabla, y basta un solo push con
las dos cosas. Si no llegan (p. ej. falló el CI del backend), el build falla y sigue en
línea la versión anterior. El CI de GitHub y los previews no esperan. Lo que la espera no
cubre: una migración que **borra o renombra** algo que el frontend en línea todavía usa;
eso va en dos pasos (primero el código que deja de usarlo, después la migración).

## Desarrollo

```bash
pnpm install
cp .env.example .env     # completa DATABASE_URL, SESSION_SECRET, etc.
pnpm dev                 # http://localhost:3000
```

En local no hay dominios: usa el selector **“Demo”** del header para ver el sitio
central o cada marca (sin cookie se ve el central; `/sitio/<id>` hace lo mismo).
Para entrar al panel de admin, registra tu cuenta con un correo que esté en `ADMIN_EMAILS`
(con Google, o con correo/contraseña después de confirmar el correo).

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Neon (pooled), la misma del backend. |
| `SESSION_SECRET` | Firma la cookie de sesión. Genera con `openssl rand -base64 32`. |
| `NEXT_PUBLIC_FIREBASE_*` | Config web de Firebase (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`). Ver [Login con Firebase](#login-con-firebase). |
| `ADMIN_EMAILS` | Correos (coma) que entran al panel de admin. |
| `OWNER_EMAIL` | A quién llega el aviso de un pago nuevo. |
| `RESEND_API_KEY` | Envío de correos con Resend (basta una key *sending access*). Sin ella, los correos solo se registran en logs. |
| `EMAIL_FROM` | Remitente: `Mathyu's APIs <avisos@mathyusolutions.com>` (dominio verificado en Resend). |
| `CRON_SECRET` | Protege el cron diario de planes vencidos: Vercel lo manda como `Authorization: Bearer`. Sin ella, la ruta no existe. |
| `NEXT_PUBLIC_YAPE_NUMBER` | Número que ve el cliente para pagar con Yape o Plin (las dos apps pagan al mismo número; el QR de `public/pay/yape-qr.png` también sirve en las dos). |
| `NEXT_PUBLIC_PAY_NAME` | Nombre del titular que ve el cliente. |
| `NEXT_PUBLIC_API_URL` | URL pública del backend (para los ejemplos de la doc). |
| `NEXT_PUBLIC_PANEL_URL` | Solo con dominios propios: el panel único, `https://apis.mathyusolutions.com`. Las landings mandan ahí y `src/proxy.ts` redirige `/login`, `/register`, `/dashboard` y `/admin` de los otros dominios (una sola sesión). Sin ella, todo es relativo. |

## Login con Firebase

El navegador se autentica con Firebase (popup de Google, o correo/contraseña) y
manda el ID token a `POST /api/auth/session`, que valida la firma con las claves
públicas de Google (sin Admin SDK ni credenciales), exige correo verificado, crea
el usuario la primera vez (enlazado por correo) y emite la cookie de sesión.
Firebase no guarda sesión en el navegador (persistencia en memoria).

Los proveedores están declarados en [`firebase.json`](firebase.json) (proyecto Firebase
`apis-eccomerce`, ver `.firebaserc`) y se aplican con el CLI:

```bash
npx firebase-tools login                         # una vez, con la cuenta dueña del proyecto
npx firebase-tools deploy --only auth            # habilita Google + correo/contraseña
npx firebase-tools apps:sdkconfig WEB            # valores para NEXT_PUBLIC_FIREBASE_*
```

Cada dominio donde se inicia sesión debe estar en **Authentication → Settings →
Authorized domains**: el del panel (`apis.mathyusolutions.com`) y el `*.vercel.app`;
`localhost` ya viene incluido. Las landings de cada API mandan el login al panel.

## Despliegue en Vercel

1. En Vercel: **New Project → importa el repo**, con **Root Directory = `frontend`**.
   Vercel detecta Next.js y usa pnpm (campo `packageManager`).
2. Carga las variables de arriba en **Settings → Environment Variables**
   (al menos `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, `OWNER_EMAIL`,
   los `NEXT_PUBLIC_*` y, para los correos, `RESEND_API_KEY`, `EMAIL_FROM` y `CRON_SECRET`).
3. Deploy. Luego, en **Settings → Domains**, agrega el dominio central y los 3 de
   marca (los `hosts` de `HUB` y de cada marca en `src/lib/brands.ts`) y define
   `NEXT_PUBLIC_PANEL_URL` con el del panel.

El navegador solo habla con este portal (mismo origen); el portal habla con Neon.
No hace falta CORS en el backend: las API keys se muestran al cliente para que
las use él contra el backend.

## Marcas

Se configuran en [`src/lib/brands.ts`](src/lib/brands.ts) (nombre, colores, textos,
endpoints de la doc, dominios; `HUB` es el sitio central) y los planes y packs en
[`src/lib/plans.ts`](src/lib/plans.ts). Los límites del plan gratis están también en
`backend/src/auth/plan-quota.ts`: mantenerlos iguales.

## Página de estado (`/status`)

Cada sitio tiene `/status` (link "Estado del servicio" en el footer): la central muestra
todas las APIs y el sitio de cada API, la plataforma y lo suyo. Los datos son los
chequeos que el worker del backend guarda cada 20 minutos en `status_checks` (ver
"Página de estado" en `backend/README.md`); [`src/lib/status.ts`](src/lib/status.ts) los
lee **directo de Neon**, así la página responde aunque la API esté caída, y además le
pregunta a la API por `/health` en el momento (`NEXT_PUBLIC_API_URL`).

- Estado actual: el último chequeo de cada componente; sin chequeos en 30 min, "Sin datos".
  El de la API sale del `/health` en vivo.
- Barras de 90 días (30 en el móvil): verde sin fallas, ámbar con fallas breves o demoras,
  rojo con caídas que suman 30 min o más, gris sin datos. Al pasar el mouse (o tocar) se
  ve el detalle del día.
- Incidentes: chequeos sin respuesta seguidos de los últimos 14 días, y los huecos en los
  chequeos de la API (la API o el worker no respondieron).
- Todo pasa por `unstable_cache` de 60 s (no se le pega a Neon ni a la API en cada visita);
  si lo guardado tiene más de 3 min se lee de nuevo.

## SEO: páginas que se generan solas

Además de la landing, la doc y los precios, cada sitio publica páginas armadas con datos
reales que se mantienen al día sin tocarlas. Viven en `src/app/(content)`, un grupo **sin
`loading.tsx`** para que una URL que no existe dé un 404 real y una vieja, un 308 (con
`loading.tsx` la respuesta sale antes y serían un 200 con `noindex` o un `meta refresh`).
Todas entran en el sitemap de su dominio y llevan breadcrumbs con JSON-LD.

| Sitio | Páginas | Datos | Cómo se actualiza |
|---|---|---|---|
| Shalom, Olva | `/agencias`, `/agencias/<departamento>`, `/agencias/<departamento>/<provincia>` (si tiene 2+ agencias), `/agencia/<nombre>-<id>` | `public/data/agencies-*.json` ([`src/lib/directory.ts`](src/lib/directory.ts)) | Workflow **Snapshot de agencias**, cada domingo (secreto `SNAPSHOT_API_KEY`, variable `PUBLIC_API_URL`). Falla, sin publicar, si la API trae muchas menos agencias que el snapshot actual. |
| SUNAT | `/tipo-de-cambio`, `/tipo-de-cambio/<mes>-<año>` (desde 2015) | API de series del BCRP, la misma del backend ([`src/lib/exchange-rate.ts`](src/lib/exchange-rate.ts)) | Solo: caché de 30 min para lo reciente y de 30 días para los meses cerrados. Un error del BCRP no queda en caché. |
| SUNAT | `/catalogos`, `/catalogos/<número>-<nombre>` | `src/data/sunat-catalogs.json`, generado desde `backend/src/modules/sunat/core/catalogs.ts` | `node scripts/snapshot-sunat-catalogs.mjs` cuando cambian los catálogos del backend (y actualizar `CATALOGS_UPDATED` en `src/app/sitemap.ts`). |
| Todos | `/guias`, `/guias/<slug>` | `content/guias/*.md` ([`src/lib/guides.ts`](src/lib/guides.ts)) | Motor de guías, abajo. |

### Motor de guías

Lunes, miércoles y viernes el workflow **Guías SEO** corre [`scripts/seo/write-guide.mjs`](scripts/seo/write-guide.mjs):
toma el siguiente tema de [`content/seo/backlog.json`](content/seo/backlog.json), le pasa a
**GitHub Copilot** (el [Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
en modo no interactivo, sin herramientas) los datos reales del producto (endpoints, campos, planes
y precios salen de `brands.ts` y `plans.ts`, nunca de memoria) y **publica la guía solo, sin
aprobación**, si pasa la revisión automática:

1. **Chequeos fijos**: links solo a páginas que existen y a sitios oficiales, rutas de la API que
   existen en la doc, sin H1, con "Preguntas frecuentes", largo, título y descripción.
2. **Revisión con Copilot como editor**: compara cada afirmación con los datos del producto y busca
   cifras o normas inventadas, código que no funcionaría y que no insinúe afiliación con Shalom,
   Olva o la SUNAT.
3. Si hay problemas, el autor corrige y se vuelve a revisar (hasta 2 veces).

Si pasa, el commit va directo a `main` y Vercel lo despliega. Si después de las correcciones sigue
con problemas, no se publica: queda en una rama `seo/guia-<slug>` y se abre un issue con lo
pendiente y el link para crear el PR (la organización no deja que Actions abra PRs). Cuando quedan menos de 5 temas,
el mismo commit trae ideas nuevas para el backlog, así que el motor no se detiene. Usa los
créditos incluidos en el plan de Copilot del dueño del token (sin costo aparte mientras no se
pase de lo incluido; si se acaban, Copilot deja de responder hasta el mes siguiente, salvo que
se haya configurado un presupuesto de uso adicional).

- Secreto `COPILOT_GITHUB_TOKEN`: un fine-grained PAT de la cuenta con Copilot, con el permiso de
  cuenta **Copilot Requests** (GitHub → Settings → Developer settings → Fine-grained tokens).
  Variable `PUBLIC_API_URL` (ya está) y, opcional, `COPILOT_MODEL` (sin ella, modo `auto`).
  Los permisos (escribir en `main` y abrir issues) los pide el propio workflow.
- Para pausarlo: **Actions → Guías SEO → Disable workflow**. Para despublicar una guía, bórrala de
  `content/guias/` o ponle `draft: true`.
- Para correrlo a mano con tu sesión de `gh`:
  `GH_TOKEN=$(gh auth token) COPILOT_BIN="npx -y @github/copilot" node scripts/seo/write-guide.mjs [--slug X] [--dry-run]`.
  `--print-prompt` muestra lo que se le manda al modelo y `--check content/guias/X.md` corre los
  chequeos fijos sobre una guía, los dos sin llamar a Copilot.
- Una guía con `draft: true` o con fecha futura solo se ve en desarrollo.
- Si cambian los campos del JSON de SUNAT (`backend/src/modules/sunat/dto`), actualizar
  `SUNAT_FIELDS` en el script: es lo que evita que una guía invente campos.
