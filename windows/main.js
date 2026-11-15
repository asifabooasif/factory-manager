/* Windows shell for Lanka Slipper ERP: opens your live website in its own window.
   Web changes reach the app automatically; a new installer is only needed to change this shell. */
const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs'), path = require('path');
let URL_ = process.env.APP_URL || '';
try { URL_ = URL_ || JSON.parse(fs.readFileSync(path.join(__dirname, 'app-url.json'), 'utf8')).url; } catch (e) {}
if (!app.requestSingleInstanceLock()) app.quit();
const isOurs = u => { try { return new URL(u).origin === new URL(URL_).origin; } catch (e) { return false; } };
const authHost = u => /(^|\.)(google\.com|googleapis\.com|firebaseapp\.com|gstatic\.com)$/.test(new URL(u).hostname);
function create() {
  const win = new BrowserWindow({ width: 1366, height: 820, minWidth: 900, minHeight: 600, backgroundColor: '#2a1758', title: 'Slipper ERP', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') } });
  /* Google refuses sign-in from browsers that call themselves Electron, so present as plain Chrome */
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s?Electron\/\S+/i, '').replace(/\s?lanka-slipper-erp-windows\/\S+/i, ''));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || authHost(url) || isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, parent: win } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (e, code, d, u, main) => { if (main && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: URL_ } }); });
  if (!URL_) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: '' } }); else win.loadURL(URL_);
  Menu.setApplicationMenu(null);
  return win;
}
app.whenReady().then(() => { let w = create(); app.on('second-instance', () => { if (w) { if (w.isMinimized()) w.restore(); w.focus(); } }); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) w = create(); }); });
app.on('window-all-closed', () => app.quit());

/* ---------- local database on this PC (SQLite) ---------- */
const store = require('./store');
let db = null, dbFile = '';
const cfgFile = () => path.join(app.getPath('userData'), 'local-db.json');
const cfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const dataDir = () => cfg().dir || path.join(app.getPath('documents'), 'SlipperERP-Data');
function open() { const f = path.join(dataDir(), 'erp-local.db'); if (db && f === dbFile) return db; try { db && db.close(); } catch (e) {} db = store.openDb(f); dbFile = f; return db; }
const trusted = e => { try { return isOurs(e.senderFrame.url); } catch (x) { return false; } };
ipcMain.handle('local:info', (e, fid) => { if (!trusted(e)) throw new Error('Not allowed'); const d = open(); return Object.assign({ path: dbFile, dir: dataDir() }, store.info(d, fid)); });
ipcMain.handle('local:send', (e, p) => { if (!trusted(e)) throw new Error('Not allowed'); const d = open(); const r = store.send(d, p); try { r.backup = store.backup(d, path.join(dataDir(), 'backups')); } catch (x) { r.backupError = x.message; } return r; });
ipcMain.handle('local:choose', async e => { if (!trusted(e)) throw new Error('Not allowed'); const r = await dialog.showOpenDialog({ title: 'Choose where to keep the local database', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; fs.writeFileSync(cfgFile(), JSON.stringify(Object.assign(cfg(), { dir: r.filePaths[0] }))); return r.filePaths[0]; });
ipcMain.handle('local:open', e => { if (!trusted(e)) throw new Error('Not allowed'); fs.mkdirSync(dataDir(), { recursive: true }); return shell.openPath(dataDir()); });
