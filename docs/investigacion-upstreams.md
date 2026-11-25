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
| `rastrea/buscar` | `{ numero, codigo, ose_id, recaptcha_token }` + header `X-Auth-Token` | `rastrea_buscar` | ✅ **se valida en el servidor** ("Verificación de seguridad fallida" con un token falso). Acepta guía + clave o solo `ose_id` (lo usa su lector de QR) |
| `rastrea/estados` | `{ ose_id }` | no, pero… | ✅ desde el 19-nov-2026 solo responde la orden que **esa misma sesión** buscó con `rastrea/buscar`; si no, 409 "Busque nuevamente la orden de servicio." |
| `rastrea/comprobante` | `{ serie, numero, cop_id, recaptcha_token }` | `rastrea_comprobante` | sin probar |
| `rastrea/grt` | `{ ose_id, cap_id }` | ? | sin probar |
| `pro/login` | `{ email, password }` | ? | sin probar |

**Implicación para el tracking:** cada consulta cuesta **un** reCAPTCHA. Hasta el 19-nov-2026 bastaba uno por guía (de guía + clave a `ose_id`) y después `rastrea/estados` por `ose_id` era libre; ahora la sesión de Shalom (120 s) guarda la orden buscada y `estados` solo responde esa. Por eso `buscar` y `estados` van juntos en una sesión que nadie más usa mientras tanto (`ShalomWebClient.isolated`): en una sesión compartida, otra búsqueda a la vez la pisaría. Esas sesiones se reutilizan (una por cada captcha a la vez) hasta que vencen: Shalom deja abrir **unas 20 sesiones por minuto por IP** (`/api/local/session` responde 429 "Too many requests" con `Retry-After: 60`), así que una sesión por rastreo no aguanta una ráfaga. Las rutas también tienen límite, **unas 20 consultas por minuto por IP en cada una** (`rastrea/estados` dio 429 en la 21ª mientras `agencias/version` seguía respondiendo): como un rastreo es un `buscar` y un `estados`, son unos 20 rastreos por minuto por IP entre todos los clientes. Medido el 25-nov-2026. Pasado el límite, Shalom corta esa ruta a esa IP **60 s fijos desde el primer 429** (los intentos durante el corte no lo alargan, pero cada uno gasta un captcha); en producción se vieron dos cortes distintos a la vez, o sea dos IPs de salida (las instancias de Cloud Run). Por eso el rastreo va a 15 por minuto por instancia (3 seguidos y uno cada 4 s), espera el corte en vez de reintentar, y responde 503 con `Retry-After`. Una búsqueda fallida no borra la orden ya buscada en la sesión. El 409 se ve con `scripts/probes/shalom-track-probe.mjs`.

> ⚠️ Los `ose_id` son secuenciales. **No enumerar.** Usar solo ids de guías que nuestros clientes nos den.

### 1.2 Shalom Pro: pro.shalom.pe (SPA en Vue + Laravel Sanctum)

Para registrar envíos, generar rótulos y tickets se necesita la **cuenta Shalom Pro del cliente**. Esto es lo que shalom-api llama "instancias": guardan las credenciales de cada cliente y mantienen una sesión logueada, con navegador headless para pasar el reCAPTCHA v3 del login.

**Actualizado el 2026-11-19** (leyendo el bundle de Vite, `/assets/index-*.js` y sus chunks): el portal dejó de ser Laravel + jQuery con formularios. Ahora es una SPA y la API cuelga de `/api/v1`:

