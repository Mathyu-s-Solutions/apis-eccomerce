---
title: "Resumen diario de boletas SUNAT: guía para tu API"
description: "Aprende qué es el resumen diario de boletas SUNAT y cómo organizar su envío con enviar_en_resumen desde tu tienda online."
site: "sunat"
date: "2026-11-13"
updated: "2026-11-13"
keywords: ["resumen diario de boletas SUNAT","enviar boletas en resumen diario","API resumen diario SUNAT","enviar_en_resumen SUNAT","daily-summary SUNAT"]
draft: false
---

El resumen diario permite informar posteriormente determinadas boletas a SUNAT, en lugar de enviarlas una por una en el momento de la venta. Con SUNAT API, marcas la boleta con `enviar_en_resumen: true` y luego usas `POST /v1/sunat/daily-summary`. La estructura exacta del resumen debe seguir la [documentación](/docs) y las reglas vigentes de SUNAT.

## Qué es el resumen diario de boletas

El resumen diario es una comunicación electrónica para informar o anular boletas dentro del flujo permitido por SUNAT. No reemplaza la boleta ni elimina la necesidad de conservar los datos de cada venta: serie, número, fecha, cliente, productos, cantidades, precios, impuestos y total.

La integración tiene dos momentos:

1. Registras la venta como boleta y la marcas para enviarla posteriormente en un resumen.
2. Reúnes las boletas pendientes y comunicas el resumen mediante el endpoint correspondiente.

Este artículo explica cómo organizar el flujo y cómo usar el campo `enviar_en_resumen`. Los datos disponibles del producto no incluyen el esquema completo del cuerpo de `POST /v1/sunat/daily-summary` ni el cuerpo completo de `POST /v1/sunat/status`. Por eso, no se inventan campos: debes copiar esas estructuras desde la [documentación](/docs) antes de implementar el envío.

## Cuándo conviene usar un resumen diario

El resumen puede evaluarse cuando tu tienda procesa muchas ventas pequeñas y no necesita enviar cada boleta individual inmediatamente. También encaja cuando tu sistema ya tiene un proceso programado, como una cola o tarea, que reúne las ventas pendientes y controla el resultado de cada comunicación.

Puede convenirte si:

- Tu operación emite principalmente boletas.
- Puedes guardar los datos completos de cada venta antes de comunicarla.
- Tienes un proceso posterior para agrupar pendientes y revisar errores.
- No necesitas confirmar el envío individual de cada boleta en el mismo instante.
- Puedes conciliar cada boleta con el resumen que la incluyó.

El envío individual puede ser más simple si tienes pocas ventas o si necesitas una respuesta inmediata por comprobante. En ese caso usas `POST /v1/sunat/documents`.

| Situación | Alternativa que debes evaluar |
|---|---|
| Pocas boletas | Envío individual con `/documents` |
| Muchas ventas y proceso programado | Resumen diario |
| Confirmación inmediata por venta | Envío individual |
| Boleta pendiente de informar | Flujo con `/daily-summary` |
| Anulación dentro del flujo de resumen | `/daily-summary`, según las reglas aplicables |

No asumas que cualquier comprobante o escenario puede enviarse mediante resumen. Verifica los requisitos vigentes en la fuente oficial de SUNAT y en la [documentación](/docs).

## Cómo funciona `enviar_en_resumen`

`enviar_en_resumen` es un campo del JSON de `POST /v1/sunat/documents`. Según los datos del producto, se usa en boletas para indicar que no se enviarán en ese momento y que se informarán después mediante un resumen diario.

Este es un ejemplo de una boleta marcada para resumen:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "documento": "boleta",
    "serie": "B001",
    "cliente_tipo_de_documento": "1",
    "cliente_numero_de_documento": "75413811",
    "cliente_denominacion": "NOMBRE DEL CLIENTE",
    "enviar_en_resumen": true,
    "items": [
      {
        "descripcion": "Polo",
        "cantidad": "2",
        "valor_unitario": "42.372881"
      }
    ],
    "total": "100.00"
  }'
```

`valor_unitario` se expresa sin IGV. También puedes usar `precio_unitario`, que incluye IGV; si envías ambos campos, la API usa `valor_unitario`. `total` es opcional; si lo envías, se compara con el total calculado con una tolerancia de un céntimo.

No uses `enviar_en_resumen` para facturas. El campo está descrito para boletas dentro de este flujo.

## Flujo recomendado para una tienda online

### 1. Registra tu empresa emisora

Antes de emitir, registra la empresa con sus datos y credenciales de SUNAT. La empresa comienza en beta y puedes probar contra SUNAT beta sin certificado ni cuota. Para pasar a producción debes subir el certificado requerido por el servicio.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/companies" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"ruc":"20123456789","razon_social":"MI EMPRESA S.A.C.","direccion":"AV. LOS OLIVOS 123","ubigeo":"150101"}'
```

Si tu cuenta tiene más de una empresa, selecciona la emisora con la cabecera `x-ruc` cuando corresponda.

### 2. Guarda la boleta pendiente

Cuando se confirma el pedido, guarda la venta y todos los datos necesarios para construir la boleta. Conserva la serie, el número, la fecha, los datos del cliente, los ítems, los códigos tributarios, los importes y el estado de comunicación.

