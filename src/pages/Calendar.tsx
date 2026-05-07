import React, { useState, useEffect, useRef } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, subDays, parseISO } from 'date-fns';
import { googleDriveService } from '../services/googleDriveService';
import { getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Video, Plus, Youtube, Calendar, Clock, Archive, UploadCloud, ExternalLink, Upload, Play, FolderPlus, Loader2, Camera, Folder, Cloud, FolderSearch, RefreshCcw, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, getDocs, setDoc, doc, serverTimestamp, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from '@/src/lib/AuthContext';
import { reauthenticateCalendar } from '@/src/services/googleAuthHelpers';
import { v4 as uuidv4 } from 'uuid';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const FileDropzone = ({ 
  onFilesDrop, 
  title, 
  icon: Icon, 
  accept, 
  isUploading, 
  folderId,
  count,
  onRefresh,
  isRefreshing
}: { 
  onFilesDrop: (files: FileList) => void, 
  title: string, 
  icon: any, 
  accept: string, 
  isUploading: boolean,
  folderId?: string,
  count?: number,
  onRefresh?: () => void,
  isRefreshing?: boolean
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesDrop(e.dataTransfer.files);
    }
  };

  if (!folderId && !onRefresh) return (
    <div 
      className="relative group border-2 border-dashed border-white/5 bg-white/[0.02] rounded-xl p-4 flex flex-col items-center justify-center gap-2 opacity-50 cursor-not-allowed"
    >
      <div className="p-2 rounded-lg bg-white/5 text-white/20">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-center">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{title}</div>
        <div className="text-[7px] text-white/20 uppercase font-bold mt-0.5 whitespace-nowrap">Template needed</div>
      </div>
    </div>
  );

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (!folderId && onRefresh) {
           // We'll handle this in the parent for auto-template creation
        } else {
           inputRef.current?.click();
        }
      }}
      className={`relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center gap-2 ${
        isDragActive 
          ? 'border-indigo-500 bg-indigo-500/10' 
          : folderId 
            ? 'border-white/5 hover:border-white/10 bg-white/[0.02]'
            : 'border-white/5 bg-white/[0.01] opacity-60'
      }`}
    >
      <input 
        type="file" 
        ref={inputRef}
        onChange={(e) => e.target.files && onFilesDrop(e.target.files)}
        accept={accept}
        multiple
        className="hidden"
      />

      {count !== undefined && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[7px] font-black text-indigo-400 uppercase tracking-tighter">
          {count} Files
        </div>
      )}

      {onRefresh && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/5 z-20"
        >
          {isRefreshing ? <Loader2 className="w-2.5 h-2.5 animate-spin"/> : <RefreshCcw className="w-2.5 h-2.5" />}
        </button>
      )}
      
      <div className={`p-2 rounded-lg ${isDragActive ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/40'}`}>
        <Icon className="w-5 h-5" />
      </div>
      
      <div className="text-center">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/60">{title}</div>
        <div className="text-[8px] text-white/30 uppercase font-bold mt-0.5">Click or drag to upload</div>
      </div>

      {isUploading && (
        <div className="absolute inset-0 bg-[#0D0D0E]/80 rounded-xl flex items-center justify-center backdrop-blur-sm z-10">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        </div>
      )}
    </div>
  );
};

