const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('erpLocal', {
  info: fid => ipcRenderer.invoke('local:info', fid),
  send: payload => ipcRenderer.invoke('local:send', payload),
  chooseFolder: () => ipcRenderer.invoke('local:choose'),
  openFolder: () => ipcRenderer.invoke('local:open')
});
