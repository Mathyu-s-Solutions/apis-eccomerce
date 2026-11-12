---
title: "Alternativa a apisunat: migra a SUNAT API sin rehacer código"
description: "Alternativa a apisunat.pe compatible con tu JSON: cambia la URL y la API key, prueba en beta y valida tu integración antes de producción."
site: "sunat"
date: "2026-11-11"
updated: "2026-11-11"
keywords: ["alternativa a apisunat","apisunat.pe alternativa","migrar de apisunat","API SUNAT Perú","facturación electrónica API"]
draft: false
---

Si buscas una alternativa a apisunat.pe, puedes migrar a SUNAT API cambiando la URL base y la API key, sin rehacer el JSON de entrada ni el de respuesta. La API de Mathyu's Solutions mantiene el mismo formato compatible y permite probar tu integración contra SUNAT beta antes de pasar a producción.

La URL base es `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat` y la autenticación usa la cabecera `x-api-key`. En esta guía verás qué cambiar, qué revisar y cómo probar una emisión sin enviar comprobantes reales.

## Qué cambia al migrar desde apisunat.pe

La migración se concentra en dos valores de configuración:

1. Reemplazar la URL base por `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`.
2. Reemplazar la API key por una key creada en tu panel de Mathyu's Solutions.

El JSON de entrada y el JSON de respuesta son los mismos que usa apisunat.pe. Por eso, si tu aplicación ya construye correctamente solicitudes para facturas, boletas, notas o consultas, puedes conservar esa lógica y cambiar únicamente la configuración del cliente HTTP.

La API key se envía en cada solicitud mediante `x-api-key`:

```text
x-api-key: $MATHYU_API_KEY
```

Mantén la key en una variable de entorno o en el gestor de secretos de tu servidor. No la incluyas en JavaScript que se ejecute en el navegador, aplicaciones móviles distribuidas a clientes ni repositorios públicos.

Puedes revisar las rutas y campos disponibles en la [documentación](/docs).

## Configura la URL y la autenticación

Centraliza la URL base para que el cambio no quede repetido en varios archivos. Si tu código concatena las rutas, define solo la base y agrega después `/documents`, `/status` u otra ruta compatible.

```javascript
const SUNAT_API_URL = "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat";
const MATHYU_API_KEY = process.env.MATHYU_API_KEY;
```

Una emisión con `fetch` puede conservar el mismo cuerpo JSON que ya usa tu integración:

```javascript
const response = await fetch(`${SUNAT_API_URL}/documents`, {
  method: "POST",
  headers: {
    "x-api-key": MATHYU_API_KEY,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    documento: "boleta",
    serie: "B001",
    cliente_tipo_de_documento: "1",
    cliente_numero_de_documento: "75413811",
    cliente_denominacion: "NOMBRE DEL CLIENTE",
    items: [
      {
        descripcion: "Polo",
        cantidad: "2",
        valor_unitario: "42.372881"
      }
    ],
    total: "100.00"
  })
});

const data = await response.json();
console.log(data);
```

No cambies los nombres de campos solo por cambiar de proveedor. La compatibilidad depende de enviar el formato esperado, incluyendo `documento`, `serie`, los datos del cliente e `items`.

## Qué revisar antes de migrar

### La URL completa y las rutas

La URL base de SUNAT API es:

```text
https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat
```

Para emitir comprobantes, la ruta completa es:

```text
https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents
```

Para consultar el estado de un comprobante, usa `POST /v1/sunat/status`. No agregues rutas de archivos que no estén en la documentación. La respuesta de emisión puede incluir enlaces al XML firmado, la constancia de SUNAT y el PDF; usa los enlaces que la API devuelva, sin construirlos manualmente.

### La empresa emisora

Antes de emitir, registra tu empresa con `POST /v1/sunat/companies`. La empresa empieza en beta y puedes emitir contra SUNAT beta sin certificado ni cuota. Para producción, debes subir tu certificado.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/companies" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"ruc":"20123456789","razon_social":"MI EMPRESA S.A.C.","direccion":"AV. LOS OLIVOS 123","ubigeo":"150101"}'
```

Usa `GET /v1/sunat/companies` para consultar tus empresas y revisar qué les falta para producción. Si tu cuenta tiene más de una empresa emisora, indica cuál corresponde mediante la cabecera `x-ruc` en las operaciones que lo requieran.

Las credenciales de SUNAT de tu empresa se almacenan cifradas y no se devuelven en las respuestas. También puedes registrar y revisar empresas desde el panel.

### Series y documentos

La serie tiene cuatro caracteres. Para facturas empieza con `F` y para boletas con `B`. El campo `numero` es opcional; si no lo envías, la API toma el siguiente correlativo.

Una factura se emite a un cliente con RUC, usando normalmente `cliente_tipo_de_documento: "6"`. Para una boleta puedes usar `cliente_tipo_de_documento: "1"` para DNI. Confirma los valores en los catálogos de [tipo de documento de identidad](/catalogos/06-tipo-de-documento-de-identidad) y [tipo de afectación del IGV](/catalogos/07-tipo-de-afectacion-del-igv).

En cada ítem puedes enviar `valor_unitario`, que no incluye IGV, o `precio_unitario`, que sí lo incluye. Si envías ambos, prevalece `valor_unitario`. El campo `total` es opcional; si lo envías, la API lo compara con el total calculado con una tolerancia de un céntimo.

### Reintentos y duplicados

Si tu servidor reintenta una solicitud por un timeout o un error de red, envía `Idempotency-Key`. Usa una clave estable para el mismo intento lógico: generar una key nueva en cada reintento puede impedir que la API identifique que se trata de la misma operación.

## Prueba la migración en beta

Haz las pruebas con una empresa registrada en beta antes de cambiar el tráfico de tu tienda. La beta permite comprobar que la URL, la autenticación, el JSON y el procesamiento de respuestas funcionan sin certificado ni cuota.

### Paso 1: emite una boleta

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"boleta","serie":"B001","cliente_tipo_de_documento":"1","cliente_numero_de_documento":"75413811","cliente_denominacion":"NOMBRE DEL CLIENTE","items":[{"descripcion":"Polo","cantidad":"2","valor_unitario":"42.372881"}],"total":"100.00"}'
```

