
import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, ChevronLeft, Check, Search, HardDrive } from 'lucide-react';
import { googleDriveService, GdriveFile } from '../services/googleDriveService';

interface DriveFolderMapperProps {
  accessToken: string;
  onSelectRoot: (folderId: string, folderName: string) => void;
  currentRootId?: string;
}

export const DriveFolderMapper: React.FC<DriveFolderMapperProps> = ({ 
  accessToken, 
  onSelectRoot,
  currentRootId 
}) => {
  const [path, setPath] = useState<{id: string, name: string}[]>([{ id: 'root', name: 'My Drive' }]);
  const [folders, setFolders] = useState<GdriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentFolder = path[path.length - 1];

  useEffect(() => {
    fetchFolders(currentFolder.id);
  }, [currentFolder.id, accessToken]);

  const fetchFolders = async (parentId: string) => {
    setIsLoading(true);
    try {
      const data = await googleDriveService.listFolders(accessToken, parentId);
      setFolders(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateTo = (folder: GdriveFile) => {
    setPath([...path, { id: folder.id, name: folder.name }]);
  };

  const goBack = () => {
    if (path.length > 1) {
      setPath(path.slice(0, -1));
    }
  };

  const navigateToBreadcrumb = (index: number) => {
    setPath(path.slice(0, index + 1));
  };

  const filteredFolders = folders.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[500px]">
      <div className="p-4 border-b border-white/5 bg-[#0D0D0E] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Drive Mapper</h3>
            <p className="text-[8px] text-white/40 uppercase tracking-tighter">Navigate to select Root Project folder</p>
          </div>
        </div>
        <div className="relative">
          <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input 
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-black/20 border border-white/5 rounded-lg py-1.5 pl-8 pr-3 text-[10px] text-white focus:outline-none focus:border-indigo-500/30 transition-all w-48"
          />
        </div>
      </div>

      <div className="px-4 py-2 bg-[#0A0A0B] border-b border-white/5 flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {path.map((p, idx) => (
          <React.Fragment key={p.id}>
            <button 
              onClick={() => navigateToBreadcrumb(idx)}
              className={`text-[9px] font-black uppercase tracking-widest transition-colors ${idx === path.length - 1 ? 'text-indigo-400' : 'text-white/40 hover:text-white'}`}
            >
              {p.name}
            </button>
            {idx < path.length - 1 && <ChevronRight className="w-3 h-3 text-white/10" />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : filteredFolders.length > 0 ? (
          filteredFolders.map(folder => (
            <div 
              key={folder.id}
              className={`group flex items-center justify-between p-2 rounded-xl transition-all border ${currentRootId === folder.id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05] hover:border-white/5'}`}
            >
              <div 
                className="flex items-center gap-3 flex-1 cursor-pointer"
                onClick={() => navigateTo(folder)}
              >
                <Folder className={`w-4 h-4 ${currentRootId === folder.id ? 'text-indigo-400' : 'text-white/20 group-hover:text-indigo-400'} transition-colors`} />
                <span className={`text-[11px] font-medium ${currentRootId === folder.id ? 'text-white' : 'text-white/60 group-hover:text-white'} truncate`}>
                  {folder.name}
                </span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoot(folder.id, folder.name);
                }}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${currentRootId === folder.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-white/5 text-white/40 hover:bg-indigo-500 hover:text-white opacity-0 group-hover:opacity-100'}`}
              >
                {currentRootId === folder.id ? <Check className="w-3 h-3" /> : 'Select Root'}
              </button>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <Folder className="w-8 h-8 text-white/5 mb-2" />
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No folders found</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-[#0D0D0E] border-t border-white/5 flex items-center justify-between">
        <button 
          onClick={goBack}
          disabled={path.length <= 1}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white/60 rounded text-[9px] uppercase font-black tracking-widest transition-all border border-white/5"
        >
          <ChevronLeft className="w-3 h-3" />
          Back
        </button>
        <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">
          {filteredFolders.length} Folders
        </div>
      </div>
    </div>
  );
};
