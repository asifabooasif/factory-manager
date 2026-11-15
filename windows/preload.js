const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('erpLocal', {
  info: fid => ipcRenderer.invoke('local:info', fid),
  send: payload => ipcRenderer.invoke('local:send', payload),
  chooseFolder: () => ipcRenderer.invoke('local:choose'),
  openFolder: () => ipcRenderer.invoke('local:open')
});
contextBridge.exposeInMainWorld('erpWin', {
  notify: p => ipcRenderer.send('win:notify', p),
  badge: p => ipcRenderer.send('win:badge', p),
  getSettings: () => ipcRenderer.invoke('win:settings'),
  setSettings: p => ipcRenderer.invoke('win:settings', p),
  onNavigate: cb => ipcRenderer.on('win:navigate', (e, r) => cb(r))
});
