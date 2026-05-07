import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, signOut as fbSignOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
         try {
           const docRef = doc(db, 'users', user.uid, 'settings', 'integrations');
           const docSnap = await getDoc(docRef);
           if (docSnap.exists()) {
             const data = docSnap.data();
             if (data.google_drive_token && !localStorage.getItem('google_drive_token')) {
                localStorage.setItem('google_drive_token', data.google_drive_token);
                if (data.google_drive_email) localStorage.setItem('google_drive_email', data.google_drive_email);
             }
             if (data.google_calendar_token && !localStorage.getItem('google_calendar_token')) {
                localStorage.setItem('google_calendar_token', data.google_calendar_token);
                if (data.google_calendar_email) localStorage.setItem('google_calendar_email', data.google_calendar_email);
             }
           }
           try {
             const projRef = doc(db, 'users', user.uid, 'settings', 'project_config');
             const projSnap = await getDoc(projRef);
             if (projSnap.exists()) {
               const rf = projSnap.data().rootFolder;
               if (rf && rf.id) {
                 localStorage.setItem('drive_root_folder', rf.id);
               }
             }
           } catch(e) {
             console.error("Failed fetching project config from DB on boot", e);
           }
         } catch(e) {
           console.error("Failed fetching tokens from DB on boot", e);
         }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const signIn = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed", error);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };
  
  const signOut = async () => {
    try {
      localStorage.removeItem('google_drive_token');
      localStorage.removeItem('google_calendar_token');
      localStorage.removeItem('google_drive_email');
      localStorage.removeItem('google_calendar_email');
      await fbSignOut();
    } catch (error) {
      console.error("Sign out failed", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
