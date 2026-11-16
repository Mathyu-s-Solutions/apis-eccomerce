---
title: "Cómo anular una factura electrónica: baja o nota"
description: "Cómo anular una factura electrónica en Perú: conoce la baja y la nota de crédito 01, y emite la alternativa correcta con SUNAT API."
site: "sunat"
date: "2026-11-16"
updated: "2026-11-16"
keywords: ["cómo anular una factura electrónica","comunicación de baja SUNAT","nota de crédito motivo 01","anular factura SUNAT","API facturación electrónica Perú"]
draft: false
---

Para anular una factura electrónica en Perú existen dos caminos: comunicar la baja del comprobante o emitir una nota de crédito con motivo 01. No son la misma operación: la baja informa sobre una factura que ya no debe considerarse emitida, mientras que la nota de crédito es un nuevo comprobante relacionado con la factura original.

En SUNAT API, la baja se gestiona con `POST /v1/sunat/voided`. La nota de crédito se emite con `POST /v1/sunat/documents`. Esta guía explica cuándo revisar cada alternativa y muestra un ejemplo funcional para emitir la nota de crédito. El esquema exacto del cuerpo de `/voided` debe confirmarse en la [documentación](/docs) vigente antes de integrarlo, porque no está incluido en los datos publicados de este artículo.

## Baja o nota de crédito: cuál usar

Aunque en una tienda online ambas acciones pueden describirse como “anular una factura”, tienen finalidades distintas.

| Situación | Alternativa | Endpoint de SUNAT API |
|---|---|---|
| Corresponde informar que una factura o nota ya no debe continuar como comprobante emitido | Comunicación de baja | `POST /v1/sunat/voided` |
| La operación existió y debe revertirse mediante un comprobante relacionado | Nota de crédito con motivo 01 | `POST /v1/sunat/documents` |

La comunicación de baja actúa sobre el comprobante que informas. La nota de crédito crea un nuevo comprobante electrónico y lo relaciona con la factura mediante `documento_afectado`.

No decidas únicamente porque el cliente canceló un pedido. Una cancelación en tu tienda y la anulación tributaria de un comprobante son situaciones diferentes. Si la factura todavía no fue emitida, el flujo de tu sistema puede detener la emisión. Si ya fue emitida, revisa qué alternativa corresponde según el caso y las reglas vigentes.

La respuesta puede depender del estado del comprobante, de la operación y de las circunstancias en que detectaste el error. Si el caso tiene implicancias contables o tributarias, verifícalo en la fuente oficial de SUNAT o con tu contador.

## Opción 1: comunicar la baja

SUNAT API ofrece `POST /v1/sunat/voided` para comunicar la baja de una factura o nota. La llamada usa el header `x-api-key` y la URL base de la API:

```text
https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat
```

El cuerpo exacto de `/voided` no está especificado en los datos disponibles para esta guía. Por eso, no se incluye un `curl` con campos supuestos: enviar un JSON inventado puede provocar errores o comunicar información incorrecta. Antes de implementar este camino, consulta el esquema vigente en la [documentación](/docs), incluyendo los campos obligatorios, el formato de la fecha y la estructura de la respuesta.

La integración debe tener en cuenta estas reglas del producto:

- Usa `x-api-key` con la API key creada en tu panel.
- Si tu cuenta tiene más de una empresa emisora, identifica la empresa correcta con `x-ruc`.
- Usa la ruta completa `POST /v1/sunat/voided`.
- Guarda la respuesta real del endpoint y relaciónala con el comprobante original.
- No asumas que la respuesta de la baja tiene el mismo formato que una emisión de documentos.

El endpoint forma parte de los comprobantes de SUNAT API y la comunicación de baja cuenta como un comprobante en los planes que aplican. Revisa los [planes y límites](/pricing) para confirmar la cuota vigente.

### Qué revisar antes de comunicar la baja

