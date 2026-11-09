---
title: "consulta ruc api: valida RUC antes de facturar"
description: "consulta ruc api: valida un RUC y revisa razón social, estado, condición y domicilio fiscal antes de emitir factura con la API de Mathyu's Solutions."
site: "sunat"
date: "2026-11-09"
updated: "2026-11-09"
keywords: ["consulta ruc api","validar ruc sunat","razón social por ruc api","estado ruc sunat api","domicilio fiscal ruc api","api facturación peru"]
draft: false
---

## Qué te resuelve esta consulta

Si buscas "consulta ruc api", la respuesta corta es esta: antes de emitir una factura, valida el RUC y revisa la información del padrón de SUNAT para no facturar con datos inconsistentes. En un checkout peruano, eso te ayuda a evitar errores que después te obligan a corregir comprobantes, pedir datos de nuevo o bloquear la venta a último minuto.

En la API de Mathyu's Solutions, la consulta que te sirve para este caso es esta: GET /v1/sunat/ruc/{ruc}. La base es https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat y la autenticación va en la cabecera x-api-key. La idea no es “mandar un número al azar y seguir adelante”. La idea es validar la estructura del documento y, si pasa, consultar la información oficial del contribuyente antes de generar la factura.

Esto importa cuando un cliente compra con factura y tú necesitas datos del cliente para emitida. Si el RUC no existe, si está mal escrito o si la razón social y el domicilio fiscal no coinciden con lo que aparece en SUNAT, mejor bloquear la operación antes de facturar. En el backend, esto es una validación de negocio simple y útil: te ahorra devoluciones, soporte y errores de facturación.

## Endpoint real y autenticación

La ruta oficial del producto para esta consulta es:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/20100066603" \
  -H "x-api-key: $MATHYU_API_KEY"
```

La idea de esta llamada es consultar la información del padrón de SUNAT y usarla en tu flow de venta. Si quieres revisar la referencia del servicio, mira [documentación](/docs), [precios](/pricing) y [catálogos](/catalogos). Si necesitas un punto de partida para tipos de documento o validación de identidad, revisa [tipo de documento de identidad](/catalogos/06-tipo-de-documento-de-identidad).

No confundas dos cosas:

1. La validación del formato del RUC: que tenga 11 dígitos y una estructura coherente con tu flujo.
2. La consulta del padrón: la API te devuelve información que SUNAT tiene registrada para ese contribuyente.

La segunda es la que te permite revisar la razón social, el estado, la condición y el domicilio fiscal antes de emitir la factura. Para un ecommerce peruano, eso es muy valioso.

## Qué debes validar antes de emitir una factura

En un checkout, la validación no debería ser solo un regex ni solo una llamada a la API. Debe ser un flujo claro:

- validar la estructura del RUC;
- consultar la información del padrón;
- revisar que la respuesta tenga sentido para la operación;
- decidir si se puede continuar con la compra y la factura.

### 1. Valida la estructura del RUC

Una validación básica al inicio del flujo es importante. En la práctica, suele ser así:

- el RUC debe tener 11 dígitos;
- no debe estar vacío ni con espacios;
- no debe venir con letras, puntos u otros caracteres extraños;
- si el cliente elige documento tipo RUC, el valor debe ser coherente con el formulario.

Esto no reemplaza la consulta del padrón, pero sí te ahorra llamadas innecesarias y evita errores muy simples al inicio del proceso. Si el cliente pone un RUC con menos de 11 dígitos, tú debes bloquear la entrada antes de continuar.

### 2. Consulta la información del contribuyente

Cuando el RUC pasa la validación inicial, llamas al endpoint del producto:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/${RUC}" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "accept: application/json"
```

La llamada te devuelve la información que SUNAT tiene registrada para ese contribuyente. En la práctica, te sirve para revisar:

- si el contribuyente existe en el padrón;
- cuál es la razón social que SUNAT muestra;
- si el estado y la condición del contribuyente son los esperados;
- cuál es el domicilio fiscal reportado.

Eso es exactamente lo que necesitas para no facturar con una empresa inventada o con datos que no coinciden con el padrón.

### 3. Revisa cómo reaccionar a la respuesta

No te metas a asumir nombres de campos ni a inventar una estructura de respuesta. La regla segura es: revisa la respuesta real del endpoint y toma decisiones según lo que la API te devuelva. Si la respuesta viene vacía, con error o con un dato que no encaja con tu flujo, bloquea la venta y pide corrección. Si la respuesta se ve útil y consistente, completa el formulario con la data y continúa.

En términos de negocio, esto te ayuda a decidir:

- si aceptas la compra con factura;
- si pides que el cliente corrija el RUC;
- si muestras un mensaje claro y no sigues con la venta;
- si guardas la información del cliente para la factura final.

## Flujo recomendado en checkout

Esto es lo más práctico. El punto es hacerlo antes de emitir el comprobante, no después.

