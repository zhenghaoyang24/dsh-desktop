const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  confirmDshPath: (p) => ipcRenderer.invoke('confirm-dsh-path', p),
  browseDshPath: () => ipcRenderer.invoke('browse-dsh-path'),
  retry: () => ipcRenderer.invoke('retry'),
  restartDsh: () => ipcRenderer.invoke('restart-dsh'),
  openHomepage: () => ipcRenderer.invoke('open-homepage'),
  openRepo: () => ipcRenderer.invoke('open-repo'),
  openAbout: () => ipcRenderer.invoke('open-about'),
  openLog: () => ipcRenderer.invoke('open-log'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onChromeTheme: (cb) => ipcRenderer.on('chrome-theme', (_e, d) => cb(d)),
  notifyTaskComplete: () => ipcRenderer.send('task-complete'),
});
