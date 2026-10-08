import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  browserPopupRedirectResolver,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth';

// Firebase solo se usa para identificar al usuario (Google o correo/contraseña)
// y obtener un ID token; la sesión real es nuestra cookie (lib/session.ts). Por
// eso la persistencia es en memoria: el navegador no guarda sesión de Firebase.

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let auth: Auth | undefined;

/** Instancia de Firebase Auth (solo en el navegador). */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  if (getApps().length) {
    auth = getAuth(getApp());
  } else {
    auth = initializeAuth(initializeApp(config), {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  auth.languageCode = 'es';
  return auth;
}
