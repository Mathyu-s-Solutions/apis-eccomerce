# Frontend — Portal de Mathyu's APIs

Portal web de **Mathyu's APIs** en **Next.js 16** (App Router). Una sola app sirve,
según el dominio, el **sitio central** (todas las APIs) y la landing de cada API
(Shalom, Olva, SUNAT). La cuenta, el panel, los pagos y el admin son uno solo.

- Landing central + landing, documentación y precios de cada API.
- Registro / login **solo con Google o correo/contraseña** (Firebase Auth); luego
  la sesión es propia, con cookie firmada. Una cuenta sirve para todas las APIs.
- Panel del cliente: una tarjeta por API con su plan, vencimiento y consumo del mes;
  API keys (de una API o de todas) y pagos.
- **Planes por API** (precio individual) y **packs** de promoción (p. ej. Shalom +
  Olva Básico a S/ 45). La cuota es del plan, no de la key: la comparten todas las
  keys del cliente para esa API (`subscriptions` + `plan_usage`, ver backend).
- Pagos con **Yape/Plin**: el cliente sube la foto, al dueño le llega un correo con
  el comprobante adjunto y valida desde el admin; al aprobar, se activan por un mes
  los planes comprados (si es el mismo plan y sigue vigente, se suma un mes). El
  admin también puede asignar o quitar un plan a mano.
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
| `NEXT_PUBLIC_YAPE_NUMBER` / `NEXT_PUBLIC_PLIN_NUMBER` | Números que ve el cliente para pagar. |
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
con problemas, no se publica: se abre un PR con lo pendiente. Cuando quedan menos de 5 temas,
el mismo commit trae ideas nuevas para el backlog, así que el motor no se detiene. Usa los
créditos incluidos en el plan de Copilot del dueño del token (sin costo aparte mientras no se
pase de lo incluido; si se acaban, Copilot deja de responder hasta el mes siguiente, salvo que
se haya configurado un presupuesto de uso adicional).

- Secreto `COPILOT_GITHUB_TOKEN`: un fine-grained PAT de la cuenta con Copilot, con el permiso de
  cuenta **Copilot Requests** (GitHub → Settings → Developer settings → Fine-grained tokens).
  Variable `PUBLIC_API_URL` (ya está) y, opcional, `COPILOT_MODEL` (sin ella, modo `auto`).
  En **Settings → Actions → General**, "Read and write permissions" y permitir que GitHub Actions
  cree pull requests.
- Para pausarlo: **Actions → Guías SEO → Disable workflow**. Para despublicar una guía, bórrala de
  `content/guias/` o ponle `draft: true`.
- Para correrlo a mano con tu sesión de `gh`:
  `GH_TOKEN=$(gh auth token) COPILOT_BIN="npx -y @github/copilot" node scripts/seo/write-guide.mjs [--slug X] [--dry-run]`.
  `--print-prompt` muestra lo que se le manda al modelo y `--check content/guias/X.md` corre los
  chequeos fijos sobre una guía, los dos sin llamar a Copilot.
- Una guía con `draft: true` o con fecha futura solo se ve en desarrollo.
- Si cambian los campos del JSON de SUNAT (`backend/src/modules/sunat/dto`), actualizar
  `SUNAT_FIELDS` en el script: es lo que evita que una guía invente campos.