Si tienes más de una empresa registrada, agrega la cabecera `x-ruc` con el RUC de la emisora:

```bash
-H "x-ruc: 20123456789"
```

### Paso 2: procesa la respuesta

La respuesta de emisión mantiene la estructura compatible con apisunat.pe. Incluye `success`, `message` y `payload`. Dentro de `payload` puedes recibir el `estado`, el `hash` y los enlaces al XML, CDR y PDF.

Un resultado aceptado tiene esta forma general:

```json
{
  "success": true,
  "message": "El comprobante fue enviado y aceptado por SUNAT.",
  "payload": {
    "estado": "ACEPTADO",
    "hash": "pFKddbDnm4oRDxNNyTT3VXLXzkOOHkZVIVgr8RV2JVY=",
    "xml": "enlace-al-xml-devuelto-por-la-api",
    "cdr": "enlace-al-cdr-devuelto-por-la-api",
    "pdf": {
      "ticket": "enlace-al-pdf-ticket",
      "a4": "enlace-al-pdf-a4"
    }
  }
}
```

Tu aplicación debe revisar el contenido de la respuesta y el campo `estado`, no depender de un texto fijo en `message`. Guarda o procesa los enlaces devueltos según tu flujo de tienda.

### Paso 3: consulta el estado

Usa `POST /v1/sunat/status` para consultar el estado, XML, CDR y PDF de un comprobante. Esta operación es gratuita en la cuota. También puedes usar `GET /v1/sunat/documents` para listar comprobantes emitidos con filtros y paginación.

Prueba una consulta de RUC con un endpoint disponible:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/20100066603" \
  -H "x-api-key: $MATHYU_API_KEY"
```

La consulta de RUC puede devolver razón social, estado, condición y domicilio fiscal según los datos disponibles del padrón de SUNAT.

## Qué puedes conservar de tu integración

Además de facturas y boletas, SUNAT API incluye notas de crédito y débito mediante `POST /v1/sunat/documents`, bajas mediante `POST /v1/sunat/voided` y resúmenes diarios mediante `POST /v1/sunat/daily-summary`.

También puedes emitir guías de remisión de remitente o transportista con `POST /v1/sunat/dispatches`. Para estos documentos se usan campos como `motivo_de_traslado`, `modalidad_de_transporte`, puntos de partida y llegada, peso, bultos, conductores, vehículos e ítems. Revisa los [catálogos de SUNAT](/catalogos), [motivos de traslado](/catalogos/20-motivo-de-traslado) y [modalidades de transporte](/catalogos/18-modalidad-de-transporte).

Las consultas disponibles incluyen RUC, DNI, validez de comprobantes, SIRE, tipo de cambio SBS y catálogos. RUC y DNI están incluidos en el plan Básico; validez de comprobantes y SIRE están incluidos en el plan Pro. Revisa los límites y precios actuales en [precios](/pricing).

## Checklist antes de producción

1. La URL base apunta a `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`.
2. La key se carga desde la variable segura `MATHYU_API_KEY`.
3. La empresa emisora está registrada y configurada para el entorno correcto.
4. Las series corresponden al tipo de comprobante.
5. Tu aplicación valida `estado` y maneja respuestas no aceptadas.
6. Procesas los enlaces de XML, CDR y PDF que devuelve la API, sin construir rutas manualmente.
7. Los reintentos usan `Idempotency-Key`.
8. Probaste una boleta, una consulta de estado y, si corresponde, una factura, nota o guía.
9. Si usas varias empresas, envías el RUC correcto en `x-ruc`.

La migración desde apisunat.pe puede ser pequeña porque se conserva el contrato JSON. Cambia primero la URL y la key en beta, verifica las respuestas que espera tu aplicación y luego configura las credenciales de producción.

## Preguntas frecuentes

### ¿Tengo que cambiar el JSON que ya uso con apisunat.pe?

No para la compatibilidad indicada: SUNAT API usa el mismo JSON de entrada y respuesta. Revisa de todos modos rutas, series, credenciales y manejo de errores.

### ¿Cuál es la URL base de SUNAT API?

Es `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`. La API key va en la cabecera `x-api-key`.

### ¿Puedo probar sin certificado?

Sí. Tu empresa empieza en beta y puedes emitir contra SUNAT beta sin certificado ni cuota. Para producción debes subir tu certificado.

### ¿Cómo evito duplicar un comprobante al reintentar?

Envía una cabecera `Idempotency-Key` estable para el mismo intento lógico.

### ¿La API pertenece a SUNAT o a apisunat.pe?

No. Es un servicio independiente de Mathyu's Solutions, no afiliado a SUNAT ni al Estado peruano. Para requisitos tributarios, verifica siempre la información oficial correspondiente.