- Sesión Sanctum en modo SPA ✅: `GET /sanctum/csrf-cookie` da `XSRF-TOKEN` y `enviashalom_session` (1 h). Cada llamada lleva esas cookies, `X-XSRF-TOKEN` (la cookie decodificada), `X-Requested-With: XMLHttpRequest` y `Accept: application/json`. Sin sesión, `GET /api/v1/auth/me` da 401 ✅. Con 419 su front pide otra cookie CSRF y reintenta.
- Login: `POST /api/v1/auth/login` con JSON `{ email, password, remember, recaptcha_token }`. El reCAPTCHA v3 usa el **mismo site key** que shalom.com.pe, con `action: "login"`. Lo resolvemos en una página de pro.shalom.pe, porque el token lleva el dominio donde se generó.
- Respuestas: `{ success, message, data }`.
- Flujo "Envía ya" (`FormEnvio-*.js`), sin probar con cuenta:
  - `GET /auth/me` → `data.person` (`document`, `name`, `last_name`, `sur_name`, `phone`) o `data.company` (`number_document`, `legal_name`, `phone`). Es el remitente.
  - `POST /envia_ya/terminals` → `Map[]` con `ter_id` (el mismo `code` de las agencias públicas), `origen`, `destino`, `ter_habilitado_OS`, `ter_aereo` y `origenes_aereos`. El destino aéreo va como `"0" + ter_id`.
  - `POST /envia_ya/products` → `data[]` (`id`, `title`: Sobre, Caja Paquete XXS…L, Otra Medida).
  - `POST /envia_ya/tariff/calculate { origin, destiny, width, height, length, weight }` → `tariff.{sobre, cajapaquetexxs…l}` y `price` (otra medida).
  - `POST /service-orders/recipients/search { document }` → `uuid`. Si no existe, `POST /service-orders/recipients/save { document, first_name, last_name, surname, email, phone }`.
  - `POST /envia_ya/service_order/save` → `{ guia, serie, codigo, ose_id, precio }`. Campos: `origen`, `destino`, `tipo_pago` (REMITENTE/DESTINATARIO), `tipo_producto`, `tipo_producto_json`, `cantidad`, medidas, `costo`, `destinatario_uuid`, `remitente_*`, `garantia*`, `grrs`, `clave` (4 dígitos, sin repetidos ni consecutivos), `aereo`, `servicio_cobranza*` y `declaracion_jurada`.
  - `POST /rotulo/token { ose_id }` → `{ url }` del rótulo. `POST /ticket-pdf/token { ose_id }` → `{ token }`, y el PDF está en `GET /api/v1/ticket-pdf/<ose_id>?token=…`.
- Otras rutas vistas: envíos masivos (`/service-orders/import`, `/service-orders/send`), historial (`/service-orders/shipments/history`), pagos (`/payment/*`, Openpay, Yape) y autogestión (cambio de destino, retención, clave).

Implementado en `backend/src/modules/shalom/pro/`. Para verificar las respuestas con una cuenta real sin crear guías: `scripts/probes/shalom-pro-probe.mjs`.

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

**Actualizado el 2026-11-19** (front del 2026-11-15, chunks `main-*.js` y `chunk-*.js`). Escrituras sin probar en vivo:

- Su interceptor manda `X-Recaptcha-Token` en cada ruta, con su `action` (`cart_store`, `cart_origin_update`, `cart_who_pays_update`, `cart_item_store`, `price_show`, `shipping_pin_update`, `payment_tienda`, `shipping_label_show`, `person_lookup`, `geo_address`…). Si el error menciona captcha, recaptcha o score, reintenta con un token nuevo: **el servidor sí lo valida**. El script Enterprise (`recaptcha/enterprise.js?render=<key>`) se carga recién en la primera acción.
- Sin captcha responden ✅: `/v1/token`, sedes, categorías, destinos, persona y `GET /v1/geo/address?address=&ubigeo=` (devuelve coordenadas, `polygon` como "AQP013", `office` y `dangerous`; 404 si no ubica la dirección).
- `GET /v1/shipping-records/headquarters` ✅ → 23 sedes de origen, con `payment_modalities[].code`: `ONLINE` (Niubiz o PagoEfectivo), `DESTINATION` (paga el destinatario) y `STORE` (pago en tienda, solo en algunas sedes).
- `GET /v1/shipping-records/destinations?mode=store|home&ubigeo_code=<origen>&modality=<pago>` ✅ → tiendas (`office_id`, `delivery_type: "O"`, `is_agent`; con pago en destino su front quita los agentes) o distritos a domicilio (`ubigeo_id` interno, `delivery_type: "D"`).
- Pasos:
  1. `POST /v1/cart { shipment_modality: "package", person }` → `session_id`. `person` lleva los datos del remitente más campos internos que salen de `GET /v1/person/{dni|ruc|ce|pas}/{n}?role=sender`: `employee_id`, `discount_shipments_count`, `rounding_factor`, `package_headquarter_code`, `tax_affectation_type_id` y `person_legal_area`.
  2. `PUT …/origin` con la sede, y `PUT …/who-pays { who_pays }`.
  3. `POST …/item { who_receive, destination, service: { return_charge, delivery_type }, what_send }`. En `what_send` va `shipment_type: 2`, peso y medidas, `article_id`, `declared_value`, `custom_size`/`size_id` e `insurance_accepted`. Los tamaños estándar están en `GET /v1/shipping-records/cart/{uuid}/standard-sizes?id_sede_origen=&tipo_entrega=DOMICILIO|TIENDA&id_ubigeo_destino=`.
  4. `GET /v1/price/{uuid}`.
  5. Si se recoge en tienda, `PUT /v1/shipping-records/cart/{uuid}/pin { pin }`.
  6. Con `STORE` o `DESTINATION`, `POST /v1/cart/{uuid}/payment/tienda {}`. Con `ONLINE` + PagoEfectivo, `POST …/payment/pagoefectivo { email }`; el CIP queda en `cart.pagoefectivo_result.cip_code` y `cip_url`. Niubiz abre su formulario de tarjeta. ✅ Hay pago online en las 23 sedes, pago en destino en 18 y pago en tienda en 16 (Lima no).
