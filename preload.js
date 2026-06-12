// Claude Dock — preload bridge (safe IPC for the renderer)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dock', {
  getState: () => ipcRenderer.invoke('dock:getState'),
  list: () => ipcRenderer.invoke('clients:list'),
  open: (id) => ipcRenderer.invoke('clients:open', id),
  openAll: () => ipcRenderer.invoke('clients:openAll'),
  add: (name) => ipcRenderer.invoke('clients:add', name),
  rename: (id, name) => ipcRenderer.invoke('clients:rename', id, name),
  hide: (id) => ipcRenderer.invoke('clients:hide', id),
  pickAvatar: (id) => ipcRenderer.invoke('clients:pickAvatar', id),
  resetAvatar: (id) => ipcRenderer.invoke('clients:resetAvatar', id),
  setIgnore: (flag) => ipcRenderer.send('mouse:setIgnore', flag),
  savePos: (pos) => ipcRenderer.send('dock:savePos', pos),
  quit: () => ipcRenderer.send('app:quit'),
  onChanged: (cb) => ipcRenderer.on('clients:changed', cb),
  onCenter: (cb) => ipcRenderer.on('dock:center', cb)
});
