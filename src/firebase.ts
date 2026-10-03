import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyCREsKnPrmOhpkLivwWFZ8Y_V0jhqoiqps",
  authDomain: "uno1-d9f32.firebaseapp.com",
  projectId: "uno1-d9f32",
  storageBucket: "uno1-d9f32.firebasestorage.app",
  messagingSenderId: "76571161804",
  appId: "1:76571161804:web:9d155cda5772fa78cefe69",
  measurementId: "G-Q90KX7FHX2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);

// Helper to ensure authenticated user (anonymous auth if available, with graceful fallback)
export async function ensureAuth(): Promise<string> {
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    // If anonymous auth is disabled in Firebase console, use a persistent client ID
    console.warn('Anonymous sign-in not enabled in Firebase Console, using local player UID fallback:', err);
    let fallbackId = localStorage.getItem('uno_firebase_uid');
    if (!fallbackId) {
      fallbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('uno_firebase_uid', fallbackId);
    }
    return fallbackId;
  }
}
