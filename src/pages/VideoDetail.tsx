import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, query, orderBy, onSnapshot, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useParams, Link } from 'react-router-dom';
import { Download, ArrowLeft, Play, Pause, MessageSquarePlus, Send, History } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { v4 as uuidv4 } from 'uuid';

export const VideoDetail = () => {
  const { projectId, videoId } = useParams<{ projectId: string, videoId: string }>();
  const { user } = useAuth();
  
  const [videoData, setVideoData] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [currentVersion, setCurrentVersion] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (projectId && videoId) {
      loadVideo();
      const unsubVersions = listenVersions();
      return () => {
         unsubVersions && unsubVersions();
      }
    }
  }, [projectId, videoId]);

  // When versions load, select initial current version if not set
  useEffect(() => {
     if (versions.length > 0 && videoData && !currentVersion) {
        const v = versions.find(v => v.id === videoData.currentVersionId) || versions[versions.length - 1];
        setCurrentVersion(v);
     }
  }, [versions, videoData, currentVersion]);

  // When a version is selected, load its comments
  useEffect(() => {
     if (currentVersion && projectId && videoId) {
       setVideoError(false);
       const q = query(
         collection(db, `projects/${projectId}/videos/${videoId}/comments`),
       );
       const unsub = onSnapshot(q, (snap) => {
          let list = snap.docs.map(d => ({id: d.id, ...d.data()} as any));
          // Filter in client for versionId and sort manually to preserve queries
          list = list.filter(c => c.versionId === currentVersion.id);
          list.sort((a: any, b: any) => a.videoTimeMs - b.videoTimeMs);
          setComments(list);
       }, (err) => {
         handleFirestoreError(err, OperationType.GET, `projects/${projectId}/videos/${videoId}/comments`);
       });
       return () => unsub();
     }
  }, [currentVersion, projectId, videoId]);

  const loadVideo = async () => {
    try {
      const snap = await getDoc(doc(db, `projects/${projectId}/videos/${videoId}`));
      if (snap.exists()) {
        setVideoData(snap.data());
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `projects/${projectId}/videos/${videoId}`);
    } finally {
      setLoading(false);
    }
  };

  const listenVersions = () => {
    const q = query(collection(db, `projects/${projectId}/videos/${videoId}/versions`));
    return onSnapshot(q, (snap) => {
       const list = snap.docs.map(d => ({id: d.id, ...d.data()}));
       list.sort((a: any, b: any) => a.versionNumber - b.versionNumber);
       setVersions(list);
    }, (err) => {
       handleFirestoreError(err, OperationType.GET, `projects/${projectId}/videos/${videoId}/versions`);
    });
  };

  const [isAddingVersion, setIsAddingVersion] = useState(false);
  const [newVersionUrl, setNewVersionUrl] = useState('');

  const [videoError, setVideoError] = useState(false);

  const processVideoUrl = (url: string) => {
    if (!url) return url;
    
    // Dropbox parsing
    if (url.includes('dropbox.com')) {
      let newUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      newUrl = newUrl.replace('?dl=0', '');
      newUrl = newUrl.replace('&dl=0', '');
      return newUrl;
    }
    
    // Google Drive parsing
    const driveOpenMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveOpenMatch) {
      // Adding confirm=t to help bypass virus scan warnings on some files
      return `https://drive.google.com/uc?export=download&confirm=t&id=${driveOpenMatch[1]}`;
    }
    const driveFileMatch = url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch) {
      return `https://drive.google.com/uc?export=download&confirm=t&id=${driveFileMatch[1]}`;
    }
    
    return url;
  };

  const submitNewVersion = async () => {
     setVideoError(false);
     const processedUrl = processVideoUrl(newVersionUrl);
     if (!processedUrl) {
       setIsAddingVersion(false);
       return;
     }

     try {
       const newVerId = uuidv4();
       const verNum = versions.length + 1;
       const now = serverTimestamp();
       await setDoc(doc(db, `projects/${projectId}/videos/${videoId}/versions`, newVerId), {
         videoUrl: processedUrl,
         versionNumber: verNum,
         createdAt: now
       });
       await updateDoc(doc(db, `projects/${projectId}/videos/${videoId}`), {
          currentVersionId: newVerId,
          updatedAt: now
       });
       const newVer = {
         id: newVerId,
         videoUrl: processedUrl,
         versionNumber: verNum,
         createdAt: now
       };
       setCurrentVersion(newVer);
       setIsAddingVersion(false);
       setNewVersionUrl('');
     } catch(e) {
        handleFirestoreError(e, OperationType.CREATE, `projects/${projectId}/videos/${videoId}/versions`);
     }
  };

  const handleAddComment = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!newComment.trim() || !user || !currentVersion) return;
    
    try {
      const timeMs = Math.floor(currentTime * 1000); // 1000ms per sec
      const id = uuidv4();
      await setDoc(doc(db, `projects/${projectId}/videos/${videoId}/comments`, id), {
         versionId: currentVersion.id,
         text: newComment,
         authorId: user.uid,
         authorName: user.displayName || 'Unknown',
         videoTimeMs: timeMs,
         createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `projects/${projectId}/videos/${videoId}/comments`);
    }
  };

  const formatTime = (ms: number) => {
     const totalSec = Math.floor(ms / 1000);
     const m = Math.floor(totalSec / 60);
     const s = totalSec % 60;
     return `${m}:${s < 10 ? '0': ''}${s}`;
  };

  const seekTo = (ms: number) => {
     if (videoRef.current) {
        videoRef.current.currentTime = ms / 1000;
        videoRef.current.play();
     }
  };

  const toggleResolve = async (comment: any) => {
    try {
      await updateDoc(doc(db, `projects/${projectId}/videos/${videoId}/comments`, comment.id), {
        resolved: !comment.resolved
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `projects/${projectId}/videos/${videoId}/comments`);
    }
  };

  const downloadFeedback = () => {
    if (!comments.length) return;
    
    const lines = comments.map(c => `[${formatTime(c.videoTimeMs)}] ${c.authorName}: ${c.text}`);
    const text = `Feedback for: ${videoData?.name || 'Video'} (Version ${currentVersion?.versionNumber || 1})\n\n${lines.join('\n')}`;
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Feedback_${videoData?.name || 'Video'}_V${currentVersion?.versionNumber || 1}.txt`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpdateTitle = async () => {
    if(!editTitleValue.trim() || editTitleValue.trim() === videoData?.name) {
       setIsEditingTitle(false);
       return;
    }
    try {
        await updateDoc(doc(db, `projects/${projectId}/videos/${videoId}`), {
            name: editTitleValue.trim(),
            updatedAt: serverTimestamp()
        });
        setVideoData((prev: any) => ({...prev, name: editTitleValue.trim()}));
        setIsEditingTitle(false);
    } catch(e) {
        handleFirestoreError(e, OperationType.UPDATE, `projects/${projectId}/videos`);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    try {
        await updateDoc(doc(db, `projects/${projectId}/videos/${videoId}`), {
            status,
            updatedAt: serverTimestamp()
        });
        setVideoData((prev: any) => ({...prev, status}));
    } catch(e) {
        handleFirestoreError(e, OperationType.UPDATE, `projects/${projectId}/videos`);
    }
  };

  const downloadVideo = () => {
    if (!currentVersion?.videoUrl) return;
    const a = document.createElement('a');
    a.href = currentVersion.videoUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = `Video_V${currentVersion?.versionNumber || 1}_${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) return <div className="p-8">Loading video workspace...</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#E0E0E0]">
        <header className="h-14 flex-shrink-0 bg-[#121214] border-b border-white/10 flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-4">
            <Link 
              to={`/projects/${projectId}`} 
              className="text-white/40 hover:text-white transition-colors"
            >
               <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2 text-sm font-medium">
               <span className="text-white/40 font-normal truncate max-w-[100px] md:max-w-[200px]">Workspace</span>
               <span className="text-white/20">/</span>
               {isEditingTitle ? (
                 <div className="flex items-center gap-2">
                   <input
                     autoFocus
                     className="bg-black border border-white/20 text-white rounded px-2 py-0.5 text-sm outline-none focus:border-indigo-500 w-32 md:w-48"
                     value={editTitleValue}
                     onChange={e => setEditTitleValue(e.target.value)}
                     onKeyDown={e => {
                       if(e.key === 'Enter') handleUpdateTitle();
                       if(e.key === 'Escape') setIsEditingTitle(false);
                     }}
                   />
                   <button onClick={handleUpdateTitle} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors font-bold">Save</button>
                 </div>
               ) : (
                 <span 
                   className="text-white truncate max-w-[200px] cursor-pointer hover:underline"
                   onClick={() => {
                     setEditTitleValue(videoData?.name || 'Untitled Video');
                     setIsEditingTitle(true);
                   }}
                 >
                   {videoData?.name || 'Untitled Video'}
                 </span>
               )}
            </div>
          </div>
          
          {currentVersion && !isAddingVersion && (
            <div className="flex items-center gap-3 space-x-2">
              <div className="flex items-center gap-2 mr-4 border-r border-white/10 pr-4">
                <button 
                  onClick={() => handleUpdateStatus('Approved')}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${videoData?.status === 'Approved' ? 'bg-emerald-500 text-black' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}
                >
                  Approve
                </button>
                <button 
                  onClick={() => handleUpdateStatus('Need Revision')}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${videoData?.status === 'Need Revision' ? 'bg-amber-500 text-black' : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'}`}
                >
                  Send to Editor
                </button>
              </div>
              <button 
                onClick={downloadVideo}
                className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs rounded-md transition-colors flex items-center gap-2"
              >
                 <Download className="w-3 h-3" />
                 Download
              </button>
              <button 
                onClick={() => setIsAddingVersion(true)}
                className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs rounded-md transition-colors flex items-center gap-2"
              >
                 <History className="w-3 h-3" />
                 Add Version
              </button>
            </div>
          )}
        </header>

       <div className="flex-1 flex min-h-0">
          
          {/* Main Video Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative p-6">
             {(!currentVersion || isAddingVersion) ? (
               <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 bg-[#121214] rounded-lg p-8">
                  <div className="w-full max-w-lg bg-[#1A1A1C] p-6 rounded-xl border border-white/10 shadow-2xl flex flex-col items-center">
                     <h3 className="text-white font-bold text-lg mb-2">Import Video</h3>
                     <p className="text-white/40 text-xs text-center mb-6 max-w-sm">
                       Paste a link from Google Drive or Dropbox. We'll automatically process it for frame-accurate playback.
                     </p>
                     
                     <div className="w-full flex gap-2">
                        <input
                           type="text"
                           value={newVersionUrl}
                           onChange={(e) => setNewVersionUrl(e.target.value)}
                           placeholder="https://drive.google.com/..."
                           className="flex-1 bg-black border border-white/10 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                           autoFocus
                        />
                        <button 
                          onClick={submitNewVersion}
                          disabled={!newVersionUrl.trim()}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-md text-sm font-bold transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600 whitespace-nowrap"
                        >
                          {currentVersion ? 'Add Version' : 'Import Video'}
                        </button>
                     </div>
                     
                     {currentVersion && (
                        <button 
                           onClick={() => setIsAddingVersion(false)}
                           className="mt-4 text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                        >
                           Cancel
                        </button>
                     )}
                     
                     <div className="w-full flex items-center gap-4 mt-8 pt-6 border-t border-white/5 opacity-50">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                              <span className="text-black text-[10px] font-bold tracking-tighter">Drive</span>
                           </div>
                           <span className="text-[10px] uppercase font-mono tracking-widest text-white">Supported</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-[#0061FF] rounded-full flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold tracking-tighter">GB</span>
                           </div>
                           <span className="text-[10px] uppercase font-mono tracking-widest text-white">Supported</span>
                        </div>
                     </div>
                  </div>
               </div>
             ) : (
               <div className="flex-1 min-h-0 relative rounded-lg bg-[#000] border border-white/5 overflow-hidden flex flex-col group">
                  <div className="flex-1 min-h-0 w-full relative flex items-center justify-center">
                    {videoError && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                          <span className="text-red-400 font-bold">!</span>
                        </div>
                        <p className="text-white text-sm font-bold mb-2">Video could not be loaded</p>
                        <p className="text-white/50 text-xs max-w-sm mb-6">
                          Google Drive might be blocking access due to file size limits or permissions. Please ensure the link is publicly accessible ("Anyone with the link"). Alternatively, consider using Dropbox which has better playback compatibility.
                        </p>
                        <button 
                          onClick={() => setVideoError(false)}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    <video 
                       ref={videoRef}
                       src={currentVersion.videoUrl} 
                       className="w-full h-full max-h-full max-w-full object-contain"
                       controls
                       playsInline
                       onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                       onError={() => setVideoError(true)}
                    />
                  </div>
                  
                  <div className="absolute top-4 left-4 flex gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-bold text-white tracking-widest">
                      VERSION {String(currentVersion.versionNumber).padStart(2, '0')}
                    </div>
                  </div>
                  
                  <div className="absolute bottom-16 left-0 right-0 p-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex justify-start items-center">
                    <div className="text-[10px] font-mono tracking-tighter text-white/60 bg-black/60 px-3 py-1.5 rounded w-fit backdrop-blur-md border border-white/10">
                      <div>CURRENT: <span className="text-white">{formatTime(Math.floor(currentTime * 1000))}</span></div>
                    </div>
                  </div>
               </div>
             )}
          </div>

          {/* Right Sidebar - Comments */}
          <div className="w-80 bg-[#121214] border-l border-white/10 flex flex-col">
             <div className="p-4 border-b border-white/5 flex flex-col gap-3 bg-[#1A1A1C]">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#E0E0E0]">Feedback ({comments.length})</h2>
                  {currentVersion && (
                     <div className="relative flex items-center shrink-0">
                       <select 
                          value={currentVersion.id}
                          onChange={(e) => {
                             const v = versions.find(ver => ver.id === e.target.value);
                             if (v) setCurrentVersion(v);
                          }}
                          className="bg-black text-indigo-400 border border-indigo-500/30 rounded text-xs font-bold pl-2 pr-6 py-1 outline-none focus:border-indigo-500/80 cursor-pointer appearance-none hover:bg-white/5 transition-colors"
                       >
                          {versions.map(v => (
                             <option key={v.id} value={v.id}>
                                V{v.versionNumber} {v.id === videoData.currentVersionId ? '(Latest)' : ''}
                             </option>
                          ))}
                       </select>
                       <div className="absolute right-1.5 pointer-events-none text-indigo-400">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                       </div>
                     </div>
                   )}
                </div>
                
                <div className="flex items-center gap-2 justify-between">
                   <div className="text-[10px] text-white/50 bg-white/5 px-2 py-1 rounded truncate flex-1">
                      Editor: Nguyen Van A
                   </div>
                   <div className="flex items-center gap-1 shrink-0">
                     <button 
                       onClick={downloadFeedback}
                       disabled={comments.length === 0}
                       className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] text-white/60 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                     >
                       <Download className="w-3 h-3" />
                       Export
                     </button>
                   </div>
                </div>
             </div>
             
             <div className="flex-1 overflow-hidden p-4 space-y-4 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-[10px] text-white/30 uppercase font-mono text-center tracking-widest mt-10">No feedback</p>
                ) : (
                  comments.map((c, idx) => (
                    <React.Fragment key={c.id}>
                      <div className={`space-y-2 group ${c.resolved ? 'opacity-40' : ''}`}>
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             <div className={`w-5 h-5 rounded-full ${c.resolved ? 'bg-indigo-900 border-indigo-700/50 text-white/50' : 'bg-indigo-600 border-[#121214] text-white'} border-2 text-[8px] flex items-center justify-center font-bold`}>
                               {c.authorName[0]?.toUpperCase()}
                             </div>
                             <span className={`text-xs font-bold ${c.resolved ? 'text-white/40 line-through' : 'text-white'}`}>{c.authorName}</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <button
                               onClick={() => toggleResolve(c)}
                               className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded transition-colors ${
                                 c.resolved 
                                 ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' 
                                 : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                               }`}
                             >
                               {c.resolved ? 'Done' : 'Check'}
                             </button>
                             <button onClick={() => seekTo(c.videoTimeMs)} className={`text-[10px] font-mono bg-white/5 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer ${c.resolved ? 'text-white/40 group-hover:text-white/60' : 'text-white/60 hover:text-white'}`}>
                               {formatTime(c.videoTimeMs)}
                             </button>
                           </div>
                         </div>
                         <p className={`text-xs pl-7 leading-relaxed ${c.resolved ? 'text-white/30 line-through' : 'text-white/70'}`}>
                           {c.text}
                         </p>
                      </div>
                      {idx < comments.length - 1 && <div className="h-px bg-white/5 w-full"></div>}
                    </React.Fragment>
                  ))
                )}
             </div>

             {/* Comment Input */}
             {currentVersion && (
               <div className="p-4 bg-[#1A1A1C] border-t border-white/10 mt-auto">
                  <form onSubmit={handleAddComment} className="relative flex flex-col gap-2">
                     <div className="flex items-center justify-between text-[10px] text-white/40 mb-1 font-mono uppercase tracking-widest">
                        <span>Add Comment</span>
                        <span className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                           @{formatTime(Math.floor(currentTime * 1000))}
                        </span>
                     </div>
                     <div className="relative">
                        <textarea 
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              handleAddComment(e);
                            }
                          }}
                          placeholder="Write a comment... (Cmd/Ctrl + Enter to send)"
                          className="w-full bg-black border border-white/10 rounded-md p-3 text-xs focus:outline-none focus:border-indigo-500 resize-none h-20 text-white"
                        />
                        <button 
                          type="submit"
                          disabled={!newComment.trim()}
                          className="absolute bottom-2 right-2 flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white px-2 py-1 rounded text-[10px] disabled:opacity-50 font-bold transition-colors"
                        >
                           <Send className="w-3 h-3" />
                           Send
                        </button>
                     </div>
                  </form>
               </div>
             )}
          </div>
       </div>
    </div>
  );
};
