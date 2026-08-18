const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  confirmDshPath: (p) => ipcRenderer.invoke('confirm-dsh-path', p),
  browseDshPath: () => ipcRenderer.invoke('browse-dsh-path'),
  retry: () => ipcRenderer.invoke('retry'),
  restartDsh: () => ipcRenderer.invoke('restart-dsh'),
  openHelpMenu: (rect) => ipcRenderer.invoke('open-help-menu', rect),
  openRepo: () => ipcRenderer.invoke('open-repo'),
  openLog: () => ipcRenderer.invoke('open-log'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkDshUpdate: () => ipcRenderer.invoke('check-dsh-update'),
  onChromeTheme: (cb) => ipcRenderer.on('chrome-theme', (_e, d) => cb(d)),
  onChromeLanguage: (cb) => ipcRenderer.on('chrome-language', (_e, l) => cb(l)),
  onHelpMenuState: (cb) => ipcRenderer.on('help-menu-state', (_e, open) => cb(open)),
  onHelpBtnState: (cb) => ipcRenderer.on('help-btn-state', (_e, visible) => cb(visible)),
  notifyTaskComplete: () => ipcRenderer.send('task-complete'),
});
