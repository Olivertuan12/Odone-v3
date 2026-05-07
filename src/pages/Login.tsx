import React from 'react';
import { useAuth } from '@/src/lib/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Book, Loader2 } from 'lucide-react';

export const Login = () => {
  const { user, signIn, loading } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  
  if (loading) return <div className="h-screen w-full flex items-center justify-center">Loading...</div>;
  if (user) return <Navigate to="/calendar" />;

  const handleLogin = async () => {
    if (isAuthenticating) return;
    setError(null);
    setIsAuthenticating(true);
    try {
      await signIn();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/cancelled-popup-request') {
        // Ignore this error as it means another popup was opened or current one was cancelled
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(`Unauthorized Domain: Please add "${window.location.hostname}" to your Authorized Domains list in the Firebase Console (Authentication > Settings > Authorized domains).`);
      } else {
        setError(err.message || 'Login failed. Please check your connection.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-6 text-foreground font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
         <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand/10 rounded-full blur-[150px]" />
         <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-brand-secondary/10 rounded-full blur-[150px]" />
      </div>
      
      <motion.div 
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         className="z-10 bg-surface-2 border border-border p-8 rounded-lg shadow-2xl w-full max-w-sm flex flex-col items-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand to-transparent"></div>
        
        <div className="flex justify-center mb-6">
           <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-secondary rounded flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
             <span className="text-white text-sm font-mono font-bold tracking-tighter">RE</span>
           </div>
        </div>
        
        <h1 className="text-xl font-bold text-center text-primary mb-1 uppercase tracking-widest">RE MEDIA</h1>
        <p className="text-muted-foreground text-center text-[10px] uppercase tracking-widest mb-8 font-mono">Video Production Hub</p>
        
        <div className="space-y-3 w-full mb-8">
          <div className="flex gap-3 p-3 rounded bg-surface-3 border border-border items-center">
            <span className="text-brand text-lg">📹</span>
            <div>
               <h3 className="text-foreground text-xs font-bold uppercase tracking-widest">Workspace</h3>
               <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-tighter mt-0.5">Orders & Production</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded bg-surface-3 border border-border items-center">
            <span className="text-brand text-lg">🔍</span>
            <div>
               <h3 className="text-foreground text-xs font-bold uppercase tracking-widest">Review Hub</h3>
               <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-tighter mt-0.5">Frame-accurate feedback</p>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] rounded w-full text-center font-mono">
            {error}
          </div>
        )}
        
        <button
          onClick={handleLogin}
          disabled={isAuthenticating}
          className="w-full bg-surface-3 hover:bg-surface-4 disabled:opacity-50 text-foreground font-bold py-2.5 px-4 rounded-md text-[10px] tracking-widest transition-all flex items-center justify-center gap-3 uppercase border border-border shadow-sm group"
        >
          {isAuthenticating ? (
            <Loader2 className="w-4 h-4 animate-spin text-brand" />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
          )}
          <span>{isAuthenticating ? 'Authenticating...' : 'Login with Google'}</span>
        </button>
      </motion.div>
    </div>
  );
};
