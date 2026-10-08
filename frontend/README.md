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
| `NEXT_PUBLIC_PANEL_URL` | Solo con dominios propios: el panel único, p. ej. `https://app.mathyu.dev`. Las landings mandan ahí y `src/proxy.ts` redirige `/login`, `/register`, `/dashboard` y `/admin` de los otros dominios (una sola sesión). Sin ella, todo es relativo. |

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

Cada dominio donde corre el portal (los 3 de marca y el `*.vercel.app`) debe estar
en **Authentication → Settings → Authorized domains**; `localhost` ya viene incluido.

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
