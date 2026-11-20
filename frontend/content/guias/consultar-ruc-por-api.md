---
title: "Consulta RUC API: valida datos SUNAT para tu checkout"
description: "Consulta RUC API para validar el dígito, obtener razón social y revisar estado y domicilio fiscal antes de emitir una factura electrónica."
site: "sunat"
date: "2026-11-20"
updated: "2026-11-20"
keywords: ["consulta ruc api","validar ruc peru","digito verificador ruc","api ruc sunat","domicilio fiscal ruc"]
draft: false
---

Si necesitas validar un RUC antes de emitir una factura, primero puedes comprobar su formato y dígito verificador y, luego, consultar el padrón de SUNAT. Con la SUNAT API de Mathyu's Solutions puedes obtener razón social, estado, condición y domicilio fiscal desde el endpoint `GET /v1/sunat/ruc/{ruc}`.

La comprobación local evita llamadas innecesarias por errores de captura. La consulta a la API confirma además si el RUC aparece en el padrón reducido publicado por SUNAT.

## Cómo validar el RUC antes de consultar la API

Un RUC peruano tiene 11 dígitos. La API no aceptará la consulta si el valor tiene otra longitud o si falla la regla del dígito verificador. También puede devolver `404` si el número no aparece en el padrón.

El dígito verificador se calcula con los diez primeros dígitos y los factores `5, 4, 3, 2, 7, 6, 5, 4, 3, 2`. La suma se calcula multiplicando cada dígito por su factor. Después, se divide la suma entre 11 y se usa el resto:

- Si el resto es `0`, el dígito esperado es `0`.
- Si el resto es `1`, el dígito esperado es `1`.
- En cualquier otro caso, el dígito esperado es `11 - resto`.

Esta comprobación es previa. No demuestra por sí sola que una persona o empresa pueda emitir comprobantes, ni sustituye una revisión fiscal. Si tienes dudas sobre una situación tributaria concreta, usa la información oficial de SUNAT.

## Campos que devuelve la consulta

El endpoint devuelve estos campos dentro de `payload`:

| Campo | Para qué sirve |
|---|---|
| `ruc` | RUC consultado |
| `razon_social` | Denominación registrada |
| `estado` | Situación del contribuyente |
| `condicion` | Condición registrada en el padrón |
| `tipo_contribuyente` | Tipo registrado |
| `direccion_fiscal` | Domicilio publicado |
| `ubigeo` | Código de ubicación |
| `departamento`, `provincia`, `distrito` | Dirección desagregada |
| `nombre_comercial` | Nombre comercial, si existe |
| `fecha_padron` | Fecha asociada al padrón |

El `payload` puede incluir campos con valor `null`, como `nombre_comercial` o `actividades_economicas`. Tu integración debe contemplar esos casos.

El domicilio puede cambiar o no estar disponible para algunos contribuyentes. SUNAT no publica el domicilio de personas naturales en el padrón reducido. Para datos sensibles o discrepancias, verifica el registro directamente en las fuentes oficiales.

## Consultar un RUC con la API

Necesitas crear una cuenta, obtener una API key desde el panel y exportarla como `MATHYU_API_KEY`. Esta clave se envía en el header `x-api-key`.

La URL base es `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat`. Puedes probar el RUC de ejemplo con:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/20100066603" \
  -H "x-api-key: $MATHYU_API_KEY"
