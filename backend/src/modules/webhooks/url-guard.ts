import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/**
 * El webhook lo pone el cliente: no puede apuntar a nuestra red ni al servidor
 * de metadatos de Google (169.254.169.254), o serviría para leer credenciales
 * (SSRF). Se valida al guardar la URL y otra vez en cada envío, al resolver el
 * DNS, por si el dominio cambia de IP después.
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** IP privada, reservada o que no es una IP. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blocked.check(address, 'ipv4');
  if (version === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? blocked.check(mapped[1], 'ipv4') : blocked.check(address, 'ipv6');
  }
  return true;
}

/** URL de webhook aceptable: https, sin usuario/clave, a un host público. */
export function checkWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('La URL del webhook no es válida.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const reasons = [
    url.protocol !== 'https:' && 'tiene que ser https',
    (url.username || url.password) && 'no puede llevar usuario ni clave',
    raw.length > 500 && 'es demasiado larga',
    (host === 'localhost' || /\.(localhost|local|internal|lan)$/.test(host)) && 'apunta a una red local',
    isIP(host) && isPrivateAddress(host) && 'apunta a una IP privada',
  ].filter(Boolean);
  if (reasons.length) throw new BadRequestException(`La URL del webhook ${reasons[0]}.`);
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** `lookup` para https.request: resuelve el DNS y rechaza las IPs no públicas. */
export function publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) {
      return callback(Object.assign(new Error(`El webhook resuelve a una dirección no pública (${bad?.address ?? hostname}).`), { code: 'EPRIVATE' }), '');
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
