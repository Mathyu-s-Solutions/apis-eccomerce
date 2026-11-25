---
title: "Cómo anular una factura electrónica: baja o nota de crédito"
description: "Cómo anular una factura electrónica con comunicación de baja o nota de crédito: elige el mecanismo correcto y envía la solicitud a SUNAT desde una API."
site: "sunat"
date: "2026-11-25"
updated: "2026-11-25"
keywords: ["cómo anular una factura electrónica","comunicación de baja SUNAT","nota de crédito motivo 01","anular factura SUNAT por API","diferencia entre baja y nota de crédito"]
draft: false
---

Para anular una factura electrónica puedes enviar una comunicación de baja o emitir una nota de crédito con el motivo 01, «Anulación de la operación». No son la misma acción: la baja comunica que el comprobante debe quedar sin efecto; la nota de crédito es un nuevo comprobante que referencia a la factura. Elige según lo ocurrido y verifica las reglas vigentes de SUNAT para tu caso.

Con SUNAT API puedes enviar ambas solicitudes: `POST /v1/sunat/voided` para la comunicación de baja y `POST /v1/sunat/documents` para emitir la nota de crédito. Antes de actuar, confirma que la factura esté aceptada y revisa sus datos.

## Diferencia entre comunicación de baja y nota de crédito

La comunicación de baja no crea una nota de crédito. Envía a SUNAT la solicitud de dar de baja una factura o una nota que ya fue aceptada. La API solo permite dar de baja comprobantes en estado `ACEPTADO`.

La nota de crédito sí es otro comprobante electrónico. Debe señalar cuál es el documento afectado y llevar un motivo del catálogo 09. El código `01` corresponde a la anulación de la operación. Por eso, esta opción sirve cuando necesitas dejar constancia de la anulación mediante un documento vinculado a la factura original.

| Situación | Opción que debes evaluar | Qué hace la API |
|---|---|---|
| La factura aceptada debe darse de baja como comprobante | Comunicación de baja (`/voided`) | Comunica la baja de la factura a SUNAT |
| Se anuló la operación y corresponde emitir un documento relacionado | Nota de crédito con código de motivo `01` (`/documents`) | Emite una nota que referencia a la factura |
| La venta ocurrió, pero necesitas corregir un dato o importe | No asumas que corresponde el motivo `01` | Revisa el motivo aplicable en el catálogo 09 y las reglas de SUNAT |

