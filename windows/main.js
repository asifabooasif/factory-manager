/* Windows shell for Lanka Slipper ERP: opens your live website in its own window.
   Web changes reach the app automatically; a new installer is only needed to change this shell. */
const { app, BrowserWindow, shell, Menu, ipcMain, dialog, Tray, Notification, nativeImage } = require('electron');
const fs = require('fs'), path = require('path');
let URL_ = process.env.APP_URL || '';
try { URL_ = URL_ || JSON.parse(fs.readFileSync(path.join(__dirname, 'app-url.json'), 'utf8')).url; } catch (e) {}
if (!app.requestSingleInstanceLock()) app.quit();
const isOurs = u => { try { return new URL(u).origin === new URL(URL_).origin; } catch (e) { return false; } };
const authHost = u => /(^|\.)(google\.com|googleapis\.com|firebaseapp\.com|gstatic\.com)$/.test(new URL(u).hostname);
/* ---------- notifications: tray icon, background running, start with Windows ---------- */
app.setAppUserModelId('lk.lankaslipper.erp.desktop');   /* needed for Windows pop-ups */
const winCfgFile = () => path.join(app.getPath('userData'), 'win-settings.json');
const winCfg = () => { let c = {}; try { c = JSON.parse(fs.readFileSync(winCfgFile(), 'utf8')); } catch (e) {} return Object.assign({ tray: true, autostart: false }, c); };
const saveWinCfg = c => { try { fs.writeFileSync(winCfgFile(), JSON.stringify(c)); } catch (e) {} };
let mainWin = null, tray = null, quitting = false, badgeCount = 0;
const hiddenStart = process.argv.includes('--hidden');
const iconFile = () => path.join(__dirname, 'build', 'icon.png');
function showWin() { if (!mainWin) return; if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
function refreshTray() {
  if (!tray) return; const c = winCfg();
  tray.setToolTip('Slipper ERP' + (badgeCount ? ' - ' + badgeCount + ' notification' + (badgeCount === 1 ? '' : 's') : ''));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Slipper ERP', click: showWin }, { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: !!c.autostart, click: i => applyCfg({ autostart: i.checked }) },
    { label: 'Keep running in the tray', type: 'checkbox', checked: c.tray !== false, click: i => applyCfg({ tray: i.checked }) },
    { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit(); } }]));
}
function buildTray() {
  if (tray) return;
  try { tray = new Tray(nativeImage.createFromPath(iconFile()).resize({ width: 16, height: 16 })); } catch (e) { tray = null; return; }
  tray.on('click', showWin); refreshTray();
}
function applyCfg(p) {
  const c = Object.assign(winCfg(), p); saveWinCfg(c);
  if ('autostart' in p) { try { app.setLoginItemSettings({ openAtLogin: !!c.autostart, args: ['--hidden'] }); } catch (e) {} }
  if (c.tray !== false) buildTray(); else if (tray) { tray.destroy(); tray = null; }
  refreshTray(); return c;
}
app.on('before-quit', () => { quitting = true; });
function create() {
  const win = new BrowserWindow({ width: 1366, height: 820, minWidth: 900, minHeight: 600, show: !hiddenStart, backgroundColor: '#2a1758', title: 'Slipper ERP', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') } });
  mainWin = win;
  win.on('focus', () => { try { win.flashFrame(false); } catch (e) {} });
  win.on('close', e => {
    const c = winCfg();
    if (!quitting && c.tray !== false && tray) {
      e.preventDefault(); win.hide();
      if (!c.notedTray) { try { new Notification({ title: 'Slipper ERP is still running', body: 'It stays in the system tray so alerts can reach you. Right-click the tray icon to quit.' }).show(); } catch (x) {} saveWinCfg(Object.assign(c, { notedTray: true })); }
    }
  });
  /* Google refuses sign-in from browsers that call themselves Electron, so present as plain Chrome */
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s?Electron\/\S+/i, '').replace(/\s?lanka-slipper-erp-windows\/\S+/i, ''));
  win.webContents.setWindowOpenHandler(({ url }) => {
    /* print windows (invoices, delivery notes, reports) are opened as empty pages by the app */
    if (!url || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { width: 980, height: 1100, autoHideMenuBar: true } };
    if (!url || url === 'about:blank' || authHost(url) || isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, parent: win } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('did-fail-load', (e, code, d, u, main) => { if (main && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: URL_ } }); });
  if (!URL_) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: '' } }); else win.loadURL(URL_);
  Menu.setApplicationMenu(null);
  return win;
}
app.whenReady().then(() => { if (winCfg().tray !== false) buildTray(); let w = create(); app.on('second-instance', () => { showWin(); }); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) w = create(); }); });
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

/* ---------- notification bridge (used by js/modules/notify.js) ---------- */
const live = new Set();
ipcMain.handle('win:settings', (e, p) => { if (!trusted(e)) throw new Error('Not allowed'); return p ? applyCfg(p) : winCfg(); });
ipcMain.on('win:notify', (e, p) => {
  if (!trusted(e) || !p || !Notification.isSupported()) return;
  const n = new Notification({ title: String(p.title || 'Slipper ERP').slice(0, 120), body: String(p.body || '').slice(0, 400), silent: !!p.silent, icon: nativeImage.createFromPath(iconFile()) });
  live.add(n);
  n.on('click', () => { showWin(); if (mainWin) mainWin.webContents.send('win:navigate', String(p.route || '')); });
  n.on('close', () => live.delete(n));
  n.show();
  if (p.urgent && mainWin && !mainWin.isFocused()) { try { mainWin.flashFrame(true); } catch (x) {} }
});
ipcMain.on('win:badge', (e, p) => {
  if (!trusted(e) || !mainWin || !p) return;
  badgeCount = Math.max(0, p.count | 0);
  try { mainWin.setOverlayIcon(badgeCount && p.overlay ? nativeImage.createFromDataURL(p.overlay) : null, badgeCount ? badgeCount + ' notifications' : ''); } catch (x) {}
  refreshTray();
});
