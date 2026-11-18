---
title: "Qué es el CDR SUNAT: estados y cómo conservarlo"
description: "Qué es el CDR SUNAT, cómo interpretar sus estados y cómo guardar la constancia junto al XML y PDF de cada comprobante electrónico."
site: "sunat"
date: "2026-11-18"
updated: "2026-11-18"
keywords: ["qué es el CDR SUNAT","constancia de recepción SUNAT","estados del CDR SUNAT","CDR comprobante electrónico","guardar CDR SUNAT"]
draft: false
---

El CDR SUNAT es la Constancia de Recepción que devuelve SUNAT después de procesar un comprobante electrónico. Permite conocer el resultado del envío y debe conservarse junto con el XML firmado y la representación PDF del comprobante.

Con SUNAT API puedes emitir una factura, boleta o nota y recibir en la respuesta el estado, el enlace al XML, el enlace al CDR y los enlaces al PDF en formato A4 o ticket de 80 mm. También puedes consultar posteriormente el estado y esos archivos mediante `POST /v1/sunat/status`.

## Qué significa CDR SUNAT

CDR significa Constancia de Recepción. Es el archivo XML que representa la respuesta de SUNAT al comprobante electrónico recibido. No es el mismo archivo que el XML firmado del comprobante.

| Archivo | Qué representa | Uso principal |
|---|---|---|
| XML firmado | El comprobante electrónico enviado por el emisor | Conserva los datos estructurados de la factura, boleta o nota |
| CDR | La respuesta de SUNAT al procesamiento del comprobante | Permite revisar el resultado y la respuesta asociada |
| PDF | La representación visual del comprobante | Facilita la lectura y el envío al cliente |

El XML y el CDR tienen formato XML, pero cumplen funciones distintas. El XML contiene la información del documento que emitiste; el CDR contiene la constancia de la respuesta recibida.

El CDR no reemplaza al comprobante electrónico ni al PDF. Para tener un registro completo, relaciona los tres archivos con el RUC de la empresa emisora, el tipo de documento, la serie y el número.

## Qué estados puede tener un comprobante

El estado informa qué ocurrió durante el procesamiento del comprobante. En SUNAT API, el resultado se encuentra en `payload.estado`. No conviene decidir si una venta es válida solo porque la solicitud HTTP terminó correctamente: debes leer el estado devuelto por la API.

### ACEPTADO

`ACEPTADO` indica que el comprobante fue aceptado por SUNAT. Conserva el CDR como constancia de la respuesta y relaciona el XML, el PDF y los datos de la venta en tu sistema.

La respuesta puede incluir una estructura como esta:

```json
{
  "success": true,
  "message": "El comprobante fue enviado y aceptado por SUNAT.",
  "payload": {
    "estado": "ACEPTADO",
    "hash": "pFKddbDnm4oRDxNNyTT3VXLXzkOOHkZVIVgr8RV2JVY=",
    "xml": "URL devuelta por SUNAT API",
    "cdr": "URL devuelta por SUNAT API",
    "pdf": {
      "ticket": "URL devuelta por SUNAT API",
      "a4": "URL devuelta por SUNAT API"
    }
  }
}
```

La respuesta real entrega las URL correspondientes a los archivos. Tu integración debe guardar esos valores y descargarlos según el flujo documental de tu sistema.

### RECHAZADO

`RECHAZADO` indica que SUNAT no aceptó el comprobante. Antes de continuar con el flujo comercial, revisa el contenido del CDR y los mensajes devueltos para identificar el dato o la validación que requiere corrección.

El problema puede estar relacionado con información del cliente, numeración, importes, códigos de catálogo o reglas aplicables al tipo de operación. No vuelvas a emitir automáticamente sin revisar primero la respuesta y evitar duplicidades.

### Observaciones

La respuesta puede incluir información adicional u observaciones. Revisa siempre el estado principal y los mensajes asociados. No bases toda la lógica de tu integración únicamente en el texto de `message`, porque ese texto está pensado para describir la respuesta de forma general.

La interpretación tributaria de un estado o de una observación depende del caso. Si tienes dudas sobre el tratamiento de un comprobante, verifica la información oficial de SUNAT o consulta a un profesional contable.

## Por qué debes guardar el CDR

Guardar el CDR te permite conservar evidencia de la respuesta recibida durante el envío del comprobante. También facilita revisar errores, atender consultas de clientes y reconstruir una operación cuando necesitas volver a mostrar sus documentos.

Por cada comprobante, almacena como mínimo:

- RUC de la empresa emisora.
- Tipo de documento, serie y número.
- Estado devuelto en `payload.estado`.
- XML firmado.
- CDR.
- PDF A4 o ticket, según corresponda.
- Fecha y hora del envío.
- Identificador interno de la venta.

Las URL que devuelve la API permiten acceder a los archivos, pero no conviene depender únicamente de mostrar el enlace en pantalla. Descarga y guarda los archivos en tu sistema documental o repositorio, con controles de acceso y copias de seguridad.

El plazo y las obligaciones concretas de conservación dependen de la situación tributaria de cada empresa y de la normativa vigente. Verifica esos requisitos en SUNAT o con tu asesor contable; esta guía se concentra en el flujo técnico del CDR.

