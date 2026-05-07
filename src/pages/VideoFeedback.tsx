import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  RotateCcw, 
  MessageSquare, 
  Send, 
  Clock, 
  Shield, 
  Maximize2,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Link as LinkIcon,
  FileText,
  Paperclip,
  ExternalLink,
  File
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { format } from 'date-fns';

export function VideoFeedback() {
  const { submissionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'feedback' | 'context'>('feedback');

  useEffect(() => {
    if (!user || !submissionId) return;

    // Real-time listener for comments and status
    const unsub = onSnapshot(doc(db, 'submissions', submissionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSubmission({ id: docSnap.id, ...data });
        setComments(data.comments || []);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user, submissionId]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const jumpToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      if (!isPlaying) togglePlay();
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !submissionId) return;

    try {
      const comment = {
        id: crypto.randomUUID(),
        authorName: user.displayName || user.email,
        authorId: user.uid,
        text: newComment,
        timestamp: currentTime,
        createdAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'submissions', submissionId), {
        comments: arrayUnion(comment),
        status: 'Client Review'
      });

      setNewComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${submissionId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#050505]">
        <Loader2 className="w-12 h-12 animate-spin text-brand" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-white/40 font-mono">Synchronizing Feed...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-white overflow-hidden">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <div className="w-[1px] h-4 bg-white/10 mx-2" />
          <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">Feedback Terminal // {submission?.eventTitle}</h1>
        </div>
        <div className="flex items-center gap-4">
           <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
             submission?.status === 'Completed' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 
             submission?.status === 'Client Review' ? 'text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/5' :
             submission?.status === 'In Progress' ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5' :
             'text-amber-400 border-amber-500/20 bg-amber-500/5'
           }`}>
             {submission?.status}
           </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Video Side */}
        <div className="flex-1 flex flex-col bg-black relative">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-5xl aspect-video bg-[#121214] rounded-2xl overflow-hidden shadow-2xl relative group">
              {/* Mock Video Placeholder or Real Video */}
              <video 
                ref={videoRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-contain"
                src={submission?.videoUrl || "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}
              />
              
              {/* Custom Overlay Controls */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <div className="flex items-center gap-4 mb-4">
                   <button onClick={togglePlay} className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform">
                     {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                   </button>
                   <div className="flex-1 h-1.5 bg-white/20 rounded-full relative cursor-pointer group/bar">
                      <div 
                        className="absolute h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                      />
                   </div>
                   <span className="text-[10px] font-mono font-bold text-white tracking-widest">
                     {formatTime(currentTime)} / {formatTime(duration)}
                   </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="h-20 shrink-0 border-t border-white/5 bg-[#080809] flex items-center justify-between px-8">
             <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-brand text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
                   Approve Edit
                </button>
                <button className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-white/5">
                   Request Revision
                </button>
             </div>
             <div className="flex items-center gap-1.5 px-4 py-2 bg-black/40 border border-white/5 rounded-xl">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Secure Client Stream Enforced</span>
             </div>
          </div>
        </div>

        {/* Feedback Side */}
        <div className="w-[400px] shrink-0 border-l border-white/10 bg-[#0A0A0B] flex flex-col">
          <div className="flex bg-[#080809] border-b border-white/5">
             <button 
               onClick={() => setActiveTab('feedback')}
               className={`flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                 activeTab === 'feedback' ? 'text-brand border-brand bg-brand/5' : 'text-white/20 border-transparent hover:text-white/40'
               }`}
             >
                <MessageSquare className="w-3.5 h-3.5" />
                Ledger
             </button>
             <button 
               onClick={() => setActiveTab('context')}
               className={`flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                 activeTab === 'context' ? 'text-indigo-400 border-indigo-400 bg-indigo-400/5' : 'text-white/20 border-transparent hover:text-white/40'
               }`}
             >
                <Info className="w-3.5 h-3.5" />
                Context
             </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
             <AnimatePresence mode="wait">
               {activeTab === 'feedback' ? (
                 <motion.div 
                   key="feedback"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="p-6 space-y-6"
                 >
                    {comments.sort((a, b) => a.timestamp - b.timestamp).map((comment) => (
                      <div key={comment.id} className="group space-y-2">
                         <div className="flex items-center justify-between">
                            <div 
                              onClick={() => jumpToTime(comment.timestamp)}
                              className="flex items-center gap-2 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded cursor-pointer hover:bg-indigo-500/20 transition-all"
                            >
                               <Clock className="w-3 h-3" />
                               <span className="text-[10px] font-black font-mono">{formatTime(comment.timestamp)}</span>
                            </div>
                            <span className="text-[9px] font-mono text-white/10">{comment.authorName}</span>
                         </div>
                         <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl group-hover:border-white/10 transition-colors shadow-lg">
                            <p className="text-[11px] leading-relaxed text-white/70 italic">"{comment.text}"</p>
                         </div>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                         <div className="w-12 h-12 rounded-2xl bg-white/5 border border-dashed border-white/10 flex items-center justify-center">
                           <MessageSquare className="w-5 h-5 text-white/10" />
                         </div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-white/10 italic">Buffer Empty // Awaiting Input</p>
                      </div>
                    )}
                 </motion.div>
               ) : (
                 <motion.div 
                   key="context"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="p-6 space-y-8"
                 >
                    {/* Instructions */}
                    <div className="space-y-3">
                       <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                          <FileText className="w-3 h-3 text-emerald-400" />
                          Protocol Instructions
                       </div>
                       <div className="p-4 bg-black/40 border border-white/5 rounded-xl text-xs text-white/60 leading-relaxed font-mono whitespace-pre-wrap">
                          {submission?.instructions || "Initialize manual bypass: No custom instructions detected."}
                       </div>
                    </div>

                    {/* Resources */}
                    <div className="space-y-3">
                       <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                          <LinkIcon className="w-3 h-3 text-indigo-400" />
                          External Links
                       </div>
                       <div className="p-4 bg-black/40 border border-white/5 rounded-xl text-[10px] text-indigo-400 font-mono break-all line-clamp-4 hover:line-clamp-none transition-all cursor-pointer">
                          {submission?.rawLinks || "No external resource pointers detected."}
                       </div>
                    </div>

                    {/* Assets */}
                    <div className="space-y-3">
                       <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                          <Paperclip className="w-3 h-3 text-amber-500" />
                          Production Assets ({submission?.assets?.length || 0})
                       </div>
                       <div className="grid grid-cols-1 gap-2">
                          {submission?.assets?.map((asset: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-lg group hover:border-white/10 transition-all">
                               <div className="flex items-center gap-3 overflow-hidden">
                                  <File className="w-4 h-4 text-white/20 shrink-0" />
                                  <span className="text-[10px] font-black text-white/60 truncate uppercase tracking-tighter">{asset.name}</span>
                               </div>
                               <span className="text-[8px] font-mono text-white/20 shrink-0">{asset.size}</span>
                            </div>
                          ))}
                          {!submission?.assets?.length && (
                            <div className="text-center py-8 border border-dashed border-white/5 rounded-xl text-[9px] font-black uppercase text-white/10">No Local Assets Attached</div>
                          )}
                       </div>
                    </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          <div className="p-6 border-t border-white/5 bg-[#080809]">
             {activeTab === 'feedback' ? (
               <form onSubmit={handleAddComment} className="relative">
                  <input 
                    type="text" 
                    placeholder="Insert feedback at CURRENT TIME..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 transition-all font-mono"
                  />
                  <button 
                    type="submit"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand hover:text-white transition-all shadow-lg"
                  >
                    <Send className="w-4 h-4" />
                  </button>
               </form>
             ) : (
               <div className="text-center space-y-1">
                  <div className="text-[9px] font-black uppercase text-white/40 tracking-widest">Metadata Monitor</div>
                  <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.2em]">Submitted: {submission?.submittedAt ? format(submission.submittedAt.toDate(), 'MM.dd.yyyy // HH:mm') : '--'}</div>
               </div>
             )}
             <p className="mt-4 text-[8px] font-mono text-white/20 uppercase tracking-[0.2em] text-center">
                Autosave enabled // Comments sync to {submission?.editor}'s node
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
