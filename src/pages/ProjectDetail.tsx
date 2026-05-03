import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, setDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useParams, Link } from 'react-router-dom';
import { Book, Video, Plus, FileText, Film, MoreVertical, LayoutGrid, CheckSquare, Activity } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const VIDEO_STATUSES = ['New Arrival', 'Editing', 'Need Revision', 'Need Improve', 'Approved', 'Delivered'];

const VIEWS: Record<string, string[]> = {
  'All': VIDEO_STATUSES,
  'Editor': ['New Arrival', 'Editing', 'Need Improve', 'Approved'],
  'QC': ['Need Revision', 'Approved'],
  'Deliver': ['Approved', 'Delivered']
};

const STATUS_COLORS: Record<string, string> = {
  'New Arrival': 'text-blue-400',
  'Editing': 'text-purple-400',
  'Need Revision': 'text-orange-400',
  'Need Improve': 'text-red-400',
  'Approved': 'text-emerald-400',
  'Delivered': 'text-teal-400'
};

const STATUS_HEX: Record<string, string> = {
  'New Arrival': '#60a5fa', // blue-400
  'Editing': '#c084fc', // purple-400
  'Need Revision': '#fb923c', // orange-400
  'Need Improve': '#f87171', // red-400
  'Approved': '#34d399', // emerald-400
  'Delivered': '#2dd4bf' // teal-400
};

