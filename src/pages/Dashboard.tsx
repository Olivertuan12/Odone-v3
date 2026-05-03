import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Video, 
  Calendar, 
  TrendingUp, 
  Clock, 
  ChevronRight, 
  Plus, 
  Search,
  ExternalLink,
  Zap,
  FolderOpen,
  PieChart,
  HardDrive
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ 
    activeProjects: 0, 
    totalClients: 0, 
    pendingShoots: 0, 
    revenueThisMonth: 0 
  });
  const [driveStorage, setDriveStorage] = useState<{ used: number, total: number } | null>(null);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [upcomingShoots, setUpcomingShoots] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchDashboardData = async () => {
      try {
        // Fetch Drive Storage if token exists
        const driveToken = localStorage.getItem('google_drive_token') || localStorage.getItem('google_calendar_token');
        if (driveToken) {
          try {
            const driveResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota(usage,limit,usageInDrive,usageInDriveTrash)', {
              headers: { Authorization: `Bearer ${driveToken}` }
            });
            if (driveResp.ok) {
              const driveData = await driveResp.json();
              if (driveData.storageQuota) {
                // For pooled storage (EDU/Enterprise), 'limit' is often the domain pool.
                // 'usageInDrive' is the most accurate for "Drive storage".
                setDriveStorage({
                  used: Number(driveData.storageQuota.usageInDrive || driveData.storageQuota.usage || 0),
                  total: Number(driveData.storageQuota.limit || -1)
                });
              }
            }
          } catch (e) {
            console.error("Drive storage fetch failed", e);
          }
        }

        // Projects
        const projQ = query(
          collection(db, 'projects'), 
          where('ownerId', '==', user.uid),
          orderBy('updatedAt', 'desc'),
          limit(4)
        );
        const projSnap = await getDocs(projQ);
        const projs = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRecentProjects(projs);

        // Submissions
        const subQ = query(
          collection(db, 'submissions'),
          where('ownerId', '==', user.uid),
          orderBy('submittedAt', 'desc'),
          limit(3)
        );
        const subSnap = await getDocs(subQ);
        setRecentSubmissions(subSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Events
        const eventQ = query(
          collection(db, `users/${user.uid}/calendar_events`),
          orderBy('date', 'asc'),
          limit(5)
        );
        const eventSnap = await getDocs(eventQ);
        const events = eventSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUpcomingShoots(events);

        // Stats (simplified for now)
        setStats({
          activeProjects: projs.length,
          totalClients: 12, // Mock for now until we have a real query
          pendingShoots: events.length,
          revenueThisMonth: 8400
        });

      } catch (err) {
        console.error("Dashboard data fetch failed:", err instanceof Error ? err.message : String(err));
        // If it's a permission error, it might be due to missing rules or indexes
        if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
           console.warn("Security policy violation or missing relational index detected.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return 'Unlimited';
    if (bytes === 0) return '0.00 GB';
    const tb = bytes / (1000 ** 4);
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = bytes / (1000 ** 3);
    return `${gb.toFixed(2)} GB`;
  };

  const statCards = [
    { label: 'Active Projects', value: stats.activeProjects, icon: FolderOpen, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    { label: 'Video Output', value: '24', icon: Video, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Drive Usage', value: driveStorage ? `${formatStorage(driveStorage.used)} / ${formatStorage(driveStorage.total)}` : 'Scanning...', icon: HardDrive, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { label: 'Ledger Yield', value: `$${stats.revenueThisMonth.toLocaleString()}`, icon: TrendingUp, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] p-6 gap-6 overflow-hidden">
      {/* Search Header */}
      <div className="flex items-center justify-between gap-6 shrink-0">
        <div className="relative group max-w-xl flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-indigo-400 transition-colors" />
          <input 
            type="text" 
            placeholder="Search system logs, projects, entities..."
            className="w-full bg-[#121214] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-[11px] text-white focus:outline-none focus:border-indigo-500/30 transition-all shadow-xl"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
             <span className="text-[10px] font-black uppercase tracking-widest text-white/60">System Online</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-1">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`p-6 rounded-2xl bg-[#121214] border ${stat.border} shadow-xl relative overflow-hidden group`}
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <stat.icon className="w-12 h-12" />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{stat.label}</span>
              </div>
              <div className="text-xl font-black text-white italic tracking-tighter">
                {stat.value}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main Content: Recent Projects */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                  <h2 className="text-xs font-black uppercase tracking-widest text-white">Project Activity</h2>
                  <div className="w-8 h-[1px] bg-white/10" />
               </div>
               <Link to="/projects" className="text-[9px] font-black uppercase text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-2 group">
                  View Registry
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
               </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {recentProjects.length > 0 ? recentProjects.map((proj, i) => (
                 <Link 
                   key={proj.id}
                   to={`/projects/${proj.id}`}
                   className="bg-[#121214] border border-white/5 rounded-2xl p-5 hover:border-indigo-500/30 transition-all group overflow-hidden relative shadow-lg"
                 >
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/20 group-hover:bg-indigo-500 transition-all" />
                    <div className="flex justify-between items-start mb-4">
                       <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <FolderOpen className="w-5 h-5 text-indigo-400" />
                       </div>
                       <div className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">
                          {proj.updatedAt ? format(proj.updatedAt.toDate(), 'MM.dd.yy') : '00.00.00'}
                       </div>
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors mb-2">{proj.name}</h3>
                    <div className="flex items-center gap-4">
                       <div className="flex -space-x-2">
                          {[1, 2, 3].map(n => (
                            <div key={n} className="w-6 h-6 rounded-full bg-white/5 border border-black flex items-center justify-center text-[8px] font-bold text-white/40">
                               {String.fromCharCode(64 + n)}
                            </div>
                          ))}
                       </div>
                       <span className="text-[9px] font-black uppercase text-white/20 tracking-widest">Active Thread</span>
                    </div>
                 </Link>
               )) : (
                 <div className="col-span-2 py-20 text-center border border-dashed border-white/5 rounded-2xl bg-black/40">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">No Active Projects Discovered</p>
                 </div>
               )}
            </div>

            {/* Production Pipeline */}
            <div className="space-y-4 pt-6">
               <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                     <h2 className="text-xs font-black uppercase tracking-widest text-white">Production Pipeline</h2>
                     <div className="w-8 h-[1px] bg-white/10" />
                  </div>
                  <Link to="/video-library" className="text-[9px] font-black uppercase text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-2 group">
                     Asset Matrix
                     <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
               </div>

               <div className="grid grid-cols-1 gap-3">
                  {recentSubmissions.map((sub, i) => (
                    <Link 
                      key={sub.id} 
                      to={`/video-feedback/${sub.id}`}
                      className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
                    >
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                             <Video className="w-5 h-5 text-amber-500" />
                          </div>
                          <div>
                             <h4 className="text-[11px] font-black text-white uppercase tracking-tight group-hover:text-amber-400 transition-colors">{sub.eventTitle}</h4>
                             <div className="flex items-center gap-3 mt-1">
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                  sub.status === 'Completed' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-amber-400 border-amber-500/20 bg-amber-500/5'
                                }`}>
                                   {sub.status}
                                </span>
                                <span className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">Editor: {sub.editor}</span>
                             </div>
                          </div>
                       </div>
                       <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/40 transition-transform" />
                    </Link>
                  ))}
                  {recentSubmissions.length === 0 && (
                    <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl bg-black/20">
                       <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10 italic">Pipeline Empty</p>
                    </div>
                  )}
               </div>
            </div>
          </div>

          {/* Sidebar: Upcoming Shoots */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
               <h2 className="text-xs font-black uppercase tracking-widest text-white">Temporal Log</h2>
               <div className="w-8 h-[1px] bg-white/10" />
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-2xl p-1 overflow-hidden shadow-2xl">
               <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Clock className="w-3 h-3 text-indigo-400" />
                     <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Queue Status</span>
                  </div>
                  <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black rounded border border-emerald-500/20">Synced</div>
               </div>
               
               <div className="divide-y divide-white/5">
                  {upcomingShoots.map((event, i) => (
                    <div key={event.id} className="p-4 hover:bg-white/[0.02] transition-colors group cursor-pointer">
                       <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-mono text-indigo-400/60 uppercase group-hover:text-indigo-400 transition-colors">
                             {event.date ? format(new Date(event.date), 'MMM dd') : '-- --'}
                          </span>
                          <ExternalLink className="w-3 h-3 text-white/10 group-hover:text-white/40 transition-colors" />
                       </div>
                       <h4 className="text-[10px] font-black text-white/80 uppercase tracking-tight truncate group-hover:text-white transition-colors">
                          {event.location || event.title}
                       </h4>
                       <div className="flex items-center gap-2 mt-2">
                          <div className={`w-1 h-1 rounded-full ${i % 2 === 0 ? 'bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.5)]' : 'bg-fuchsia-400 shadow-[0_0_4px_rgba(232,121,249,0.5)]'}`} />
                          <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{event.clientName || 'Private Node'}</span>
                       </div>
                    </div>
                  ))}
                  {upcomingShoots.length === 0 && (
                    <div className="p-12 text-center text-[9px] font-black uppercase text-white/10 italic">
                       Queue Cleared
                    </div>
                  )}
               </div>
               
               <Link to="/calendar" className="block p-4 bg-black/40 text-center text-[9px] font-black uppercase text-white/40 hover:text-white transition-colors border-t border-white/5">
                  Access Full Calendar Node
               </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
