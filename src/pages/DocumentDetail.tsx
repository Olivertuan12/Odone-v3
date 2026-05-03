import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export const DocumentDetail = () => {
  const { projectId, documentId } = useParams<{ projectId: string, documentId: string }>();
  const [docData, setDocData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (projectId && documentId) {
      loadDoc();
    }
  }, [projectId, documentId]);

  const loadDoc = async () => {
    try {
      const snap = await getDoc(doc(db, `projects/${projectId}/documents/${documentId}`));
      if (snap.exists()) {
         const data = snap.data();
         setDocData(data);
         setTitle(data.title);
         setContent(data.content);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `projects/${projectId}/documents/${documentId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
     if (!projectId || !documentId) return;
     setSaving(true);
     try {
       await updateDoc(doc(db, `projects/${projectId}/documents/${documentId}`), {
          title,
          content,
          updatedAt: serverTimestamp()
       });
       setTimeout(() => setSaving(false), 1000);
     } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `projects/${projectId}/documents/${documentId}`);
        setSaving(false);
     }
  };

  // Adjust textarea height
  useEffect(() => {
     if (contentRef.current) {
        contentRef.current.style.height = 'auto';
        contentRef.current.style.height = contentRef.current.scrollHeight + 'px';
     }
  }, [content]);

  if (loading) return <div className="p-8">Loading document...</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#E0E0E0] relative">
       {/* Minimal Immersive Header */}
       <header className="sticky top-0 z-10 h-14 bg-[#121214] border-b border-white/10 flex items-center justify-between px-6">
          <Link 
            to={`/projects/${projectId}`} 
            className="flex items-center gap-2 text-[10px] uppercase font-bold text-white/40 hover:text-white transition-colors"
          >
             <ArrowLeft className="w-4 h-4" />
             Back to Workspace
          </Link>

          <div className="flex items-center gap-3 text-[10px] font-mono">
             <span className="text-white/30 uppercase">
               {saving ? 'Syncing...' : 'Saved'}
             </span>
             <button 
               onClick={handleSave}
               className="p-1.5 bg-white/5 border border-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded transition-colors"
               title="Force Save"
             >
                {saving ? <Check className="w-3 h-3 text-indigo-400" /> : <Save className="w-3 h-3" />}
             </button>
          </div>
       </header>

       {/* Editor Body */}
       <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full px-8 py-16">
             <input
               type="text"
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               onBlur={handleSave}
               placeholder="Untitled"
               className="w-full text-4xl font-bold tracking-tight text-white border-none outline-none bg-transparent mb-8 placeholder:text-white/20 font-sans"
             />

             <textarea
               ref={contentRef}
               value={content}
               onChange={(e) => setContent(e.target.value)}
               onBlur={handleSave}
               placeholder="Start typing..."
               className="w-full text-sm leading-relaxed text-white/70 border-none outline-none bg-transparent resize-none min-h-[50vh] placeholder:text-white/20 font-sans"
             />
          </div>
       </div>
    </div>
  );
};
