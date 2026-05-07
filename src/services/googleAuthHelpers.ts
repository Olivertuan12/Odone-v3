import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { secondaryAuth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

let isAuthenticating = false;

export const reauthenticateDrive = async (uid: string) => {
  if (isAuthenticating) {
    throw new Error('Authentication already in progress');
  }
  isAuthenticating = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive');
    
    const email = localStorage.getItem('google_drive_email');
    if (email) {
      provider.setCustomParameters({ login_hint: email });
    } else {
      provider.setCustomParameters({ prompt: 'select_account' });
    }
    
    const result = await signInWithPopup(secondaryAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (credential?.accessToken) {
      localStorage.setItem('google_drive_token', credential.accessToken);
      if (result.user.email) localStorage.setItem('google_drive_email', result.user.email);
      
      await setDoc(doc(db, 'users', uid, 'settings', 'integrations'), {
        google_drive_token: credential.accessToken,
        google_drive_email: result.user.email
      }, { merge: true });
    }
    await signOut(secondaryAuth);
    return credential?.accessToken;
  } finally {
    isAuthenticating = false;
  }
};

export const reauthenticateCalendar = async (uid: string) => {
  if (isAuthenticating) {
    throw new Error('Authentication already in progress');
  }
  isAuthenticating = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    
    const email = localStorage.getItem('google_calendar_email');
    if (email) {
      provider.setCustomParameters({ login_hint: email });
    } else {
      provider.setCustomParameters({ prompt: 'select_account' });
    }
    
    const result = await signInWithPopup(secondaryAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (credential?.accessToken) {
      localStorage.setItem('google_calendar_token', credential.accessToken);
      if (result.user.email) localStorage.setItem('google_calendar_email', result.user.email);
      
      await setDoc(doc(db, 'users', uid, 'settings', 'integrations'), {
        google_calendar_token: credential.accessToken,
        google_calendar_email: result.user.email
      }, { merge: true });
    }
    await signOut(secondaryAuth);
    return credential?.accessToken;
  } finally {
    isAuthenticating = false;
  }
};
