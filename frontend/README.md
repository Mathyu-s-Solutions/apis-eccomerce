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
- Pagos con **Yape/Plin**: el cliente sube la foto, al dueño le llega un aviso y
  valida desde el admin; al aprobar, se activan por un mes los planes comprados
  (si es el mismo plan y sigue vigente, se suma un mes). El admin también puede
  asignar o quitar un plan a mano.

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
| `RESEND_API_KEY` | Opcional: envío real de correos (si falta, solo se registra en logs). |
| `EMAIL_FROM` | Remitente del correo (requiere dominio verificado en Resend). |
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
   los `NEXT_PUBLIC_*` y, si quieres correos, `RESEND_API_KEY`/`EMAIL_FROM`).
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
| Shalom, Olva | `/agencias`, `/agencias/<departamento>`, `/agencias/<departamento>/<provincia>` (si tiene 2+ agencias), `/agencia/<nombre>-<id>` | `public/data/agencies-*.json` ([`src/lib/directory.ts`](src/lib/directory.ts)) | Workflow **Snapshot de agencias**, cada domingo (secreto `SNAPSHOT_API_KEY`, variable `NEXT_PUBLIC_API_URL`). Falla, sin publicar, si la API trae muchas menos agencias que el snapshot actual. |
| SUNAT | `/tipo-de-cambio`, `/tipo-de-cambio/<mes>-<año>` (desde 2015) | API de series del BCRP, la misma del backend ([`src/lib/exchange-rate.ts`](src/lib/exchange-rate.ts)) | Solo: caché de 30 min para lo reciente y de 30 días para los meses cerrados. Un error del BCRP no queda en caché. |
| SUNAT | `/catalogos`, `/catalogos/<número>-<nombre>` | `src/data/sunat-catalogs.json`, generado desde `backend/src/modules/sunat/core/catalogs.ts` | `node scripts/snapshot-sunat-catalogs.mjs` cuando cambian los catálogos del backend (y actualizar `CATALOGS_UPDATED` en `src/app/sitemap.ts`). |
| Todos | `/guias`, `/guias/<slug>` | `content/guias/*.md` ([`src/lib/guides.ts`](src/lib/guides.ts)) | Motor de guías, abajo. |

### Motor de guías

Cada lunes el workflow **Guías SEO** corre [`scripts/seo/write-guide.mjs`](scripts/seo/write-guide.mjs):
toma el siguiente tema de [`content/seo/backlog.json`](content/seo/backlog.json), le pasa a Claude
(`claude-opus-5-5`) los datos reales del producto (endpoints, campos, planes y precios salen de
`brands.ts` y `plans.ts`, nunca de memoria) y abre un PR con la guía y una lista de cosas para
verificar. **Nada se publica solo**: la guía sale al hacer merge, después de revisarla en la
preview de Vercel. Cuando quedan menos de 5 temas, el mismo PR trae ideas nuevas para el backlog.

- Secreto `ANTHROPIC_API_KEY` y variable `NEXT_PUBLIC_API_URL` en el repo; en **Settings → Actions →
  General**, permitir que GitHub Actions cree pull requests.
- Para correrlo a mano: `ANTHROPIC_API_KEY=... node scripts/seo/write-guide.mjs [--slug X] [--dry-run]`.
  Con `--print-prompt` muestra lo que se le manda al modelo, sin llamar a la API.
- Una guía con `draft: true` o con fecha futura solo se ve en desarrollo.
- Si cambian los campos del JSON de SUNAT (`backend/src/modules/sunat/dto`), actualizar
  `SUNAT_FIELDS` en el script: es lo que evita que una guía invente campos.