Si no envías `numero`, la API toma el siguiente correlativo. En ese caso, registra el número que corresponda en tu sistema para evitar que la conciliación quede incompleta.

Para revisar códigos de identidad, unidades y afectación del IGV, consulta los [catálogos de SUNAT](/catalogos), como el [tipo de documento de identidad](/catalogos/06-tipo-de-documento-de-identidad), [unidades de medida](/catalogos/03-unidades-de-medida) y [afectación del IGV](/catalogos/07-tipo-de-afectacion-del-igv).

### 3. Selecciona las boletas pendientes

Tu proceso debe buscar las boletas marcadas con `enviar_en_resumen: true` que todavía no estén asociadas a un resumen comunicado con resultado exitoso. Guarda también el lote, la fecha del intento, la respuesta de la API y el estado interno de cada boleta.

Si una solicitud falla, conserva la boleta como pendiente y registra el motivo. Para reintentos, usa `Idempotency-Key` cuando corresponda y evita crear duplicados por reintentos automáticos.

### 4. Envía el resumen diario

El endpoint es:

```text
POST https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/daily-summary
```

La ruta comunica el resumen diario para informar o anular boletas. Sin embargo, los datos del producto proporcionados para esta guía no incluyen los nombres ni la forma completa de los campos del cuerpo. Por precisión, no es correcto presentar un JSON inventado como si fuera válido.

Antes de programar esta llamada, revisa en la [documentación](/docs) el payload requerido, la identificación de cada boleta, los datos de la fecha y la estructura para informar o anular. El código de autenticación de la solicitud sí está definido:

```javascript
const response = await fetch(
  "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/daily-summary",
  {
    method: "POST",
    headers: {
      "x-api-key": process.env.MATHYU_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  }
);

const result = await response.json();

if (!response.ok || !result.success) {
  throw new Error(result.message || "No se pudo enviar el resumen diario");
}

console.log(result);
```

En este ejemplo, `payload` no es un objeto genérico que puedas enviar sin cambios: debes construirlo con los campos exactos publicados para `/daily-summary`. La guía no presenta el flujo como una integración completa hasta que se confirme ese esquema en la documentación.

### 5. Guarda la respuesta y concilia

No marques las boletas como comunicadas antes de recibir y guardar una respuesta exitosa. Relaciona cada boleta con el resumen enviado y conserva la respuesta completa para auditoría y reintentos controlados.

Para consultar posteriormente el estado, XML, CDR o PDF de un comprobante existe `POST /v1/sunat/status`. El método correcto es `POST`, no `GET`. Los datos disponibles del producto confirman que el endpoint consulta el estado de un comprobante, pero no incluyen el cuerpo requerido. Por eso debes usar en la solicitud el JSON exacto indicado en la [documentación](/docs), sin sustituirlo por campos supuestos.

Una vez confirmado el cuerpo en la documentación, la llamada debe mantener esta forma:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/status" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '<JSON de consulta definido en la documentación>'
```

El marcador anterior no es un payload listo para producción. Señala deliberadamente el punto que debes reemplazar por el cuerpo oficial documentado. No cambies una boleta a completada solo porque la solicitud HTTP terminó sin error: revisa el resultado devuelto por la API.

## Resumen diario frente a envío individual

`POST /v1/sunat/documents` procesa una boleta por solicitud. Es directo y facilita asociar la respuesta con una venta concreta. El resumen diario separa el registro de la venta del momento de comunicación, pero exige una cola de pendientes, control de duplicados y conciliación.

No confundas este flujo con una baja de factura o nota. Para comunicar la baja de una factura o nota existe `POST /v1/sunat/voided`. El resumen diario tiene su propio endpoint y se relaciona con informar o anular boletas según las reglas aplicables.

## Pruebas y producción

Puedes comenzar en beta con pruebas contra SUNAT beta sin certificado ni cuota, según la configuración del producto. Antes de pasar a producción, revisa la configuración de la empresa y sube el certificado requerido.

La autenticación usa el header `x-api-key`. Crea la key en tu panel y guárdala en una variable de entorno como `MATHYU_API_KEY`. No la expongas en el navegador ni en el código público de tu tienda. Revisa los límites vigentes en [precios](/pricing).

## Preguntas frecuentes

### ¿El resumen diario reemplaza la boleta?

No. La boleta sigue siendo el comprobante de la venta; el resumen es el mecanismo posterior para informar o anular determinadas boletas.

### ¿Puedo usar `enviar_en_resumen` en una factura?

Según los datos del producto, el campo se usa en boletas. Las facturas se emiten mediante `POST /v1/sunat/documents` sin aplicar este flujo.

### ¿El artículo incluye el payload completo de `/daily-summary`?

No. Ese esquema no está incluido en los datos proporcionados. Debes obtenerlo de la [documentación](/docs) y verificarlo antes de implementar.

### ¿Qué método usa `/v1/sunat/status`?

Usa `POST`. El cuerpo debe ser el JSON definido en la [documentación](/docs); no se debe asumir una estructura no publicada.

### ¿Qué hago si falla el resumen?

Conserva las boletas como pendientes, registra el error, corrige los datos si corresponde y reintenta con control de duplicados.
