import React, { useState, useEffect } from 'react';
import { Play, Pause, MessageSquare, Send, CheckCircle2, ChevronLeft, MoreHorizontal, FileText, MapPin, User, Package, ExternalLink, Folder, FolderOpen, UploadCloud, File as FileIcon, Image as ImageIcon, Video, Globe, Clock, FolderPlus, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { googleDriveService } from '../services/googleDriveService';
import './OrderDetail.css';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { reauthenticateDrive } from '../services/googleAuthHelpers';

/* ============================================
   DUAL-PLATFORM PARSER
   Detects StarRep vs Fotello format automatically
   ============================================ */

const cleanHtml = (htmlDesc: string) => {
  if (!htmlDesc) return [];
  const text = htmlDesc
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h[1-6]|li)>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, (match, p1, p2) => {
      if (p1.toLowerCase().startsWith('mailto:')) return p2;
      return `${p2} [${p1}]`;
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim());
};

const detectPlatform = (lines: string[]) => {
  const full = lines.join(' ').toLowerCase();
  
  if (full.includes('hd.pics/su/') || lines.some(l => l.includes('hd.pics/su/'))) {
    return 'hdphotohub';
  }
  if (full.includes('view your order here')) {
    return 'tonomo';
  }
  if (full.includes('order items') && (full.includes('intake answers') || full.includes('order id'))) {
    return 'fotello';
  }
  return 'starep';
};

/* --- StarRep / Tonomo Parser --- */
const parseStarep = (lines: string[], isTonomo: boolean = false) => {
  const getLine = (prefix: string) => {
    const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
    return line ? line.substring(prefix.length).trim() : '';
  };

  const getBlock = (start: string, end?: string) => {
    let si = lines.findIndex(l => l.toLowerCase().includes(start.toLowerCase()));
    let ei = end ? lines.findIndex((l, i) => i > si && l.toLowerCase().includes(end.toLowerCase())) : lines.length;
    if (si === -1) return [];
    if (ei === -1) ei = lines.length;
    return lines.slice(si + 1, ei).filter(l => !/^[=-]{3,}$/.test(l) && l.length > 0);
  };

  const pkgLines = getBlock('Booked packages and services', 'Location');
  const packageName = pkgLines.length > 0 ? pkgLines[0].replace(/^- /, '').replace(/\(a la cart\)/i, '').trim() : '';
  const orderItems = pkgLines.length > 1 ? pkgLines.slice(1).map(i => i.replace(/^- /, '').trim()) : [];

  let tonomoOrderUrl = '';
  if (isTonomo) {
    const linkPtn = /\[(https?:\/\/[^\]]+)\]/;
    const viewOrderIdx = lines.findIndex(l => l.toLowerCase().includes('view your order here'));
    if (viewOrderIdx !== -1) {
      for (let i = viewOrderIdx; i <= viewOrderIdx + 2 && i < lines.length; i++) {
          const match = lines[i].match(linkPtn);
          if (match) {
              tonomoOrderUrl = match[1];
              break;
          }
      }
    }
  }

  let dateStr = '';
  const dateLine = lines.find(l => l.toLowerCase().startsWith('date:'));
  if (dateLine) {
    dateStr = dateLine.substring(5).trim();
  }

  return {
    platform: isTonomo ? 'tonomo' : 'starep',
    dateStr,
    clientName: getLine('Client Name:'),
    phone: getLine('Phone:'),
    email: getLine('Email:'),
    listingAgent: getLine('Listing Agent:'),
    packageName,
    orderItems,
    location: getBlock('Location', 'Entry Notes').join('\n'),
    entryNotes: getBlock('Entry Notes', 'Amenities').join('\n'),
    amenities: getBlock('Amenities', 'Client Preferences').join('\n'),
    preferences: getBlock('Client Preferences', 'Photographers').join('\n'),
    photographers: getBlock('Photographers', '---').filter(l => l.length > 0).join(', '),
    intakeAnswers: [] as any[],
    fotelloOrderId: '',
    tonomoOrderUrl,
  };
};

/* --- Fotello Parser --- */
const parseFotello = (lines: string[]) => {
  const custIdx = lines.findIndex(l => l.toLowerCase() === 'customer' || l.toLowerCase().startsWith('customer:'));
  let clientName = '';
  if (custIdx !== -1) {
    if (lines[custIdx].toLowerCase().startsWith('customer:')) {
      clientName = lines[custIdx].substring(9).trim();
    } else if (custIdx + 1 < lines.length && !lines[custIdx + 1].toLowerCase().startsWith('email:')) {
      clientName = lines[custIdx + 1];
    }
  }

  const emailLine = lines.find(l => l.toLowerCase().startsWith('email:') || l.toLowerCase().includes('email '));
  const email = emailLine ? emailLine.replace(/^(?:email[\s:]*)/i, '').trim() : '';

  let dateStr = '';
  const dateLine = lines.find(l => l.toLowerCase().startsWith('date:'));
  if (dateLine) {
    dateStr = dateLine.substring(5).trim();
  }

  const oiStart = lines.findIndex(l => l.toLowerCase() === 'order items');
  const oiEnd = lines.findIndex((l, i) => i > oiStart && (l.toLowerCase() === 'intake answers' || l.toLowerCase().startsWith('order id')));
  
  let packageName = '';
  const orderItems: string[] = [];
  
  if (oiStart !== -1) {
    const end = oiEnd !== -1 ? oiEnd : lines.length;
    const oiLines = lines.slice(oiStart + 1, end).filter(l => l.length > 0);
    
    oiLines.forEach(l => {
      const cleaned = l.replace(/^[•◦]\s*/, '').trim();
      if (!cleaned) return;
      if (l.startsWith('•')) {
        orderItems.push(cleaned);
      } else if (l.startsWith('◦') || l.startsWith('  ')) {
        orderItems.push(cleaned);
      } else {
        orderItems.push(cleaned);
      }
    });
    
    const pkgIdx = orderItems.findIndex(i => i.toLowerCase().includes('package'));
    if (pkgIdx !== -1) {
      packageName = orderItems[pkgIdx];
    }
  }

  const iaStart = lines.findIndex(l => l.toLowerCase() === 'intake answers');
  const iaEnd = lines.findIndex((l, i) => i > iaStart && l.toLowerCase().startsWith('order id'));
  const intakeAnswers: {question: string, answer: string}[] = [];
  
  if (iaStart !== -1) {
    const end = iaEnd !== -1 ? iaEnd : lines.length;
    const iaLines = lines.slice(iaStart + 1, end).filter(l => l.length > 0);
    
    let currentQ: {question: string, answer: string} | null = null;
    iaLines.forEach(l => {
      const cleaned = l.replace(/^[•◦]\s*/, '').trim();
      if (!cleaned) return;
      
      if (l.startsWith('•')) {
        if (currentQ) intakeAnswers.push(currentQ);
        currentQ = { question: cleaned, answer: '' };
      } else if (currentQ) {
        currentQ.answer = currentQ.answer ? currentQ.answer + ' ' + cleaned : cleaned;
      }
    });
    if (currentQ) intakeAnswers.push(currentQ);
  }

  const oidLine = lines.find(l => l.toLowerCase().startsWith('order id'));
  let fotelloOrderId = '';
  if (oidLine) {
    const parts = oidLine.split(/[:\s]+/);
    if (parts.length > 2 && parts[2].trim() !== '') {
      fotelloOrderId = parts.slice(2).join(' ').trim();
    } else {
      const oidIdx = lines.indexOf(oidLine);
      if (oidIdx + 1 < lines.length) {
        fotelloOrderId = lines[oidIdx + 1].trim();
      }
    }
  }

  const findAnswer = (keyword: string) => {
    const match = intakeAnswers.find(qa => qa.question.toLowerCase().includes(keyword.toLowerCase()));
    return match ? match.answer : '';
  };

  return {
    platform: 'fotello',
    clientName,
    phone: '',
    email,
    listingAgent: '',
    packageName,
    orderItems: orderItems.filter(i => !i.toLowerCase().includes('package') || orderItems.indexOf(i) > 0),
    location: '', 
    entryNotes: findAnswer('access') || findAnswer('lockbox'),
    amenities: findAnswer('highlighted') || findAnswer('specific'),
    preferences: findAnswer('gate code') || findAnswer('parking'),
    photographers: '',
    intakeAnswers,
    fotelloOrderId,
  };
};

