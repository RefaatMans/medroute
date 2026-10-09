import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** False until `.env` is filled in; the UI shows a setup banner instead of crashing. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!isFirebaseConfigured) {
  console.warn('[MedRoute] Firebase is not configured. Copy .env.example to .env and fill in your project values.');
}

// Placeholder values keep the SDK from throwing at import time when unconfigured.
export const app = initializeApp(
  isFirebaseConfigured
    ? firebaseConfig
    : { apiKey: 'not-configured', projectId: 'not-configured', appId: 'not-configured' },
);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const ADMIN_CODE: string = env.VITE_ADMIN_CODE ?? '';