No decidas solo porque la factura tiene un error. El momento de la anulación y lo que pasó con la operación pueden influir en el tratamiento. La documentación de la API describe cómo enviar cada solicitud, pero no reemplaza la revisión tributaria del caso. Si tienes dudas sobre cuál corresponde, consulta la información oficial en [SUNAT](https://www.sunat.gob.pe) antes de emitir.

## Antes de anular, confirma el estado

Consulta primero la factura con `POST /v1/sunat/status`. La respuesta de SUNAT puede aparecer como `PENDIENTE`, `ACEPTADO`, `RECHAZADO` o `ANULADO`. Si aún está `PENDIENTE`, espera la respuesta antes de intentar darla de baja. Si ya está `ANULADO`, no envíes otra solicitud de baja para el mismo comprobante.

Necesitas una API key creada en tu panel y enviarla en la cabecera `x-api-key`. La URL base de SUNAT API es `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`. Si tu cuenta tiene más de una empresa emisora, incluye también la cabecera `x-ruc` con el RUC correspondiente. La API es un servicio de Mathyu's Solutions; no es la SUNAT ni está afiliada al Estado peruano.

Este ejemplo consulta el estado de una factura:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/status" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"factura","serie":"F001","numero":123}'
```

Usa la serie y el número que aparecen en tu comprobante. En la respuesta, confirma el valor de `payload.estado` antes de seguir.

## Opción 1: enviar una comunicación de baja

Usa `POST /v1/sunat/voided` para comunicar la baja de una factura aceptada. Puedes indicar un motivo propio; si no lo envías, la API usa `ANULACIÓN DE OPERACIÓN`. Para una factura emitida con esta API no hace falta incluir su fecha de emisión. Si el comprobante se emitió fuera de esta API, incluye `fecha_de_emision` dentro del documento afectado.

Ejemplo de baja para una factura:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/voided" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"motivo":"ERROR EN LOS DATOS DEL CLIENTE","documento_afectado":{"documento":"factura","serie":"F001","numero":123}}'
```

El motivo del ejemplo es descriptivo; escribe uno que refleje lo ocurrido. También puedes enviar varios documentos en `documentos_afectados`, hasta 100 por solicitud. La API acepta un solo documento afectado o la lista, no necesitas enviar ambos formatos en la misma petición.

Después de enviar la solicitud, revisa la respuesta y consulta el estado del comprobante. Una solicitud enviada no es lo mismo que confirmar que el documento quedó anulado. La API devuelve respuestas con `success`, `message` y `payload`; si recibes un error, revisa el código HTTP y el mensaje en lugar de repetir la petición a ciegas.

## Opción 2: emitir una nota de crédito con motivo 01

Si corresponde documentar la anulación de la operación con una nota de crédito, envíala a `POST /v1/sunat/documents`. Incluye `documento: "nota_credito"`, el código de motivo `01`, una descripción del motivo y `documento_afectado` con los datos de la factura. La nota también requiere sus datos de emisión, cliente e ítems. Usa los datos que correspondan a tu operación; el siguiente ejemplo muestra un cuerpo completo con valores de muestra.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"nota_credito","serie":"FC01","fecha_de_emision":"2026-11-25","nota_credito_codigo_tipo":"01","nota_credito_motivo":"Anulación de la operación","documento_afectado":{"documento":"factura","serie":"F001","numero":123},"cliente_tipo_de_documento":"6","cliente_numero_de_documento":"20123456789","cliente_denominacion":"MI EMPRESA S.A.C.","items":[{"descripcion":"Polo","cantidad":"1","valor_unitario":"100.00"}],"total":"118.00"}'
```

El ejemplo usa una nota por S/ 118.00: un ítem de S/ 100.00 antes del IGV, con la tasa predeterminada indicada por la API. Cambia la serie, los datos del cliente, el ítem, los importes y la referencia para que coincidan con el comprobante y la operación reales. No envíes importes ficticios en producción. Si tienes varias empresas en la cuenta, agrega `x-ruc` para seleccionar la emisora.

La respuesta de emisión incluye el estado y, según la respuesta, enlaces al XML, CDR y PDF. Comprueba el resultado: si está `PENDIENTE`, la API vuelve a consultar automáticamente; espera a que se actualice para confirmar la respuesta de SUNAT. Conserva la nota y su CDR junto con la factura relacionada.

## Si el comprobante es una boleta

No uses `/voided` para una boleta: ese endpoint de la API recibe facturas y notas. Para anular o informar boletas y sus notas, el producto ofrece `POST /v1/sunat/daily-summary`, que permite indicar `accion_resumen: "anular"`. La boleta debe estar aceptada para anularse. Revisa la [guía del resumen diario de boletas](/guias/resumen-diario-de-boletas) y las condiciones vigentes de SUNAT antes de enviarlo.

## Errores que conviene evitar

- Intentar dar de baja una factura que todavía está `PENDIENTE`, fue `RECHAZADA` o ya figura `ANULADA`. Confirma primero el estado.
- Confundir el envío de la solicitud con su resultado final. Revisa la respuesta y el estado después de la operación.
- Usar motivo `01` para cualquier corrección. El código significa anulación de la operación; consulta el [catálogo de motivos de nota de crédito](/catalogos/09-tipo-de-nota-de-credito) si el caso es otro.
- Referenciar otra serie o número, o consignar datos del cliente o importes que no correspondan. Una nota debe identificar correctamente el comprobante afectado.
- Aplicar el procedimiento de factura a una boleta. Para boletas, revisa el resumen diario.

Consulta la [documentación de SUNAT API](/docs) para revisar las rutas y los campos disponibles. Si necesitas confirmar qué tratamiento aplica a tu operación o dentro de qué plazo puedes usar cada mecanismo, verifica la información actual en SUNAT o con tu asesor contable; esta guía no fija plazos ni reemplaza esa validación.

## Preguntas frecuentes

### ¿La comunicación de baja y la nota de crédito son lo mismo?

No. La baja comunica que una factura o nota aceptada debe quedar sin efecto. La nota de crédito es un comprobante nuevo que referencia al documento afectado.

### ¿Qué significa el motivo 01 de una nota de crédito?

Es el código del catálogo 09 para «Anulación de la operación». Úsalo cuando ese sea el motivo que corresponde; para otros casos, revisa el catálogo.

### ¿Puedo dar de baja una factura pendiente?

La API solo da de baja comprobantes aceptados. Consulta el estado y espera la respuesta de SUNAT si figura `PENDIENTE`.

### ¿Cómo anulo una boleta con esta API?

La API gestiona la anulación de boletas mediante `POST /v1/sunat/daily-summary`, con la acción `anular`. La boleta debe estar aceptada.
