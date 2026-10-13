import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import forge from 'node-forge';
import { SunatInputError } from '../errors';

/** Certificado digital listo para firmar: llave privada y certificado en PEM. */
export interface SigningCertificate {
  privateKeyPem: string;
  certificatePem: string;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  /** RUC que figura en el certificado, si lo trae. */
  ruc: string | null;
}

const PEM_BLOCK = /-----BEGIN ([A-Z ]+)-----[\s\S]+?-----END \1-----/g;

/**
 * Lee el certificado del contribuyente: un .pfx/.p12 (binario) o un PEM con la
 * llave privada y el certificado. Valida que la llave corresponda al certificado.
 */
export function parseCertificate(file: Buffer, password = ''): SigningCertificate {
  const text = file.toString('latin1');
  const parsed = text.includes('-----BEGIN') ? fromPem(text, password) : fromPkcs12(file, password);

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(parsed.certificatePem);
  } catch {
    throw new SunatInputError('El certificado no es un X.509 válido.');
  }
  let key;
  try {
    key = createPrivateKey(parsed.privateKeyPem);
  } catch {
    throw new SunatInputError('No se pudo leer la llave privada del certificado.');
  }
  if (key.asymmetricKeyType !== 'rsa') throw new SunatInputError('SUNAT firma con RSA: el certificado debe traer una llave RSA.');
  if (!cert.checkPrivateKey(key)) throw new SunatInputError('La llave privada no corresponde al certificado.');

  return {
    // PKCS#8 sin cifrar: se guarda cifrado con la llave del servidor.
    privateKeyPem: key.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificatePem: cert.toString(),
  };
}

function fromPem(text: string, password: string): SigningCertificate {
  const blocks = text.match(PEM_BLOCK) ?? [];
  const certs = blocks.filter((b) => b.startsWith('-----BEGIN CERTIFICATE-----'));
  const keyBlock = blocks.find((b) => / PRIVATE KEY-----/.test(b.split('\n')[0]));
  if (!certs.length || !keyBlock) throw new SunatInputError('El PEM debe traer la llave privada y el certificado.');
  let privateKeyPem: string;
  try {
    privateKeyPem = createPrivateKey({ key: keyBlock, passphrase: password }).export({ type: 'pkcs8', format: 'pem' }).toString();
  } catch {
    throw new SunatInputError('No se pudo abrir la llave privada: revisa la clave del certificado.');
  }
  return { privateKeyPem, certificatePem: pickLeaf(certs, privateKeyPem) };
}

function fromPkcs12(file: Buffer, password: string): SigningCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(file.toString('binary'))), false, password);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (/mac|password|PKCS#12/i.test(msg)) throw new SunatInputError('No se pudo abrir el certificado: la clave es incorrecta o el archivo no es un .pfx/.p12.');
    throw new SunatInputError('El archivo del certificado no es un .pfx/.p12 válido.');
  }
  const bags = (type: string) => p12.getBags({ bagType: type })[type] ?? [];
  const keyBag = [...bags(forge.pki.oids.pkcs8ShroudedKeyBag), ...bags(forge.pki.oids.keyBag)].find((b) => b.key);
  if (!keyBag?.key) throw new SunatInputError('El certificado no trae llave privada.');
  const certs = bags(forge.pki.oids.certBag)
    .filter((b) => b.cert)
    .map((b) => forge.pki.certificateToPem(b.cert!));
  if (!certs.length) throw new SunatInputError('El archivo no trae ningún certificado.');
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  return { privateKeyPem, certificatePem: pickLeaf(certs, privateKeyPem) };
}

/** De la cadena, el certificado cuya llave pública es la de la llave privada. */
function pickLeaf(certs: string[], privateKeyPem: string): string {
  const publicKey = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });
  const leaf = certs.find((pem) => {
    try {
      return new X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' }).equals(publicKey);
    } catch {
      return false;
    }
  });
  if (!leaf) throw new SunatInputError('La llave privada no corresponde a ningún certificado del archivo.');
  return leaf;
}

export function certificateInfo(certificatePem: string): CertificateInfo {
  const cert = new X509Certificate(certificatePem);
  const subject = cert.subject.replace(/\n/g, ', ');
  // Los certificados tributarios llevan el RUC en el sujeto (OU, serialNumber u organizationIdentifier).
  const ruc = /\b((?:10|15|16|17|20)\d{9})\b/.exec(subject)?.[1] ?? null;
  return {
    subject,
    issuer: cert.issuer.replace(/\n/g, ', '),
    serialNumber: cert.serialNumber,
    validFrom: new Date(cert.validFrom).toISOString(),
    validTo: new Date(cert.validTo).toISOString(),
    ruc,
  };
}

/** Cuerpo base64 del certificado, para ds:X509Certificate. */
export function certificateBody(certificatePem: string): string {
  return certificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
}