export const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [documents, setDocuments] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<string>('All');

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      const docsQ = query(collection(db, `projects/${projectId}/documents`));
      const vidsQ = query(collection(db, `projects/${projectId}/videos`));
      
      const [docsSnap, vidsSnap] = await Promise.all([
        getDocs(docsQ),
        getDocs(vidsQ)
      ]);
      
      setDocuments(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVideos(vidsSnap.docs.map(d => ({ id: d.id, status: d.data().status || 'New Arrival', ...d.data() })));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `projects/${projectId}/documents`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    try {
      const id = uuidv4();
      const now = serverTimestamp();
      await setDoc(doc(db, `projects/${projectId}/documents`, id), {
        title: 'Untitled Document',
        content: '',
        parentId: '',
        createdAt: now,
        updatedAt: now
      });
      loadData();
    } catch (e) {
       handleFirestoreError(e, OperationType.CREATE, `projects/${projectId}/documents`);
    }
  };

  const handleCreateVideo = async () => {
    try {
      const id = uuidv4();
      const now = serverTimestamp();
      await setDoc(doc(db, `projects/${projectId}/videos`, id), {
        name: 'New Video Asset',
        description: '',
        currentVersionId: '',
        status: 'New Arrival',
        createdAt: now,
        updatedAt: now
      });
      loadData();
    } catch (e) {
       handleFirestoreError(e, OperationType.CREATE, `projects/${projectId}/videos`);
    }
  };

  const updateVideoStatus = async (videoId: string, newStatus: string) => {
    try {
      // Optimistic update
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, status: newStatus } : v));
      
      await updateDoc(doc(db, `projects/${projectId}/videos/${videoId}`), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `projects/${projectId}/videos`);
      loadData(); // Revert on failure
    }
  };

  const onDragStart = (e: React.DragEvent, videoId: string) => {
    e.dataTransfer.setData('videoId', videoId);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const videoId = e.dataTransfer.getData('videoId');
    if (videoId) {
      updateVideoStatus(videoId, targetStatus);
    }
  };

  const chartData = VIDEO_STATUSES.map(status => ({
    name: status,
    count: videos.filter(v => (v.status || 'New Arrival') === status).length
  }));

  if (loading) return <div className="p-8">Loading workspace...</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-y-auto">
       <div className="p-6 w-full max-w-[1600px] mx-auto min-h-full flex flex-col">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-6 border-b border-white/5 gap-4">
            <div className="flex flex-col gap-1">
               <h1 className="text-xl font-bold uppercase tracking-[0.2em] text-white">Project Interface</h1>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">Unified media management and narrative control</p>
               </div>
            </div>
            <div className="flex items-center gap-3 bg-[#121214] p-2 rounded-lg border border-white/5">
               <div className="flex flex-col items-end px-3 border-r border-white/5">
                  <span className="text-[9px] uppercase font-bold text-white/20 tracking-widest">Assets</span>
                  <span className="text-xs font-mono text-white">{videos.length + documents.length}</span>
               </div>
               <div className="flex flex-col items-end px-3">
                  <span className="text-[9px] uppercase font-bold text-white/20 tracking-widest">Status</span>
                  <span className="text-xs font-mono text-indigo-400">Active Pipeline</span>
               </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 flex-1 min-h-0">
            
            {/* Top Row: Docs & Todo & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-64">
              {/* Documents */}
              <div className="bg-[#121214] rounded p-4 border border-white/5 flex flex-col overflow-hidden">
                 <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/30 font-bold">
                       <FileText className="w-3 h-3" />
                       Documents
                    </div>
                    <button 
                      onClick={handleCreateDocument}
                      className="p-1 px-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded text-[10px] uppercase font-bold transition-colors border border-white/5"
                    >
                      + New Doc
                    </button>
                 </div>

                 {documents.length === 0 ? (
                   <div className="flex-1 flex items-center justify-center border border-dashed border-white/5 bg-black/50 rounded">
                      <p className="text-[10px] text-white/30 uppercase font-mono tracking-tighter">No docs yet.</p>
                   </div>
                 ) : (
                   <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1 pr-1">
                     {documents.map(d => (
                       <Link 
                         key={d.id} 
                         to={`/projects/${projectId}/documents/${d.id}`}
                         className="group flex items-center gap-2 p-2 hover:bg-white/5 rounded transition-colors border border-transparent hover:border-white/5 bg-[#1A1A1C]"
                       >
                          <span className="text-indigo-400 text-xs">📄</span>
                          <span className="text-xs text-white/70 group-hover:text-white truncate">
                            {d.title || 'Untitled'}
                          </span>
                       </Link>
                     ))}
                   </div>
                 )}
              </div>

              {/* Todo */}
              <div className="bg-[#121214] rounded p-4 border border-white/5 flex flex-col overflow-hidden">
                 <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/30 font-bold">
                       <CheckSquare className="w-3 h-3" />
                       To-Do
                    </div>
                    <button 
                      className="p-1 px-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded text-[10px] uppercase font-bold transition-colors border border-white/5 disabled:opacity-50"
                      disabled
                    >
                      + New Task
                    </button>
                 </div>

                 <div className="flex-1 flex items-center justify-center border border-dashed border-white/5 bg-black/50 rounded">
                    <p className="text-[10px] text-white/30 uppercase font-mono tracking-tighter">Tasks coming soon</p>
                 </div>
              </div>

              {/* Stats/Charts */}
              <div className="bg-[#121214] rounded p-4 border border-white/5 flex flex-col overflow-hidden">
                 <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/30 font-bold">
                       <Activity className="w-3 h-3" />
                       Statistics
                    </div>
                 </div>
                 
                 <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
                        <XAxis 
                          dataKey="name" 
                          tick={{ fill: '#ffffff40', fontSize: 9 }} 
                          tickLine={false}
                          axisLine={false}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis 
                          tick={{ fill: '#ffffff40', fontSize: 9 }} 
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip 
                          cursor={{ fill: '#ffffff05' }}
                          contentStyle={{ backgroundColor: '#1A1A1C', border: '1px solid #ffffff10', borderRadius: '4px', fontSize: '11px', color: '#fff' }}
                          itemStyle={{ color: '#818cf8' }}
                        />
                        <Bar 
                          dataKey="count" 
                          radius={[2, 2, 0, 0]} 
                          maxBarSize={40}
                        >
                          {chartData.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={STATUS_HEX[entry.name] || '#4f46e5'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            </div>

            {/* Videos Kanban Base */}
            <div className="flex-1 w-full bg-[#121214] rounded p-4 border border-white/5 flex flex-col min-h-[500px] overflow-hidden">
               <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-4">
                     <div className="text-[11px] uppercase tracking-widest text-white/30 font-bold">Video Kanban Board</div>
                     <div className="flex bg-black/40 rounded border border-white/5 p-0.5">
                        {Object.keys(VIEWS).map(view => (
                           <button
                             key={view}
                             onClick={() => setViewMode(view)}
                             className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-colors ${viewMode === view ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/80'}`}
                           >
                             {view}
                           </button>
                        ))}
                     </div>
                  </div>
                  <button 
                    onClick={handleCreateVideo}
                    className="p-1 px-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded text-[10px] uppercase font-bold transition-colors border border-white/5"
                  >
                    + New Video
                  </button>
               </div>

               <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
                  {VIEWS[viewMode].map(status => (
                     <div 
                       key={status} 
                       className="flex-shrink-0 w-64 bg-black/40 rounded-lg p-3 border border-white/5 flex flex-col min-h-0"
                       onDragOver={onDragOver}
                       onDrop={(e) => onDrop(e, status)}
                     >
                        <div className={`text-[10px] uppercase tracking-widest font-bold mb-3 px-1 flex justify-between items-center ${STATUS_COLORS[status] || 'text-white/40'}`}>
                           <span>{status}</span>
                           <span className="bg-white/5 px-1.5 py-0.5 rounded text-white/60">
                             {videos.filter(v => (v.status || 'New Arrival') === status).length}
                           </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                           {videos.filter(v => (v.status || 'New Arrival') === status).map(v => (
                             <div 
                               key={v.id} 
                               draggable
                               onDragStart={(e) => onDragStart(e, v.id)}
                               className="bg-[#1A1A1C] p-3 rounded border border-white/10 hover:border-white/20 transition-all cursor-grab active:cursor-grabbing group relative"
                             >
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-auto">
                                  <Link to={`/projects/${projectId}/videos/${v.id}`} className="text-[9px] uppercase font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded cursor-pointer" onMouseDown={(e) => e.stopPropagation()}>
                                    Open
                                  </Link>
                                </div>
                                <h4 className="text-xs font-bold text-white mb-1 pr-10 truncate">{v.name || 'Untitled'}</h4>
                                {v.eventDate && (
                                   <div className="text-[9px] text-white/50 mb-1 font-mono uppercase bg-white/5 px-1 inline-block rounded">
                                      Due: {new Date(v.eventDate).toLocaleDateString()}
                                   </div>
                                )}
                                <p className="text-[10px] text-white/40 font-mono line-clamp-2 leading-relaxed">
                                  {v.description || 'No description provided.'}
                                </p>
                             </div>
                           ))}
                           
                           {videos.filter(v => (v.status || 'New Arrival') === status).length === 0 && (
                             <div className="border border-dashed border-white/5 rounded py-4 text-center">
                                <p className="text-[9px] uppercase tracking-widest font-mono text-white/20">Drop here</p>
                             </div>
                           )}
                        </div>
                     </div>
                  ))}
               </div>
            </div>

          </div>
       </div>
    </div>
  );
};

