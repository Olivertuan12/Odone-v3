import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '@/firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Test connection on boot
const testConnection = async () => {
    try {
      if (db) {
        await getDocFromServer(doc(db, 'test', 'connection'));
      }
    } catch (error) {
       // connection tests might fail on permissions, that's fine. We just want to prime it
    }
}
testConnection();

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    localStorage.setItem('google_drive_token', credential.accessToken);
    localStorage.setItem('google_calendar_token', credential.accessToken);
    localStorage.setItem('google_drive_email', result.user.email || '');
    localStorage.setItem('google_calendar_email', result.user.email || '');
    try {
      await setDoc(doc(db, 'users', result.user.uid, 'settings', 'integrations'), {
        google_drive_token: credential.accessToken,
        google_drive_email: result.user.email,
        google_calendar_token: credential.accessToken,
        google_calendar_email: result.user.email
      }, { merge: true });
    } catch(e) {
      console.error(e);
    }
  }
  return result;
};
export const signOut = () => fbSignOut(auth);

// Helper for throwing standardized errors
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