Identifica el RUC emisor, el tipo de comprobante, la serie y el número. El ID interno del pedido no reemplaza los datos tributarios del comprobante. Confirma también que estás usando la empresa correcta si tu cuenta tiene varios RUC.

No envíes una baja automáticamente ante cualquier devolución o cancelación comercial. Determina primero si el caso corresponde a una baja o a una nota de crédito con motivo 01. Cuando no tengas certeza, valida el caso con SUNAT o con tu contador.

Esta guía no incluye un ejemplo ejecutable de `/voided` porque el esquema de campos de ese endpoint no está presente en los datos del producto proporcionados. La sección de nota de crédito sí contiene una solicitud completa y funcional con los campos documentados.

## Opción 2: emitir una nota de crédito con motivo 01

Cuando la operación existió y debe revertirse mediante un comprobante relacionado, emite una nota de crédito con `POST /v1/sunat/documents`. Para este tipo de documento debes enviar, como mínimo, los datos coherentes del cliente, la serie, los ítems, el tipo de nota y el comprobante afectado.

Los campos principales son:

- `documento: "nota_credito"`.
- `serie`, con una serie válida que empiece con `F` o `B`.
- `cliente_tipo_de_documento`, `cliente_numero_de_documento` y `cliente_denominacion`.
- `nota_credito_codigo_tipo`.
- `nota_credito_motivo`.
- `documento_afectado`, con `documento`, `serie` y `numero`.
- `items[]`, con la descripción, cantidad, unidad y valor.
- `total`, de forma opcional, para que la API compare el total enviado con el calculado.

Para el caso de anulación de la operación, el enfoque de esta guía usa el motivo 01. Verifica el código vigente en el [catálogo 09 de tipos de nota de crédito](/catalogos/09-tipo-de-nota-de-credito).

### Ejemplo completo con curl

Este ejemplo supone una factura en soles, gravada con IGV de 18 %, sin descuentos, anticipos ni detracción. Sustituye los datos de ejemplo por los de tu factura y cliente:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \\
  -H "x-api-key: $MATHYU_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "documento":"nota_credito",
    "serie":"F002",
    "cliente_tipo_de_documento":"6",
    "cliente_numero_de_documento":"20123456789",
    "cliente_denominacion":"CLIENTE S.A.C.",
    "moneda":"PEN",
    "nota_credito_codigo_tipo":"01",
    "nota_credito_motivo":"Anulación de la operación",
    "documento_afectado":{
      "documento":"factura",
      "serie":"F001",
      "numero":"123"
    },
    "items":[
      {
        "descripcion":"Anulación de la operación según factura F001-123",
        "cantidad":"1",
        "unidad_de_medida":"NIU",
        "valor_unitario":"100.00",
        "porcentaje_igv":"18",
        "codigo_tipo_afectacion_igv":"10"
      }
    ],
    "total":"118.00"
  }'
```

En la API, `valor_unitario` se expresa sin IGV. Por eso, un valor unitario de `100.00` con un IGV de 18 % produce un total de `118.00` en este ejemplo. Si envías `total`, la API lo compara con el total calculado con una tolerancia de un céntimo.

El importe de la nota debe corresponder al comprobante que estás anulando y a la forma en que debe registrarse la operación. No copies el monto del ejemplo si la factura original tiene otros productos, descuentos, anticipos, detracción, otra moneda o una afectación distinta del IGV.

### Ejemplo con JavaScript

Si tu backend usa Node.js o un entorno compatible con `fetch`, puedes enviar la misma nota así:

```javascript
const response = await fetch(
  'https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents',
  {
    method: 'POST',
    headers: {
      'x-api-key': process.env.MATHYU_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      documento: 'nota_credito',
      serie: 'F002',
      cliente_tipo_de_documento: '6',
      cliente_numero_de_documento: '20123456789',
      cliente_denominacion: 'CLIENTE S.A.C.',
      moneda: 'PEN',
      nota_credito_codigo_tipo: '01',
      nota_credito_motivo: 'Anulación de la operación',
      documento_afectado: {
        documento: 'factura',
        serie: 'F001',
        numero: '123'
      },
      items: [
        {
          descripcion: 'Anulación de la operación según factura F001-123',
          cantidad: '1',
          unidad_de_medida: 'NIU',
          valor_unitario: '100.00',
          porcentaje_igv: '18',
          codigo_tipo_afectacion_igv: '10'
        }
      ],
      total: '118.00'
    })
  }
);

