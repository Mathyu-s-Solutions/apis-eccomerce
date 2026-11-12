---
title: "API facturación electrónica Perú: emite comprobantes"
description: "Conoce cómo funciona una API de facturación electrónica en Perú y emite boletas y facturas con XML, CDR y PDF desde tu sistema."
site: "sunat"
date: "2026-11-08"
updated: "2026-11-08"
keywords: ["API facturación electrónica Perú","API SUNAT Perú","emitir factura electrónica por API","boleta electrónica con API","XML CDR PDF SUNAT"]
draft: false
---

Una API de facturación electrónica te permite enviar los datos de una venta y recibir el resultado y estado del comprobante, junto con los enlaces disponibles al XML, CDR y PDF. Así puedes integrar tu ecommerce o sistema de ventas con SUNAT sin construir y firmar manualmente cada XML UBL 2.1.

Con SUNAT API puedes registrar tu empresa en beta, emitir una boleta o factura, consultar el estado y acceder a los archivos relacionados. Es un servicio de Mathyu's Solutions sobre los servicios oficiales de SUNAT; no es la SUNAT ni una entidad del Estado peruano.

## Qué es una API de facturación electrónica

Una API de facturación electrónica es una interfaz REST que conecta tu tienda online, ERP o sistema propio con un servicio de emisión. Tu aplicación envía un JSON con los datos del emisor, cliente, productos, impuestos y totales. La API procesa la solicitud y devuelve el resultado del comprobante, su estado y, cuando están disponibles, los enlaces al XML firmado, la constancia de recepción (CDR) y el PDF.

Tu sistema debe leer y manejar el estado devuelto por la API en cada emisión, en lugar de asumir que toda solicitud terminó correctamente.

### Qué resuelve frente a construir el XML

Emitir directamente desde tu sistema requiere más que registrar una venta. Debes preparar el XML UBL 2.1, calcular bases e IGV, aplicar descuentos, firmar el documento, administrar el certificado digital, enviarlo a SUNAT, interpretar el CDR y conservar los archivos.

También debes controlar series y correlativos, notas de crédito y débito, bajas, reintentos y comprobantes que se informan en un resumen diario. Una API concentra esa comunicación en endpoints HTTP y te permite trabajar con JSON.

| Opción | Qué debes implementar | Cuándo conviene |
|---|---|---|
| API de facturación | Integración HTTP, autenticación, validación de datos y manejo de estados | Cuando quieres emitir desde tu ecommerce sin mantener toda la capa técnica de facturación |
| Implementación propia | XML UBL 2.1, firma, certificado, envío, CDR, archivos y cambios regulatorios | Cuando cuentas con un equipo especializado y necesitas controlar todo el proceso |

Envía datos comerciales y tributarios correctos, incluida la afectación del IGV y la identificación del cliente.

SUNAT API usa el mismo JSON de entrada y respuesta que apisunat.pe. Si ya tienes una integración con ese servicio, los datos del producto indican que puedes migrar cambiando la URL y la API key.

## Cómo funciona SUNAT API

La URL base de la API es:

```text
https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat
```

Autentica cada solicitud con el header `x-api-key`. Crea la key desde tu panel y guárdala como secreto en el servidor, por ejemplo, en la variable de entorno `$MATHYU_API_KEY`.

Si tu cuenta tiene más de una empresa emisora, selecciona la empresa con la cabecera `x-ruc`. Para reintentar una operación sin duplicarla, puedes enviar una cabecera `Idempotency-Key` con el mismo valor del intento original.

## Emitir una boleta de punta a punta

### 1. Registra la empresa en beta

El registro inicial deja la empresa en beta. Puedes emitir contra SUNAT beta sin certificado ni cuota para probar la integración. Para pasar a producción, sube el certificado de tu empresa según el proceso disponible en el servicio.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/companies" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"ruc":"20123456789","razon_social":"MI EMPRESA S.A.C.","direccion":"AV. LOS OLIVOS 123","ubigeo":"150101"}'
```

Las credenciales de SUNAT de la empresa se almacenan cifradas y no se devuelven. También puedes administrar empresas desde el panel. Para consultar las empresas registradas y lo que les falta para producción, usa `GET /v1/sunat/companies`.

### 2. Emite la boleta

Usa `POST /v1/sunat/documents`. El campo `documento` debe ser `boleta` y la serie debe tener cuatro caracteres y comenzar con `B`. En el ejemplo, `valor_unitario` no incluye IGV; el porcentaje de IGV usado por defecto es 18.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: pedido-10045" \
  -d '{"documento":"boleta","serie":"B001","cliente_tipo_de_documento":"1","cliente_numero_de_documento":"75413811","cliente_denominacion":"NOMBRE DEL CLIENTE","items":[{"descripcion":"Polo","cantidad":"2","valor_unitario":"42.372881"}],"total":"100.00"}'
```

`numero` es opcional. Si no lo envías, la API toma el siguiente correlativo. `total` también es opcional; si lo envías, se compara con el total calculado con una tolerancia de un céntimo.

Si la boleta no debe enviarse inmediatamente, puedes incluir `enviar_en_resumen: true` y comunicarla después con `POST /v1/sunat/daily-summary`, de acuerdo con el flujo que corresponda a tu operación.

### 3. Lee el resultado y guarda los archivos

La respuesta de emisión devuelve el resultado del comprobante, su estado y los enlaces disponibles al XML firmado, CDR y PDF. Una respuesta aceptada puede tener una estructura como esta:

```json
{
  "success": true,
  "message": "El comprobante fue enviado y aceptado por SUNAT.",
  "payload": {
    "estado": "ACEPTADO",
    "hash": "pFKddbDnm4oRDxNNyTT3VXLXzkOOHkZVIVgr8RV2JVY=",
    "xml": "enlace devuelto por la API al XML firmado",
    "cdr": "enlace devuelto por la API al CDR",
    "pdf": {
      "ticket": "enlace devuelto por la API al PDF ticket",
      "a4": "enlace devuelto por la API al PDF A4"
    }
  }
}
```

Los valores de `xml`, `cdr` y `pdf` son enlaces devueltos en la respuesta. No construyas manualmente una URL de archivos ni uses una ruta no documentada. Guarda los enlaces o descarga los archivos desde tu backend, según cómo administres el historial de pedidos.

Para revisar posteriormente un comprobante, usa `POST /v1/sunat/status`. El endpoint es gratuito y devuelve el estado, XML, CDR y PDF del comprobante. Consulta la [documentación](/docs) para enviar los datos de identificación requeridos por ese endpoint.

## Emitir una factura electrónica

El flujo es el mismo, pero debes cambiar `documento` a `factura`, usar una serie de cuatro caracteres que empiece con `F` y enviar normalmente un cliente con tipo de documento `6` (RUC), salvo exportación.

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/documents" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: pedido-10046" \
  -d '{"documento":"factura","serie":"F001","cliente_tipo_de_documento":"6","cliente_numero_de_documento":"20100066603","cliente_denominacion":"CLIENTE EMPRESA S.A.C.","cliente_direccion":"JR. COMERCIO 456, LIMA","cliente_email":"compras@cliente.pe","items":[{"descripcion":"Servicio de integración","cantidad":"1","unidad_de_medida":"NIU","valor_unitario":"100.00"}],"moneda":"PEN","total":"118.00"}'
```

En este caso, el valor unitario es 100.00 sin IGV y el total enviado es 118.00. Antes de usar un ejemplo en producción, valida que los datos tributarios, la operación y la afectación del IGV correspondan a tu venta.

Una factura al crédito puede incluir `cuotas[]` con el importe y la fecha de pago. Para descuentos globales usa `descuentos[]`; para anticipos, `anticipos[]`. Las detracciones requieren los campos específicos del producto, incluido el tipo de operación correspondiente. Revisa los [catálogos de SUNAT](/catalogos) y los catálogos de [afectación del IGV](/catalogos/07-tipo-de-afectacion-del-igv), [tipo de operación](/catalogos/51-tipo-de-operacion) y [detracciones](/catalogos/54-bienes-y-servicios-sujetos-a-detraccion).

## Notas, bajas y consultas

Para emitir una nota de crédito o débito usa el mismo endpoint de documentos con `documento` igual a `nota_credito` o `nota_debito`. Debes enviar el código y motivo de la nota, además de `documento_afectado` con el tipo, serie y número del comprobante relacionado.

Las bajas de facturas o notas se comunican con `POST /v1/sunat/voided`. Para informar o anular boletas usa `POST /v1/sunat/daily-summary`. Los comprobantes emitidos se consultan con `GET /v1/sunat/documents`, que incluye filtros y paginación.

También puedes emitir una guía de remisión de remitente o transportista con `POST /v1/sunat/dispatches`. Para consultas, la API ofrece RUC, DNI, validez de comprobantes, reportes SIRE, tipo de cambio SBS y catálogos. La consulta de [tipo de cambio](/tipo-de-cambio) y los [catálogos](/catalogos) ayudan a preparar los valores aceptados por la API.

## Beta, producción y planes

La empresa empieza en beta y puede emitir contra SUNAT beta sin certificado ni cuota. Para producción, debes subir el certificado de tu empresa. El plan Prueba es gratuito, permite 20 comprobantes al mes e incluye pruebas ilimitadas en beta, PDF, XML, CDR y soporte por correo.

| Plan | Precio mensual | Límite mensual | Incluye |
|---|---:|---:|---|
| Prueba | Gratis | 20 | Emisión en beta, PDF, XML y CDR |
| Básico | S/ 20 | 1000 | Facturas, boletas, notas, bajas, guías, consultas RUC y DNI |
| Pro | S/ 59 | 5000 | Todo lo del Básico, validez de comprobantes y SIRE |
| Empresarial | S/ 149 | 20000 | Todo lo del Pro, integración a medida, soporte dedicado y SLA |

Revisa los detalles en [precios](/pricing). Antes de pasar a producción, prueba estados devueltos por la API, reintentos, correlativos, almacenamiento de XML y CDR, y la entrega del PDF al cliente.

## Preguntas frecuentes

### ¿Una API garantiza que SUNAT acepte cada comprobante?

No. Devuelve el resultado y estado informado para cada emisión. Tu sistema debe manejar el estado que reciba.

### ¿Puedo obtener el XML, CDR y PDF?

Sí. La respuesta puede incluir enlaces al XML firmado, la constancia de SUNAT y los PDF en formato A4 o ticket de 80 mm.

### ¿Necesito certificado para probar la integración?

La empresa puede emitir en beta sin certificado. Para producción, debes subir el certificado de tu empresa.

### ¿Puedo usar varias empresas emisoras?

Sí. Puedes registrar varias empresas y seleccionar la emisora con `x-ruc` cuando tu cuenta tenga más de una.

### ¿La API pertenece a SUNAT?

No. Es un servicio de Mathyu's Solutions que usa los servicios oficiales de SUNAT y no está afiliado a SUNAT ni al Estado peruano.