```

Una respuesta válida tiene esta estructura general:

```json
{
  "success": true,
  "message": "...",
  "payload": {
    "ruc": "20100066603",
    "razon_social": "NOMBRE O RAZÓN SOCIAL",
    "estado": "ACTIVO",
    "condicion": "HABIDO",
    "tipo_contribuyente": "SOCIEDAD ANONIMA CERRADA",
    "direccion_fiscal": "DIRECCIÓN PUBLICADA",
    "ubigeo": "150101",
    "departamento": "LIMA",
    "provincia": "LIMA",
    "distrito": "LIMA",
    "nombre_comercial": null,
    "actividades_economicas": null,
    "fecha_padron": "2026-11-20"
  }
}
```

El ejemplo es ilustrativo. Los valores reales pueden cambiar cuando SUNAT actualice el padrón. No uses textos fijos como `ACTIVO` o `HABIDO` para decidir una situación tributaria compleja sin validar el flujo en tu sistema.

## Errores más frecuentes

| Código | Significado esperado |
|---|---|
| `400` | RUC inválido o con dígito incorrecto |
| `401` | API key inválida |
| `403` | API key pertenece a otra API |
| `404` | RUC no encontrado en el padrón |
| `429` | Cuota agotada |

Las consultas RUC están incluidas en los planes de pago. En el plan gratis cuentan como una consulta. Cada consulta exitosa consume una consulta de la cuota según los datos del producto.

## Validar y buscar un RUC en checkout

En una tienda en Perú conviene colocar el RUC, razón social y dirección en campos separados. Cuando el cliente ingresa un RUC, ejecuta esta secuencia:

1. Elimina espacios y guiones.
2. Comprueba que sean exactamente 11 dígitos.
3. Calcula el dígito verificador localmente.
4. Si pasa la validación, consulta el endpoint.
5. Pasa la razón social y el domicilio a los campos del checkout.
6. Conserva el RUC original para emitir la factura.

No reemplaces `razon_social` con el nombre ingresado por el cliente. Para una factura, el sistema debe emitir el comprobante a nombre del RUC y con los datos registrados que correspondan.

### Ejemplo completo en JavaScript

El siguiente script usa `fetch`, valida el RUC y consulta la API. Primero elimina únicamente espacios y guiones. Después rechaza cualquier otro carácter o una longitud distinta de 11 dígitos antes de calcular el dígito verificador:

```javascript
async function consultarRuc(ruc, apiKey) {
  const limpio = ruc.replace(/[\s-]/g, "");

  if (!/^\d{11}$/.test(limpio)) {
    throw new Error("El RUC debe tener 11 dígitos.");
  }

  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;

  for (let i = 0; i < 10; i++) {
    suma += Number(limpio[i]) * factores[i];
  }

  const resto = suma % 11;
  let digitoEsperado;

  if (resto === 0) {
    digitoEsperado = 0;
  } else if (resto === 1) {
    digitoEsperado = 1;
  } else {
    digitoEsperado = 11 - resto;
  }

  if (Number(limpio[10]) !== digitoEsperado) {
    throw new Error("El dígito verificador del RUC no es correcto.");
  }

  const respuesta = await fetch(
    `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/${limpio}`,
    {
      headers: {
        "x-api-key": apiKey,
        "accept": "application/json"
      }
    }
  );

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos.message || `Error ${respuesta.status}`);
  }

  if (!datos.success || !datos.payload) {
    throw new Error("La consulta no devolvió datos del RUC.");
  }

  return datos.payload;
}

const apiKey = process.env.MATHYU_API_KEY;

if (!apiKey) {
  throw new Error("Configura MATHYU_API_KEY en las variables de entorno.");
}

consultarRuc("20100066603", apiKey)
  .then((cliente) => {
    console.log({
      ruc: cliente.ruc,
      razon_social: cliente.razon_social,
      estado: cliente.estado,
      condicion: cliente.condicion,
      direccion_fiscal: cliente.direccion_fiscal,
      ubigeo: cliente.ubigeo
    });
  })
  .catch((error) => {
    console.error(error.message);
  });