const result = await response.json();
console.log(result);
```

La API genera el XML UBL 2.1 firmado, lo envía a SUNAT y devuelve la respuesta de la emisión. En una emisión aceptada, la respuesta documentada incluye el estado y enlaces al XML, CDR y PDF en formato A4 o ticket de 80 mm, con QR.

## Flujo recomendado para una tienda online

1. **Ubica la factura.** Guarda el RUC emisor, tipo, serie y número del comprobante.
2. **Analiza el caso.** Determina si corresponde comunicar una baja o emitir una nota de crédito con motivo 01.
3. **Confirma la empresa.** Si tienes varios RUC, prepara el header `x-ruc` con el emisor correcto.
4. **Prepara la nota.** Revisa cliente, moneda, ítems, IGV, descuentos, anticipos y detracción.
5. **Evita duplicados.** Para reintentar una emisión sin duplicarla, usa `Idempotency-Key` en los endpoints de comprobantes.
6. **Guarda la respuesta.** Conserva el estado, XML, CDR y PDF de la nota emitida. Para la baja, guarda la respuesta real según el esquema de `/voided`.
7. **Conserva el historial.** No borres la factura original de tu sistema; relaciónala con la baja o la nota de crédito correspondiente.

Puedes revisar la guía de [API de facturación electrónica en Perú](/guias/api-facturacion-electronica-peru) para conocer el flujo general de emisión y consultar los [catálogos de SUNAT](/catalogos) usados por la API.

## Qué revisar antes de enviar

La serie debe corresponder al comprobante. En SUNAT API, las series de factura empiezan con `F` y las de boleta con `B`. La nota de crédito debe usar una serie válida y relacionar el comprobante correcto en `documento_afectado`.

Verifica también el tipo de documento del cliente. Una factura normalmente se emite a un cliente con RUC, usando `cliente_tipo_de_documento: "6"`, salvo operaciones como exportación. Los datos de la nota deben ser coherentes con el comprobante afectado.

No uses la comunicación de baja y la nota de crédito como dos pasos obligatorios para la misma factura. Son alternativas para situaciones distintas. Si no tienes claro cuál corresponde, detén la automatización y valida el caso antes de enviarlo.

La empresa puede empezar en beta y emitir contra SUNAT beta sin certificado ni cuota. Para pasar a producción debe subir su certificado y completar los requisitos correspondientes. Revisa los [planes y límites](/pricing) si necesitas conocer la cuota mensual del servicio.

## Preguntas frecuentes

### ¿La baja y la nota de crédito son lo mismo?

No. La baja informa sobre un comprobante; la nota de crédito es un nuevo comprobante relacionado con la factura original.

### ¿Qué código uso para anular una operación con nota de crédito?

Usa el motivo 01 para el caso de anulación de la operación y relaciona la factura mediante `documento_afectado`. Verifica el [catálogo 09](/catalogos/09-tipo-de-nota-de-credito).

### ¿Puedo enviar cualquier monto en la nota de crédito?

No. Los ítems y el total deben ser coherentes con la operación. Si envías `total`, la API lo compara con el total calculado con una tolerancia de un céntimo.

### ¿La API elimina la factura original?

No debes borrar el registro original de tu sistema. Conserva la factura y relaciónala con la baja o la nota de crédito correspondiente.

### ¿Dónde confirmo el cuerpo exacto de `/voided`?

Revisa la [documentación](/docs) vigente de SUNAT API. Los datos disponibles confirman la ruta y su finalidad, pero no incluyen aquí el esquema completo del payload.
