const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  setDshPath: (p) => ipcRenderer.invoke('set-dsh-path', p),
  browseDshPath: () => ipcRenderer.invoke('browse-dsh-path'),
  openHomepage: () => ipcRenderer.invoke('open-homepage'),
  retry: () => ipcRenderer.invoke('retry'),
  restartDsh: () => ipcRenderer.invoke('restart-dsh'),
  notifyTaskComplete: () => ipcRenderer.send('task-complete'),
});
