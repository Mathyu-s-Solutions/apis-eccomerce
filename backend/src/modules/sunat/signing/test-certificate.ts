import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';
import type { SigningCertificate } from './certificate';

let cached: SigningCertificate | undefined;

/**
 * Certificado autofirmado para el entorno beta de SUNAT, que acepta cualquier
 * firma válida. Así una empresa puede probar sin subir su certificado.
 * Se genera una vez por proceso; nunca se usa en producción.
 */
export function testCertificate(): SigningCertificate {
  if (cached) return cached;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = `01${Date.now().toString(16)}`;
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const name = [
    { name: 'commonName', value: 'CERTIFICADO DE PRUEBAS (BETA)' },
    { name: 'organizationName', value: "Mathyu's APIs" },
    { name: 'countryName', value: 'PE' },
  ];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  cached = { privateKeyPem: privateKey, certificatePem: forge.pki.certificateToPem(cert) };
  return cached;
}