## Cómo obtener el CDR con SUNAT API

SUNAT API usa `POST /v1/sunat/documents` para emitir facturas, boletas, notas de crédito y notas de débito. La autenticación se realiza con la cabecera `x-api-key` y la URL base es `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`.

### 1. Emite el comprobante

Este ejemplo emite una boleta. Usa una API key almacenada en la variable de entorno `$MATHYU_API_KEY`:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"boleta","serie":"B001","cliente_tipo_de_documento":"1","cliente_numero_de_documento":"75413811","cliente_denominacion":"NOMBRE DEL CLIENTE","items":[{"descripcion":"Polo","cantidad":"2","valor_unitario":"42.372881"}],"total":"100.00"}'
```

La respuesta contiene `success`, `message` y `payload`. En `payload` encontrarás el estado y, cuando estén disponibles, los enlaces al XML, al CDR y a los PDF.

Si tu cuenta tiene más de una empresa emisora, indica la empresa correspondiente con la cabecera `x-ruc`. Para reintentos, la API también admite la cabecera `Idempotency-Key`; conserva la clave usada por tu sistema.

### 2. Guarda el estado y los enlaces

Procesa la respuesta y guarda los campos que relacionan el comprobante con sus archivos:

```javascript
const respuesta = await fetch(
  "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents",
  {
    method: "POST",
    headers: {
      "x-api-key": process.env.MATHYU_API_KEY,
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
  }
);

const datos = await respuesta.json();
const comprobante = datos.payload;

console.log({
  estado: comprobante.estado,
  xml: comprobante.xml,
  cdr: comprobante.cdr,
  pdfA4: comprobante.pdf?.a4,
  pdfTicket: comprobante.pdf?.ticket
});
```

En una integración real, valida que `payload` exista y que los campos tengan el formato esperado antes de almacenarlos. Si el resultado es `RECHAZADO`, conserva el CDR y los mensajes antes de corregir los datos.

### 3. Consulta el estado posteriormente

Si necesitas recuperar la información de un comprobante ya emitido, usa `POST /v1/sunat/status`. Este endpoint permite consultar el estado, el XML, el CDR y el PDF. Los identificadores y parámetros exactos de la solicitud deben implementarse según la [documentación](/docs).

La consulta de estado no crea un comprobante nuevo. Úsala cuando tu sistema no recibió la respuesta completa, cuando necesitas volver a mostrar los archivos o cuando quieres sincronizar el estado con tu registro interno.

## Flujo recomendado para una tienda online

1. Registra la venta y genera una clave interna para identificarla.
2. Envía el comprobante a `POST /v1/sunat/documents`.
3. Lee `payload.estado` y no solo el código o resultado HTTP.
4. Guarda el XML, el CDR y el PDF devueltos por la respuesta.
5. Si el estado es `ACEPTADO`, relaciona los archivos con la orden y entrega al cliente el PDF que corresponda.
6. Si el estado es `RECHAZADO` o contiene mensajes de validación, detén el flujo automático y revisa el CDR.
7. Si no guardaste la respuesta original, consulta el comprobante con `POST /v1/sunat/status`.

Puedes revisar los campos de emisión en la [documentación](/docs) y los códigos usados por la API en los [catálogos de SUNAT](/catalogos). Los planes y las cuotas mensuales están disponibles en [precios](/pricing).

## Errores comunes al trabajar con el CDR

### Guardar solo el PDF

El PDF facilita la lectura, pero no sustituye al XML ni al CDR. Guarda los archivos que devuelve la respuesta de la API.

### Confundir una solicitud exitosa con una aceptación

Que tu aplicación reciba una respuesta HTTP no significa por sí solo que SUNAT haya aceptado el comprobante. Lee `payload.estado` y conserva el CDR.

### Ignorar el CDR de un rechazo

El CDR contiene la respuesta que debes revisar para corregir el problema. Conserva el archivo original antes de volver a emitir.

### Reintentar sin controlar duplicados

Si tu aplicación pierde la respuesta después del envío, evita crear otro comprobante sin revisar primero el resultado. Usa una `Idempotency-Key` cuando reintentes y conserva esa clave en tu registro.

## Preguntas frecuentes

### ¿El CDR es lo mismo que la factura electrónica?

No. El XML firmado representa el comprobante y el CDR representa la respuesta de SUNAT. El PDF es una representación visual adicional.

### ¿Qué hago si el CDR indica rechazo?

Revisa el estado, el contenido del CDR y los mensajes de la respuesta. Corrige el dato correspondiente antes de continuar con tu flujo de emisión.

### ¿SUNAT API devuelve el CDR al emitir?

Sí. La respuesta de emisión incluye el estado y los enlaces al XML, al CDR y a los PDF disponibles.

### ¿Puedo consultar el CDR después de emitir?

Sí. Usa `POST /v1/sunat/status` para consultar el estado, el XML, el CDR y el PDF. Revisa la [documentación](/docs) para conocer los datos de la solicitud.

### ¿Debo guardar el CDR si ya tengo el PDF?

Sí. El PDF facilita la lectura, pero no reemplaza la constancia de recepción ni el XML firmado.
