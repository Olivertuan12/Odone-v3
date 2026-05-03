import React from 'react';
import { Target, CheckCircle2, Clock, Map, LayoutList, Layers } from 'lucide-react';

export const FeaturePlanning = () => {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-y-auto w-full">
       <div className="p-8 max-w-7xl mx-auto w-full flex flex-col min-h-full">
         <div className="mb-10 border-b border-white/5 pb-4">
           <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
             <Map className="w-6 h-6 text-indigo-400" />
             Strategic Roadmap
           </h1>
           <p className="text-sm text-white/40 mt-1 uppercase tracking-widest font-mono">Product Development Plan</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           
           {/* Stage 1 */}
           <div className="bg-[#121214] border border-white/5 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mx-10 -my-10"></div>
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                 <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                   <CheckCircle2 className="w-4 h-4 text-green-400" />
                   Stage 1
                 </h2>
                 <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-green-400/20">Active</span>
              </div>

              <div className="space-y-4">
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">Core Architecture</h3>
                    <p className="text-xs text-white/40">Firebase Auth, Firestore rules, user roles, project structure, basic layouts.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">Video Asset Management</h3>
                    <p className="text-xs text-white/40">G-Drive/Dropbox integration, frame-accurate playback, multi-versioning support.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">Feedback Kanban</h3>
                    <p className="text-xs text-white/40">Approval workflows, HTML5 drag and drop statuses, exporting feedback CSV/TXT.</p>
                 </div>
              </div>
           </div>

           {/* Stage 2 */}
           <div className="bg-[#121214] border border-white/5 rounded-xl p-5 shadow-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                 <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                   <Clock className="w-4 h-4 text-orange-400" />
                   Stage 2
                 </h2>
                 <span className="text-[10px] text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-orange-400/20">Up Next</span>
              </div>

              <div className="space-y-4">
                 <div className="bg-[#050505] p-3 rounded border border-white/5 border-l-2 border-l-orange-500/50">
                    <h3 className="text-white text-sm font-bold mb-1">Time-Stamped Spatial Annotations</h3>
                    <p className="text-xs text-white/40">Allow users to draw shapes over the video at specific timestamps.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5 border-l-2 border-l-orange-500/50">
                    <h3 className="text-white text-sm font-bold mb-1">Notification System</h3>
                    <p className="text-xs text-white/40">Email triggers when a video requires review or an approval is received.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5 border-l-2 border-l-orange-500/50">
                    <h3 className="text-white text-sm font-bold mb-1">Document Collaboration</h3>
                    <p className="text-xs text-white/40">Real-time collaborative text editing for scripts and storyboards.</p>
                 </div>
              </div>
           </div>

           {/* Stage 3 */}
           <div className="bg-[#121214] border border-transparent rounded-xl p-5 shadow-2xl relative overflow-hidden opacity-60">
              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                 <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                   <Target className="w-4 h-4 text-white/40" />
                   Stage 3
                 </h2>
                 <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-white/10">Future</span>
              </div>

              <div className="space-y-4">
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">Asset Delivery Portal</h3>
                    <p className="text-xs text-white/40">Branded password-protected external links for final client delivery.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">AI Transcript & Summary</h3>
                    <p className="text-xs text-white/40">Automate feedback summaries and transcript generation via LLM API.</p>
                 </div>
                 <div className="bg-[#050505] p-3 rounded border border-white/5">
                    <h3 className="text-white text-sm font-bold mb-1">Analytics Dashboard</h3>
                    <p className="text-xs text-white/40">Project velocity tracking, version count metrics, and editor performance.</p>
                 </div>
              </div>
           </div>

         </div>
       </div>
    </div>
  );
};
