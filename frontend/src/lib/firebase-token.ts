import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Verifica un ID token de Firebase Auth sin el Admin SDK ni credenciales: se
// valida la firma contra las claves públicas de Google y los claims según
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Métodos de ingreso permitidos: Google o correo/contraseña. */
const ALLOWED_PROVIDERS = new Set(['google.com', 'password']);

export interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  provider: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const provider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
    if (!payload.sub || typeof payload.email !== 'string' || !provider || !ALLOWED_PROVIDERS.has(provider)) {
      return null;
    }
    return {
      uid: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
      provider,
    };
  } catch {
    return null;
  }
}
