// Claude Dock — by Haris AI
// Main process: full-screen transparent overlay, click-through, client folders, terminal launching.

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const HOME = os.homedir();
const ACCOUNTS_DIR = path.join(HOME, '.claude-accounts'); // one folder per client login
const CLIENTS_DIR = path.join(HOME, 'Clients');           // one work folder per client
const DOCK_DIR = path.join(HOME, '.claude-dock');          // app data
const AVATAR_DIR = path.join(DOCK_DIR, 'avatars');
const CONFIG_PATH = path.join(DOCK_DIR, 'config.json');

const PALETTE = ['#85B7EB', '#97C459', '#FAC775', '#ED93B1', '#AFA9EC', '#5DCAA5', '#F0997B', '#B5D4F4', '#9FE1CB', '#F4C0D1'];

let win = null;
let tray = null;

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ---------- Helpers ----------
function ensureDirs() {
  [ACCOUNTS_DIR, CLIENTS_DIR, DOCK_DIR, AVATAR_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { clients: {}, pos: null }; }
}
function saveConfig(cfg) {
  fs.mkdirSync(DOCK_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
function clientPaths(id) {
  return { cfgDir: path.join(ACCOUNTS_DIR, id), workDir: path.join(CLIENTS_DIR, id) };
}

function listClients() {
  ensureDirs();
  const cfg = loadConfig();
  const ids = fs.readdirSync(ACCOUNTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name).sort((a, b) => a.localeCompare(b));
  let changed = false;
  ids.forEach((id) => {
    if (!cfg.clients[id]) {
      cfg.clients[id] = { displayName: id, avatar: null, color: PALETTE[Object.keys(cfg.clients).length % PALETTE.length], hidden: false };
      changed = true;
    }
  });
  if (changed) saveConfig(cfg);
  return ids.filter((id) => !cfg.clients[id].hidden).map((id) => ({ id, ...cfg.clients[id] }));
}

function ensureLauncher(id) {
  const { cfgDir, workDir } = clientPaths(id);
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  if (process.platform === 'win32') {
    const bat = path.join(workDir, 'launch-claude.bat');
    fs.writeFileSync(bat, ['@echo off', `title Claude - ${id}`, `set "CLAUDE_CONFIG_DIR=${cfgDir}"`, `cd /d "${workDir}"`, 'claude', 'pause', ''].join('\r\n'));
    return bat;
  }
  const isMac = process.platform === 'darwin';
  const sh = path.join(workDir, isMac ? 'launch-claude.command' : 'launch-claude.sh');
  const lines = ['#!/bin/bash', 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"', `export CLAUDE_CONFIG_DIR="${cfgDir}"`, `cd "${workDir}"`, 'claude'];
  if (!isMac) { lines.push('echo ""', 'read -p "Press Enter to close..."'); }
  lines.push('');
  fs.writeFileSync(sh, lines.join('\n'));
  fs.chmodSync(sh, 0o755);
  return sh;
}

function tryLinuxTerminals(shPath) {
  const cands = [['gnome-terminal', ['--', 'bash', shPath]], ['konsole', ['-e', 'bash', shPath]], ['xfce4-terminal', ['-e', `bash ${shPath}`]], ['x-terminal-emulator', ['-e', `bash ${shPath}`]], ['xterm', ['-e', 'bash', shPath]]];
  const next = (i) => { if (i >= cands.length) return; const [c, a] = cands[i]; const ch = spawn(c, a, { detached: true, stdio: 'ignore' }); ch.on('error', () => next(i + 1)); ch.unref(); };
  next(0);
}

function openClient(id) {
  const launcher = ensureLauncher(id);
  const { workDir } = clientPaths(id);
  if (process.platform === 'win32') { const ch = spawn('cmd.exe', ['/c', 'start', '', launcher], { cwd: workDir, detached: true, stdio: 'ignore' }); ch.unref(); }
  else if (process.platform === 'darwin') { const ch = spawn('open', [launcher], { detached: true, stdio: 'ignore' }); ch.unref(); }
  else { tryLinuxTerminals(launcher); }
}

// ---------- Window (full-screen transparent overlay) ----------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height,
    transparent: true, frame: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, roundedCorners: false, focusable: true, acceptFirstMouse: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through until cursor is over the agent
}

function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Claude Dock — by Haris AI');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Center the agent', click: () => win && win.webContents.send('dock:center') },
    { label: 'Reload clients', click: () => win && win.webContents.send('clients:changed') },
    { type: 'separator' },
    { label: 'Quit Claude Dock', click: () => app.quit() }
  ]));
}

// ---------- IPC ----------
ipcMain.handle('clients:list', () => listClients());
ipcMain.handle('dock:getState', () => ({ clients: listClients(), pos: loadConfig().pos }));
ipcMain.handle('clients:open', (e, id) => { openClient(id); return true; });
ipcMain.handle('clients:openAll', async () => {
  const list = listClients();
  for (let i = 0; i < list.length; i++) { openClient(list[i].id); await new Promise((r) => setTimeout(r, 450)); }
  return list.length;
});
ipcMain.handle('clients:add', (e, name) => {
  const clean = String(name || '').trim();
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(clean)) throw new Error('One word only — letters/numbers (e.g. Sierra)');
  ensureLauncher(clean);
  const cfg = loadConfig();
  if (cfg.clients[clean]) cfg.clients[clean].hidden = false;
  saveConfig(cfg);
  return listClients();
});
ipcMain.handle('clients:rename', (e, id, newName) => {
  const cfg = loadConfig(); const clean = String(newName || '').trim().slice(0, 24);
  if (cfg.clients[id] && clean) { cfg.clients[id].displayName = clean; saveConfig(cfg); }
  return listClients();
});
ipcMain.handle('clients:hide', (e, id) => {
  const cfg = loadConfig();
  if (cfg.clients[id]) { cfg.clients[id].hidden = true; saveConfig(cfg); }
  return listClients();
});
ipcMain.handle('clients:pickAvatar', async (e, id) => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose an image for ' + id, properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (!r.canceled && r.filePaths[0]) {
    const src = r.filePaths[0]; const ext = path.extname(src).toLowerCase() || '.png';
    const dest = path.join(AVATAR_DIR, id + ext);
    ['.png', '.jpg', '.jpeg', '.webp'].forEach((x) => { const p = path.join(AVATAR_DIR, id + x); if (fs.existsSync(p) && p !== dest) fs.unlinkSync(p); });
    fs.copyFileSync(src, dest);
    const cfg = loadConfig(); if (cfg.clients[id]) { cfg.clients[id].avatar = dest; saveConfig(cfg); }
  }
  return listClients();
});
ipcMain.handle('clients:resetAvatar', (e, id) => {
  const cfg = loadConfig(); if (cfg.clients[id]) { cfg.clients[id].avatar = null; saveConfig(cfg); }
  return listClients();
});
ipcMain.on('mouse:setIgnore', (e, flag) => { if (win) win.setIgnoreMouseEvents(!!flag, { forward: true }); });
ipcMain.on('dock:savePos', (e, pos) => { const cfg = loadConfig(); cfg.pos = pos; saveConfig(cfg); });
ipcMain.on('app:quit', () => app.quit());

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  ensureDirs();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  const delay = process.platform === 'linux' ? 300 : 0;
  setTimeout(() => { createWindow(); createTray(); }, delay);
});
app.on('second-instance', () => { if (win) win.webContents.send('dock:center'); });
app.on('window-all-closed', () => app.quit());
