import { SignedXml } from 'xml-crypto';
import { SIGNATURE_ID } from '../ubl/invoice-xml';
import { type SigningCertificate, certificateBody } from './certificate';

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

export interface SignedDocument {
  xml: string;
  /** DigestValue de la firma: el "valor resumen" que va en el PDF y el QR. */
  hash: string;
}

/**
 * Firma XMLDSig "enveloped" como la pide SUNAT: el ds:Signature va dentro de
 * ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent y cubre todo el documento.
 */
export function signXml(xml: string, certificate: SigningCertificate): SignedDocument {
  const body = certificateBody(certificate.certificatePem);
  const sig = new SignedXml({
    privateKey: certificate.privateKeyPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: (args) => {
      const p = args?.prefix ? `${args.prefix}:` : '';
      return `<${p}X509Data><${p}X509Certificate>${body}</${p}X509Certificate></${p}X509Data>`;
    },
  });
  sig.addReference({ xpath: '/*', transforms: [ENVELOPED], digestAlgorithm: SHA256, isEmptyUri: true });
  sig.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: SIGNATURE_ID },
    location: { reference: "//*[local-name(.)='ExtensionContent']", action: 'append' },
  });
  const signed = sig.getSignedXml();
  const hash = /<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(signed)?.[1];
  if (!hash) throw new Error('La firma no generó DigestValue');
  return { xml: signed.startsWith('<?xml') ? signed : `<?xml version="1.0" encoding="UTF-8"?>\n${signed}`, hash };
}