/* --- HDPhotoHub Parser --- */
const parseHDPhotoHub = (lines: string[]) => {
  const urlLine = lines.find(l => l.includes('hd.pics/su/'));
  const hdOrderUrl = urlLine ? (urlLine.match(/\[(https?:\/\/.*?)\]/) ? urlLine.match(/\[(https?:\/\/.*?)\]/)![1] : urlLine.trim()) : '';
  
  // Find index of the URL line to start parsing after it
  const urlIdx = lines.findIndex(l => l.includes('hd.pics/su/'));
  
  // Client name and phone usually follow the URL
  let clientName = '';
  let phone = '';
  if (urlIdx !== -1) {
    const nextLines = lines.slice(urlIdx + 1, urlIdx + 5).filter(l => l.trim().length > 0);
    if (nextLines.length >= 1) clientName = nextLines[0].trim();
    if (nextLines.length >= 2 && /^[\d\-()+ ]+$/.test(nextLines[1].trim())) {
      phone = nextLines[1].trim();
    }
  }

  // Order items usually have colons and are before sqft
  const sqftIdx = lines.findIndex(l => l.toLowerCase().includes('sqft'));
  const orderItems: string[] = [];
  if (urlIdx !== -1) {
    const serviceLines = lines.slice(urlIdx + 1, sqftIdx !== -1 ? sqftIdx : lines.length);
    serviceLines.forEach(l => {
      if (l.includes(':')) {
        const item = l.split(':')[1].trim();
        if (item && !orderItems.includes(item)) {
          orderItems.push(item);
        }
      }
    });
  }

  // Sqft and Bed/Bath
  let sqft = '';
  if (sqftIdx !== -1) sqft = lines[sqftIdx].trim();
  
  const bedIdx = lines.findIndex(l => l.toLowerCase().includes('bed(s)'));
  const bathIdx = lines.findIndex(l => l.toLowerCase().includes('bath(s)'));
  let bedBath = '';
  if (bedIdx !== -1 && bathIdx !== -1) {
    bedBath = `${lines[bedIdx].trim()}, ${lines[bathIdx].trim()}`;
  }

  // Entry Notes / Order Notes
  const notesIdx = lines.findIndex(l => l.toLowerCase().includes('order note(s):'));
  let entryNotes = '';
  if (notesIdx !== -1) {
    entryNotes = lines.slice(notesIdx + 1).join('\n').trim();
  }

  // Look for location if possible (often before or after the URL)
  let location = '';
  const possibleLocLines = lines.slice(0, 10).filter(l => 
    l.trim().length > 0 && 
    !l.includes('hd.pics/su/') && 
    !l.includes(':') &&
    !/^[\d\-()+ ]+$/.test(l.trim()) // not a phone number
  );
  
  // Simple address heuristic: starts with a number and has typical road suffixes, potentially followed by city/state
  const addrPtn = /\d+\s+[A-Za-z0-9\s.\-]+(?:St|Ave|Dr|Ln|Cir|Rd|Blvd|Way|Pl|Ct|Ter|Pkwy|Loop)(?:\s*,?\s*[A-Za-z\s]+,\s*[A-Z]{2},?\s*\d{5})?/i;
  const foundLoc = possibleLocLines.find(l => addrPtn.test(l));
  if (foundLoc) {
    const match = foundLoc.match(addrPtn);
    if (match) location = match[0].trim();
  }

  return {
    platform: 'hdphotohub',
    clientName,
    phone,
    email: '',
    listingAgent: '',
    packageName: orderItems[0] || 'HDPhotoHub Order',
    orderItems: orderItems.slice(1),
    location: location + (sqft ? ' ' + sqft : ''), 
    entryNotes: [bedBath, entryNotes].filter(Boolean).join('\n\n'),
    amenities: '',
    preferences: '',
    photographers: '',
    intakeAnswers: [] as any[],
    fotelloOrderId: '',
    tonomoOrderUrl: hdOrderUrl,
  };
};

const checkContentFlags = (parsed: any) => {
  const allText = (
    (parsed.packageName || '') + ' ' + 
    (parsed.orderItems?.join(' ') || '') + ' ' +
    (parsed.entryNotes || '')
  ).toLowerCase();
  
  // Video/Interactive keywords
  const videoKeywords = ['video', 'tour', '3d', 'cinematic', 'reel', 'social', 'zillow', 'matterport', 'walkthrough', 'drone', 'virtual'];
  let hasVideo = videoKeywords.some(k => allText.includes(k));
  
  // Photo keywords
  const photoKeywords = ['photo', 'photography', 'bundle', 'kit', 'print', 'twilight', 'floor plan', 'shots', 'pictures', 'stills', 'hdr'];
  let hasPhoto = photoKeywords.some(k => allText.includes(k));

  // If no keywords found but it's a recognized order platform, default to showing Photos
  if (!hasPhoto && !hasVideo && parsed.platform !== 'unknown') {
    hasPhoto = true;
  }
  
  // Also, if it has Photo keywords, ensure hasPhoto is true
  // (already handled by keywords check)

  return { ...parsed, hasVideo, hasPhoto };
};

const parseEventDescription = (htmlDesc: string) => {
  if (!htmlDesc) return checkContentFlags({ platform: 'unknown', orderItems: [], intakeAnswers: [], packageName: '' } as any);
  const lines = cleanHtml(htmlDesc);
  const platform = detectPlatform(lines);
  
  let result;
  if (platform === 'hdphotohub') result = parseHDPhotoHub(lines);
  else if (platform === 'fotello') result = parseFotello(lines);
  else if (platform === 'tonomo') result = parseStarep(lines, true);
  else result = parseStarep(lines, false);

  return checkContentFlags(result);
};

const ChecklistItem = ({ text, defaultChecked = false, onChange }: any) => {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className={`checklist-item ${checked ? 'checked' : ''}`}>
      <input 
        type="checkbox" 
        style={{ marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} 
        checked={checked} 
        onChange={() => {
          setChecked(!checked);
          if (onChange) onChange(!checked);
        }} 
      />
      <span className="checklist-item-text">{text}</span>
    </label>
  );
};

