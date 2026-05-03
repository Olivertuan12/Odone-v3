import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
  MoreVertical,
  Play,
  FileVideo,
  Download,
  Share2,
  Trash2,
  ExternalLink,
  Loader2,
  ChevronRight,
  Paperclip,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';

export function VideoLibrary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Pending Review' | 'In Progress' | 'Client Review' | 'Completed'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    const fetchSubmissions = async () => {
      try {
        const q = query(
          collection(db, 'submissions'),
          where('ownerId', '==', user.uid),
          orderBy('submittedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error fetching submissions:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSubmissions();
  }, [user]);

  const filtered = submissions.filter(s => {
    const matchesFilter = filter === 'All' || s.status === filter;
    const matchesSearch = s.eventTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         s.editor?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Confirm protocol termination (permanent deletion)?")) return;
    try {
      await deleteDoc(doc(db, 'submissions', id));
      setSubmissions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const statusColors: any = {
    'Pending Review': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'In Progress': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    'Client Review': 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
    'Completed': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-white overflow-hidden">
      {/* Header Bar */}
      <header className="h-12 shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-[#050505] z-10">
        <div className="flex items-center gap-6">
           <h1 className="text-xs font-black uppercase tracking-[0.2em] text-white">Video Asset Matrix</h1>
           <div className="text-[9px] text-white/20 px-2 py-0.5 rounded font-mono uppercase border border-white/5">Local Registry Active</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
            <input 
               type="text" 
               placeholder="Search registry..."
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="bg-white/5 border border-white/5 rounded-lg py-1.5 pl-8 pr-4 text-[10px] focus:outline-none focus:border-indigo-500/30 w-48 transition-all"
            />
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="shrink-0 p-6 pb-0 flex gap-4">
        {['All', 'Pending Review', 'In Progress', 'Client Review', 'Completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              filter === f 
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
                : 'bg-transparent border-white/5 text-white/30 hover:text-white/60 hover:border-white/10'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center">
             <Loader2 className="w-8 h-8 animate-spin text-white/10" />
             <p className="mt-4 text-[9px] font-mono text-white/20 uppercase tracking-widest">Hydrating Registry...</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((sub, i) => (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#121214] border border-white/5 rounded-2xl p-5 flex flex-col group relative overflow-hidden shadow-xl hover:border-white/10 transition-all"
              >
                {/* Visual Accent */}
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Video className="w-16 h-16 rotate-12" />
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div className={`px-2 py-1 rounded text-[8px] font-black uppercase border ${statusColors[sub.status] || 'text-white/40 border-white/10'}`}>
                    {sub.status}
                  </div>
                  <button 
                    onClick={() => handleDelete(sub.id)}
                    className="p-1.5 text-white/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <h3 className="text-sm font-black text-white italic uppercase tracking-tight mb-2 group-hover:text-indigo-400 transition-colors truncate">
                  {sub.eventTitle}
                </h3>
                
                <div className="flex items-center gap-4 mb-6 text-[10px] font-mono text-white/30">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {sub.submittedAt ? format(sub.submittedAt.toDate(), 'MM.dd.yy') : '--'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3" />
                    {sub.editor}
                  </div>
                  {sub.assets && sub.assets.length > 0 && (
                    <div className="flex items-center gap-1.5 text-indigo-400/60">
                      <Paperclip className="w-3 h-3" />
                      {sub.assets.length} Nodes
                    </div>
                  )}
                </div>

                <div className="mb-6 line-clamp-1 text-[9px] text-white/20 uppercase font-mono bg-white/5 p-2 rounded border border-white/5">
                   {sub.instructions || "No custom protocol instructions"}
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => navigate(`/video-feedback/${sub.id}`)}
                     className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                   >
                     <Play className="w-3 h-3" />
                     Review Node
                   </button>
                   <button className="px-4 py-2.5 bg-black/40 hover:bg-black/60 text-white/60 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2">
                     <Download className="w-3 h-3" />
                     Local Arch
                   </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl bg-black/40">
             <Video className="w-12 h-12 text-white/5 mb-4" />
             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">Registry Entry Empty</p>
          </div>
        )}
      </main>
    </div>
  );
}
