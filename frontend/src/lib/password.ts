import crypto from 'node:crypto';

// Hash de contraseña con scrypt (incluido en Node, sin dependencias).
// Formato almacenado: scrypt$<saltHex>$<hashHex>

const KEYLEN = 64;

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('hex')}$${derived.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return Promise.resolve(false);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(
        derived.length === expected.length &&
          crypto.timingSafeEqual(derived, expected),
      );
    });
  });
}
