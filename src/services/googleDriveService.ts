
export interface GdriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export const googleDriveService = {
  async listFolders(token: string, parentId: string = 'root'): Promise<GdriveFile[]> {
    const query = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name, mimeType)`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
      if (!response.ok) {
        let msg = '';
        try { msg = await response.text(); } catch(e){}
        if (response.status === 401) {
          throw new Error('401 Unauthorized: Drive token expired');
        }
        throw new Error(`Failed to list folders (Status: ${response.status}): ${msg}`);
      }
    const data = await response.json();
    return data.files || [];
  },

  async findFolder(token: string, name: string, parentId: string = 'root'): Promise<string | null> {
    const query = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  },

  async getOrCreateFolder(token: string, name: string, parentId: string = 'root'): Promise<string> {
    const existing = await this.findFolder(token, name, parentId);
    if (existing) return existing;
    return this.createFolder(token, name, parentId);
  },

  async createFolder(token: string, name: string, parentId: string = 'root'): Promise<string> {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    if (!response.ok) {
       let msg = '';
       try { msg = await response.text(); } catch(e){}
       throw new Error(`Failed to create folder (Status: ${response.status}): ${msg}`);
    }
    const data = await response.json();
    return data.id;
  },

  async createTextFile(token: string, name: string, content: string, parentId: string): Promise<string> {
    const metadata = {
      name,
      mimeType: 'text/plain',
      parents: [parentId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'text/plain' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    
    if (!response.ok) throw new Error('Failed to create file');
    const data = await response.json();
    return data.id;
  },

  async uploadFile(token: string, file: File, parentId: string, onProgress?: (progress: number) => void): Promise<string> {
    const metadata = {
      name: file.name,
      parents: [parentId]
    };

    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size.toString()
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
       let msg = '';
       try { msg = await initRes.text(); } catch(e){}
       if (initRes.status === 401) {
         throw new Error('401 Unauthorized: Drive token expired');
       }
       throw new Error(`Failed to initialize upload (Status: ${initRes.status}): ${msg}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
       throw new Error('No resumable upload URL returned from API');
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            onProgress(Math.min(percent, 99.9));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let responseId = '';
          try {
            const response = JSON.parse(xhr.responseText);
            responseId = response.id;
          } catch(e) {}
          if (onProgress) onProgress(100);
          resolve(responseId);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
  },

  async listFiles(token: string, folderId: string): Promise<any[]> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,createdTime)&pageSize=100`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to list files');
    const data = await response.json();
    return data.files || [];
  },

  async createTemplate(token: string, event: any, rootFolderId: string): Promise<{
    rawId: string, 
    deliverId: string,
    rawPhotosId: string,
    rawVideoId: string,
    finalPhotosId: string,
    finalVideoId: string
  }> {
    const shooterName = event.shooter || 'Unassigned';
    const eventDate = typeof event.date === 'string' ? event.date.split('T')[0] : 'Unknown_Date';
    const clientName = event.clientName || 'Unknown_Client';
    const eventBaseName = event.location || event.title || 'Untitled_Event';
    
    // 1. Order folder name: [Client Name] - [Event Name]
    const orderFolderName = `${clientName} - ${eventBaseName}`;
    
    // 2. Setup Root Folders
    const rawMediaRootId = await this.getOrCreateFolder(token, 'Raw Media', rootFolderId);
    const deliverRootId = await this.getOrCreateFolder(token, 'Deliver', rootFolderId);

    // 3. Build RAW Structure: Raw Media > Shooter > Date > Order Name
    const shooterFolderId = await this.getOrCreateFolder(token, shooterName, rawMediaRootId);
    const dateFolderId = await this.getOrCreateFolder(token, eventDate, shooterFolderId);
    const rawEventFolderId = await this.createFolder(token, orderFolderName, dateFolderId);

    // 4. Build DELIVER Structure: Deliver > Client > Order Name
    const clientFolderId = await this.getOrCreateFolder(token, clientName, deliverRootId);
    const deliverEventFolderId = await this.createFolder(token, orderFolderName, clientFolderId);

    // 5. Create Specific Subfolders requested
    const [rawPhotosId, rawVideoId, finalPhotosId, finalVideoId] = await Promise.all([
      this.createFolder(token, 'Photos', rawEventFolderId),
      this.createFolder(token, 'Raw Video', rawEventFolderId),
      this.createFolder(token, 'Final Photos', deliverEventFolderId),
      this.createFolder(token, 'Final Video', deliverEventFolderId)
    ]);

    // 6. Create internal links
    const deliverUrl = `https://drive.google.com/drive/folders/${deliverEventFolderId}`;
    const rawUrl = `https://drive.google.com/drive/folders/${rawEventFolderId}`;

    await Promise.all([
      this.createTextFile(token, 'LINK_TO_DELIVER.txt', `Access the delivery folder here:\n${deliverUrl}`, rawEventFolderId),
      this.createTextFile(token, 'LINK_TO_RAW.txt', `Access the raw media folder here:\n${rawUrl}`, deliverEventFolderId)
    ]);

    return { 
      rawId: rawEventFolderId, 
      deliverId: deliverEventFolderId,
      rawPhotosId,
      rawVideoId,
      finalPhotosId,
      finalVideoId
    };
  }
};