```

Para ejecutarlo con Node.js debes definir la variable antes de iniciar el proceso:

```bash
MATHYU_API_KEY="tu-api-key" node consulta-ruc.js
```

Reemplaza `consulta-ruc.js` por el nombre real de tu archivo. No incluyas la API key en el código de frontend, rutas públicas ni repositorios.

## Usar los datos en el formulario

En el evento de salida del campo RUC puedes llamar a la función y rellenar los campos bloqueados. Si el cliente necesita modificar la dirección fiscal, conserva una copia del valor publicado y registra cualquier modificación por separado.

En una factura electrónica, además del RUC y la razón social, el comprobante requiere los datos de cliente definidos por la API:

- `cliente_tipo_de_documento`: para RUC se usa el código `6` del catálogo de tipo de documento.
- `cliente_numero_de_documento`: el RUC de once dígitos.
- `cliente_denominacion`: razón social del cliente.
- `cliente_direccion`: dirección fiscal que usarás en el comprobante.
- `cliente_email`: correo del cliente, si corresponde.

La lista completa está en el [catálogo de tipo de documento de identidad](/catalogos/06-tipo-de-documento-de-identidad). Si necesitas emitir comprobantes, revisa primero la [guía de facturación electrónica](/guias/api-facturacion-electronica-peru).

## Cómo registrar una factura desde el checkout

Una vez seleccionado el RUC, el servidor puede verificarlo nuevamente antes de crear la factura. No confíes solo en el resultado que llegó desde el navegador, porque un usuario puede cambiar los campos o repetir una solicitud.

El servidor debe:

1. Recibir el RUC de la sesión o del pedido.
2. Volver a validar formato y dígito.
3. Consultar el endpoint RUC si aún no se ha consultado.
4. Construir el cliente con `cliente_tipo_de_documento: "6"`.
5. Usar la razón social y dirección obtenidas o verificadas.
6. Crear los ítems y calcular el comprobante.
7. Emitirlo con `POST /v1/sunat/documents`.

La API exige una factura para un cliente con RUC, salvo operaciones de exportación. Para el número, puedes omitirlo y dejar que tome el siguiente correlativo disponible.

El endpoint de emisión no está completo si falta información tributaria. Por ejemplo, los montos deben tratarse con precisión. El campo `valor_unitario` no incluye IGV, mientras que `precio_unitario` incluye IGV. La SUNAT API compara el `total` enviado con el total calculado y permite una tolerancia de un céntimo si decides enviarlo.

Para ver la estructura disponible de comprobantes, campos y respuestas, revisa la [documentación](/docs).

## RUC válido, estado y condición

Una validación local exitosa significa que el número tiene un dígito correcto. No significa automáticamente que el estado o la condición sean aptos para tu operación. También hay diferencias entre validar el RUC y emitir una factura:

- El RUC pertenece al padrón: puedes usar el resultado como referencia.
- El estado o la condición cambian: el padrón reducido es una publicación diaria de SUNAT.
- La información fiscal requiere revisión: consulta el registro oficial ante una diferencia.
- El comprobante necesita datos adicionales: domicilio fiscal, serie, moneda y tratamiento de IGV deben coincidir con la operación.

Cuando el dato sea crítico para cobrar o emitir, compara el resultado con el sitio oficial de [SUNAT](https://www.sunat.gob.pe).

## Pruebas y producción

La cuenta de SUNAT API puede empezar en beta. En ese ambiente puedes emitir comprobantes de prueba contra SUNAT beta sin certificado ni cuota. Para pasar a producción se necesita subir el certificado y completar las credenciales SOL según el registro de la empresa.

Puedes registrar la empresa con:

```bash
curl -X POST "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/companies" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "content-type: application/json" \
  -d '{"ruc":"20123456789","razon_social":"MI EMPRESA S.A.C.","direccion":"AV. LOS OLIVOS 123","ubigeo":"150101"}'
```

Puedes consultar las empresas registradas y sus requisitos de producción con:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/companies" \
  -H "x-api-key: $MATHYU_API_KEY"
```

La respuesta de empresas indica `listo_para_produccion` y `faltantes_para_produccion`. Usa esa respuesta para bloquear o habilitar la emisión real en tu sistema.

Los planes muestran cuántas operaciones mensuales están disponibles. Puedes comparar consumos y precios en [precios](/pricing). La API reporta las cuotas agotadas con el error HTTP `429`.

## Preguntas frecuentes

### ¿La consulta RUC API garantiza que el contribuyente pueda emitir factura?

No. Confirma que el número pasa la validación y busca su registro en el padrón reducido de SUNAT. El estado, la condición y otros requisitos deben revisarse según la operación. Ante dudas fiscales, verifica el dato en SUNAT.

### ¿Por qué un RUC válido puede devolver 404?

Puede no aparecer en el padrón reducido publicado por SUNAT o haber sido actualizado después de la última publicación. En ese caso, verifica el RUC directamente en la fuente oficial y vuelve a consultar más tarde si corresponde.

### ¿Puedo usar esta consulta para DNI?

No con este endpoint. Existe `GET /v1/sunat/dni/{dni}`, pero solo devuelve datos de personas naturales que tienen RUC. Para un DNI, revisa la documentación antes de diseñar el flujo.

### ¿Debo guardar el domicilio fiscal devuelto por la API?

Puedes guardar una copia junto al pedido, pero no reemplaces el domicilio actual del checkout sin dejar registro de su origen. El domicilio fiscal publicado puede cambiar.

### ¿La validación del dígito sustituye la consulta a SUNAT?

No. El dígito local detecta errores de captura. La consulta confirma razón social, estado, condición y domicilio fiscal disponibles en el padrón del momento.
