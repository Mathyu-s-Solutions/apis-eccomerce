# Investigación: cómo funcionan shalom-api.lat, olva-api.lat y apisunat.pe

Fecha: 2026-10-08. Todo lo marcado ✅ se probó en vivo desde Perú ese día.

## Resumen

| Servicio | Qué es en realidad | Fuente upstream |
|---|---|---|
| shalom-api.lat | Wrapper de las APIs internas de las webs de Shalom (rastreo, agencias, tarifas) + automatización del portal Shalom Pro con la cuenta del cliente ("instancias") | `shalom.com.pe/api/v1/web/*` (proxy cifrado) y `pro.shalom.pe` (Laravel) |
| olva-api.lat | Wrapper de las APIs internas de las webs de Olva (tracking, WordPress, registro de envíos) | `reports.olvaexpress.pe`, `olva-api.olvacourier.com`, `olvacourier.com/wp-admin/admin-ajax.php`, `service-registro-envios-prod.olvacourier.com` |
| apisunat.pe | Capa REST sobre los **servicios oficiales** de SUNAT (no es scraping) | SOAP `billService`, REST GRE, API de validez de CPE, SIRE y padrón RUC |

Shalom API y Olva API son del mismo autor (GitHub `ronnaldrangel`: `n8n-nodes-shalom`, `n8n-nodes-olva`, `shalom-api-skill`). Ambas tienen el mismo diseño: `x-api-key`, `/validate`, `/track`, `/track/batch`, `/agencies`, `/public/agencies`, `/locations/*`, webhooks y `tracking/subscriptions`, todo sobre Fastify + Swagger. El spec de Olva es público en `https://api.olva-api.lat/docs/json`.

El método: leer los bundles JS de las webs públicas, sacar endpoints, headers y keys embebidas, y replicar las llamadas desde el servidor. Encima añaden autenticación por API key, cuotas, caché en Redis, workers que consultan el tracking y disparan webhooks, y normalización de estados.

---

## 1. Shalom

### 1.1 Web pública: shalom.com.pe (SPA en Vue)

Los dominios antiguos (`rastrea.shalom.pe`, `pagalo.shalom.pe`) redirigen a `shalom.com.pe/...`. El front llama a un **proxy en el mismo dominio**, `/api/v1/web/<ruta>`, que reenvía a `newwebservices.shalomcontrol.com`.

> El host viejo `servicesweb.shalomcontrol.com` (el que usa el paquete npm `mcp-shalom`) ya no responde (timeout). Shalom migró y endureció la web en 2026, así que hay que esperar cambios.

**Protocolo (reproducido ✅):**

1. El cliente genera 32 bytes aleatorios, en base64. Esa es la `X-Session-Key`.
2. `GET /api/local/session` con headers `X-Session-Key` y `X-Requested-With: XMLHttpRequest`. Devuelve `{ csrf: "<exp>@<hmac>", expiresAt }`.
3. `POST /api/v1/web/<ruta>` con body JSON y headers `X-Proxy-Token: <csrf>` y `X-Session-Key: <key>`.
4. La respuesta puede venir como `{ encrypted: true, data: base64(IV[16] || ciphertext) }`, cifrada con AES-256-CBC y PKCS7 usando **la misma session key**. Como la key la elige el cliente, descifrar es trivial.
5. Algunas rutas exigen `recaptcha_token` en el body: reCAPTCHA v3, site key `6LeGp5EtAAAAADF5427odqjDKEoxPudnerojGTt2`, con la `action` indicada abajo.

Scripts de prueba: [scripts/probes/shalom-probe.mjs](../scripts/probes/shalom-probe.mjs) (sesión, descifrado y agencias) y [scripts/probes/shalom-track-probe.mjs](../scripts/probes/shalom-track-probe.mjs) (qué pide cada ruta de rastreo). Se ejecutan con `node`, sin dependencias.

