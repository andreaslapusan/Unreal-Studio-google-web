/**
 * Firebase web client.
 *
 * Configuration is read from Vite env variables prefixed with VITE_FIREBASE_.
 * Set them in `.env.local` for development and as GitHub Actions secrets for
 * production builds.
 */
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "gen-lang-client-0678977822.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "gen-lang-client-0678977822",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "gen-lang-client-0678977822.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "343975482095",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

const app = initializeApp(config);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const isFirebaseConfigured = Boolean(config.apiKey && config.appId);
