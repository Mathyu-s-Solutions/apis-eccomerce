# Mathyu's APIs

Plataforma de APIs de Mathyu's Solutions para **Shalom**, **Olva** y **SUNAT**:
tracking, agencias, cotización y comprobantes electrónicos, para los ecommerce
propios y para vender como servicio a terceros.

Monorepo:

| Carpeta | Qué es | Stack |
|---|---|---|
| [`backend/`](backend/) | API gateway (couriers + SUNAT), auth por API key, cuotas | NestJS 12 + Fastify, Prisma, Postgres (Neon) |
| [`frontend/`](frontend/) | Portal web multi-marca: landings, documentación, login, dashboard de consumo, pagos (Yape/Plin) y panel de admin | Next.js 16 (App Router) |

- Backend: ver [backend/README.md](backend/README.md) — desplegado en GCP Cloud Run.
- Frontend: ver [frontend/README.md](frontend/README.md) — se despliega en Vercel (Root Directory `frontend`).
- Ambas apps usan la **misma base Neon**; el backend es el dueño del esquema (migraciones).
- Investigación de los servicios originales: [docs/investigacion-upstreams.md](docs/investigacion-upstreams.md).
- Arquitectura y decisiones: [docs/arquitectura.md](docs/arquitectura.md).

## Despliegue

Todo en GCP sobre capa gratuita (proyecto `mathyu-apis`, región `southamerica-east1`).
Cada carpeta tiene su propio CI/CD en [`.github/workflows/`](.github/workflows/):
un push a `main` que toque `backend/**` redespliega el backend; el frontend
tendrá su propio pipeline. Los PRs corren typecheck, tests y build.
