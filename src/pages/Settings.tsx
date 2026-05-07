import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Database, 
  CheckCircle2, 
  UploadCloud, 
  Plus, 
  Loader2, 
  Settings as SettingsIcon,
  User,
  Shield,
  Command,
  CreditCard,
  LogOut,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { auth, secondaryAuth, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { DriveFolderMapper } from '../components/DriveFolderMapper';

export function Settings() {
  const { user } = useAuth();
  const [storageToken, setStorageToken] = useState<string | null>(localStorage.getItem('google_drive_token'));
  const [calendarToken, setCalendarToken] = useState<string | null>(localStorage.getItem('google_calendar_token'));
  const [storageEmail, setStorageEmail] = useState<string | null>(localStorage.getItem('google_drive_email'));
  const [calendarEmail, setCalendarEmail] = useState<string | null>(localStorage.getItem('google_calendar_email'));
  
  const [driveStorage, setDriveStorage] = useState<{ used: number, total: number } | null>(null);
  const [rootFolder, setRootFolder] = useState<{ id: string, name: string } | null>(null);
  const [showFolderMapper, setShowFolderMapper] = useState(false);
  const [calendarMappings, setCalendarMappings] = useState<any[]>([]);
  const [availableCalendars, setAvailableCalendars] = useState<any[]>([]);
  const [isFetchingCalendars, setIsFetchingCalendars] = useState(false);
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [isAuthenticatingStorage, setIsAuthenticatingStorage] = useState(false);
  const [isAuthenticatingCalendar, setIsAuthenticatingCalendar] = useState(false);
  const [activeTab, setActiveTab] = useState<'integrations' | 'profile' | 'shortcuts' | 'billing'>('integrations');

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'users', user.uid, 'settings', 'integrations');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.google_drive_token && !storageToken) {
             setStorageToken(data.google_drive_token);
             setStorageEmail(data.google_drive_email);
             localStorage.setItem('google_drive_token', data.google_drive_token);
             if (data.google_drive_email) localStorage.setItem('google_drive_email', data.google_drive_email);
          }
          if (data.google_calendar_token && !calendarToken) {
             setCalendarToken(data.google_calendar_token);
             setCalendarEmail(data.google_calendar_email);
             localStorage.setItem('google_calendar_token', data.google_calendar_token);
             if (data.google_calendar_email) localStorage.setItem('google_calendar_email', data.google_calendar_email);
          }
        }

        const mappingRef = doc(db, 'users', user.uid, 'settings', 'calendar_mappings');
        const mappingSnap = await getDoc(mappingRef);
        if (mappingSnap.exists()) {
          setCalendarMappings(mappingSnap.data().mappings || []);
        }

        const projectConfigRef = doc(db, 'users', user.uid, 'settings', 'project_config');
        const projectConfigSnap = await getDoc(projectConfigRef);
        if (projectConfigSnap.exists()) {
          const rf = projectConfigSnap.data().rootFolder;
          if (rf) {
            setRootFolder(rf);
            localStorage.setItem('drive_root_folder', rf.id);
          }
        }
      } catch (e) {
        console.error('Failed to fetch settings', e);
      }
    };
    fetchSettings();
  }, [user]);

  const fetchDriveStorage = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota(usage,limit,usageInDrive,usageInDriveTrash)', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.storageQuota) {
          setDriveStorage({
            used: Number(data.storageQuota.usageInDrive || data.storageQuota.usage || 0),
            total: Number(data.storageQuota.limit || -1)
          });
        }
      } else if (response.status === 401) {
        handleDisconnectStorage();
      }
    } catch (e) {
      console.error("Error fetching drive storage:", e);
    }
  };

  const fetchAvailableCalendars = async (token: string) => {
    setIsFetchingCalendars(true);
    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableCalendars(data.items || []);
      } else if (response.status === 401) {
        handleDisconnectCalendar();
      }
    } catch (e) {
      console.error("Error fetching calendars:", e);
    } finally {
      setIsFetchingCalendars(false);
    }
  };

  useEffect(() => {
    if (storageToken) fetchDriveStorage(storageToken);
  }, [storageToken]);

  useEffect(() => {
    if (calendarToken) fetchAvailableCalendars(calendarToken);
  }, [calendarToken]);

  const saveToFirestore = async (key: string, token: string | null, emailKey: string, email: string | null) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    try {
       const docRef = doc(db, 'users', currentUid, 'settings', 'integrations');
       await setDoc(docRef, { [key]: token, [emailKey]: email }, { merge: true });
    } catch(e) {
       console.error("Failed saving to DB", e);
    }
  };

  const handleConnectStorage = async () => {
    if (isAuthenticatingStorage) return;
    setIsAuthenticatingStorage(true);
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
        setStorageToken(credential.accessToken);
        setStorageEmail(result.user.email);
        localStorage.setItem('google_drive_token', credential.accessToken);
        localStorage.setItem('google_drive_email', result.user.email || '');
        await saveToFirestore('google_drive_token', credential.accessToken, 'google_drive_email', result.user.email);
        fetchDriveStorage(credential.accessToken);
      }
      await signOut(secondaryAuth);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // Ignore cancelled requests
        if (error.code === 'auth/popup-closed-by-user') {
          alert("The authentication popup was closed before completion. Please try again and keep the popup open until finished. If the popup didn't appear, check if your browser is blocking popups.");
        }
      } else {
        console.error("Error authenticating drive:", error);
        alert(`Authentication error: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsAuthenticatingStorage(false);
    }
  };

  const handleDisconnectStorage = async () => {
    localStorage.removeItem('google_drive_token');
    localStorage.removeItem('google_drive_email');
    setStorageToken(null);
    setStorageEmail(null);
    setDriveStorage(null);
    await saveToFirestore('google_drive_token', null, 'google_drive_email', null);
  };

  const handleConnectCalendar = async () => {
    if (isAuthenticatingCalendar) return;
    setIsAuthenticatingCalendar(true);
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
        setCalendarToken(credential.accessToken);
        setCalendarEmail(result.user.email);
        localStorage.setItem('google_calendar_token', credential.accessToken);
        localStorage.setItem('google_calendar_email', result.user.email || '');
        await saveToFirestore('google_calendar_token', credential.accessToken, 'google_calendar_email', result.user.email);
        fetchAvailableCalendars(credential.accessToken);
      }
      await signOut(secondaryAuth);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // Ignore cancelled requests
        if (error.code === 'auth/popup-closed-by-user') {
          alert("The authentication popup was closed before completion. Please try again and keep the popup open until finished. If the popup didn't appear, check if your browser is blocking popups.");
        }
      } else {
        console.error("Error authenticating calendar:", error);
        alert(`Authentication error: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsAuthenticatingCalendar(false);
    }
  };
  
  const handleDisconnectCalendar = async () => {
    localStorage.removeItem('google_calendar_token');
    localStorage.removeItem('google_calendar_email');
    setCalendarToken(null);
    setCalendarEmail(null);
    setAvailableCalendars([]);
    await saveToFirestore('google_calendar_token', null, 'google_calendar_email', null);
  };

  const handleClearSyncedEvents = async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    if (!confirm('Are you sure you want to delete all cached events?')) return;
    try {
      const snapshot = await getDocs(query(collection(db, `users/${currentUid}/calendar_events`)));
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, `users/${currentUid}/calendar_events`, docSnap.id));
      }
      alert('Local calendar events cache cleared successfully.');
    } catch (e: any) {
      alert(`Error clearing events: ${e.message}`);
    }
  };

  const handleSaveMappings = async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    setIsSavingMappings(true);
    try {
      await setDoc(doc(db, `users/${currentUid}/settings`, 'calendar_mappings'), {
        mappings: calendarMappings,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${currentUid}/settings/calendar_mappings`);
    } finally {
      setIsSavingMappings(false);
    }
  };

  const handleSaveRootFolder = async (folderId: string, folderName: string) => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    try {
      await setDoc(doc(db, `users/${currentUid}/settings`, 'project_config'), {
        rootFolder: { id: folderId, name: folderName },
        updatedAt: serverTimestamp()
      }, { merge: true });
      setRootFolder({ id: folderId, name: folderName });
      localStorage.setItem('drive_root_folder', folderId);
      setShowFolderMapper(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${currentUid}/settings/project_config`);
    }
  };

  const navItems = [
    { id: 'integrations', label: 'Integrations', icon: RefreshCw },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'shortcuts', label: 'Hotkeys', icon: Command },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return 'Unlimited';
    if (bytes === 0) return '0.00 GB';
    const tb = bytes / (1000 ** 4);
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = bytes / (1000 ** 3);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#E0E0E0] overflow-hidden">
      {/* App Header Bar (Matches Calendar) */}
      <header className="h-12 shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505] z-10">
        <div className="flex items-center gap-6">
           <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">System Settings</h1>
           <div className="text-[9px] text-white/20 px-2 py-0.5 rounded font-mono uppercase border border-white/5">v4.2.0.stable</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="h-4 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-mono text-white/40">{user?.email}</div>
            <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[10px] font-bold text-indigo-400">
              {user?.displayName?.charAt(0) || 'A'}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Settings Sidebar */}
        <aside className="w-64 shrink-0 border-r border-white/5 bg-[#080809] flex flex-col p-4 gap-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                activeTab === item.id 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-widest leading-none">{item.label}</span>
              {activeTab === item.id && <div className="ml-auto w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />}
            </button>
          ))}
          
          <div className="mt-auto pt-6 border-t border-white/5">
            <button 
              onClick={async () => {
                localStorage.removeItem('google_drive_token');
                localStorage.removeItem('google_drive_email');
                localStorage.removeItem('google_calendar_token');
                localStorage.removeItem('google_calendar_email');
                localStorage.removeItem('drive_root_folder');
                await auth.signOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400/50 hover:text-red-400 hover:bg-red-400/5 transition-all text-[11px] font-black uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              Sign Out Hub
            </button>
          </div>
        </aside>

        {/* Settings Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0A0A0B] p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            
            <AnimatePresence mode="wait">
              {activeTab === 'integrations' && (
                <motion.div 
                  key="integrations"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="space-y-1 border-l-2 border-indigo-500 pl-6 py-1">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-white">External Nodes</h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-mono">Configure API bridge connections</p>
                  </div>

                  <div className="bg-[#121214] border border-white/5 rounded-2xl p-6">
                     <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                           <User className="w-5 h-5" />
                        </div>
                        <div>
                           <h2 className="text-[13px] font-black uppercase tracking-widest text-white/90">Core Identity Config</h2>
                           <p className="text-[11px] text-white/40">This account was used to login. It does NOT automatically sync your Drive or Calendar.</p>
                        </div>
                     </div>
                     <div className="px-4 py-3 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-mono text-white/70">{user.email || 'Unknown User'}</span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase font-bold tracking-widest">Active Database Identity</span>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Google Drive Connection */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 flex flex-col relative overflow-hidden group shadow-xl hover:border-white/10 transition-all">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Database className="w-16 h-16 rotate-12" />
                      </div>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                          <Database className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-black uppercase tracking-widest text-white">Google Drive</h3>
                          <p className="text-[9px] text-white/20 uppercase font-mono">Storage Cluster</p>
                        </div>
                      </div>

                       {storageToken ? (
                        <div className="space-y-6 flex-1">
                          <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-mono text-emerald-400">{storageEmail}</span>
                            </div>
                            <button onClick={handleDisconnectStorage} className="text-[9px] text-white/20 hover:text-red-400 uppercase font-bold transition-colors">Disconnect</button>
                          </div>
                          
                          {driveStorage && (
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-white/40 uppercase">Storage Cluster Load</span>
                                <span className="text-white/60">{formatStorage(driveStorage.used)} / {formatStorage(driveStorage.total)}</span>
                              </div>
                              <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                <div 
                                  className="h-full bg-amber-500 transition-all duration-1000 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                                  style={{ width: `${Math.round((driveStorage.used / driveStorage.total) * 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="pt-4 border-t border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60">Project Root</h4>
                                <p className="text-[8px] text-white/20 uppercase font-mono">{rootFolder ? rootFolder.name : 'Not Allocated'}</p>
                              </div>
                              <button 
                                onClick={() => setShowFolderMapper(!showFolderMapper)}
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-white/5"
                              >
                                {showFolderMapper ? 'Cancel' : (rootFolder ? 'Change' : 'Configure')}
                              </button>
                            </div>

                            {showFolderMapper && storageToken && (
                              <DriveFolderMapper 
                                accessToken={storageToken}
                                currentRootId={rootFolder?.id}
                                onSelectRoot={handleSaveRootFolder}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center py-4">
                           <button 
                             onClick={handleConnectStorage}
                             disabled={isAuthenticatingStorage}
                             className="w-full py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                           >
                              {isAuthenticatingStorage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              {isAuthenticatingStorage ? 'Authenticating...' : 'Initialize Bridge'}
                           </button>
                        </div>
                      )}
                    </div>

                    {/* Google Calendar Connection */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-6 flex flex-col relative overflow-hidden group shadow-xl hover:border-white/10 transition-all">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Calendar className="w-16 h-16 -rotate-12" />
                      </div>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                          <Calendar className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-black uppercase tracking-widest text-white">Google Calendar</h3>
                          <p className="text-[9px] text-white/20 uppercase font-mono">Temporal Interface</p>
                        </div>
                      </div>

                      {calendarToken ? (
                        <div className="space-y-6 flex-1">
                          <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-mono text-emerald-400">{calendarEmail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                               <button onClick={handleClearSyncedEvents} className="text-[9px] text-white/50 hover:text-white uppercase font-bold transition-colors border border-white/10 px-2 py-1 rounded">Clear Synced</button>
                               <button onClick={handleDisconnectCalendar} className="text-[9px] text-white/20 hover:text-red-400 uppercase font-bold transition-colors">Disconnect</button>
                            </div>
                          </div>
                          <div className="text-[9px] text-white/30 uppercase leading-relaxed font-mono">
                            Syncing {availableCalendars.length} calendar nodes into system buffer.
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center py-4">
                           <button 
                             onClick={handleConnectCalendar}
                             disabled={isAuthenticatingCalendar}
                             className="w-full py-3 px-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                           >
                              {isAuthenticatingCalendar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                              {isAuthenticatingCalendar ? 'Authenticating...' : 'Connect Temporal Node'}
                           </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {calendarToken && (
                    <div className="flex-1 flex flex-col gap-6">
                       <div className="flex items-center justify-between">
                          <div className="space-y-1">
                             <h3 className="text-xs font-black uppercase tracking-widest text-white">Node Allocation Matrix</h3>
                             <p className="text-[9px] text-white/20 uppercase font-mono">Map active calendars to production editors</p>
                          </div>
                          <button 
                            onClick={handleSaveMappings}
                            disabled={isSavingMappings}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                          >
                             {isSavingMappings ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                             Save Matrix
                          </button>
                       </div>

                       <div className="grid grid-cols-1 gap-2 border border-white/5 bg-black/20 rounded-2xl overflow-hidden p-2">
                          <AnimatePresence mode="popLayout">
                            {isFetchingCalendars ? (
                              <div className="h-48 flex flex-col items-center justify-center text-white/20 gap-4">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                                <span className="text-[9px] font-mono uppercase tracking-widest">Scanning network streams...</span>
                              </div>
                            ) : availableCalendars.length > 0 ? (
                              availableCalendars.map((cal, idx) => {
                                 const currentMapping = calendarMappings.find(m => m.calendarId === cal.id);
                                 return (
                                   <motion.div 
                                     key={`cal-${cal.id}`}
                                     initial={{ opacity: 0, x: -10 }}
                                     animate={{ opacity: 1, x: 0 }}
                                     transition={{ delay: idx * 0.05 }}
                                     className="flex items-center justify-between p-4 bg-[#121214] border border-white/5 rounded-xl hover:border-white/10 transition-all group"
                                   >
                                      <div className="flex items-center gap-4 flex-1 truncate">
                                         <div 
                                           className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]" 
                                           style={{ color: cal.backgroundColor, backgroundColor: cal.backgroundColor }} 
                                         />
                                         <div className="truncate">
                                            <div className="text-[11px] font-black text-white/80 uppercase truncate group-hover:text-white transition-colors">{cal.summary}</div>
                                            <div className="text-[8px] font-mono text-white/20 truncate">{cal.id}</div>
                                         </div>
                                      </div>

                                      <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 ml-4">
                                         {['Kyle', 'Jack', 'Unassigned'].map(name => {
                                            const isActive = currentMapping?.shooterName === name || (!currentMapping && name === 'Unassigned');
                                            return (
                                              <button
                                                key={name}
                                                onClick={() => {
                                                   const others = calendarMappings.filter(m => m.calendarId !== cal.id);
                                                   if (name === 'Unassigned') {
                                                      setCalendarMappings(others);
                                                   } else {
                                                      setCalendarMappings([...others, { calendarId: cal.id, shooterName: name }]);
                                                   }
                                                }}
                                                className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${
                                                  isActive 
                                                    ? (name === 'Kyle' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 
                                                       name === 'Jack' ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/40 shadow-[0_0_10px_rgba(217,70,239,0.1)]' :
                                                       'bg-white/10 text-white border border-white/10')
                                                    : 'text-white/10 hover:text-white/40 border border-transparent'
                                                }`}
                                              >
                                                {name}
                                              </button>
                                            )
                                         })}
                                      </div>
                                   </motion.div>
                                 )
                              })
                            ) : (
                              <div className="h-32 flex flex-col items-center justify-center text-white/10 gap-3">
                                <AlertCircle className="w-5 h-5" />
                                <span className="text-[10px] font-mono uppercase">Interface Offline</span>
                              </div>
                            )}
                          </AnimatePresence>
                       </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'profile' && (
                <motion.div 
                  key="profile"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="space-y-1 border-l-2 border-indigo-500 pl-6 py-1">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-white">Operator Profile</h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-mono">System user record</p>
                  </div>

                  <div className="bg-[#121214] border border-white/5 rounded-2xl p-8 space-y-10">
                    <div className="flex items-center gap-8">
                       <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl font-black text-indigo-400">
                         {user?.displayName?.charAt(0) || 'A'}
                       </div>
                       <div className="space-y-2">
                          <h3 className="text-xl font-black text-white uppercase tracking-tighter">{user?.displayName || 'Editor Node'}</h3>
                          <p className="text-xs font-mono text-white/40">{user?.uid}</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Alias</label>
                          <input 
                            type="text" 
                            defaultValue={user?.displayName || ""}
                            readOnly
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/60 focus:outline-none"
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Auth Email</label>
                          <input 
                            type="text" 
                            defaultValue={user?.email || ""}
                            readOnly
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/60 focus:outline-none"
                          />
                       </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 flex gap-4">
                       <button className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">Update Descriptor</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'shortcuts' && (
                <motion.div 
                  key="shortcuts"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="space-y-1 border-l-2 border-indigo-500 pl-6 py-1">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-white">Neural Hotkeys</h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-mono">Input acceleration protocols</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { key: 'SHIFT + D', desc: 'Jump to Main Dashboard Node' },
                      { key: 'SHIFT + C', desc: 'Jump to Temporal Logistics' },
                      { key: 'SHIFT + L', desc: 'Jump to Client Database' },
                      { key: 'SHIFT + B', desc: 'Jump to Revenue Protocol' },
                      { key: 'SHIFT + S', desc: 'System Configuration' }
                    ].map((hk, i) => (
                      <div key={i} className="bg-[#121214] border border-white/5 p-5 rounded-2xl flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                        <span className="text-[11px] font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">
                           {hk.desc}
                        </span>
                        <div className="flex items-center gap-1">
                           {hk.key.split(' + ').map((k, j) => (
                             <React.Fragment key={j}>
                               <kbd className="px-2.5 py-1.5 bg-black border border-white/10 rounded-lg font-mono text-[10px] text-white shadow-inner">{k}</kbd>
                               {j === 0 && <span className="text-indigo-400 font-black px-1 text-[10px]">+</span>}
                             </React.Fragment>
                           ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'billing' && (
                <motion.div 
                  key="billing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="space-y-1 border-l-2 border-indigo-500 pl-6 py-1">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-white">Revenue Ledger</h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-mono">Financial node configuration</p>
                  </div>

                  <div className="p-20 text-center border border-white/5 bg-[#121214] rounded-2xl space-y-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
                     <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-500">
                        <CreditCard className="w-8 h-8 text-indigo-400" />
                     </div>
                     <div className="space-y-2">
                        <h3 className="text-lg font-black uppercase tracking-widest text-white">Enterprise Node</h3>
                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] max-w-sm mx-auto">This workspace is currently part of an enterprise high-throughput license cluster. Billing handles are managed at root level.</p>
                     </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </main>
      </div>
    </div>
  );
}