1. El cliente elige tipo de documento: RUC.
2. Ingresa el número del contribuyente.
3. Tu frontend valida que tenga 11 dígitos.
4. Llamas a GET /v1/sunat/ruc/{ruc} con x-api-key.
5. Revisas la respuesta y decides si es útil para la operación.
6. Si la respuesta es válida, completas el cliente y habilitas la compra.
7. Si falla, muestras un mensaje y no permites la factura.

Este es un ejemplo concreto para un formulario de checkout:

```javascript
async function validarRucParaFactura(ruc, apiKey) {
  const numero = String(ruc).trim();

  if (!/^\d{11}$/.test(numero)) {
    return {
      ok: false,
      error: 'El RUC debe tener 11 dígitos.'
    };
  }

  const response = await fetch(
    `https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/${numero}`,
    {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        accept: 'application/json'
      }
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      error: 'No pudimos consultar el RUC en SUNAT.'
    };
  }

  const data = await response.json();

  return {
    ok: true,
    data
  };
}

async function confirmarClienteEnCheckout(form) {
  const ruc = form.ruc.value;
  const resultado = await validarRucParaFactura(ruc, process.env.MATHYU_API_KEY);

  if (!resultado.ok) {
    alert(resultado.error);
    return;
  }

  const cliente = resultado.data;
  console.log('Respuesta del padrón:', cliente);

  // Aquí decides si la venta puede continuar con factura.
  // Usa la respuesta real del endpoint para completar el formulario o bloquear la operación.
  form.isValid = true;
}
```

Este patrón separa dos cosas: la validación del formato y la consulta real del padrón. La validación del dígito verificador puede ser una capa extra en tu backend si tu negocio lo requiere, pero para un ecommerce en Perú la parte más útil es consultar la información fiscal antes de facturar y no seguir con datos ambiguos.

## Ejemplo con curl para scripts y pruebas

Si quieres probar la consulta desde terminal o desde un script de automatización, este es el patrón correcto:

```bash
curl "https://mathyu-apis-vzuxpxsama-rj.a.run.app/v1/sunat/ruc/20100066603" \
  -H "x-api-key: $MATHYU_API_KEY" \
  -H "accept: application/json"
```

Con eso revisas la respuesta real del servicio y decides si el cliente está listo para factura. Si la API responde con error, no sigas con la compra. Pide corrección, bloquea la operación o solicita que el cliente confirme los datos otra vez.

## ¿Cuándo vale la pena esta validación?

Usa esta comprobación cuando tu flujo de ecommerce tiene venta con factura o trabaja con clientes empresariales. En tiendas B2C o con ventas al consumidor final, quizá no sea un paso necesario en cada compra, pero sí es muy útil si tu operación tiene facturación a empresas y quieres reducir errores.

Esta validación te sirve para tres cosas:

- confirmar que el cliente existe en el padrón de SUNAT;
- evitar facturas con datos inconsistentes;
- completar la información del cliente antes de emitir el comprobante.

En la práctica, no es un extra. Es una validación útil del backend para una operación con factura. Si lo que buscas es resolver un problema concreto antes de facturar, este flujo es mejor que depender solo del dato que te ingresó el cliente en la compra.

También puedes revisar la referencia del servicio en [documentación](/docs), [precios](/pricing), [tipo de cambio](/tipo-de-cambio) y los [catálogos](/catalogos). Si necesitas más contexto sobre validación de documentos, el [tipo de documento de identidad](/catalogos/06-tipo-de-documento-de-identidad) te sirve como referencia rápida para el flujo de compra.

## Preguntas frecuentes

### ¿Es necesario validar el RUC antes de facturar?

Sí, si la venta va con factura o si tu flujo de ecommerce trabaja con clientes empresariales. Es una validación útil para no facturar con un contribuyente que no existe o con datos inconsistentes.

### ¿La API de Mathyu's Solutions valida el dígito verificador del RUC?

La API del producto que te interesa para este caso es la consulta del RUC y la información del padrón de SUNAT. Tú puedes hacer una validación adicional del formato o del dígito verificador en tu backend si tu negocio lo requiere, pero la parte más útil es consultar la información real del contribuyente antes de facturar.

### ¿Qué pasa si la consulta falla?

Tu flujo debe bloquear la operación o pedir corrección del dato. Si la respuesta no es útil, no sigas con la factura con un RUC que no puedas verificar.

### ¿Necesito una empresa o una cuenta especial?

La API usa tu key en el header x-api-key y la base del servicio que está documentada en el producto. Esta guía sirve para integrar la validación antes de la factura en tu checkout.

### ¿Puedo usar esta consulta en un formulario de checkout?

Sí. Es una buena práctica validar el documento antes de confirmar la compra o de generar el comprobante. Eso reduce errores de datos y mejora la calidad de la facturación.

En resumen, si buscas "consulta ruc api" para resolver algo concreto, la respuesta útil es esta: usa GET /v1/sunat/ruc/{ruc}, autentica con x-api-key, valida la estructura del RUC y revisa la respuesta del padrón antes de emitir la factura. Es una validación simple, directa y muy útil para un ecommerce en Perú.
