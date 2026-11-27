---
title: "Guía de remisión electrónica remitente API: cómo emitir"
description: "Guía de remisión electrónica remitente por API: identifica quién emite, reúne motivo, modalidad y direcciones, y envía la guía con /dispatches."
site: "sunat"
date: "2026-11-27"
updated: "2026-11-27"
keywords: ["guía de remisión electrónica remitente API","emitir guía de remisión por API","guía de remisión transportista SUNAT","motivos de traslado SUNAT","API guías de remisión Perú"]
draft: false
---

La guía de remisión electrónica sustenta el traslado de bienes y permite registrar quién los remite, cómo se transportan y desde dónde salen y adónde llegan. Con SUNAT API puedes enviar una guía de remitente o de transportista mediante `POST /v1/sunat/dispatches`; antes de hacerlo, define el tipo de guía y prepara los datos del traslado.

## Guía de remitente o de transportista: cuál corresponde

La guía de remisión de remitente identifica a quien remite los bienes y da información sobre el movimiento. La guía de remisión de transportista corresponde al traslado realizado por un transportista. No son dos nombres para el mismo documento: la modalidad del transporte y quién asume el traslado ayudan a determinar cuál corresponde.

Como orientación general, en un traslado con transporte privado se evalúa la guía de remitente; en el transporte público puede corresponder una guía de remitente y también una de transportista. La situación concreta depende de quién remite los bienes, quién presta el servicio y de las reglas y excepciones vigentes. No deduzcas el tipo de guía solo por tener un vehículo propio o contratar un courier: confirma el caso en la información oficial de [SUNAT](https://www.sunat.gob.pe).

| Situación general | Guía que debes evaluar | Qué revisar |
| --- | --- | --- |
| La empresa remite bienes en transporte privado | Remitente | Quién realiza el traslado, datos de conductores y vehículos y motivo declarado. |
| Un tercero presta el servicio de transporte público | Transportista | Datos del transportista y modalidad; verifica si también corresponde una guía de remitente. |
| No está claro quién debe emitir o si aplica una excepción | Depende del caso | Confirma el supuesto en SUNAT antes de emitir. |

Esta tabla es una orientación, no reemplaza la revisión del caso ni de las disposiciones vigentes. Planifica la emisión antes de que empiece el traslado y verifica en SUNAT el momento aplicable y las excepciones; no asumas que podrás completar el documento después.

## Datos que debes preparar

La API recibe campos para describir la guía y el traslado. El producto documenta los siguientes; consulta la [documentación](/docs) para confirmar cuáles corresponden como obligatorios a cada tipo de guía y cómo se representa cada dato en el JSON.

### 1. Tipo de documento y motivo

En `documento` indica `guia_remision_remitente` o `guia_remision_transportista`. Para una guía de remitente, la serie empieza con `T`. El campo `motivo_de_traslado` usa el catálogo 20; `motivo_de_traslado_descripcion` permite consignar una descripción. El motivo debe reflejar el movimiento real, no elegirse solo para completar el envío.

Los códigos admitidos son los del catálogo aplicable. Revísalos en [motivos de traslado](/catalogos/20-motivo-de-traslado) o en los [catálogos de SUNAT](/catalogos). No uses un código de memoria ni reutilices uno de una operación diferente.

### 2. Modalidad de transporte

`modalidad_de_transporte` distingue transporte público (`01`) de privado (`02`). La modalidad debe corresponder al servicio que se realiza; no determina por sí sola el tipo de guía. Puedes consultar el [catálogo de modalidad de transporte](/catalogos/18-modalidad-de-transporte) antes de integrar la selección en tu sistema.

Para transporte privado, los campos de la API incluyen `conductores[]` y `vehiculos[]`. La información del conductor y del vehículo debe coincidir con la operación. No envíes datos ficticios para hacer pasar una validación: confirma en la documentación el formato y los datos requeridos para cada arreglo.

### 3. Destinatario y puntos del traslado

Prepara `destinatario_tipo_de_documento` y `destinatario_numero_de_documento` para identificar al destinatario. Define el punto de partida y el de llegada con sus campos de ubigeo y dirección: `punto_de_partida_ubigeo`, `punto_de_partida_direccion`, `punto_de_llegada_ubigeo` y `punto_de_llegada_direccion`.

Usa direcciones que describan los lugares efectivos del traslado. Comprueba los ubigeos con la referencia que use tu empresa y valida que correspondan a esos puntos. Si el recorrido o la operación requieren información adicional según SUNAT, consúltala en la fuente oficial: la lista de campos del producto no detalla todos los supuestos normativos.

### 4. Peso, bultos e ítems

La lista de campos incluye `peso_bruto_total`, `peso_bruto_unidad_de_medida`, `numero_de_bultos` e `items[]`. La unidad de peso indicada para `peso_bruto_unidad_de_medida` puede ser `KGM` o `TNE`. Cada ítem contempla `descripcion`, `cantidad` y `unidad_de_medida`.

Registra cantidades, peso y descripción de acuerdo con los bienes que realmente se trasladan. No inventes una unidad o un código si no está confirmado; para las unidades de medida disponibles, consulta el [catálogo de unidades](/catalogos/03-unidades-de-medida). La API documenta estos campos, pero la información del producto no especifica todas las validaciones ni un cuerpo JSON completo de ejemplo para `dispatches`.

## Cómo emitirla con SUNAT API

El endpoint es `POST https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/dispatches`. Envía la API key en el header `x-api-key` y el contenido como JSON. En el cuerpo, incluye el tipo de documento y los datos aplicables que preparaste: motivo, modalidad, destinatario, origen, destino, peso, bultos, conductores, vehículos e ítems.

Antes de implementar el envío, revisa en [documentación](/docs) el esquema vigente de la ruta, los campos requeridos para cada tipo de guía y el formato de los arreglos. Los datos del producto no incluyen un cuerpo JSON exacto ni los valores completos del catálogo 20; por eso, no conviene copiar un ejemplo inventado como si fuera una solicitud lista para producción. Obtén los códigos correctos de los catálogos y construye el cuerpo con los datos reales de tu operación.

En producción, las guías usan las credenciales de API de SUNAT de tu empresa. La información del producto señala que, para pasar una empresa a producción, se configura `ambiente` como producción y se registran credenciales SOL, certificado y clave del certificado; para las guías se requieren además `api_client_id` y `api_client_secret`. Gestiona estas credenciales en la configuración de tu empresa y no las incluyas en código público ni las compartas en el navegador.

La empresa puede empezar en beta y emitir pruebas contra SUNAT beta sin certificado ni cuota, según la información del producto. Prueba primero con los datos de tu empresa de prueba y revisa la respuesta antes de integrar el proceso de despacho. La API de Mathyu's Solutions es independiente: no es la SUNAT ni afirma estar afiliada al Estado peruano.

## Revisa la respuesta y conserva el resultado

Las respuestas de la API tienen la forma `success`, `message` y `payload`. Al emitir, el payload incluye estado, hash y enlaces a XML, CDR y PDF. Comprueba el estado devuelto y guarda los datos de la respuesta asociados a la operación; no marques un traslado como correctamente emitido basándote solo en que tu sistema recibió una respuesta HTTP.

Si hay un error, revisa el código HTTP y el mensaje. La API documenta, entre otros, `400` para datos inválidos, `401` para una key inválida, `403` para una key de otra API, `404` para un recurso no encontrado y `429` cuando se agota la cuota. Corrige el dato indicado o revisa la configuración antes de volver a enviar, para evitar crear registros duplicados desde tu propio sistema.

Para consultar el estado y recuperar XML, CDR o PDF de un documento ya emitido, la API documenta `POST /v1/sunat/status`. El cuerpo identifica el documento, la serie y el número. Confirma en la [documentación](/docs) el formato exacto que debes enviar para una guía; no uses un ejemplo de factura como si definiera todos los campos de consulta de una guía.

## Errores comunes al integrar guías

- **Confundir motivo con modalidad:** el motivo explica por qué se trasladan los bienes; la modalidad indica si el transporte es público o privado. Son campos distintos.
- **Elegir la guía solo por el tipo de vehículo:** el tipo de guía depende del contexto del traslado y de quién remite o transporta los bienes. Verifica el caso en SUNAT.
- **Enviar direcciones sin revisar los ubigeos:** origen y llegada deben representar los puntos reales y coherentes del movimiento.
- **Inventar datos para completar campos:** prepara la información real y confirma las reglas del esquema antes de enviar.
- **Tratar beta como producción:** las pruebas en beta no sustituyen la configuración de credenciales necesaria para emitir en producción.

La API es útil si quieres conectar la emisión con el sistema de pedidos o despacho de tu tienda. Separa la recopilación de datos del envío: primero valida destinatario, bienes y ruta; luego arma la solicitud según el tipo de guía y, al final, registra la respuesta y sus enlaces.

## Preguntas frecuentes

### ¿La guía de remitente y la de transportista son intercambiables?

No. Identifican roles diferentes en el traslado. Evalúa quién remite los bienes, quién presta el transporte y cuál es la modalidad; confirma el supuesto en SUNAT.

### ¿Qué código debo enviar como motivo de traslado?

El que corresponda al motivo real según el catálogo 20. Consulta [motivos de traslado](/catalogos/20-motivo-de-traslado); no es posible recomendar un código concreto sin conocer la operación.

### ¿Puedo emitir una guía de remitente con transporte privado?

La API admite guía de remitente para transporte público o privado y documenta modalidad `02` para transporte privado. Confirma en SUNAT qué documento corresponde a tu caso y qué información debes consignar.

### ¿Qué credenciales necesito para emitir guías en producción?

Según los datos del producto, las guías de producción usan credenciales de API de SUNAT de tu empresa, además de la configuración de producción y credenciales requeridas para la empresa. Revisa los requisitos vigentes en [documentación](/docs).

### ¿La respuesta incluye el CDR y el PDF?

La información del producto indica que la respuesta de emisión incluye enlaces a XML, CDR y PDF. Verifica el estado en el payload y conserva los enlaces y datos de la respuesta.
