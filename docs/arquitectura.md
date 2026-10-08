# Arquitectura

Monolito modular NestJS. Un solo proceso y un solo deploy para el MVP; fronteras
limpias para poder extraer módulos a servicios propios cuando el volumen lo pida.

## Capas

```
src/
  main.ts                  arranque Fastify, helmet, swagger, filtro global
  app.module.ts            compone todo
  config/                  validación de entorno (zod) + config tipada global
  common/
    http/                  HttpClientService: fetch + timeout + reintentos
    zod/                   ZodValidationPipe
    filters/               AllExceptionsFilter (JSON de error uniforme)
    errors/                UpstreamError (502/504)
    courier/               CourierAdapter + modelo de estados normalizado
  auth/                    API keys (hash SHA-256), cuota (@Cost), guard, /validate
                           stores: memoria (sin BD) | Prisma (con DATABASE_URL)
  prisma/                  PrismaService (conecta solo si hay DATABASE_URL)
  health/                  liveness/readiness (sin auth)
  modules/
    olva/                  controller → service → upstream → mapper
    shalom/                + shalom-web.client (sesión/AES) + captcha seam
    sunat/                 stub documentado
```

## Decisiones

- **Monolito modular, no microservicios**: menos infra y operación para un
  equipo chico. El trabajo es I/O-bound (esperar a los upstreams), que Node
  maneja en un proceso. Lo único que escala distinto —captcha con navegadores y
  los workers de polling— se piensa como proceso aparte desde el diseño.
- **Adaptador por courier detrás de `CourierAdapter`**: frontera estable; migrar
  a servicio propio es mover el módulo, no reescribir consumidores.
- **Auth y cuota transversales**: una sola vez en `auth/`, reutilizadas por todos
  los módulos. `@Cost(n)` marca cuántas unidades consume cada endpoint.
- **Errores**: `UpstreamError` separa fallos del proveedor (502/504) de errores
  nuestros; `AllExceptionsFilter` da una forma JSON única.
- **Validación con Zod**: un `ZodValidationPipe` evita peer-deps inmaduros y
  reúsa los esquemas en tests.

## Cuándo partir un módulo a su propio servicio

Sólo cuando se cumpla algo concreto, no por estética:

1. Ese upstream mueve un volumen que compite por recursos con los demás.
2. Necesita un ciclo de release independiente (p. ej. SUNAT cambia por normativa).
3. Tiene requisitos distintos de seguridad/cumplimiento (el certificado digital
   de SUNAT conviene aislarlo).

## SUNAT: nota de stack

La emisión de comprobantes (UBL 2.1 + firma XMLDSig + SOAP) es más madura en PHP
(**Greenter**). Dos caminos: (a) todo Node asumiendo la firma UBL a mano, o (b)
un microservicio PHP/Greenter sólo para SUNAT. Es la única excepción donde un
servicio aparte se justifica desde el inicio, por madurez de ecosistema.

## Roadmap sugerido

1. **Olva** (hecho): tracking, agencias, cotización. Sin captcha.
2. **Shalom** (hecho): agencias, estados por ose_id y rastreo por guía (con captcha).
3. **Servicio de captcha** (hecho): `PlaywrightCaptchaProvider` con pool de páginas
   sobre shalom.com.pe. Pendiente: IP peruana para mejor score; evaluar extraerlo
   a proceso aparte si la RAM lo pide.
4. **Persistencia y cuota atómica** (hecho): Postgres (Neon) con Prisma 6. Keys
   guardadas como SHA-256; cuota con `UPDATE ... WHERE used + n <= limit RETURNING`
   (atómica entre instancias); reserva antes del handler y reembolso si falla.
   Prisma 6 y no 7: la v7 exige driver adapters + `prisma.config.ts` y aún se está
   asentando; migrar cuando madure. Migraciones como SQL versionado aplicadas con
   `migrate deploy` (sin shadow DB, que en Neon da fricción).
5. **Caché + workers**: Redis + BullMQ (refresco de tracking, webhooks firmados). ← siguiente
6. **SUNAT**: padrón RUC primero, luego emisión en beta.
7. **Registro de envíos**: Olva (carrito OAuth) y Shalom Pro (instancias por cliente).