| Ruta (`/api/v1/web/…`) | Body | reCAPTCHA (action) | Estado |
|---|---|---|---|
| `agencias/version` | `{}` | no | ✅ devuelve un número de versión (sirve para invalidar caché) |
| `agencias/listar` | `{}` | no | ✅ 558 agencias (`ter_id`, `ter_abrebiatura`, `zona`, `latitud`, `estadoAgencia`, horarios…) |
| `agencias/provincias` | `{ depid }` | no | sin probar |
| `agencias/distritos` | `{ depid, provid }` | no | sin probar |
| `tarifa/mostrar` | `{ origin, destiny, recaptcha_token }` (`destiny` con prefijo `"0"` = aéreo) | `tarifa_mostrar` | ✅ 403 "Token de seguridad requerido." sin token |
| `tarifa/reparto` | `{ dep_id, prov_id, dist_id }` | ? | sin probar |
| `rastrea/buscar` | `{ numero, codigo, ose_id, recaptcha_token }` + header `X-Auth-Token` | `rastrea_buscar` | ✅ **se valida en el servidor** ("Verificación de seguridad fallida" con un token falso) |
| `rastrea/estados` | `{ ose_id }` | **no** | ✅ 200 sin login ni captcha |
| `rastrea/comprobante` | `{ serie, numero, cop_id, recaptcha_token }` | `rastrea_comprobante` | sin probar |
| `rastrea/grt` | `{ ose_id, cap_id }` | ? | sin probar |
| `pro/login` | `{ email, password }` | ? | sin probar |

**Implicación para el tracking:** cada guía nueva cuesta **un** reCAPTCHA (`rastrea/buscar`, de guía + clave a `ose_id`). Después, consultar `rastrea/estados` por `ose_id` es libre. Por eso shalom-api cachea y refresca cada 30 min / 2 h / 6 h según el estado.

> ⚠️ Los `ose_id` son secuenciales y `rastrea/estados` no pide autenticación. **No enumerar.** Usar solo ids de guías que nuestros clientes nos den.

### 1.2 Shalom Pro: pro.shalom.pe (Laravel + jQuery)

Para registrar envíos, generar rótulos y tickets se necesita la **cuenta Shalom Pro del cliente**. Esto es lo que shalom-api llama "instancias": guardan las credenciales de cada cliente y mantienen una sesión logueada, con navegador headless para pasar el reCAPTCHA v3 del login.

- Login: `POST https://pro.shalom.pe/login` (form) con `_token` (CSRF de Laravel, sale del HTML), `recaptcha_token`, `email`, `password` y `remember`. Devuelve una cookie de sesión.
- Rutas vistas en `pro.shalom.pe/js/app.js` (sin probar, necesitan cuenta): `/envia_ya/terminals`, `/envia_ya/tariff/calculate`, `/envia_ya/service_order/save`, `/envia_ya/service_order/count`, `/envios/prelist`, `/rotulo/token`, `/service_order/pdf/`, `/person/search`, `/orden/buscar`, `/orden/validar`, `/ubigeo/{departamentos,provincias,distritos}`.
- Según la doc de shalom-api, también existen `POST /ticket-pdf/token` + `GET /ticket-pdf/<ose_id>` (voucher) y `POST /rotulo/token` (etiqueta).

---

## 2. Olva

### 2.1 Tracking: tracking.olvaexpress.pe (Angular)

El bundle trae **API keys públicas embebidas**. El front genera un token de reCAPTCHA pero **no lo envía** a la API.

| Endpoint | Estado |
|---|---|
| `GET https://reports.olvaexpress.pe/webservice/rest/getTrackingInformation?tracking={n}&emision={yy}&apikey=a82e5d192fae9bbfee43a964024498e87dfecb884b67c7e95865a3bb07b607dd&details=1` | ✅ (404 JSON si no existe) |
| `GET https://olva-api.olvacourier.com/api/v1/tracking/searchInfo?emision={yy}&tracking={n}&u=b2x2YV91c2VyX2ltYWdlcw%3D%3D&p=VUY5V1R1aGRYMWlsMmlhOEN1UWNnVVFtYko1bHMwY1R3UG1UV1o0SlZiQWRvTVRZdFA%3D` | ✅ |
| `GET https://reports.olvaexpress.pe/webservice/rest/images?type=1&id={id_envio}&apikey=…` (fotos de entrega) | sin probar |
| `GET https://api.olvaexpress.pe/olva/tracking/search/orden-servicio?emision_orden=&numero_orden=` con header `x-api-key: $2y$10$IJhDK7T.FisOz8dLFgg0MuUv49LvqUL6IdYNom3F5ilmwpyW.kini` | sin probar |
| `GET https://api.olvaexpress.pe/olva/tracking/search/doc-cliente?cod_cliente=&numero_interno=` (mismo header) | sin probar |

