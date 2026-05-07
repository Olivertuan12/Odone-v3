import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Home, Folder, Video, Book, Calendar, CheckSquare, Settings, Users, ChevronLeft, Menu, GripVertical } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';

export const Layout = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.shiftKey) {
        switch (e.key.toUpperCase()) {
          case 'D':
            navigate('/dashboard');
            break;
          case 'C':
            navigate('/calendar');
            break;
          case 'L':
            navigate('/clients');
            break;
          case 'B':
            navigate('/revenue');
            break;
          case 'S':
            navigate('/settings');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const [navItems, setNavItems] = useState([
    { id: 'calendar', label: 'Calendar', path: '/calendar', icon: Calendar, color: 'text-[#34d399]' },
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: Home, color: 'text-brand' },
    { id: 'video-library', label: 'Video Manage', path: '/video-library', icon: Video, color: 'text-amber-400' },
    { id: 'clients', label: 'Clients', path: '/clients', icon: Users, color: 'text-[#60a5fa]' },
    { id: 'revenue', label: 'Revenue', path: '/revenue', icon: Folder, color: 'text-[#f472b6]' },
  ]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-sans">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 200, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="h-full bg-surface-1 border-r border-border flex flex-col flex-shrink-0 relative z-50 overflow-hidden"
          >
            <div className="p-4 h-14 border-b border-border flex items-center justify-between shrink-0">
               <div className="font-bold tracking-wide text-lg flex items-center gap-2">
                 <div className="w-6 h-6 bg-gradient-to-br from-brand to-brand-secondary rounded flex items-center justify-center">
                    <span className="text-white text-[10px] font-mono font-bold tracking-tighter">RE</span>
                 </div>
                 <span className="text-primary text-sm uppercase tracking-wide font-bold ml-1">RE MEDIA</span>
               </div>
               <button 
                 onClick={() => setIsSidebarOpen(false)}
                 className="p-1.5 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground transition-all"
               >
                 <ChevronLeft className="w-4 h-4" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 custom-scrollbar">
               <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold px-2 py-2 mb-2 flex items-center justify-between">
                  <span>Workspace</span>
               </div>
               
               <div className="space-y-1">
                 {navItems.map((item) => (
                   <div key={item.id} className="group relative">
                     <Link 
                       to={item.path} 
                       className={`flex items-center gap-3 p-2.5 text-[11px] font-bold uppercase tracking-wider rounded transition-all border border-transparent ${
                         location.pathname === item.path 
                           ? 'bg-surface-3 text-foreground border-border' 
                           : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground hover:border-border'
                       }`}
                     >
                        <item.icon className={`w-4 h-4 ${location.pathname === item.path ? item.color : 'text-muted-foreground group-hover:text-foreground transition-colors'}`} />
                        {item.label}
                     </Link>
                   </div>
                 ))}
               </div>
            </div>

            <div className="p-4 border-t border-border mt-auto bg-surface-1 flex flex-col gap-3">
               <Link 
                 to="/settings"
                 className={`flex items-center gap-3 p-2.5 text-[11px] font-bold uppercase tracking-wider rounded transition-all border border-transparent ${
                   location.pathname === '/settings'
                     ? 'bg-surface-3 text-foreground border-border' 
                     : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground hover:border-border'
                 }`}
               >
                  <Settings className={`w-4 h-4 ${location.pathname === '/settings' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground transition-colors'}`} />
                  Settings
               </Link>
               
               <div className="flex items-center gap-3">
                 <img src={user?.photoURL || ''} alt="Avatar" className="w-8 h-8 rounded-full border-2 border-border shadow-xl" />
                 <div className="flex-1 min-w-0">
                   <p className="text-[11px] font-black truncate text-foreground uppercase tracking-wider">{user?.displayName || 'User'}</p>
                   <p className="text-[9px] text-muted-foreground uppercase font-mono truncate">{user?.email || 'admin@re.media'}</p>
                 </div>
                 <button 
                   onClick={async () => {
                     try {
                       await signOut();
                     } catch(e) {
                       console.error(e);
                       alert("Logout error: " + (e as Error).message);
                     }
                   }} 
                   className="text-muted-foreground hover:text-destructive p-2 rounded-lg transition-colors hover:bg-surface-3 cursor-pointer"
                 >
                    <LogOut className="w-3.5 h-3.5" />
                 </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle for closed sidebar */}
      {!isSidebarOpen && (
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-[60] w-10 h-10 bg-surface-2 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground shadow-xl"
        >
          <Menu className="w-5 h-5" />
        </motion.button>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-background z-0">
         <Outlet />
      </div>
    </div>
  );
};