- Resultado ✅ (prueba real del 2026-11-20, pago en destino): `payment/tienda` → `{ success, presale_id, nro_pedido, remitos: "3123602-26--" }`. El carrito queda con `nroPedidoPreventa`, `presale_result` y `remito_list`. `remitos` es el **tracking** (número y emisión) que imprime el rótulo ("TRACKING 3123602-26"). Recién creado, el rastreo de Olva responde 404; aparecería cuando reciben el paquete (sin confirmar). El rótulo sale de `GET …/label` → `{ filename, mime_type, pdf_base64 }`. El precio sale de `GET /v1/price/{uuid}` → `data.total_amount`.
- Errores vistos en la prueba: `article_id` 0 → «El tipo de artículo no está disponible» (hay que mandar una categoría real); `who_receive.email` con un pago que no es en destino → «El correo del destinatario solo corresponde a pago en destino»; PagoEfectivo con un correo `.example` → 502 «Error del proveedor».

Implementado en `backend/src/modules/olva/shipments/`.

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
| Tipo de cambio SBS | API de estadísticas del BCRP (series diarias) | ninguna | ✅ dólar y euro |

- Librería de referencia: **Greenter** (PHP, activa, ~370★) cubre UBL, firma y SOAP. En Node se puede armar con `xml-crypto` + `node-forge` + un cliente SOAP.

**Actualización 2026-10-12 (implementado en `backend/src/modules/sunat`):**

- **Beta SOAP:** acepta cualquier RUC con el usuario `MODDATOS` / `moddatos` y un certificado autofirmado, y valida de verdad (firma y reglas). Corta las ráfagas con un `401` en HTML (~1 request por segundo): se reintenta. Los rechazos llegan como SOAP Fault con el código de SUNAT.
- **Guías (GRE):** no hay beta oficial. Se usa el entorno público `https://gre-test.nubefact.com/v1` (el de la documentación de Greenter: client id `test-85e5b0ae-…`, usuario `MODDATOS`), que valida esquema y reglas. El token exige `Content-Type: application/x-www-form-urlencoded` exacto (sin `; charset`). En transporte público la fecha de entrega al transportista va en `cac:LoadingTransportEvent/cbc:OccurrenceDate` (si falta: error 3617). En la guía de transportista, el remitente va en `cac:Despatch/cac:DespatchParty`, quien subcontrata en `cac:Consignment/cac:LogisticsOperatorParty` y el tercero que paga el flete en `cac:OriginatorCustomerParty`.
- **Consulta RUC:** `e-consultaruc.sunat.gob.pe` está tras un desafío de Cloudflare. **No se evade:** se usa el padrón reducido (18,5 millones de filas, sin ordenar, ISO-8859-1), que no trae nombre comercial ni actividades económicas.
- **Tipo de cambio:** la SBS (Incapsula) y SUNAT (WAF) bloquean las consultas automáticas. Se usa la API del BCRP: series `PD04639PD`/`PD04640PD` (SBS compra/venta, dólar) y `PD04647PD`/`PD04648PD` (euro). Sin un `User-Agent` de navegador su PHP pega una traza de error después del JSON, y a las consultas muy seguidas responde HTML: se guarda cada fecha en BD y se reintenta.
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