const DropZone = ({ label, icon, accept, isDragging, onDragOver, onDragLeave, onDrop, color }: any) => (
  <div 
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    style={{
      border: `2px dashed ${isDragging ? (color || 'var(--accent-primary)') : 'var(--border-emphasized)'}`,
      backgroundColor: isDragging ? `${color || 'var(--accent-primary)'}10` : 'var(--surface-2)',
      borderRadius: '12px',
      padding: '32px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      minHeight: '160px'
    }}
  >
    <div style={{ color: isDragging ? (color || 'var(--accent-primary)') : 'var(--text-muted)' }}>{icon}</div>
    <div style={{ fontWeight: 500, fontSize: '14px', color: isDragging ? (color || 'var(--accent-primary)') : 'var(--text-primary)' }}>{label}</div>
    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{accept}</div>
  </div>
);

const UploadLogItem = ({ log }: any) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
      <FileIcon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.name}</span>
      <span style={{ fontSize: '11px', flexShrink: 0, padding: '2px 8px', borderRadius: '4px', backgroundColor: log.type === 'photo' ? 'rgba(79,172,254,0.12)' : 'rgba(232,93,44,0.12)', color: log.type === 'photo' ? '#4FACFE' : 'var(--accent-primary)' }}>
        {log.type === 'photo' ? 'Photo' : 'Video'}
      </span>
    </div>
    {log.status === 'done' ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#10B981' }}>
        <CheckCircle2 size={14} /> Done
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '100px', height: '5px', backgroundColor: 'var(--surface-1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${log.progress}%`, backgroundColor: 'var(--accent-primary)', transition: 'width 0.3s ease', borderRadius: '3px' }}></div>
        </div>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', width: '32px', textAlign: 'right' }}>{Math.round(log.progress)}%</span>
      </div>
    )}
  </div>
);

