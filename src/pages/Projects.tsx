import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderPlus, Folder, ArrowRight } from 'lucide-react';

export const Projects = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    loadProjects();
  }, [user]);

  const loadProjects = async () => {
    try {
      const q = query(collection(db, 'projects'), where('ownerId', '==', user?.uid));
      const snap = await getDocs(q);
      const projData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(projData);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) return;
    
    try {
      const batch = writeBatch(db);
      const newRef = doc(collection(db, 'projects'));
      const now = serverTimestamp();
      
      batch.set(newRef, {
        name: newProjectName,
        ownerId: user.uid,
        createdAt: now,
        updatedAt: now
      });
      
      // Add user as owner member
      batch.set(doc(db, 'projects', newRef.id, 'members', user.uid), {
        role: 'owner',
        joinedAt: now
      });

      await batch.commit();

      setNewProjectName('');
      setIsCreating(false);
      loadProjects();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'projects');
    }
  };

  const filteredProjects = projects.filter(p => 
    (p.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="p-8">Loading projects...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto w-full h-full flex flex-col relative">
       <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 border-b border-white/5 pb-4 gap-4">
         <div className="flex items-center gap-4 flex-1">
            <h1 className="text-xl font-bold tracking-widest text-[#E0E0E0] uppercase text-[11px] whitespace-nowrap">Your Projects</h1>
            <div className="relative flex-1 max-w-sm">
               <input 
                 type="text"
                 placeholder="Search projects..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 px-4 text-[10px] text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
               />
            </div>
         </div>
         <button 
           onClick={() => setIsCreating(true)}
           className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-1.5 rounded-md transition-colors flex items-center gap-2 text-xs"
         >
            <FolderPlus className="w-4 h-4" />
            New Project
         </button>
       </div>

       {isCreating && (
         <motion.form 
           initial={{ opacity: 0, height: 0 }}
           animate={{ opacity: 1, height: 'auto' }}
           onSubmit={handleCreate} 
           className="mb-8 p-4 bg-[#121214] border border-white/10 rounded overflow-hidden flex items-center gap-4"
         >
           <input 
             autoFocus
             type="text" 
             placeholder="Project Name" 
             className="flex-1 bg-black border border-white/10 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs text-white"
             value={newProjectName}
             onChange={e => setNewProjectName(e.target.value)}
           />
           <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-md">
             Create
           </button>
           <button type="button" onClick={() => setIsCreating(false)} className="text-white/40 hover:text-white text-xs font-medium px-4 py-2">
             Cancel
           </button>
         </motion.form>
       )}

       {filteredProjects.length === 0 && !isCreating ? (
         <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 rounded p-12 text-center bg-[#121214]">
            <div className="w-12 h-12 bg-black rounded flex items-center justify-center mb-4 border border-white/5">
              <Folder className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-white tracking-widest uppercase">No projects found</h3>
            <p className="text-[10px] text-white/40 mt-1 uppercase font-mono max-w-xs">{searchQuery ? 'Try adjusting your search query.' : 'Create your first project to start managing documents and videos.'}</p>
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {filteredProjects.map(proj => (
             <Link 
               key={proj.id} 
               to={`/projects/${proj.id}`}
               className="group block bg-[#121214] border border-white/5 rounded p-4 hover:border-white/20 transition-all"
             >
               <div className="flex items-start justify-between mb-3">
                 <div className="w-10 h-7 bg-black rounded relative overflow-hidden flex items-center justify-center border border-white/5">
                   <div className="absolute inset-0 bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors"></div>
                   <Folder className="w-4 h-4 text-indigo-400" />
                 </div>
                 <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all" />
               </div>
               <h3 className="font-bold text-xs text-white group-hover:text-indigo-400 transition-colors truncate">{proj.name}</h3>
               <p className="text-[10px] text-white/40 mt-1 uppercase font-mono tracking-tighter">
                 Created {proj.createdAt?.toDate ? proj.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
               </p>
             </Link>
           ))}
         </div>
       )}
    </div>
  );
};