export const CalendarPage = () => {
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem('calendar_currentDate');
    return saved ? new Date(saved) : new Date();
  });
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showProjectSelect, setShowProjectSelect] = useState<{eventId: string, x: number, y: number} | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDriveLinked, setIsDriveLinked] = useState(!!localStorage.getItem('drive_linked'));
  const [driveStorage, setDriveStorage] = useState<{ used: number, total: number } | null>(null);
  const [rootFolder, setRootFolder] = useState<{ id: string, name: string } | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [uploads, setUploads] = useState<{[key: string]: { progress: number, name: string, status: 'pending' | 'uploading' | 'completed' | 'error', type?: string, startTime?: number }}>({});
  const [fileCounts, setFileCounts] = useState<{[key: string]: number}>({});
  const [isRefreshingCounts, setIsRefreshingCounts] = useState<{[key: string]: boolean}>({});
  const [isUploadHistoryExpanded, setIsUploadHistoryExpanded] = useState<{[key: string]: boolean}>({});
  const [calendarMappings, setCalendarMappings] = useState<any[]>([]);
  const [availableCalendars, setAvailableCalendars] = useState<any[]>([]);
  const [isFetchingCalendars, setIsFetchingCalendars] = useState(false);
  
  const [view, setView] = useState<'month' | 'week'>(() => {
    return (sessionStorage.getItem('calendar_view') as 'month' | 'week') || 'month';
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem('calendar_selectedDate');
    return saved ? new Date(saved) : new Date();
  });
  
  const handleUpdateCalendarMapping = async (calId: string, shooterName: string, isEnabled: boolean) => {
    if (!user) return;
    
    let newMappings = [...calendarMappings];
    const existingIdx = newMappings.findIndex(m => m.calendarId === calId);
    
    if (!isEnabled) {
      if (existingIdx >= 0) newMappings.splice(existingIdx, 1);
    } else {
      if (existingIdx >= 0) {
        newMappings[existingIdx].shooterName = shooterName;
      } else {
        newMappings.push({ calendarId: calId, shooterName });
      }
    }
    
    setCalendarMappings(newMappings);
    
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'calendar_mappings'), {
        mappings: newMappings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // Auto-refresh events after mapped calendars change
      if (accessToken) {
        fetchCalendarEvents(accessToken);
      }
    } catch (e) {
      console.error("Error saving calendar mappings:", e);
    }
  };
  const [shooterFilter, setShooterFilter] = useState<string>('All');
  
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showOtherEvents, setShowOtherEvents] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('google_calendar_token'));
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState(() => {
    return sessionStorage.getItem('calendar_searchQuery') || '';
  });
  const [showAddEventModal, setShowAddEventModal] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('calendar_currentDate', currentDate.toISOString());
  }, [currentDate]);

  useEffect(() => {
    sessionStorage.setItem('calendar_view', view);
  }, [view]);

  useEffect(() => {
    sessionStorage.setItem('calendar_selectedDate', selectedDate.toISOString());
  }, [selectedDate]);

  useEffect(() => {
    sessionStorage.setItem('calendar_shooterFilter', shooterFilter);
  }, [shooterFilter]);

  useEffect(() => {
    sessionStorage.setItem('calendar_searchQuery', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('google_calendar_token', accessToken);
    } else {
      localStorage.removeItem('google_calendar_token');
    }
  }, [accessToken]);

  const extractClientInfo = (description: string) => {
    if (!description) return { name: '', email: '', phone: '' };
    
    const emailMatch = description.match(/(?:mailto:)?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    const phoneMatch = description.match(/(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})/);
    
    const cleanText = description.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    
    const labelMatch = description.match(/(?:Client|Name|Customer|Buyer|Contact|Người đặt|Tên kh|Tên|Khách hàng|Khách|Người liên hệ|Tên người đặt):\s*([^\n\r,;<>]+)/i);
    let name = '';
    
    if (labelMatch) {
      name = labelMatch[1].trim();
    } else {
      const potentialNames = cleanText.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);
      if (potentialNames) name = potentialNames[0];
    }

    return {
      name: name || 'Valued Client',
      email: emailMatch ? (emailMatch[1] || emailMatch[0]).trim() : '',
      phone: phoneMatch ? phoneMatch[0].trim() : ''
    };
  };

  const getStatusConfig = (status: string | undefined) => {
    const s = status || 'Waiting for Raw';
    const configs: Record<string, { bg: string, text: string, border: string, dot: string, label: string }> = {
      'Waiting for Raw': { bg: 'bg-white/5', text: 'text-white/40', border: 'border-white/10', dot: 'bg-white/20', label: 'WAITING FOR RAW' },
      'Order Created': { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', dot: 'bg-sky-500', label: 'ORDER CREATED' },
      'Uploaded': { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20', dot: 'bg-pink-500', label: 'UPLOADED' },
      'Editing': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500', label: 'EDITING' },
      'Revision': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500', label: 'REVISION' },
      'Delivered': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500', label: 'DELIVERED' },
      'Archived': { bg: 'bg-white/5', text: 'text-white/20', border: 'border-white/5', dot: 'bg-white/10', label: 'ARCHIVED' },
    };
    // Fallback for legacy statuses or unknown ones
    if (s === 'Draft') return configs['Waiting for Raw'];
    if (s === 'Confirmed') return configs['Order Created'];
    if (s === 'Scheduled') return configs['Order Created'];
    if (s === 'Completed') return configs['Delivered'];
    
    return configs[s] || configs['Waiting for Raw'];
  };

  const cleanHtml = (htmlDesc: string) => {
    if (!htmlDesc) return [];
    const text = htmlDesc
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|h[1-6]|li)>/gi, '\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 [$1]')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    return text.split('\n').map((l: string) => l.replace(/\s+/g, ' ').trim());
  };

  const detectPlatform = (lines: string[]) => {
    const full = lines.join(' ').toLowerCase();
    if (full.includes('hd.pics/su/') || lines.some(l => l.includes('hd.pics/su/'))) {
      return 'hdphotohub';
    }
    if (full.includes('order items') && (full.includes('intake answers') || full.includes('order id'))) {
      return 'fotello';
    }
    return 'starep';
  };

  const parseHDPhotoHub = (lines: string[]) => {
    const urlIdx = lines.findIndex((l: string) => l.includes('hd.pics/su/'));
    const sqftIdx = lines.findIndex((l: string) => l.toLowerCase().includes('sqft'));
    const orderItems: string[] = [];
    
    if (urlIdx !== -1) {
      const serviceLines = lines.slice(urlIdx + 1, sqftIdx !== -1 ? sqftIdx : lines.length);
      serviceLines.forEach((l: string) => {
        if (l.includes(':')) {
          const item = l.split(':')[1].trim();
          if (item && !orderItems.includes(item)) {
            orderItems.push(item);
          }
        }
      });
    }

    return {
      items: orderItems,
      intake: [],
      orderId: '',
      photographers: ''
    };
  };

  const parseStarep = (lines: string[]) => {
    const getBlock = (start: string, end?: string) => {
      let si = lines.findIndex((l: string) => l.toLowerCase().includes(start.toLowerCase()));
      let ei = end ? lines.findIndex((l: string, i: number) => i > si && l.toLowerCase().includes(end.toLowerCase())) : lines.length;
      if (si === -1) return [];
      if (ei === -1) ei = lines.length;
      return lines.slice(si + 1, ei).filter((l: string) => !/^[=-]{3,}$/.test(l) && l.length > 0);
    };

    const pkgLines = getBlock('Booked packages and services', 'Location');
    const orderItems = pkgLines.length > 1 ? pkgLines.slice(1).map((i: string) => i.replace(/^- /, '').trim()) : [];
    
    const intake: {q: string, a: string}[] = [];
    const entryNotes = getBlock('Entry Notes', 'Amenities').join('\n');
    if (entryNotes) intake.push({ q: 'Entry Notes', a: entryNotes });
    const amenities = getBlock('Amenities', 'Client Preferences').join('\n');
    if (amenities) intake.push({ q: 'Amenities or features to highlight', a: amenities });
    const prefs = getBlock('Client Preferences', 'Photographers').join('\n');
    if (prefs) intake.push({ q: 'Client Preferences', a: prefs });

    return {
      items: orderItems,
      intake,
      orderId: '',
      photographers: getBlock('Photographers', '---').filter((l: string) => l.length > 0).join(', ')
    };
  };

  const parseFotello = (lines: string[]) => {
    const oiStart = lines.findIndex((l: string) => l.toLowerCase() === 'order items');
    const oiEnd = lines.findIndex((l: string, i: number) => i > oiStart && (l.toLowerCase() === 'intake answers' || l.toLowerCase().startsWith('order id')));
    
    const orderItems: string[] = [];
    if (oiStart !== -1) {
      const end = oiEnd !== -1 ? oiEnd : lines.length;
      const oiLines = lines.slice(oiStart + 1, end).filter((l: string) => l.length > 0);
      oiLines.forEach((l: string) => {
        const cleaned = l.replace(/^[•◦]\s*/, '').trim();
        if (cleaned) orderItems.push(cleaned);
      });
    }

    const iaStart = lines.findIndex((l: string) => l.toLowerCase() === 'intake answers');
    const iaEnd = lines.findIndex((l: string, i: number) => i > iaStart && l.toLowerCase().startsWith('order id'));
    const intake: {q: string, a: string}[] = [];
    
    if (iaStart !== -1) {
      const end = iaEnd !== -1 ? iaEnd : lines.length;
      const iaLines = lines.slice(iaStart + 1, end).filter((l: string) => l.length > 0);
      
      let currentQ: {q: string, a: string} | null = null;
      iaLines.forEach((l: string) => {
        const cleaned = l.replace(/^[•◦]\s*/, '').trim();
        if (!cleaned) return;
        
        if (l.startsWith('•')) {
          if (currentQ) intake.push(currentQ);
          currentQ = { q: cleaned, a: '' };
        } else if (currentQ) {
          currentQ.a = currentQ.a ? currentQ.a + ' ' + cleaned : cleaned;
        }
      });
      if (currentQ) intake.push(currentQ);
    }

    const oidLine = lines.find((l: string) => l.toLowerCase().startsWith('order id'));
    let orderId = '';
    if (oidLine) {
      const oidIdx = lines.indexOf(oidLine);
      if (oidIdx + 1 < lines.length) {
        orderId = lines[oidIdx + 1].trim();
      }
    }

    return {
      items: orderItems,
      intake,
      orderId,
      photographers: ''
    };
  };

  const parseDescriptionSections = (description: string) => {
    if (!description) return { items: [], intake: [], orderId: '', photographers: '', clientEmail: '' };
    
    const emailMatch = description.match(/(?:mailto:)?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
    const clientEmail = emailMatch ? (emailMatch[1] || emailMatch[0]).trim() : '';

    const lines = cleanHtml(description);
    const platform = detectPlatform(lines);
    
    let result;
    if (platform === 'hdphotohub') {
      result = parseHDPhotoHub(lines);
    } else if (platform === 'fotello') {
      result = parseFotello(lines);
    } else {
      result = parseStarep(lines);
    }

    if (!result.photographers) {
       const photoMatch = description.match(/(?:Photographers|Photographer|Shooter)s?[:\s\r\n=]+([^<]*)/i);
       if (photoMatch) result.photographers = photoMatch[1].replace(/<[^>]*>?/gm, '').trim();
    }

    return { ...result, clientEmail };
  };

  useEffect(() => {
    const checkAndClearOldEvents = async () => {
      if (user?.email === 'olivertuan198@gmail.com' && !localStorage.getItem('cleared_events_olivertuan198_v2')) {
        try {
          const q = query(collection(db, `users/${user.uid}/calendar_events`));
          const snapshot = await getDocs(q);
          const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, `users/${user.uid}/calendar_events`, docSnap.id)));
          await Promise.all(deletePromises);
          localStorage.setItem('cleared_events_olivertuan198_v2', 'true');
          console.log("Cleared old events for olivertuan198 v2");
        } catch (e) {
          console.error("Failed to clear events", e);
        }
      }
    };
    checkAndClearOldEvents();

    const fetchLocalEvents = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, `users/${user.uid}/calendar_events`));
        const snapshot = await getDocs(q);
        const localEvents = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          date: doc.data().date 
        }));
        
        if (localEvents.length > 0) {
          setEvents(localEvents);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${user.uid}/calendar_events`);
      }
    };
    fetchLocalEvents();
  }, [user]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProjects(projs);
        if (projs.length > 0) setSelectedProjectId(projs[0].id);
      } catch(e) {
        handleFirestoreError(e, OperationType.GET, 'projects');
      }
    };
    fetchProjects();
  }, [user]);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, `users/${user.uid}/settings/calendar_mappings`);
        const snapshot = await getDocs(query(collection(db, `users/${user.uid}/settings`)));
        const mappingsDoc = snapshot.docs.find(d => d.id === 'calendar_mappings');
        if (mappingsDoc) {
          setCalendarMappings(mappingsDoc.data().mappings || []);
        }
      } catch (e) {
        console.error("Error fetching settings:", e);
      }
    };
    fetchSettings();
  }, [user]);

  useEffect(() => {
    const fetchProjectConfig = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, `users/${user.uid}/settings/project_config`);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          setRootFolder(snapshot.data().rootFolder || null);
        }
      } catch (e) {
        console.error("Error fetching project config:", e);
      }
    };
    fetchProjectConfig();
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
      }
    } catch (e) {
      console.error("Error fetching drive storage:", e);
    }
  };

  useEffect(() => {
    const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
    if (driveToken) {
      fetchDriveStorage(driveToken);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && user) {
      const hasSynced = sessionStorage.getItem(`synced_calendar_${user.uid}`);
      
      if (availableCalendars.length === 0) {
        fetchAvailableCalendars(accessToken).then((cals) => {
          if (!hasSynced) {
            fetchCalendarEvents(accessToken, cals);
          }
        });
      } else {
        if (!hasSynced) {
          fetchCalendarEvents(accessToken, availableCalendars);
        }
      }
    }
  }, [accessToken, user]);

  const authenticateCalendar = async () => {
    if (!user || isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      const newToken = await reauthenticateCalendar(user.uid);
      if (newToken) {
        setAccessToken(newToken);
        // The useEffect will catch the accessToken update and trigger the fetches
      }
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        if (e.code === 'auth/popup-closed-by-user') {
          alert("The authentication popup was closed before completion. Please try again and keep the popup open until finished. If the popup didn't appear, check if your browser is blocking popups.");
        }
      } else if (e.message !== 'Authentication already in progress') {
        console.error("Error authenticating calendar:", e);
        alert(`Authentication error: ${e.message || 'Unknown error'}`);
      }
    } finally {
      setIsAuthenticating(false);
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
        return data.items || [];
      } else if (response.status === 401) {
        setAccessToken(null);
      }
    } catch (e) {
      console.error("Error fetching calendars:", e);
    } finally {
      setIsFetchingCalendars(false);
    }
    return [];
  };

  const fetchCalendarEvents = async (token: string, calsList?: any[]) => {
    setIsLoadingEvents(true);
    setSyncProgress(1);
    try {
      const timeMin = startOfMonth(subMonths(currentDate, 1)).toISOString();
      const timeMax = endOfMonth(addMonths(currentDate, 6)).toISOString();
      
      const calsToUse = calsList || availableCalendars;
      // Default to checking all available calendars if no manual mappings exists
      let calendarsToFetch = calendarMappings.length > 0 
        ? calendarMappings.map(m => ({ id: m.calendarId, shooter: m.shooterName }))
        : (calsToUse.length > 0 ? calsToUse.map(c => {
            const summaryLower = (c.summary || '').toLowerCase();
            let autoShooter = 'Unassigned';
            if (summaryLower.includes('kyle')) autoShooter = 'Kyle';
            else if (summaryLower.includes('jack')) autoShooter = 'Jack';
            
            return { 
              id: c.id, 
              shooter: autoShooter,
              summary: c.summary 
            };
          }) : [{ id: 'primary', shooter: user?.displayName || 'Editor' }]);

      let allFreshEvents: any[] = [];

      for (let i = 0; i < calendarsToFetch.length; i++) {
        const cal = calendarsToFetch[i];
        try {
          const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (!response.ok) {
            console.error(`Google Calendar API Error for ${cal.id}:`, await response.text());
            if (response.status === 401) {
              setAccessToken(null);
              localStorage.removeItem('google_calendar_token');
            }
            continue;
          }

          const data = await response.json();
          if (data.items) {
             const freshEvents = data.items.map((item: any) => {
               const extracted = extractClientInfo(item.description || '');
               return {
                 id: item.id,
                 title: item.summary || 'Untitled Event',
                 date: item.start.dateTime || item.start.date,
                 description: item.description || '',
                 location: item.location || '',
                 htmlLink: item.htmlLink || '',
                 type: item.eventType || 'meeting',
                 colorId: item.colorId || null,
                 calendarId: cal.id,
                 calendarShooter: cal.shooter,
                 clientName: extracted.name,
                 clientEmail: extracted.email,
                 clientPhone: extracted.phone
               };
             }).filter((e: any) => e.date);
             allFreshEvents = [...allFreshEvents, ...freshEvents];
          }
        } catch(err) {
          console.error("Error fetching for calendar", cal.id, err);
        }
      }
      
      if (user && allFreshEvents.length > 0) {
        const total = allFreshEvents.length;
        for (let i = 0; i < total; i++) {
          const evt = allFreshEvents[i];
          
          // Parse description to determine if it's a real order
          const parsed = parseDescriptionSections(evt.description || '');
          const title = (evt.title || '').toLowerCase();
          const desc = (evt.description || '').toLowerCase();
          const hasOrderKeywords = title.match(/shoot|order|property|photos?|video/i) || 
                                  desc.includes('hd.pics/su/') || 
                                  desc.includes('tonomo.io') ||
                                  desc.includes('booked packages');
          
          const addressPattern = /^\d+\s+[A-Za-z0-9\s]+(?:St|Ave|Dr|Ln|Cir|Rd|Blvd|Way|Pl|Ct|Ter|Pkwy|Loop)/i;
          const looksLikeAddress = addressPattern.test(evt.title || '');
          
          const isRealOrder = !!(evt.location && (parsed.items.length > 0 || parsed.orderId || hasOrderKeywords || looksLikeAddress));
          
            try {
              await setDoc(doc(db, `users/${user.uid}/calendar_events`, evt.id), {
                ...evt,
                packageName: parsed.items[0] || '',
                orderId: parsed.orderId || '',
                isOrder: isRealOrder,
                updatedAt: serverTimestamp()
              }, { merge: true });
            } catch(err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/calendar_events/${evt.id}`);
            }
            
            if (i % 5 === 0 || i === total - 1) {
              setSyncProgress(Math.round(((i + 1) / total) * 100));
            }
          }
          
          const q = query(collection(db, `users/${user.uid}/calendar_events`));
          const snapshot = await getDocs(q);
          const syncedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setEvents(syncedEvents);
      }
    } catch (e) {
      console.error("Fetch Exception:", e);
    } finally {
      if (user) {
        sessionStorage.setItem(`synced_calendar_${user.uid}`, 'true');
      }
      setTimeout(() => {
        setIsLoadingEvents(false);
        setSyncProgress(0);
      }, 500);
    }
  };

  const nextMonth = () => {
    if (view === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 7));
    }
  };

  const prevMonth = () => {
    if (view === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subDays(currentDate, 7));
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handleCreateVideoFromEvent = async (event: any, projectId: string) => {
    if (!projectId) return;
    try {
      const videoId = uuidv4();
      await setDoc(doc(db, `projects/${projectId}/videos/${videoId}`), {
         name: event.title,
         description: `Auto-generated from Google Calendar Event: \nDate: ${format(parseISO(event.date), 'PPP')}\nLink: ${event.htmlLink || ''}`,
         status: 'New Arrival',
         createdAt: serverTimestamp(),
         updatedAt: serverTimestamp(),
         eventDate: event.date,
         eventId: event.id
      });
      setShowProjectSelect(null);
      navigate(`/projects/${projectId}`);
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, `projects/${projectId}/videos`);
    }
  };

  const handleAddLocalEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    const formData = new FormData(e.currentTarget);
    const newEvent = {
      id: uuidv4(),
      title: formData.get('title') as string,
      date: new Date(formData.get('date') as string).toISOString(),
      location: formData.get('location') as string,
      clientName: formData.get('clientName') as string,
      shooter: formData.get('shooter') as string,
      status: 'Waiting for Raw',
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, `users/${user.uid}/calendar_events`, newEvent.id), newEvent);
      setEvents(prev => [...prev, newEvent]);
      setShowAddEventModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/calendar_events/${newEvent.id}`);
    }
  };

  const getEventShooter = (e: any) => {
    if (e.shooter && e.shooter !== 'Unassigned') return e.shooter;
    
    // Calendar-level shooter mapping is strictly prioritized over text search
    if (e.calendarShooter && e.calendarShooter !== 'Unassigned') return e.calendarShooter;
    
    // Check description first for specific shooter names
    const parsed = parseDescriptionSections(e.description || '');
    if (parsed.photographers) {
      if (parsed.photographers.toLowerCase().includes('kyle')) return 'Kyle';
      if (parsed.photographers.toLowerCase().includes('jack')) return 'Jack';
      return parsed.photographers;
    }
    
    const textToSearch = ((e.title || '') + ' ' + (e.description || '')).toLowerCase();
    if (textToSearch.includes('kyle')) return 'Kyle';
    if (textToSearch.includes('jack')) return 'Jack';
    
    return 'Unassigned';
  };

  const getShooterColor = (shooter: string) => {
    const s = shooter.toLowerCase();
    if (s.includes('kyle')) return 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]';
    if (s.includes('jack')) return 'bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.6)]';
    return 'bg-white/20';
  };

  const generateStoragePath = (event: any) => {
    if (!event) return '';
    const shooter = getEventShooter(event);
    const date = format(parseISO(event.date), 'MM-dd-yyyy');
    const orderName = (event.location || event.title).replace(/[^a-zA-Z0-9\s-]/g, '').trim();
    return `syncspace / ${shooter} / ${date} / ${orderName}`;
  };

  const [activeTab, setActiveTab] = useState<'general' | 'editing' | 'deliver'>('general');
  const [isSaving, setIsSaving] = useState(false);

  const filteredEvents = events.filter(e => {
    const searchLower = searchQuery.toLowerCase();
    
    // Only show real orders unless showOtherEvents is true
    // Fallback for events that haven't been processed with the isOrder flag yet
    const title = (e.title || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    const hasOrderKeywords = title.match(/shoot|order|property|photos?|video/i) || 
                            desc.includes('hd.pics/su/') || 
                            desc.includes('tonomo.io') ||
                            desc.includes('booked packages');
    
    // An event with location and a title that looks like an address pattern (starts with digits) is almost certainly an order
    const addressPattern = /^\d+\s+[A-Za-z0-9\s]+(?:St|Ave|Dr|Ln|Cir|Rd|Blvd|Way|Pl|Ct|Ter|Pkwy|Loop)/i;
    const looksLikeAddress = addressPattern.test(e.title || '');
    
    const resolvedIsOrder = e.isOrder === true || (!!e.location && (!!e.packageName || !!hasOrderKeywords || looksLikeAddress));
    
    if (!showOtherEvents && !resolvedIsOrder) {
      return false;
    }
    
    if (shooterFilter !== 'All') {
      const eventShooter = getEventShooter(e);
      if (!eventShooter.toLowerCase().includes(shooterFilter.toLowerCase())) {
        return false;
      }
    }
    
    return (
      (e.title || '').toLowerCase().includes(searchLower) ||
      (e.location || '').toLowerCase().includes(searchLower) ||
      (e.clientName || '').toLowerCase().includes(searchLower) ||
      (e.clientEmail || '').toLowerCase().includes(searchLower)
    );
  });

  const selectedEvent = events.find(e => e.id === selectedEventId);

  const handleUpdateOrder = async (eventId: string, updates: any) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `users/${user.uid}/calendar_events/${eventId}`), {
        ...updates,
        updatedAt: serverTimestamp()
      });
      setEvents(events.map(e => e.id === eventId ? { ...e, ...updates } : e));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/calendar_events/${eventId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (event: any, files: FileList, targetType: 'Photos' | 'Video') => {
    const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
    if (!driveToken) {
      alert("Please connect your Google account in Settings.");
      return;
    }

    let currentEvent = event;
    let folderId = targetType === 'Photos' ? currentEvent.rawPhotosId : currentEvent.rawVideoId;

    // AUTO-CREATE TEMPLATE IF MISSING
    if (!folderId) {
      setIsCreatingTemplate(true);
      try {
        const rootFolderId = rootFolder?.id;
        if (!rootFolderId) throw new Error("No root folder configured");
        
        const shooterName = getEventShooter(currentEvent);
        const eventWithCorrectShooter = { ...currentEvent, shooter: shooterName };
        const result = await googleDriveService.createTemplate(driveToken, eventWithCorrectShooter, rootFolderId);
        
        const updates = { 
          driveFolderId: result.rawId,
          deliverFolderId: result.deliverId,
          rawPhotosId: result.rawPhotosId,
          rawVideoId: result.rawVideoId,
          finalPhotosId: result.finalPhotosId,
          finalVideoId: result.finalVideoId,
          rawLinks: `https://drive.google.com/drive/folders/${result.rawId}`,
          deliverLinks: `https://drive.google.com/drive/folders/${result.deliverId}`
        };
        
        await handleUpdateOrder(currentEvent.id, updates);
        currentEvent = { ...currentEvent, ...updates };
        folderId = targetType === 'Photos' ? currentEvent.rawPhotosId : currentEvent.rawVideoId;
      } catch (e) {
        console.error("Auto-template error:", e);
        alert("Failed to create folders. Please initialize manually first or check Drive settings.");
        setIsCreatingTemplate(false);
        return;
      } finally {
        setIsCreatingTemplate(false);
      }
    }

    if (!folderId) return;

    const fileArray = Array.from(files);
    const uploadTasks = fileArray.map(file => ({
      id: `${currentEvent.id}-${targetType}-${file.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      file,
      name: file.name
    }));

    const initialUploads = uploadTasks.reduce((acc, task) => {
      acc[task.id] = { progress: 0, name: task.name, status: 'pending', type: targetType };
      return acc;
    }, {} as any);

    setUploads(prev => ({ ...prev, ...initialUploads }));
    
    for (const task of uploadTasks) {
      setUploads(prev => ({ ...prev, [task.id]: { ...prev[task.id], status: 'uploading', startTime: Date.now() } }));

      try {
        await googleDriveService.uploadFile(driveToken, task.file, folderId, (progress) => {
          setUploads(prev => ({ ...prev, [task.id]: { ...prev[task.id], progress } }));
        });

        setUploads(prev => ({ ...prev, [task.id]: { ...prev[task.id], progress: 100, status: 'completed' } }));
        
        // Update Firestore with a record of the file
        const newFileRecord = {
          name: task.name,
          type: targetType,
          uploadedAt: new Date().toISOString(),
          driveId: task.id
        };
        
        // Re-fetch event to avoid stale data
        const eventDoc = await getDoc(doc(db, `users/${user.uid}/calendar_events/${currentEvent.id}`));
        const currentData = eventDoc.data();
        const currentFiles = currentData?.loadedFiles || [];
        
        await handleUpdateOrder(currentEvent.id, {
          loadedFiles: [...currentFiles, newFileRecord]
        });

      } catch (err) {
        console.error("Upload error:", err);
        setUploads(prev => ({ ...prev, [task.id]: { ...prev[task.id], status: 'error' } }));
      }
    }
    
    // Refresh count after all uploads are processed
    setTimeout(() => handleRefreshFileCount(currentEvent.id, folderId as string, targetType), 1000);
  };

  const handleRefreshFileCount = async (eventId: string, folderId: string, type: 'Photos' | 'Video') => {
    const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
    if (!driveToken) return;

    const countKey = `${eventId}-${type}`;
    setIsRefreshingCounts(prev => ({ ...prev, [countKey]: true }));

    try {
      const files = await googleDriveService.listFiles(driveToken, folderId);
      setFileCounts(prev => ({ ...prev, [countKey]: files.length }));
    } catch (err) {
      console.error("Error refreshing count:", err);
    } finally {
      setIsRefreshingCounts(prev => ({ ...prev, [countKey]: false }));
    }
  };

  const handleCreateDriveTemplate = async (event: any) => {
    const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
    if (!driveToken || !rootFolder) {
      alert("Please configure a Root Folder in Settings first.");
      return;
    }
    
    setIsCreatingTemplate(true);
    try {
      const shooterName = getEventShooter(event);
      const eventWithCorrectShooter = { ...event, shooter: shooterName };
      const result = await googleDriveService.createTemplate(driveToken, eventWithCorrectShooter, rootFolder.id);
      
      await handleUpdateOrder(event.id, { 
        driveFolderId: result.rawId,
        deliverFolderId: result.deliverId,
        rawPhotosId: result.rawPhotosId,
        rawVideoId: result.rawVideoId,
        finalPhotosId: result.finalPhotosId,
        finalVideoId: result.finalVideoId,
        rawLinks: `https://drive.google.com/drive/folders/${result.rawId}`,
        deliverLinks: `https://drive.google.com/drive/folders/${result.deliverId}`
      });
      
      alert(`Success! Folder structures created for: ${event.location || event.title}`);
    } catch (e) {
      console.error("Error creating template:", e);
      alert("Failed to create folder template. Please check permissions.");
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleResetLinks = async (event: any) => {
    if(!confirm("Are you sure you want to reset these links? This will NOT delete any folders on your Drive, but will clear old links and generate a NEW structure immediately.")) {
      return;
    }

    const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
    if (!driveToken || !rootFolder) {
      alert("Check Drive connection and Root Folder in Settings.");
      return;
    }
    
    setIsCreatingTemplate(true);
    try {
      // 1. Clear old data from Firestore
      await handleUpdateOrder(event.id, { 
        driveFolderId: null, 
        deliverFolderId: null, 
        rawPhotosId: null,
        rawVideoId: null,
        finalPhotosId: null,
        finalVideoId: null,
        rawLinks: null, 
        deliverLinks: null 
      });
      
      // 2. Regen using current (possibly updated) event data
      const shooterName = getEventShooter(event);
      const eventWithCorrectShooter = { ...event, shooter: shooterName };
      const result = await googleDriveService.createTemplate(driveToken, eventWithCorrectShooter, rootFolder.id);
      
      // 3. Save new links and subfolders
      await handleUpdateOrder(event.id, { 
        driveFolderId: result.rawId,
        deliverFolderId: result.deliverId,
        rawPhotosId: result.rawPhotosId,
        rawVideoId: result.rawVideoId,
        finalPhotosId: result.finalPhotosId,
        finalVideoId: result.finalVideoId,
        rawLinks: `https://drive.google.com/drive/folders/${result.rawId}`,
        deliverLinks: `https://drive.google.com/drive/folders/${result.deliverId}`
      });
      
      alert("Links have been reset and regenerated successfully.");
    } catch (e) {
      console.error("Reset error:", e);
      alert("Failed to reset links.");
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const defaultTasks = [
    { id: '1', text: 'Color Grading', done: false },
    { id: '2', text: 'Sound Design', done: false },
    { id: '3', text: 'Subtitles', done: false },
    { id: '4', text: 'Music Overlay', done: false },
    { id: '5', text: 'Final Export', done: false }
  ];

  const handleToggleTask = async (eventId: string, taskId: string) => {
    if (!selectedEvent) return;
    
    let currentTasks = selectedEvent.tasks || [];
    if (currentTasks.length === 0) {
      const parsed = parseDescriptionSections(selectedEvent.description || '');
      if (parsed.items && parsed.items.length > 0) {
        currentTasks = parsed.items.map((item: string, i: number) => ({ id: `item-${i}`, text: item, done: false }));
      } else {
        currentTasks = defaultTasks;
      }
    }

    const newTasks = currentTasks.map((t: any) => 
      t.id === taskId ? { ...t, done: !t.done } : t
    );
    const done = newTasks.filter((t: any) => t.done).length;
    const progress = Math.round((done / newTasks.length) * 100);
    await handleUpdateOrder(eventId, { tasks: newTasks, progress });
  };

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return 'Unlimited';
    if (bytes === 0) return '0.00 GB';
    const tb = bytes / (1000 ** 4);
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = bytes / (1000 ** 3);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="flex-1 flex flex-col h-full relative z-0 overflow-hidden">
      <header className="h-14 shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505] overflow-x-auto overflow-y-hidden custom-scrollbar-hide">
        <div className="flex items-center gap-6 shrink-0">
           <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white whitespace-nowrap">Shooting Schedule</h1>
           {accessToken ? (
              <div className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono uppercase border border-emerald-500/20 whitespace-nowrap">Live Sync</div>
           ) : (
              <button 
                onClick={authenticateCalendar}
                disabled={isAuthenticating}
                className="text-[9px] text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-0.5 rounded font-mono uppercase transition-colors border border-indigo-500/20 whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAuthenticating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Calendar className="w-2.5 h-2.5" />}
                {isAuthenticating ? 'Authenticating...' : 'Connect Calendar'}
              </button>
           )}
        </div>
        
        <div className="flex items-center gap-6 shrink-0 pl-6">
           <div className="flex items-center bg-black/40 rounded border border-white/10 p-0.5 whitespace-nowrap">
              <button 
                onClick={() => setView('month')}
                className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all rounded ${view === 'month' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}
              >
                Month
              </button>
              <button 
                onClick={() => setView('week')}
                className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all rounded ${view === 'week' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20 hover:text-white/40'}`}
              >
                Week
              </button>
           </div>
           
           <div className="flex items-center gap-3 whitespace-nowrap">
              <button 
                onClick={goToToday}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white border border-white/10 rounded transition-all"
              >
                Today
              </button>
              <div className="flex items-center gap-1.5">
                 <button onClick={prevMonth} className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-white">
                   <ChevronLeft className="w-4 h-4" />
                 </button>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white w-28 text-center bg-white/5 py-1 rounded">
                   {format(currentDate, view === 'month' ? "MMM yyyy" : "MMM d, yy")}
                 </span>
                 <button onClick={nextMonth} className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-white">
                   <ChevronRight className="w-4 h-4" />
                 </button>
              </div>
           </div>
           
           <button 
             disabled={!accessToken || isLoadingEvents}
             onClick={() => accessToken && fetchCalendarEvents(accessToken)}
             className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-[10px] uppercase font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] whitespace-nowrap"
           >
              <Calendar className="w-3 h-3" />
              {isLoadingEvents ? 'Syncing...' : 'Sync Cloud'}
           </button>
        </div>
      </header>

      {isLoadingEvents && syncProgress > 0 && (
        <div className="h-1 bg-[#121214] w-full relative overflow-hidden shrink-0">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(79,70,229,0.5)]"
            style={{ width: `${syncProgress}%` }}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative bg-[#080809] p-5 gap-5">
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 pb-2">
           <div className="flex gap-3 max-w-2xl shrink-0">
              <div className="relative group flex-1">
                 <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-indigo-400 transition-colors" />
                 <input 
                   type="text"
                   placeholder="Search orders, clients, locations..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full bg-[#121214] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-[11px] text-white focus:outline-none focus:border-indigo-500/30 transition-all shadow-xl"
                 />
              </div>
              <div className="flex items-center gap-2">
                 {['Kyle', 'Jack'].map(shooter => {
                   const isActive = shooterFilter === shooter;
                   const colors = shooter === 'Kyle' 
                     ? { active: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400', hover: 'hover:border-cyan-500/30' }
                     : { active: 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-400', hover: 'hover:border-fuchsia-500/30' };

                    return (
                        <button
                          key={shooter}
                          onClick={() => setShooterFilter(isActive ? 'All' : shooter)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all shadow-xl ${
                            isActive
                              ? colors.active
                              : `bg-[#121214] border-white/5 text-white/50 hover:text-white ${colors.hover}`
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${isActive ? (shooter === 'Kyle' ? 'bg-cyan-400' : 'bg-fuchsia-400') : 'bg-white/20'}`} />
                          {shooter}
                        </button>
                    );
                  })}

                  <button
                    onClick={() => setShowOtherEvents(!showOtherEvents)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all shadow-xl whitespace-nowrap ml-2 ${
                      showOtherEvents
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-[#121214] border-white/5 text-white/50 hover:text-white hover:border-amber-500/30'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${showOtherEvents ? 'bg-amber-400' : 'bg-white/20'}`} />
                    {showOtherEvents ? 'Hide Non-Orders' : 'Show All Events'}
                  </button>
              </div>
           </div>

           <div className="flex-1 min-h-[700px] flex flex-col border border-white/5 rounded-2xl overflow-hidden bg-[#121214] shadow-2xl shrink-0">
              <div className="grid grid-cols-7 w-full border-b border-white/5 bg-[#0D0D0E]">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="p-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                    {d}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0A0A0B]">
                 <div className="grid grid-cols-7 auto-rows-fr w-full min-h-full">
                   {(() => {
                      const start = view === 'month' ? startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }) : startOfWeek(currentDate, { weekStartsOn: 1 });
                      const end = view === 'month' ? endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }) : endOfWeek(currentDate, { weekStartsOn: 1 });
                      const daysArr = [];
                      let d = start;
                      while (d <= end) {
                         const cloneDay = d;
                         const dayEvents = filteredEvents.filter(e => isSameDay(parseISO(e.date), cloneDay));
                         const isToday = isSameDay(cloneDay, new Date());
                         const isCurrentMonth = isSameMonth(cloneDay, currentDate);
                         const isSelected = isSameDay(cloneDay, selectedDate);
                          daysArr.push(
                          <div
                            key={cloneDay.toString()}
                            onClick={() => setSelectedDate(cloneDay)}
                            className={`min-h-[100px] border border-white/5 p-1 flex flex-col transition-all cursor-pointer relative group ${
                              !isCurrentMonth && view === 'month' ? "opacity-10 bg-black" : "opacity-100 bg-[#121214]"
                            } ${isSelected ? 'bg-indigo-500/[0.05] ring-1 ring-inset ring-indigo-500/20' : ''} hover:bg-white/[0.02]`}
                          >
                            <div className="flex justify-between items-start mb-1 h-6">
                               <span className={`text-[10px] font-mono leading-none flex items-center justify-center p-1.5 min-w-[20px] rounded ${
                                 isToday 
                                  ? "bg-indigo-600 text-white font-black shadow-lg shadow-indigo-500/40" 
                                  : isSelected ? "text-indigo-400 font-black" : "text-white/20"
                               }`}>
                                 {format(cloneDay, 'd')}
                               </span>
                            </div>
                            
                            <div className="space-y-0.5 px-1 overflow-y-auto custom-scrollbar-thin">
                              {dayEvents.slice(0, 4).map((evt, idx) => {
                                 const config = getStatusConfig(evt.isArchived ? 'Archived' : evt.status);
                                 const shooterColor = getShooterColor(getEventShooter(evt));
                                 return (
                                   <div 
                                     key={`${evt.id}-${idx}`} 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       navigate(`/order/${evt.id}`);
                                     }}
                                     className={`relative border rounded px-1.5 py-1 transition-all cursor-pointer ${config.bg} ${config.text} ${config.border} hover:scale-[1.02] shadow-sm flex items-center gap-1.5`}
                                   >
                                      <div className={`w-1.5 h-1.5 rounded-full ${shooterColor} shrink-0`} />
                                      <div className="text-[9px] font-black truncate uppercase tracking-tight leading-none">
                                        {evt.location || evt.title}
                                      </div>
                                   </div>
                                 );
                              })}
                              {dayEvents.length > 4 && (
                                <div className="text-[8px] text-white/20 pl-1 font-black uppercase tracking-widest pt-1">
                                   + {dayEvents.length - 4} More
                                </div>
                              )}
                            </div>
                          </div>
                         );
                         d = addDays(d, 1);
                      }
                      return daysArr;
                   })()}
                 </div>
              </div>
           </div>

           {/* My Calendars moved here */}
           <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 shrink-0 transition-all z-10 w-full overflow-x-auto custom-scrollbar">
             <div className="flex flex-col gap-1 mb-3">
               <div className="text-[10px] font-black uppercase text-white/40 tracking-widest flex items-center justify-between min-w-max pr-4">
                  My Calendars
                  {isFetchingCalendars && <Loader2 className="w-3 h-3 animate-spin text-white/20" />}
               </div>
               {localStorage.getItem('google_calendar_email') && (
                 <div className="text-[9px] text-indigo-400/80 font-mono flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                   {localStorage.getItem('google_calendar_email')}
                 </div>
               )}
             </div>
             {accessToken ? (
               <div className="flex gap-4 pb-2 items-start min-w-max">
                 {availableCalendars.map((cal) => {
                   const mapping = calendarMappings.find(m => m.calendarId === cal.id);
                   const isEnabled = !!mapping;
                   const shooter = mapping?.shooterName || 'Unassigned';

                   return (
                     <div key={cal.id} className="min-w-[240px] shrink-0 p-1 pl-2.5 bg-black/40 border border-white/5 rounded-xl transition-all flex items-center gap-3 group">
                        <div className="flex-1 min-w-[80px] truncate">
                          <div className="flex-1 truncate">
                             <div className="text-[10px] font-bold text-white/50 uppercase truncate group-hover:text-white transition-colors" title={cal.summary}>{cal.summary}</div>
                          </div>
                        </div>
                        
                        {isEnabled && (
                          <div className="flex bg-[#121214]/50 p-0.5 rounded-lg border border-white/5 shrink-0">
                             {['Kyle', 'Jack'].map(name => {
                                const isActive = shooter === name;
                                return (
                                  <button
                                    key={name}
                                    title={name}
                                    onClick={() => handleUpdateCalendarMapping(cal.id, name, true)}
                                    className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                                      isActive 
                                        ? (name === 'Kyle' ? 'bg-cyan-500/20 text-cyan-400' : 
                                           name === 'Jack' ? 'bg-fuchsia-500/20 text-fuchsia-400' :
                                           'bg-white/10 text-white')
                                        : 'text-white/20 hover:text-white/50 hover:bg-white/5'
                                    }`}
                                  >
                                    {name}
                                  </button>
                                );
                             })}
                          </div>
                        )}
                     </div>
                   );
                 })}
               </div>
             ) : (
                <div className="p-4 rounded-xl border border-white/5 border-dashed text-center space-y-3 max-w-sm mx-auto">
                   <Calendar className="w-5 h-5 text-white/20 mx-auto" />
                   <div className="text-[9px] text-white/40 uppercase font-mono leading-relaxed">Connect to map shooters to specific calendars</div>
                </div>
             )}
           </div>
        </div>

        <div className="w-full md:w-52 shrink-0 flex flex-col gap-5">
           <div className="bg-[#121214] border border-white/5 rounded-2xl p-5 flex-1 flex flex-col overflow-hidden shadow-2xl relative">
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 truncate pr-2">
                    {isSameDay(selectedDate, new Date()) ? 'TODAY\'S AGENDA' : format(selectedDate, 'MMM do, yyyy')}
                 </h2>
                 <div className="w-12 h-px bg-white/10 shrink-0" />
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                 {filteredEvents.filter(e => isSameDay(parseISO(e.date), selectedDate)).length > 0 ? (
                    filteredEvents
                       .filter(e => isSameDay(parseISO(e.date), selectedDate))
                       .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
                       .map((evt, idx) => {
                          const config = getStatusConfig(evt.isArchived ? 'Archived' : evt.status);
                          return (
                             <div 
                               key={`side-${evt.id}-${idx}`} 
                               onClick={() => navigate(`/order/${evt.id}`)}
                               className={`p-3 bg-white/[0.02] border rounded-xl transition-all cursor-pointer group hover:bg-[#1A1A1C] relative overflow-hidden ${config.border}`}
                             >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/[0.03] blur-xl rounded-full -mr-8 -mt-8" />
                                <div className="flex justify-between items-start mb-3 relative">
                                   <div className="text-[9px] font-mono text-white/30 uppercase">{format(parseISO(evt.date), 'HH:mm')}</div>
                                   <div className="flex items-center gap-2">
                                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getShooterColor(getEventShooter(evt))}`} />
                                      <div className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider ${config.bg} ${config.text}`}>
                                         {config.label}
                                      </div>
                                   </div>
                                </div>
                                <div className="text-[10px] font-black text-white uppercase tracking-tight truncate mb-1">
                                  {evt.location || evt.title}
                                </div>
                                <div className="text-[9px] text-white/20 uppercase tracking-widest flex items-center gap-1.5">
                                   <div className={`w-1 h-1 rounded-full ${config.dot}`} />
                                   {evt.clientName || 'Private Client'}
                                </div>
                             </div>
                          );
                       })
                 ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                       <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-white/10" />
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No Sessions</p>
                          <p className="text-[8px] text-white/10 leading-relaxed uppercase tracking-tighter">Day is clear</p>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>

      

      {showAddEventModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
           <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-[#0A0A0B] border border-white/5 rounded-2xl p-8 w-full max-w-md shadow-2xl relative"
           >
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black uppercase tracking-widest text-white">New Shoot</h2>
                 <button onClick={() => setShowAddEventModal(false)} className="text-white/40 hover:text-white">
                    <Plus className="w-6 h-6 rotate-45" />
                 </button>
              </div>
              <form onSubmit={handleAddLocalEvent} className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Project Name</label>
                    <input name="title" required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm outline-none" placeholder="e.g. 123 Main St Production" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Shoot Date</label>
                    <input name="date" type="datetime-local" required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm outline-none" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Location</label>
                    <input name="location" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm outline-none" placeholder="Full Address" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Client Name</label>
                    <input name="clientName" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm outline-none" placeholder="Contact Person" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Shooter</label>
                    <div className="grid grid-cols-3 gap-2">
                       {['Kyle', 'Jack', 'Unassigned'].map(s => (
                          <label key={s} className="relative group cursor-pointer">
                             <input type="radio" name="shooter" value={s} defaultChecked={s === 'Unassigned'} className="peer sr-only" />
                             <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center text-[10px] font-bold text-white/40 peer-checked:bg-indigo-500/20 peer-checked:border-indigo-500/50 peer-checked:text-indigo-400 group-hover:bg-white/10 transition-all uppercase">
                                {s}
                             </div>
                          </label>
                       ))}
                    </div>
                 </div>
                 <button className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl mt-4">
                    Add to Schedule
                 </button>
              </form>
           </motion.div>
        </div>
      )}
    </div>
  );
};