### 2.2 Agencias, ubigeos y cotización: WordPress de olvacourier.com

Son endpoints `admin-ajax.php`, sin autenticación ni captcha.

| Llamada | Estado |
|---|---|
| `GET https://www.olvacourier.com/wp-admin/admin-ajax.php?action=get_olva_stores` | ✅ los mismos datos que `olva-api.lat/public/agencies` (el primer registro, 579, coincide) |
| `GET …/admin-ajax.php?action=olva_get_ubigeos` | ✅ |
| `POST …/admin-ajax.php` (multipart) con `action=olva_calculate_shipping`, `partner_rate`, `ubigeo_code_origin`, `ubigeo_code_destiny`, `delivery_type` (D/O), `shipment_type` (1 = sobre, 2 = paquete), `weight`, `length`, `width`, `height` | ✅ Lima→Arequipa, sobre de 0.5 kg = S/ 12.70 |

### 2.3 Registro de envíos: registrodeenvios.olvacourier.com (Angular)

Backend: `https://service-registro-envios-prod.olvacourier.com`. Es el flujo de invitado de la web, así que **no necesita cuenta del cliente**. El pago se hace online o en tienda, y por eso olva-api.lat devuelve un `payment-link`.

- `POST /v1/token` con `{ grant_type: "client_credentials", client_id: "app_web_id", client_secret: "123456" }` devuelve un JWT de 15 min. ✅ Funciona sin captcha.
- Catálogos ✅ sin captcha: `GET /v1/shipping-records/headquarters`, `/standard-sizes`, `/article-categories`. Además `/destinations?mode=&ubigeo_code=`.
- `GET /v1/person/{dni|ruc}/{numero}?role=sender` ✅ sin captcha. **Devuelve nombre, teléfono y email** (ver riesgos).
- Flujo del carrito (sin probar, porque crea registros reales):
  1. `POST /v1/cart`
  2. `PUT /v1/cart/{uuid}/origin`
  3. `PUT /v1/cart/{uuid}/who-pays`
  4. `POST /v1/cart/{uuid}/item`
  5. `GET /v1/price/{uuid}`
  6. `PUT /v1/shipping-records/cart/{uuid}/pin`
  7. Pago: `POST /v1/cart/{uuid}/payment/{niubiz/session|pagoefectivo|tienda}`
  8. `GET /v1/shipping-records/cart/{uuid}/label` (rótulo)

  Para carga masiva: `POST /v1/cart/{uuid}/items/massive` (xlsm/csv).
- El front adjunta `X-Recaptcha-Token` (reCAPTCHA **Enterprise**, site key `6Lfa4NosAAAAADgRBeI_fElqt1l4bmxfDCLX2Typ`) en cada acción: `auth_login`, `person_lookup`, `cart_store`, `cart_item_store`, `payment_*`… En las pruebas el servidor **no lo exigió** para el token, los catálogos ni la persona. **Falta verificar si lo exige en las escrituras** (carrito y pago).

Esto coincide con la descripción de `POST /shipments` en olva-api.lat: "remitente → origen → pago → item → tarifa → confirmación → rótulo".

---

## 3. SUNAT (apisunat.pe)

Aquí no hace falta ingeniería inversa: SUNAT publica los servicios oficiales. Lo que vende apisunat es la capa intermedia: generar el XML UBL 2.1, firmarlo, enviarlo, guardar el CDR y generar el PDF.

