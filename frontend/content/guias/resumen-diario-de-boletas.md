---
title: "Resumen diario de boletas SUNAT: cómo enviarlo por API"
description: "Resumen diario de boletas SUNAT: aprende cuándo usarlo, cómo informar boletas en lote y cómo hacerlo con /daily-summary."
site: "sunat"
date: "2026-11-24"
updated: "2026-11-24"
keywords: ["resumen diario de boletas SUNAT","enviar boletas en resumen diario","SUNAT daily summary API","enviar_en_resumen SUNAT","API boletas SUNAT"]
draft: false
---

El resumen diario de boletas SUNAT permite informar varias boletas y sus notas en una sola comunicación, en lugar de enviarlas una por una en el momento de emitirlas. Con SUNAT API, marcas cada boleta con `enviar_en_resumen: true` y después la informas mediante `POST /v1/sunat/daily-summary`.

Conviene usarlo cuando tu tienda genera varias boletas durante una operación diaria y puedes agruparlas para informarlas después. Si necesitas que cada boleta se envíe inmediatamente, no la marques para resumen: emítela con `POST /v1/sunat/documents` sin ese campo o con el valor `false`.

## Qué es el resumen diario de boletas

El resumen diario es una comunicación para informar boletas y sus notas de crédito o débito. En la API de Mathyu's Solutions, el endpoint es:

```text
POST https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/daily-summary
```

La comunicación recibe una lista de documentos afectados. Cada elemento indica el tipo de comprobante, su serie, número y la acción que corresponde:

- `adicionar`: informa una boleta o nota en el resumen.
- `modificar`: modifica la información de un documento que ya fue informado.
- `anular`: anula un documento informado.

El endpoint acepta hasta 500 documentos en una solicitud. Los documentos permitidos son `boleta`, `nota_credito` y `nota_debito`, y la serie debe empezar con `B`.

Un detalle importante: si no envías `accion_resumen`, la API toma `anular` como acción predeterminada. Para informar una boleta nueva, escribe siempre `"accion_resumen": "adicionar"` de forma explícita.

El resumen diario no reemplaza la emisión de la boleta en tu sistema. Primero debes generar la boleta con sus datos comerciales y guardar su serie y número. Luego la incluyes en el resumen con la acción que corresponda.

## Cuándo conviene usarlo

Usar un resumen puede simplificar la integración cuando tu flujo no necesita enviar cada boleta inmediatamente. Por ejemplo, puede ser útil si tu tienda registra pedidos durante el día y ejecuta un proceso de cierre que agrupa las boletas pendientes.

También puede convenirte cuando tienes un proceso por lotes: guardas los comprobantes emitidos durante la operación, revisas que sus datos estén completos y después envías una sola comunicación con varios documentos.

No lo uses como una solución automática para cualquier venta. Si tu operación necesita obtener pronto el resultado del envío de cada boleta, es más claro emitirla directamente con `POST /v1/sunat/documents` y revisar el estado que devuelve la API.

La decisión depende de tu flujo técnico y operativo:

| Situación | Opción recomendada |
|---|---|
| Necesitas enviar cada boleta inmediatamente | Emitir con `/documents` sin `enviar_en_resumen` |
| Generas boletas durante el día y las procesas por lotes | Usar `enviar_en_resumen: true` y luego `/daily-summary` |
| Debes informar una boleta ya registrada en el resumen | Usar `accion_resumen: "adicionar"` |
| Debes corregir un documento ya informado | Usar `accion_resumen: "modificar"` |
| Debes anular una boleta aceptada | Usar `accion_resumen: "anular"` |

Este criterio técnico no sustituye la revisión de las obligaciones aplicables a tu negocio. Si tienes dudas sobre cuándo corresponde un resumen o cómo debe declararse una operación, verifica la información vigente directamente en SUNAT.

## Cómo marcar una boleta para enviarla en el resumen

El campo `enviar_en_resumen` pertenece al JSON de `POST /v1/sunat/documents`. Debe tener el valor `true` cuando no quieres que la boleta se envíe en ese momento y planeas informarla después en un resumen diario.

Este es un ejemplo completo de emisión de una boleta para procesarla posteriormente:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"boleta","serie":"B001","cliente_tipo_de_documento":"1","cliente_numero_de_documento":"75413811","cliente_denominacion":"NOMBRE DEL CLIENTE","items":[{"descripcion":"Polo","cantidad":"2","valor_unitario":"42.372881"}],"total":"100.00","enviar_en_resumen":true}'
```

La variable `$MATHYU_API_KEY` debe contener la API key que creaste en tu panel. La cabecera `x-api-key` es obligatoria. Si tu cuenta tiene más de una empresa emisora, agrega también `x-ruc` con el RUC que corresponde.

En este ejemplo, la boleta usa la serie `B001`, un cliente identificado con DNI y un producto cuyo total es S/ 100.00. La API calcula el comprobante con los campos enviados y la boleta queda destinada al flujo de resumen en lugar de enviarse en ese momento.

Guarda en tu base de datos, como mínimo, el tipo de documento, la serie y el número que usarás después en `documentos_afectados`. Si omites el número al emitir, la API toma el siguiente correlativo; por eso debes conservar el número que finalmente corresponda en la respuesta de emisión.

## Cómo enviar el resumen diario

Cuando tengas las boletas que vas a informar, construye un arreglo `documentos_afectados`. Para una boleta nueva, usa `adicionar`.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/daily-summary" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documentos_afectados":[{"documento":"boleta","serie":"B001","numero":45,"accion_resumen":"adicionar"},{"documento":"boleta","serie":"B001","numero":46,"accion_resumen":"adicionar"},{"documento":"nota_credito","serie":"B001","numero":12,"accion_resumen":"adicionar"}]}'
```

