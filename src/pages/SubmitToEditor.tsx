import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Upload, 
  Link as LinkIcon, 
  FileText, 
  Send, 
  Paperclip,
  X,
  File,
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Video,
  User,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { format } from 'date-fns';

export function SubmitToEditor() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  // File Upload State
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    rawLinks: '',
    instructions: '',
    deadline: '',
    editor: 'Unassigned',
    priority: 'Normal'
  });

  useEffect(() => {
    if (!user || !eventId) return;
    const fetchEvent = async () => {
      try {
        const docRef = doc(db, `users/${user.uid}/calendar_events`, eventId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEvent({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (e) {
        console.error("Error fetching event:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [user, eventId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + 'MB',
        progress: 0,
        status: 'pending' as 'pending' | 'uploading' | 'completed' | 'error'
      }));
      setFiles(prev => [...prev, ...newFiles]);
      
      // Auto-trigger simulation for each new file
      newFiles.forEach(f => simulateUpload(f.id));
    }
  };

  const simulateUpload = (fileId: string) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'uploading' } : f));
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress, status: 'completed' } : f));
      } else {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress } : f));
      }
    }, 400);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const allFilesUploaded = files.length > 0 && files.every(f => f.status === 'completed');
  const isReadyToSubmit = (files.length > 0 && allFilesUploaded) || (formData.rawLinks.trim().length > 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !event || !isReadyToSubmit) return;
    setSubmitting(true);
    
    try {
      // Create a submission record in a new collection
      const submissionRef = collection(db, 'submissions');
      await addDoc(submissionRef, {
        eventId: event.id,
        ownerId: user.uid,
        status: 'Pending Review',
        ...formData,
        assets: files.map(f => ({ name: f.name, size: f.size })),
        eventTitle: event.title || event.clientName,
        submittedAt: serverTimestamp(),
      });

      // Update event status to 'Editing'
      const eventRef = doc(db, `users/${user.uid}/calendar_events`, event.id);
      await setDoc(eventRef, { status: 'Post-Production' }, { merge: true });

      setSubmitted(true);
      setTimeout(() => navigate('/video-library'), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'submissions');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505]">
        <Loader2 className="w-12 h-12 animate-spin text-brand" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-white/40 font-mono">Connecting to Node...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505] text-white">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-white/60">Node Not Found</p>
        <Link to="/calendar" className="mt-4 text-[10px] text-indigo-400 font-black uppercase underline tracking-widest">Return to Calendar</Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505] z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <div className="w-[1px] h-4 bg-white/10 mx-2" />
          <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">Submission Portal // {event.title || event.clientName}</h1>
        </div>
        <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">Protocol: Editor_Handoff_v1</div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-10"
              >
                {/* Event Summary Card */}
                <div className="bg-[#121214] border border-white/5 rounded-2xl p-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Video className="w-24 h-24 rotate-12" />
                  </div>
                  <div className="flex flex-col md:flex-row gap-8 justify-between">
                    <div className="space-y-4">
                      <div className="px-3 py-1 bg-brand/10 border border-brand/20 text-brand text-[9px] font-black uppercase tracking-widest rounded inline-block">Source Node</div>
                      <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">{event.title || event.clientName}</h2>
                      <div className="flex items-center gap-6 text-[11px] font-mono text-white/40">
                         <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            {event.date ? format(new Date(event.date), 'MM.dd.yyyy') : 'Unscheduled'}
                         </div>
                         <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            {event.shooterName || 'Unassigned Shooter'}
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submission Form */}
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    {/* File Upload Section */}
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-1">
                        <Upload className="w-3 h-3 text-indigo-400" />
                        Production Assets (Photos / Graphics / Docs)
                      </label>
                      
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center hover:border-indigo-500/40 hover:bg-white/[0.02] cursor-pointer transition-all group"
                      >
                         <input 
                           type="file" 
                           multiple 
                           hidden 
                           ref={fileInputRef} 
                           onChange={handleFileChange}
                         />
                         <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <Paperclip className="w-8 h-8 text-white/20 group-hover:text-indigo-400 transition-colors" />
                         </div>
                         <h3 className="text-xs font-black uppercase tracking-widest text-white/60 mb-2">Initialize Asset Node</h3>
                         <p className="text-[10px] font-mono text-white/20 uppercase">Drag & Drop or Click to Select Local Clusters</p>
                      </div>

                      {/* File List */}
                      {files.length > 0 && (
                        <div className="grid grid-cols-1 gap-2">
                          {files.map((file) => (
                            <motion.div 
                              key={file.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="bg-[#121214] border border-white/5 rounded-xl p-4 flex items-center justify-between group"
                            >
                               <div className="flex items-center gap-4 flex-1">
                                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                                     <File className="w-5 h-5 text-white/20" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                     <div className="flex items-center justify-between mb-2">
                                        <div className="text-[11px] font-black text-white/80 uppercase truncate pr-4">{file.name}</div>
                                        <div className="text-[9px] font-mono text-white/20">{file.size}</div>
                                     </div>
                                     <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full transition-all duration-300 ${file.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                          style={{ width: `${file.progress}%` }}
                                        />
                                     </div>
                                  </div>
                               </div>
                               <button 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   removeFile(file.id);
                                 }}
                                 className="ml-4 p-2 text-white/10 hover:text-red-400 transition-colors"
                               >
                                  <X className="w-4 h-4" />
                               </button>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Raw Links */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-1">
                        <LinkIcon className="w-3 h-3 text-indigo-400" />
                        Raw Asset Links (Drive/Dropbox/Web)
                      </label>
                      <textarea 
                        required
                        placeholder="Paste links to raw footage clusters here..."
                        value={formData.rawLinks}
                        onChange={e => setFormData({...formData, rawLinks: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm font-mono text-white/80 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all min-h-[120px] resize-none"
                      />
                    </div>

                    {/* Instructions */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/40 ml-1">
                        <FileText className="w-3 h-3 text-emerald-400" />
                        Production Instructions
                      </label>
                      <textarea 
                        required
                        placeholder="Details for the editor... mood, references, music constraints..."
                        value={formData.instructions}
                        onChange={e => setFormData({...formData, instructions: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm text-white/80 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all min-h-[160px] resize-none"
                      />
                    </div>

                    {/* Meta Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Target Editor</label>
                        <select 
                          value={formData.editor}
                          onChange={e => setFormData({...formData, editor: e.target.value})}
                          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase font-black"
                        >
                          <option value="Unassigned">Unassigned</option>
                          <option value="Kyle">Kyle (Internal)</option>
                          <option value="Jack">Jack (Internal)</option>
                          <option value="Freelance">Freelance Cluster</option>
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Priority Protocol</label>
                        <select 
                          value={formData.priority}
                          onChange={e => setFormData({...formData, priority: e.target.value})}
                          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase font-black"
                        >
                          <option value="Low">Standard</option>
                          <option value="Normal" selected>Urgent</option>
                          <option value="High">Emergency</option>
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Deadline Registry</label>
                        <input 
                          type="date"
                          value={formData.deadline}
                          onChange={e => setFormData({...formData, deadline: e.target.value})}
                          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase font-black font-mono invert dark:invert-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 flex flex-col items-end gap-4 border-t border-white/5">
                    {!isReadyToSubmit && (
                      <div className="flex items-center gap-2 text-amber-500/60 font-mono text-[9px] uppercase tracking-widest animate-pulse">
                         <AlertCircle className="w-3 h-3" />
                         {files.length > 0 && !allFilesUploaded 
                           ? "Awaiting asset synchronization..." 
                           : "Missing upload or raw link protocol"}
                      </div>
                    )}
                    
                    <button 
                      type="submit"
                      disabled={submitting || !isReadyToSubmit}
                      className="flex items-center gap-4 bg-indigo-600 hover:bg-brand text-white px-12 py-5 rounded-none font-black uppercase text-xs tracking-[0.3em] transition-all shadow-2xl shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Broadcasting...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Commit to Editor Pipeline
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-32 flex flex-col items-center justify-center text-center space-y-8"
              >
                <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                   <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                </div>
                <div className="space-y-2">
                   <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Upload Confirmed</h2>
                   <p className="text-[11px] font-mono text-white/40 uppercase tracking-[0.4em]">Protocol Handshake: SUCCESS // Re-routing to Library</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