| Funcionalidad | Canal oficial | Autenticación | Estado |
|---|---|---|---|
| Factura, boleta, NC, ND | SOAP `sendBill` (síncrono). Beta: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`. Prod: `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService` | RUC + usuario SOL secundario. XML firmado (XMLDSig) con el **certificado digital del emisor** | ✅ WSDL responde |
| Resumen diario, comunicación de baja | SOAP `sendSummary` + `getStatus` (asíncrono, por ticket) | igual | ✅ |
| Guías de remisión (GRE) | REST `https://api-cpe.sunat.gob.pe/v1/contribuyente/gem/comprobantes/...` | OAuth2 en `api-seguridad.sunat.gob.pe` (client_id/secret generados en SOL + usuario SOL) | ✅ 401 sin token |
| Validez de CPE | `https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/{ruc}/validarcomprobante` | OAuth2 client_credentials (credenciales API de SOL) | ✅ 401 sin token |
| Reporte de compras/ventas (RCE/RVIE) | SIRE: `https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/...` | OAuth2 password grant con SOL | ✅ 401 sin token |
| Consulta RUC | Padrón reducido: `https://www2.sunat.gob.pe/padron_reducido_ruc.zip` (~393 MB, diario). Se importa a una BD propia | ninguna | ✅ actualizado el 2026-10-07 |
| Consulta DNI | **No hay fuente oficial gratuita.** RENIEC solo vía PIDE o convenio pagado | — | — |
| Tipo de cambio SBS | Scraping de sbs.gob.pe | — | sin probar |

- Librería de referencia: **Greenter** (PHP, activa, ~370★) cubre UBL, firma y SOAP. En Node se puede armar con `xml-crypto` + `node-forge` + un cliente SOAP.
- Si vamos a emitir **en nombre de terceros**, verificar con un contador si hay que inscribirse como PSE ante SUNAT. Ser OSE es otra figura, con homologación.

---

## 4. Riesgos

1. **Términos de uso y ley:** Shalom y Olva no autorizan este uso de sus APIs internas. Resolver o evadir reCAPTCHA es saltarse una medida de seguridad. La Ley 30096 (delitos informáticos, art. 2) sanciona el acceso "vulnerando medidas de seguridad". Conviene consultarlo con un abogado y, en paralelo, **pedir integración oficial** (Olva tiene servicio corporativo; Shalom tiene Shalom Empresarial/Pro).
2. **Datos personales (Ley 29733):** el endpoint de persona de Olva devuelve teléfono y email de terceros. La "consulta DNI" de shalom-api sale de ahí ("vía Olva"). **No recomendamos revenderlo como producto.**
3. **Fragilidad:** Shalom ya rompió a los clientes que usaban el host viejo. Hace falta monitoreo sintético y capacidad de parchear rápido.
4. **No enumerar** `ose_id` de Shalom ni números de guía.

---

## 5. Arquitectura propuesta

- **Gateway** (Fastify o NestJS): API keys, planes y cuotas en Redis, rate limit, OpenAPI.
- **Un adaptador por upstream:** `shalom-web` (sesión, AES, proxy), `shalom-pro` (sesión Laravel por cliente), `olva-tracking`, `olva-wp`, `olva-registro` (OAuth + carrito), `sunat-cpe` (UBL, firma, SOAP), `sunat-gre`, `sunat-sire`, `padron-ruc` (importador diario).
- **Servicio de captcha:** pool de Playwright con Chrome real (idealmente IP peruana) que entrega tokens v3/Enterprise por `action`. Alternativa: proveedores de resolución, aunque los riesgos del punto 4 aplican igual.
- **Caché:** agencias invalidadas por `agencias/version` en Shalom (o cada 24 h en Olva), tarifas 5 min, `guía → ose_id` permanente.
- **Workers** (BullMQ): polling de tracking según el estado, webhooks firmados con HMAC, reintentos y dead-letter.
- **Modelo de estados normalizado** (`REGISTERED`, `IN_TRANSIT`, `AT_DESTINATION`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RETURNED`…) mapeado desde cada courier.
- **Credenciales de clientes** (Shalom Pro, SOL, certificados .pfx) cifradas en reposo (KMS o libsodium).
- **Checks sintéticos** cada 5–10 min por endpoint upstream, con alerta si cambia la forma de la respuesta.

Orden sugerido para el MVP:

1. Olva: tracking, agencias y cotización. Sin captcha, lo más fácil.
2. Shalom: agencias y estados.
3. Servicio de captcha, para `rastrea/buscar` y `tarifa/mostrar` de Shalom.
4. Padrón RUC y emisión de CPE en SUNAT beta.
5. Registro de envíos (Olva carrito, Shalom Pro).