const UploadWorkspace = ({ parsedInfo, event, isFolderCreated, setIsFolderCreated, formData, setFormData, onConfirmOrder, onSubmitRequest, driveCounts, setDriveCounts, realFolders, setRealFolders, isCheckingDrive, setIsCheckingDrive, handleDriveCheck, tokenExpired, setTokenExpired, errorMsg, setErrorMsg, handleReconnectDrive, isAuthenticating }: any) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const [draggingVideo, setDraggingVideo] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    const allDone = logs.length > 0 && logs.every(l => l.status === 'done');
    if (allDone && !autoSubmitted) {
      onSubmitRequest();
      setAutoSubmitted(true);
    } else if (logs.length === 0) {
      setAutoSubmitted(false);
    }
  }, [logs, autoSubmitted, onSubmitRequest]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.shooter || !formData.shootDate) {
      setErrorMsg("Please fill out all required fields: Project Name, Shooter Name, and Shoot Date.");
      return;
    }
    setErrorMsg(null);
    setTokenExpired(false);
    const token = localStorage.getItem('google_drive_token');
    const rootFolderId = localStorage.getItem('drive_root_folder');
    
    if (!token || !rootFolderId) {
      setErrorMsg("Drive not configured. Please go to Settings to connect Drive and select a Root Folder.");
      return;
    }

    try {
      setIsCreatingFolder(true);
      const eventToCreate = {
        shooter: formData.shooter,
        date: formData.shootDate,
        clientName: formData.customerName,
        title: event?.title || 'Event'
      };
      
      const result = await googleDriveService.createTemplate(token, eventToCreate, rootFolderId);
      
      const newUrls = {
        rawId: result.rawId,
        rawUrl: `https://drive.google.com/drive/folders/${result.rawId}`,
        deliverId: result.deliverId,
        deliverUrl: `https://drive.google.com/drive/folders/${result.deliverId}`,
        rawPhotosId: result.rawPhotosId,
        rawPhotosUrl: `https://drive.google.com/drive/folders/${result.rawPhotosId}`,
        rawVideoId: result.rawVideoId,
        rawVideoUrl: `https://drive.google.com/drive/folders/${result.rawVideoId}`,
        finalPhotosId: result.finalPhotosId,
        finalPhotosUrl: `https://drive.google.com/drive/folders/${result.finalPhotosId}`,
        finalVideoId: result.finalVideoId,
        finalVideoUrl: `https://drive.google.com/drive/folders/${result.finalVideoId}`,
        folderCreated: true
      };
      
      setFormData((prev: any) => ({
        ...prev,
        ...newUrls
      }));
      
      if (event?.id && auth.currentUser) {
         try {
           await updateDoc(doc(db, `users/${auth.currentUser.uid}/calendar_events`, event.id), newUrls);
         } catch(dbErr) {
           console.error("Failed to update database with folder links:", dbErr);
         }
      }
      
      setIsFolderCreated(true);
      if (onConfirmOrder) onConfirmOrder();
    } catch (err: any) {
      console.error(err);
      
      // Check if it's a permission error
      if (err.message && (err.message.includes('permission') || err.message.includes('403') || err.message.includes('401'))) {
         setErrorMsg(`Your Google Drive connection has expired (lasts 1 hour). Please reconnect to continue.`);
         setTokenExpired(true);
         localStorage.removeItem('google_drive_token');
      } else {
         setErrorMsg(`Failed to create folders: ${err.message || 'Unknown error. Check console or re-connect Drive.'}`);
      }
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUploadFiles = (files: File[], type: string) => {
    const token = localStorage.getItem('google_drive_token');
    if (!token) {
      alert("No Drive token found. Please reconnect Drive.");
      return;
    }
    
    // determine parent folder
    const targetFolderId = type === 'photo' ? formData.rawPhotosId : formData.rawVideoId;
    if (!targetFolderId) {
      alert("Folder structure not yet created. Create it first.");
      return;
    }
    
    const newLogs = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      type,
      progress: 0,
      status: 'uploading'
    }));
    
    setLogs(prev => [...newLogs, ...prev]);
    
    files.forEach(async (f, index) => {
      const logId = newLogs[index].id;
      try {
        await googleDriveService.uploadFile(token, f, targetFolderId, (progress) => {
          setLogs(prev => prev.map(l => l.id === logId ? { ...l, progress } : l));
        });
        setLogs(prev => prev.map(l => l.id === logId ? { ...l, progress: 100, status: 'done' } : l));
      } catch (e: any) {
        console.error("Upload failed", e);
        if (e.message && e.message.includes('401')) {
           alert("Drive connection expired. Please reconnect Drive in settings or reconnect panel.");
           localStorage.removeItem('google_drive_token');
        }
        // We set status to 'error' to show error state
        setLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'error', errorMsg: e.message } : l));
      }
    });
  };

  const makeDropHandlers = (setDrag: any, type: string) => ({
    onDragOver: (e: any) => { e.preventDefault(); setDrag(true); },
    onDragLeave: (e: any) => { e.preventDefault(); setDrag(false); },
    onDrop: (e: any) => { e.preventDefault(); setDrag(false); handleUploadFiles(Array.from(e.dataTransfer.files), type); },
  });

  return (
    <div className="upload-workspace">
      {!isFolderCreated ? (
        <div className="flex flex-col items-center justify-center p-8 mt-4 text-center bg-black/20 rounded-2xl border border-white/5 mx-auto max-w-xl">
          <FolderPlus size={40} className="text-indigo-400 opacity-80 mb-4" />
          <h2 className="text-xl font-black uppercase tracking-tight text-white mb-2">Create Drive Folders</h2>
          <p className="text-xs text-white/50 mb-6 max-w-md">Initialize the Google Drive structure for this order. This will create the Raw Media and Deliverables folders according to the standard format.</p>
          
          <form onSubmit={handleCreateFolder} className="w-full flex flex-col gap-4 text-left">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-[11px] flex flex-col items-center gap-2">
                <div className="text-center">{errorMsg}</div>
                {tokenExpired && (
                  <button 
                    type="button" 
                    onClick={handleReconnectDrive}
                    disabled={isAuthenticating}
                    className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded shadow transition-all text-[10px] uppercase flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isAuthenticating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                    {isAuthenticating ? 'Reconnecting...' : 'Reconnect Drive'}
                  </button>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Shooter</label>
                <select 
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg w-full text-sm text-white outline-none focus:border-indigo-500/50 appearance-none"
                  value={formData.shooter}
                  onChange={(e) => setFormData({...formData, shooter: e.target.value})}
                  required
                  disabled={isCreatingFolder}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="" disabled className="text-black">Select Shooter</option>
                  <option value="Unassigned" className="text-black">Unassigned</option>
                  <option value="Kyle" className="text-black">Kyle</option>
                  <option value="Jack" className="text-black">Jack</option>
                  <option value={formData.shooter !== '' && formData.shooter !== 'Unassigned' && formData.shooter !== 'Kyle' && formData.shooter !== 'Jack' ? formData.shooter : 'Custom'} className="text-black">
                     {formData.shooter !== '' && formData.shooter !== 'Unassigned' && formData.shooter !== 'Kyle' && formData.shooter !== 'Jack' ? formData.shooter : 'Custom Name (Edit mode)'}
                  </option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Date</label>
                <input 
                  type="date"
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg w-full text-sm text-white outline-none focus:border-indigo-500/50"
                  value={formData.shootDate}
                  onChange={(e) => setFormData({...formData, shootDate: e.target.value})}
                  required
                  disabled={isCreatingFolder}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Project Name</label>
              <input
                type="text"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg w-full text-sm text-white outline-none focus:border-indigo-500/50 block"
                value={formData.customerName}
                onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                placeholder="e.g. 123 Main St"
                required
                disabled={isCreatingFolder}
              />
            </div>

            <button type="submit" className="mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-center text-sm font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.2)] hover:shadow-[0_0_30px_rgba(79,70,229,0.4)] flex items-center justify-center gap-2" disabled={isCreatingFolder}>
              {isCreatingFolder ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  Initialize Drive Folders
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px', padding: '24px 0', alignItems: 'start' }}>
          {/* Left: Drive Structure */}
          <div className="overview-card">
            <div className="overview-card-header">
              <div className="flex items-center gap-2">
                <div className="overview-icon-wrap" style={{ backgroundColor: 'rgba(232, 93, 44, 0.1)', color: 'var(--accent-primary)' }}>
                  <Folder size={18} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Drive Folders</h3>
                  {localStorage.getItem('google_drive_email') && (
                     <span className="text-[9px] text-[var(--accent-primary)] opacity-80 font-mono">
                       {localStorage.getItem('google_drive_email')}
                     </span>
                  )}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px' }}>
                <div className="overview-label" style={{ marginBottom: '10px' }}>RAW Media Folders</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                    <FolderOpen size={16} /> {formData?.customerName} - {event?.title || 'Event'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px', marginTop: '4px' }}>
                    {realFolders ? (
                      realFolders.length > 0 ? (
                        realFolders.map((folder: any) => (
                          <div key={folder.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Folder size={14} style={{ color: '#4FACFE' }} /> {folder.name}</span>
                            <a href={`https://drive.google.com/drive/folders/${folder.id}`} target="_blank" rel="noreferrer" title="Open Drive Link" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>No subfolders found.</div>
                      )
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>Loading real folder structure...</div>
                    )}
                  </div>
                </div>
                
                <a href={formData.rawUrl || '#'} target="_blank" rel="noreferrer" className="mt-4 block w-full py-2 bg-white/5 hover:bg-white/10 rounded text-center text-xs font-bold transition-colors">
                   Open Root Folder in Drive
                </a>
              </div>

              <div style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px' }}>
                <div className="overview-label" style={{ marginBottom: '10px' }}>Deliverables URLs</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Folder size={14} style={{ color: '#10B981' }} /> Final Photos</span>
                      <a href={formData.finalPhotosUrl || '#'} target="_blank" rel="noreferrer" title="Open Drive Link" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Folder size={14} style={{ color: '#10B981' }} /> Final Video</span>
                      <a href={formData.finalVideoUrl || '#'} target="_blank" rel="noreferrer" title="Open Drive Link" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'var(--surface-2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
               <button 
                 onClick={handleDriveCheck}
                 disabled={isCheckingDrive}
                 className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded flex items-center gap-2 text-xs font-semibold transition-colors disabled:opacity-50"
               >
                 {isCheckingDrive ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Drive Check
               </button>

               {parsedInfo.hasPhoto && driveCounts.photo !== null && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg min-w-[100px] justify-center">
                   <ImageIcon size={14} className="text-[#4FACFE]" />
                   <span className="text-sm font-black text-white">{driveCounts.photo}</span>
                   <span className="text-[10px] uppercase text-white/40 font-bold ml-1">Photos</span>
                 </div>
               )}
               
               {parsedInfo.hasVideo && driveCounts.video !== null && (
                 <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg min-w-[100px] justify-center">
                   <Video size={14} className="text-[#E85D2C]" />
                   <span className="text-sm font-black text-white">{driveCounts.video}</span>
                   <span className="text-[10px] uppercase text-white/40 font-bold ml-1">Videos</span>
                 </div>
               )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: (parsedInfo.hasPhoto && parsedInfo.hasVideo) ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: '16px' }}>
              {/* Photo Column */}
              {parsedInfo.hasPhoto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                <DropZone
                  label="RAW Photos"
                  icon={<ImageIcon size={28} />}
                  accept="JPG, PNG, TIFF, RAW, CR2, ARW..."
                  isDragging={draggingPhoto}
                  color="#4FACFE"
                  {...makeDropHandlers(setDraggingPhoto, 'photo')}
                />
                {driveCounts.photo !== null && (
                  <div className="group" style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(79,172,254,0.05)', border: '1px solid rgba(79,172,254,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s ease' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Files in Drive</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button 
                        onClick={() => setLogs(prev => prev.filter(l => l.type !== 'photo'))}
                        className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded text-[10px] uppercase font-bold tracking-wider transition-all"
                      >
                        Clear Local Data
                      </button>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#4FACFE' }}>{driveCounts.photo}</span>
                    </div>
                  </div>
                )}
                {logs.filter(l => l.type === 'photo').length > 0 && (
                  <div className="overview-card" style={{ flex: 1, padding: '16px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Photos Progress</h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {logs.filter(l => l.type === 'photo' && l.status === 'done').length}/{logs.filter(l => l.type === 'photo').length} completed
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', minWidth: 0 }}>
                      {logs.filter(l => l.type === 'photo').map(log => <UploadLogItem key={log.id} log={log} />)}
                    </div>
                  </div>
                )}
              </div>
              )}
              {/* Video Column */}
              {parsedInfo.hasVideo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                <DropZone
                  label="RAW Videos"
                  icon={<Video size={28} />}
                  accept="MP4, MOV, MXF, R3D..."
                  isDragging={draggingVideo}
                  color="#E85D2C"
                  {...makeDropHandlers(setDraggingVideo, 'video')}
                />
                {driveCounts.video !== null && (
                  <div className="group" style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(232,93,44,0.05)', border: '1px solid rgba(232,93,44,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s ease' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Files in Drive</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button 
                        onClick={() => setLogs(prev => prev.filter(l => l.type !== 'video'))}
                        className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded text-[10px] uppercase font-bold tracking-wider transition-all"
                      >
                        Clear Local Data
                      </button>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#E85D2C' }}>{driveCounts.video}</span>
                    </div>
                  </div>
                )}
                {logs.filter(l => l.type === 'video').length > 0 && (
                  <div className="overview-card" style={{ flex: 1, padding: '16px', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Videos Progress</h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {logs.filter(l => l.type === 'video' && l.status === 'done').length}/{logs.filter(l => l.type === 'video').length} completed
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', minWidth: 0 }}>
                      {logs.filter(l => l.type === 'video').map(log => <UploadLogItem key={log.id} log={log} />)}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function OrderDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [event, setEvent] = useState<any>(location.state?.event || null);
  const [loading, setLoading] = useState(!event);
  const [activeTab, setActiveTab] = useState('overview');
  const [isFolderCreated, setIsFolderCreated] = useState(event?.folderCreated || !!event?.rawId || false);
  const [orderStatus, setOrderStatus] = useState(event?.status || 'Waiting for Raw');
  const [calendarMappings, setCalendarMappings] = useState<any[]>([]);

  // Elevated drive states
  const [realFolders, setRealFolders] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [isCheckingDrive, setIsCheckingDrive] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [driveCounts, setDriveCounts] = useState<{photo: number | null, video: number | null}>({ photo: null, video: null });

  // Add handleReconnectDrive as well
  const handleReconnectDrive = async () => {
    if (!auth.currentUser || isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      const newToken = await reauthenticateDrive(auth.currentUser.uid);
      if (newToken) {
        setTokenExpired(false);
        setErrorMsg(null);
      }
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // Ignore cancelled/duplicates
      } else if (e.message !== 'Authentication already in progress') {
         setErrorMsg(`Failed to reconnect: ${e.message}`);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    if (user) {
      const fetchMappings = async () => {
        try {
          const mappingRef = doc(db, 'users', user.uid, 'settings', 'calendar_mappings');
          const snap = await getDoc(mappingRef);
          if (snap.exists() && snap.data().mappings) {
            setCalendarMappings(snap.data().mappings);
          }
        } catch (e) {
          console.error(e);
        }
      };
      fetchMappings();
    }
  }, [user]);

  useEffect(() => {
    if (!event && eventId && user) {
      const fetchEvent = async () => {
        try {
          const docRef = doc(db, `users/${user.uid}/calendar_events`, eventId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
             const data = docSnap.data();
             setEvent({ id: docSnap.id, ...data });
             setOrderStatus(data.status || 'Waiting for Raw');
             setIsFolderCreated(!!data.folderCreated || !!data.rawId);
             setFormData(prev => ({
               ...prev,
               rawId: data.rawId || prev.rawId,
               rawUrl: data.rawUrl || prev.rawUrl,
               deliverId: data.deliverId || prev.deliverId,
               deliverUrl: data.deliverUrl || prev.deliverUrl,
               rawPhotosId: data.rawPhotosId || prev.rawPhotosId,
               rawPhotosUrl: data.rawPhotosUrl || prev.rawPhotosUrl,
               rawVideoId: data.rawVideoId || prev.rawVideoId,
               rawVideoUrl: data.rawVideoUrl || prev.rawVideoUrl,
               finalPhotosId: data.finalPhotosId || prev.finalPhotosId,
               finalPhotosUrl: data.finalPhotosUrl || prev.finalPhotosUrl,
               finalVideoId: data.finalVideoId || prev.finalVideoId,
               finalVideoUrl: data.finalVideoUrl || prev.finalVideoUrl,
             }));
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchEvent();
    }
  }, [eventId, user, event]);

  const parsedInfo = parseEventDescription(event?.description || event?.brief || '');
  
  const getEventDate = (evt: any) => {
    if (!evt) return new Date().toISOString().split('T')[0];
    
    let d = '';
    if (evt.date) d = evt.date;
    else if (evt.start instanceof Date && !isNaN(evt.start.getTime())) d = evt.start.toISOString();
    else if (typeof evt.start === 'string') d = evt.start;
    else if (evt.start?.dateTime) d = evt.start.dateTime;
    else if (evt.start?.date) d = evt.start.date;
    
    if (typeof d === 'string' && d.length >= 10) {
      if (d.includes('T')) return d.split('T')[0];
      return d.slice(0, 10);
    }
    return new Date().toISOString().split('T')[0];
  };

  const getDisplayEventDate = () => {
    if (parsedInfo.dateStr) {
       let d = parsedInfo.dateStr.replace(/,\s*20\d{2}/g, '');
       d = d.replace(/^[a-zA-Z]+,\s*/, '');
       return d + ' EST';
    }
    let d = event?.date || event?.start?.dateTime || event?.start?.date || event?.start;
    if (typeof d === 'string') {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' EST';
      }
    }
    return formData.shootDate;
  };

  const formatDisplayTitle = () => {
    // Prioritize the location address for the title as requested
    const location = parsedInfo.location || event?.location;
    if (location) {
      return location.trim();
    }
    return event?.title || 'ORDER DETAILS';
  };

  const getEventShooter = (e: any, parsed: any, mappings: any[]) => {
    if (!e) return '';
    
    // Always prioritize the live settings mapping if it exists
    if (e.calendarId && mappings.length > 0) {
      const mapped = mappings.find((m: any) => m.calendarId === e.calendarId);
      if (mapped && mapped.shooterName && mapped.shooterName !== 'Unassigned') {
        return mapped.shooterName;
      }
    }
    
    if (e.shooter && e.shooter !== 'Unassigned') return e.shooter;
    if (e.calendarShooter && e.calendarShooter !== 'Unassigned') return e.calendarShooter;
    
    if (parsed?.photographers) {
      if (parsed.photographers.toLowerCase().includes('kyle')) return 'Kyle';
      if (parsed.photographers.toLowerCase().includes('jack')) return 'Jack';
      return parsed.photographers;
    }
    
    const textToSearch = ((e.title || '') + ' ' + (e.description || '')).toLowerCase();
    if (textToSearch.includes('kyle')) return 'Kyle';
    if (textToSearch.includes('jack')) return 'Jack';
    
    return 'Unknown';
  };

  const [formData, setFormData] = useState({
     shooter: '',
     shootDate: getEventDate(event),
     customerName: parsedInfo?.clientName || event?.contact || event?.title || '',
     rawId: event?.rawId || '',
     rawUrl: event?.rawUrl || '',
     deliverId: event?.deliverId || '',
     deliverUrl: event?.deliverUrl || '',
     rawPhotosId: event?.rawPhotosId || '',
     rawPhotosUrl: event?.rawPhotosUrl || '',
     rawVideoId: event?.rawVideoId || '',
     rawVideoUrl: event?.rawVideoUrl || '',
     finalPhotosId: event?.finalPhotosId || '',
     finalPhotosUrl: event?.finalPhotosUrl || '',
     finalVideoId: event?.finalVideoId || '',
     finalVideoUrl: event?.finalVideoUrl || ''
  });

  useEffect(() => {
    if (event) {
      const parsed = parseEventDescription(event?.description || event?.brief || '');
      setFormData(prev => ({
        ...prev,
        shooter: prev.shooter && prev.shooter !== 'Unknown' ? prev.shooter : getEventShooter(event, parsed, calendarMappings),
        shootDate: prev.shootDate || getEventDate(event),
        customerName: prev.customerName || parsed?.clientName || event?.contact || event?.title || '',
        rawId: event.rawId || prev.rawId,
        rawUrl: event.rawUrl || prev.rawUrl,
        deliverId: event.deliverId || prev.deliverId,
        deliverUrl: event.deliverUrl || prev.deliverUrl,
        rawPhotosId: event.rawPhotosId || prev.rawPhotosId,
        rawPhotosUrl: event.rawPhotosUrl || prev.rawPhotosUrl,
        rawVideoId: event.rawVideoId || prev.rawVideoId,
        rawVideoUrl: event.rawVideoUrl || prev.rawVideoUrl,
        finalPhotosId: event.finalPhotosId || prev.finalPhotosId,
        finalPhotosUrl: event.finalPhotosUrl || prev.finalPhotosUrl,
        finalVideoId: event.finalVideoId || prev.finalVideoId,
        finalVideoUrl: event.finalVideoUrl || prev.finalVideoUrl
      }));
    }
  }, [event, calendarMappings]);

  const handleDriveCheck = async (foldersParam?: any) => {
    setIsCheckingDrive(true);
    try {
      const token = localStorage.getItem('google_drive_token');
      const foldersToUse = foldersParam || realFolders;
      if (!token || !foldersToUse) return;
      
      let photoCount: number | null = null;
      let videoCount: number | null = null;
      
      const photoFolder = foldersToUse.find((f: any) => f.name.toLowerCase().includes('photo'));
      const videoFolder = foldersToUse.find((f: any) => f.name.toLowerCase().includes('video'));
      
      if (photoFolder) {
        const photos = await googleDriveService.listFiles(token, photoFolder.id);
        photoCount = photos?.length || 0;
      }
      if (videoFolder) {
        const videos = await googleDriveService.listFiles(token, videoFolder.id);
        videoCount = videos?.length || 0;
      }
      
      setDriveCounts({ photo: photoCount, video: videoCount });
    } catch (e: any) {
      console.error("Failed to check drive files:", e);
      if (e.message && e.message.includes('401')) {
        setTokenExpired(true);
        setErrorMsg("Drive token expired. Please Reconnect.");
        localStorage.removeItem('google_drive_token');
      }
    } finally {
      setIsCheckingDrive(false);
    }
  };

  useEffect(() => {
    const fetchRealStructure = async () => {
      if (isFolderCreated && formData.rawId) {
        try {
          const token = localStorage.getItem('google_drive_token');
          if (token) {
            const children = await googleDriveService.listFolders(token, formData.rawId);
            setRealFolders(children);
            // Auto check counts
            if (children && children.length > 0) {
              handleDriveCheck(children);
            }
          }
        } catch (e: any) {
          console.error("Could not fetch real structure", e);
          if (e.message && e.message.includes('401')) {
            setTokenExpired(true);
            setErrorMsg("Drive token expired. Please Reconnect.");
            localStorage.removeItem('google_drive_token');
          }
        }
      }
    };
    fetchRealStructure();
  }, [isFolderCreated, formData.rawId]);

  const statuses = [
    { id: 'waiting for raw', label: 'Waiting for Raw' },
    { id: 'order created', label: 'Order Created' },
    { id: 'uploaded', label: 'Uploaded' },
    { id: 'editing', label: 'Editing' },
    { id: 'revision', label: 'Revision' },
    { id: 'delivered', label: 'Delivered' }
  ];

  const handleUpdateStatus = async (s: string) => {
    setOrderStatus(s);
    if (eventId && user) {
      try {
        await updateDoc(doc(db, `users/${user.uid}/calendar_events`, eventId), { status: s });
      } catch (e) {
        console.error("Failed to update status", e);
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-white/40">Loading order details...</div>;

  return (
    <div className="order-detail p-4 md:p-6 max-w-[1400px] mx-auto text-white flex flex-col h-screen overflow-hidden">
      <header className="order-header mb-4 bg-[#121214] p-5 md:p-6 rounded-2xl border border-white/5 shrink-0">
        <div className="flex items-start gap-4">
          <button className="p-2 hover:bg-white/5 rounded transition-colors mt-1 shrink-0" onClick={() => navigate(-1)}>
            <ChevronLeft size={20} />
          </button>
          <div className="flex flex-col gap-2 w-full">
             <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white uppercase tracking-tight leading-none">{formatDisplayTitle()}</h1>
             {formData.customerName && (
               <div className="text-white/60 font-medium text-sm md:text-base flex items-center gap-2 mb-2">
                 <User className="w-4 h-4" /> Client: 
                 <button onClick={() => navigate('/clients')} className="text-indigo-300 hover:text-indigo-200 hover:underline transition-colors cursor-pointer">
                   {formData.customerName}
                 </button>
               </div>
             )}
             
             <div className="flex items-center gap-x-6 gap-y-3 text-xs text-white/50 uppercase font-bold flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white/70">{event?.id?.slice(0, 8) || 'ORD-1002'}</span>
                  {parsedInfo.platform === 'hdphotohub' && parsedInfo.tonomoOrderUrl ? (
                    <a
                      href={parsedInfo.tonomoOrderUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: 'rgba(249, 115, 22, 0.12)', // Orange for HDPhotoHub
                        color: '#F97316',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      className="hover:bg-orange-500/20 transition-colors"
                    >
                      HDPhotoHub <ExternalLink size={10} />
                    </a>
                  ) : parsedInfo.platform === 'tonomo' && parsedInfo.tonomoOrderUrl ? (
                    <a
                      href={parsedInfo.tonomoOrderUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: 'rgba(167, 139, 250, 0.12)', // Purple-ish for Tonomo
                        color: '#A78BFA',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      className="hover:bg-purple-500/20 transition-colors"
                    >
                      Tonomo <ExternalLink size={10} />
                    </a>
                  ) : parsedInfo.platform === 'fotello' && parsedInfo.fotelloOrderId ? (
                    <a
                      href={`https://app.fotello.co/dashboard/listings/${parsedInfo.fotelloOrderId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                        backgroundColor: 'rgba(79,172,254,0.12)',
                        color: '#4FACFE',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      className="hover:bg-blue-500/20 transition-colors"
                    >
                      FOTELLO <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                      backgroundColor: parsedInfo.platform === 'fotello' ? 'rgba(79,172,254,0.12)' : parsedInfo.platform === 'tonomo' ? 'rgba(167, 139, 250, 0.12)' : 'rgba(232,93,44,0.12)',
                      color: parsedInfo.platform === 'fotello' ? '#4FACFE' : parsedInfo.platform === 'tonomo' ? '#A78BFA' : 'var(--accent-primary)',
                    }}>
                      {parsedInfo.platform === 'fotello' ? 'Fotello' : parsedInfo.platform === 'starep' ? 'StarRep' : parsedInfo.platform === 'tonomo' ? 'Tonomo' : 'Unknown'}
                    </span>
                  )}
                </div>
                
                <div className="w-[1px] h-4 bg-white/10 hidden md:block" />
                
                {(parsedInfo.fotelloOrderId || event?.htmlLink) && (
                  <>
                  <a 
                    href={event?.htmlLink ? `${event.htmlLink}${event.htmlLink.includes('?') ? '&' : '?'}authuser=${localStorage.getItem('google_calendar_email') || user?.email || ''}` : `https://app.fotello.co/dashboard/listings`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[10px] hover:text-white transition-colors"
                  >
                    <Globe size={12} /> Google Calendar
                  </a>
                  <div className="w-[1px] h-4 bg-white/10 hidden md:block" />
                  </>
                )}
                
                <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> Shooter: <span className="text-white/90">{formData.shooter || 'Unknown'}</span></span>
                <div className="w-[1px] h-4 bg-white/10 hidden md:block" />
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Date: <span className="text-white/90">{getDisplayEventDate()}</span></span>
             </div>
          </div>
        </div>
      </header>

      <div className="tabs flex justify-between items-center mb-4 shrink-0 px-1">
        <div className="flex gap-2">
          <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Upload</button>
          {parsedInfo.hasVideo && <button className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>Video</button>}
          {parsedInfo.hasPhoto && <button className={`tab-btn ${activeTab === 'photo' ? 'active' : ''}`} onClick={() => setActiveTab('photo')}>Photo</button>}
        </div>
        
        <div className="flex bg-black/40 rounded border border-white/10 p-0.5 overflow-hidden w-fit shadow-inner hidden md:flex">
           {statuses.map(s => (
             <button 
               key={s.id}
               onClick={() => handleUpdateStatus(s.label)}
               className={`px-4 py-1.5 text-[10px] tracking-wider font-black uppercase transition-all rounded-sm ${orderStatus?.toLowerCase() === s.id ? 'bg-indigo-600 text-white shadow-md' : 'text-white/30 hover:text-white/80 hover:bg-white/5'}`}
             >
               {s.label}
             </button>
           ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 relative">
        {activeTab === 'overview' && (
          <div className="overview-grid h-full relative">
          
          <div className="overview-col">
            <div className="overview-card">
              <div className="overview-card-header">
                <div className="overview-icon-wrap bg-indigo-500/10 text-indigo-400">
                  <User size={18} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/80">Client Information</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div className="overview-label">Client Name</div>
                  <div className="text-sm text-indigo-400 underline cursor-pointer hover:text-indigo-300 font-medium" onClick={() => navigate('/clients')}>{parsedInfo.clientName || event?.contact || 'N/A'}</div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="overview-label">Phone</div>
                    <div className="text-sm text-white/80 font-mono">{parsedInfo.phone || event?.phone || 'N/A'}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="overview-label">Email</div>
                    <div className="text-sm text-white/80" style={{ wordBreak: 'break-all' }} title={parsedInfo.email || event?.email}>
                      {parsedInfo.email || event?.email || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overview-card">
              <div className="overview-card-header">
                <div className="overview-icon-wrap bg-emerald-500/10 text-emerald-400">
                  <MapPin size={18} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/80">Location</h3>
              </div>
              <p className="text-sm text-white/60 leading-relaxed" style={{ flex: 1 }}>{parsedInfo.location || event?.location || 'N/A'}</p>
              
              {(parsedInfo.location || event?.location) && (
                <div style={{ paddingTop: '12px', borderTop: '1px dashed var(--border-subtle)' }}>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsedInfo.location || event?.location)}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink size={14} /> Open Map
                  </a>
                </div>
              )}
            </div>

            {isFolderCreated && realFolders && (
              <div className="overview-card">
                <div className="overview-card-header flex justify-between items-center mb-0">
                  <div className="flex items-center gap-2">
                    <div className="overview-icon-wrap bg-blue-500/10 text-blue-400">
                      <Folder size={18} />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white/80">Drive Status</h3>
                  </div>
                  <button onClick={handleDriveCheck} disabled={isCheckingDrive} className="text-[10px] uppercase font-bold text-white/40 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50">
                    {isCheckingDrive ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 mb-4" style={{ gridTemplateColumns: (parsedInfo.hasPhoto && parsedInfo.hasVideo) ? 'repeat(2, 1fr)' : '1fr' }}>
                  {parsedInfo.hasPhoto && (
                  <div className="bg-white/5 p-3 rounded-lg flex flex-col justify-center items-center">
                    <span className="text-[10px] uppercase text-white/40 font-bold mb-1">Photos Uploaded</span>
                    <span className="text-2xl font-black text-[#4FACFE]">{driveCounts.photo !== null ? driveCounts.photo : '-'}</span>
                  </div>
                  )}
                  {parsedInfo.hasVideo && (
                  <div className="bg-white/5 p-3 rounded-lg flex flex-col justify-center items-center">
                    <span className="text-[10px] uppercase text-white/40 font-bold mb-1">Videos Uploaded</span>
                    <span className="text-2xl font-black text-[#E85D2C]">{driveCounts.video !== null ? driveCounts.video : '-'}</span>
                  </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                   <div className="text-[10px] uppercase text-white/40 font-bold mb-1 ml-1 tracking-wider">Final Deliverables</div>
                   {parsedInfo.hasPhoto && (
                   <a href={formData.finalPhotosUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-semibold border border-emerald-500/20">
                     <span className="flex items-center gap-2"><Folder size={14} /> Final Photos</span>
                     <ExternalLink size={14} />
                   </a>
                   )}
                   {parsedInfo.hasVideo && (
                   <a href={formData.finalVideoUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2.5 bg-[#E85D2C]/10 hover:bg-[#E85D2C]/20 text-[#E85D2C] rounded-lg transition-colors text-xs font-semibold border border-[#E85D2C]/20">
                     <span className="flex items-center gap-2"><Folder size={14} /> Final Video</span>
                     <ExternalLink size={14} />
                   </a>
                   )}
                </div>
              </div>
            )}

          </div>

          <div className="overview-col">
            <div className="overview-card" style={{ height: '100%' }}>
              <div className="overview-card-header">
                <div className="overview-icon-wrap bg-amber-500/10 text-amber-500">
                  <FileText size={18} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/80">
                  {parsedInfo.platform === 'fotello' ? 'Intake Answers' : 'Brief & Preferences'}
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {parsedInfo.intakeAnswers?.length > 0 ? (
                  parsedInfo.intakeAnswers.map((qa: any, idx: number) => (
                    <div key={idx} className="bg-black/40 border border-white/5 rounded-lg p-4">
                      <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> {qa.question || qa.q}
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed italic">"{qa.answer || qa.a || 'N/A'}"</p>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-4">
                      <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Entry Notes
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">
                        {parsedInfo.entryNotes || 'No specific entry notes.'}
                      </p>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-lg p-4">
                      <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Amenities to Highlight
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">
                        {parsedInfo.amenities || 'No amenities highlighted.'}
                      </p>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-lg p-4">
                      <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Client Preferences
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">
                        {parsedInfo.preferences || 'No client preferences.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="overview-col">
            <div className="overview-card" style={{ flex: 1 }}>
              <div className="overview-card-header">
                <div className="overview-icon-wrap bg-[#4FACFE]/10 text-[#4FACFE]">
                  <Package size={18} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#4FACFE]">Booked Packages & Items</h3>
              </div>
              
              {parsedInfo.packageName && (
                 <div style={{ marginBottom: '16px' }}>
                   <div className="overview-label">Package Name</div>
                   <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                     {parsedInfo.packageName}
                   </div>
                 </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="overview-label" style={{ marginBottom: '12px' }}>Order Items (Progress)</div>
                {parsedInfo.orderItems && parsedInfo.orderItems.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {parsedInfo.orderItems.map((item: string, idx: number) => (
                      <ChecklistItem key={idx} text={item} />
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '24px 16px', border: '1px dashed var(--border-subtle)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No specific items requested.
                  </div>
                )}
              </div>
              
              <div className="pt-4 border-t border-white/5">
                 <div className="overview-label mb-3">Admin Check</div>
                 <ChecklistItem text="Order Information Verified" />
                 <ChecklistItem text="Brief & Notes Reviewed" />
                 <ChecklistItem text="Ready for Allocation" />
              </div>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'upload' && (
        <UploadWorkspace 
          parsedInfo={parsedInfo} 
          event={event} 
          isFolderCreated={isFolderCreated} 
          setIsFolderCreated={(val: boolean) => {
            setIsFolderCreated(val);
            if (eventId && user && val) {
               updateDoc(doc(db, `users/${user.uid}/calendar_events`, eventId), { folderCreated: true }).catch(console.error);
            }
          }}
          formData={formData} 
          setFormData={setFormData}
          onConfirmOrder={() => handleUpdateStatus('Order Created')}
          onSubmitRequest={() => handleUpdateStatus('Uploaded')}
          driveCounts={driveCounts}
          setDriveCounts={setDriveCounts}
          realFolders={realFolders}
          setRealFolders={setRealFolders}
          isCheckingDrive={isCheckingDrive}
          setIsCheckingDrive={setIsCheckingDrive}
          handleDriveCheck={handleDriveCheck}
          tokenExpired={tokenExpired}
          setTokenExpired={setTokenExpired}
          errorMsg={errorMsg}
          setErrorMsg={setErrorMsg}
          handleReconnectDrive={handleReconnectDrive}
          isAuthenticating={isAuthenticating}
        />
      )}

      {activeTab === 'video' && (
        <VideoTabWorkspace formData={formData} />
      )}

      {activeTab === 'photo' && (
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-12 text-center mt-6 flex flex-col items-center">
          <ImageIcon size={48} className="mx-auto mb-4 text-white/10" />
          <h3 className="text-xl font-bold text-white mb-2">Photo Gallery</h3>
          <p className="text-white/40 mb-6 font-medium max-w-md mx-auto">Access and manage the final delivered photos for this order directly from Google Drive.</p>
          
          <div className="flex gap-4">
            <a href={formData.finalPhotosUrl || '#'} target="_blank" rel="noreferrer" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm transition-all text-white flex items-center gap-2 shadow-[0_0_20px_rgba(79,70,229,0.2)]">
              <Folder size={18} /> Open Final Photos
            </a>
            <button className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm transition-colors text-white" onClick={() => setActiveTab('upload')}>Upload More</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function VideoTabWorkspace({ formData }: { formData?: any }) {
  const [versions] = useState([
    { id: '1', name: 'CinematicVideo_v2.mp4', date: 'May 02, 2026', status: 'current' },
    { id: '2', name: 'CinematicVideo_v1.mp4', date: 'Apr 29, 2026', status: 'old' },
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingTop: '24px' }}>
      <div className="flex bg-[#121214] border border-white/5 rounded-2xl p-6 items-center justify-between shadow-xl">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Video size={20} className="text-[#E85D2C]" /> Final Video Delivery
          </h2>
          <p className="text-sm text-white/50">Access the final edited video files from Google Drive</p>
        </div>
        <a href={formData?.finalVideoUrl || '#'} target="_blank" rel="noreferrer" className="px-6 py-3 bg-[#E85D2C] hover:bg-[#ff7140] rounded-xl font-bold text-sm transition-all text-white flex items-center gap-2 shadow-[0_0_20px_rgba(232,93,44,0.2)]">
          <Folder size={18} /> Open Final Videos
        </a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '-10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Video Versions</h3>
      </div>

      <div className="video-workspace">
        <div className="player-section border border-white/5 rounded-xl">
          <div className="video-container">
            <div className="video-placeholder">
              <Play size={48} className="text-white/20" />
            </div>
            <div className="video-controls">
              <button className="p-2 hover:bg-white/10 rounded transition-colors text-white"><Play size={16} /></button>
              <div className="timeline">
                <div className="timeline-track">
                  <div className="timeline-progress" style={{ width: '35%' }}></div>
                  <div className="timeline-marker" style={{ left: '20%' }}></div>
                  <div className="timeline-marker active" style={{ left: '35%' }}></div>
                  <div className="timeline-marker" style={{ left: '60%' }}></div>
                </div>
              </div>
              <span className="tabular-nums text-sm font-mono text-white/40">00:14 / 01:20</span>
            </div>
          </div>

          <div style={{ padding: '12px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {versions.map(v => (
              <div key={v.id} style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: v.status === 'current' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                backgroundColor: v.status === 'current' ? 'rgba(232,93,44,0.1)' : 'var(--surface-2)',
                color: v.status === 'current' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}>
                {v.name} <span style={{ opacity: 0.6, marginLeft: '4px' }}>· {v.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="feedback-section border border-white/5 rounded-xl bg-[#121214]">
          <div className="feedback-header">
            <h3 className="font-bold text-sm uppercase tracking-widest text-white/80">Feedback</h3>
            <select className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none">
              {versions.map((v, i) => (
                <option key={v.id}>Version {versions.length - i}</option>
              ))}
            </select>
          </div>
          
          <div className="comments-list custom-scrollbar">
            <div className="comment-item">
              <div className="comment-meta">
                <span className="comment-author text-white">Client</span>
                <span className="comment-time tabular-nums font-mono text-accent text-indigo-400">00:12</span>
              </div>
              <p className="comment-text text-white/70">Please lower the brightness here, it's slightly overexposed.</p>
              <div className="mt-2">
                <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded font-bold uppercase">Open</span>
              </div>
            </div>
            
            <div className="comment-item active !border-indigo-500/50">
              <div className="comment-meta">
                <span className="comment-author text-white">Manager</span>
                <span className="comment-time tabular-nums font-mono text-accent text-indigo-400">00:14</span>
              </div>
              <p className="comment-text text-white/70">Cut faster at this bass beat.</p>
              <div className="mt-2">
                <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded font-bold uppercase">Open</span>
              </div>
            </div>

            <div className="comment-item addressed opacity-50">
              <div className="comment-meta">
                <span className="comment-author text-white">Client</span>
                <span className="comment-time tabular-nums font-mono text-white/40">00:45</span>
              </div>
              <p className="comment-text text-white/70">Change the background music here to something more upbeat.</p>
              <div className="mt-2 flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase">
                <CheckCircle2 size={12}/> Addressed
              </div>
            </div>
          </div>

          <div className="comment-input-area">
            <textarea placeholder="Add feedback at 00:14..." className="bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white resize-none outline-none focus:border-indigo-500/50" rows={2} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span className="text-xs text-white/40">Press Cmd+Enter to submit</span>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-colors">
                 <Send size={14} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