El ejemplo informa dos boletas y una nota de crédito en una sola solicitud. El número es numérico y la serie debe corresponder al comprobante que vas a informar. Puedes incluir hasta 500 documentos en el arreglo.

La respuesta de la API mantiene la estructura general de Mathyu's Solutions: `success`, `message` y `payload`. Si el envío todavía está pendiente de una respuesta de SUNAT, el estado puede aparecer como `PENDIENTE`; también puede resultar `ACEPTADO` o `RECHAZADO`. Revisa el resultado y conserva la respuesta junto con los identificadores del resumen.

## Modificar o anular una boleta

Si necesitas corregir la información de un documento que ya informaste, inclúyelo con `accion_resumen: "modificar"`. La solicitud debe identificar la boleta o nota con su documento, serie y número.

Para anular un documento informado, usa `accion_resumen: "anular"`. La boleta debe estar `ACEPTADA` para poder anularla mediante el resumen diario.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/daily-summary" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documentos_afectados":[{"documento":"boleta","serie":"B001","numero":45,"accion_resumen":"anular"}]}'
```

No confundas este endpoint con `POST /v1/sunat/voided`. `daily-summary` trabaja con boletas y sus notas dentro del resumen diario. `voided` comunica la baja de facturas o sus notas, y puede recibir hasta 100 documentos afectados. Para saber qué operación corresponde, identifica primero el tipo de comprobante y el estado que tiene en SUNAT.

## Cómo consultar el estado del resumen

Puedes consultar el estado, XML, CDR y PDF de un resumen que ya emitiste con `POST /v1/sunat/status`. Para un resumen diario, el campo `documento` es `resumen_diario` y la serie usa el formato `RC-AAAAMMDD`.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/status" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"documento":"resumen_diario","serie":"RC-20261124","numero":1}'
```

Usa la serie y el número reales que correspondan a tu resumen. No reemplaces esos valores por los de otro día o de otra comunicación. Si tienes varias empresas en la cuenta, envía `x-ruc` para consultar la empresa correcta.

La API puede devolver enlaces al XML, CDR y PDF en el `payload`. Conserva esos archivos y el estado final como parte del registro de tu operación. Si el estado es `PENDIENTE`, la API vuelve a consultar automáticamente; revisa nuevamente hasta obtener el resultado final según tu proceso.

## Errores habituales

El error más común es omitir `accion_resumen` al informar una boleta. Como el valor predeterminado es `anular`, una solicitud sin ese campo no expresa la intención de adicionar el documento. Inclúyelo siempre.

Otro problema es enviar una serie que no empieza con `B` o superar el límite de 500 documentos. Valida ambos casos antes de construir la solicitud.

También evita mezclar el número de la boleta con el número del resumen. La boleta se identifica con su propia serie y número; el resumen tiene su identificación independiente, que luego puedes consultar con `resumen_diario` y una serie `RC-AAAAMMDD`.

La API devuelve errores con códigos HTTP: 400 para datos inválidos, 401 para una key inválida, 403 para una key de otra API, 404 cuando no encuentra el recurso y 429 cuando se agotó la cuota. Registra el código, `message` y el cuerpo de respuesta para investigar el problema sin duplicar operaciones.

## Preguntas frecuentes

### ¿El resumen diario sirve para facturas?

No. El endpoint `/daily-summary` está destinado a boletas y sus notas de crédito o débito. Las facturas se emiten con `/documents` y sus bajas se comunican con `/voided`.

### ¿Qué pasa si no envío `accion_resumen`?

La API toma `anular` como acción predeterminada. Para informar una boleta nueva debes enviar explícitamente `"accion_resumen": "adicionar"`.

### ¿Cuántas boletas puedo incluir?

El endpoint acepta hasta 500 documentos afectados en una solicitud.

### ¿Puedo enviar una boleta inmediatamente y también incluirla en un resumen?

No diseñes el flujo para hacer ambas cosas con el mismo comprobante. Define si la boleta se envía en el momento o si se marca con `enviar_en_resumen: true` para informarla después.

### ¿Dónde consulto el XML y el CDR del resumen?

Usa `POST /v1/sunat/status` con `documento: "resumen_diario"`, la serie `RC-AAAAMMDD` y el número del resumen.
