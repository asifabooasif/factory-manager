/* Android/iOS shell (Capacitor): native Google sign-in, notifications, app-update check.
   In a normal browser this file only adds the "Mobile & Notifications" screen. */
(E=>{
  const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
  const P = n => (C && C.Plugins && C.Plugins[n]) || null;
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('erp_m_' + k); return v == null ? d : JSON.parse(v); } catch (x) { return d; } }, set: (k, v) => localStorage.setItem('erp_m_' + k, JSON.stringify(v)) };
  const st = { token: '', perm: 'unknown', build: 0, version: '' };
  E.native = { is: native, state: st };

  /* ---- 1. Google sign-in (popups do not work inside the app) ---- */
  if (native && P('FirebaseAuthentication')) {
    E.sync.signIn = async () => {
      try {
        const r = await P('FirebaseAuthentication').signInWithGoogle();
        const idToken = r && r.credential && r.credential.idToken;
        if (!idToken) throw new Error('Google did not return a sign-in token');
        await firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken));
      } catch (e) { if (!/cancel/i.test(e.message || '')) E.toast('Sign-in failed: ' + (e.message || e), 'error'); }
    };
    E.sync.signOut = async () => { localStorage.removeItem('erp_last_user'); try { await P('FirebaseAuthentication').signOut(); } catch (x) {} return firebase.auth().signOut(); };
  }

  /* ---- 2. Local reminders (work offline, need no server) ---- */
  const LN = () => P('LocalNotifications');
  const ID_CHQ = 1001, ID_PROD = 1002;
  async function perm(ask) {
    const n = LN(); if (!n) return 'unsupported';
    let p = await n.checkPermissions(); if (p.display === 'prompt' && ask) p = await n.requestPermissions();
    st.perm = p.display; return p.display;
  }
  async function schedule() {
    if (E.notify && E.notify.androidPlan) return E.notify.androidPlan();   /* the Notification Center plans the alerts now */
    const n = LN(); if (!n || !E.fid) return;
    if ((await perm(false)) !== 'granted') return;
    await n.cancel({ notifications: [{ id: ID_CHQ }, { id: ID_PROD }] }).catch(() => {});
    const list = [], at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; };
    if (LS.get('chq', true)) {
      const lim = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      const due = (E.rows('cheques') || []).filter(c => c.status === 'Pending' && c.date <= lim);
      if (due.length) list.push({ id: ID_CHQ, title: 'Cheques due', body: due.length + ' pending cheque(s) due within 3 days, total ' + E.m(due.reduce((s, c) => s + (c.amount || 0), 0)), schedule: { at: at(9, 0) } });
    }
    if (LS.get('prod', false)) { const t = (LS.get('prodTime', '17:00') || '17:00').split(':'); list.push({ id: ID_PROD, title: 'Daily production', body: "Don't forget to log today's production.", schedule: { at: at(+t[0], +t[1]), every: 'day' } }); }
    if (list.length) await n.schedule({ notifications: list });
  }

  E.native.local = LN; E.native.askPerm = perm;
  /* notification channels (Android 8+) and what happens when a notification is tapped */
  async function setupLocal() {
    const n = LN(); if (!n) return;
    try {
      await n.createChannel({ id: 'alerts', name: 'Alerts', description: 'Cheques due, overdue invoices, low stock, late jobs', importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#F5A623' });
      await n.createChannel({ id: 'reminders', name: 'Reminders', description: 'Daily production reminder', importance: 3, visibility: 1 });
      await n.createChannel({ id: 'team', name: 'Team messages', description: 'Messages from the owner and team', importance: 4, visibility: 1, vibration: true });
    } catch (e) { console.warn('channels', e); }
    n.addListener('localNotificationActionPerformed', ev => { const x = (ev.notification && ev.notification.extra) || {}; if (E.notify) E.notify.open(x.route); });
  }

  /* ---- 3. Push notifications (Firebase Cloud Messaging) ---- */
  async function pushInit() {
    const M = P('FirebaseMessaging'); if (!M) return;
    try {
      const p = await M.requestPermissions(); st.perm = p.receive;
      if (p.receive !== 'granted') return;
      const t = await M.getToken(); st.token = t.token;
      const u = E.sync && E.sync.user;
      if (u && t.token) await firebase.firestore().collection('erp_devices').doc(t.token.slice(-40)).set({ token: t.token, email: (u.email || '').toLowerCase(), platform: C.getPlatform(), updated: new Date().toISOString() });
      await M.subscribeToTopic({ topic: 'all' }).catch(() => {});
      M.addListener('notificationReceived', ev => { const n = ev.notification || {}, d = n.data || {}; if (E.notify) E.notify.addMessage({ id: d.nid, title: n.title, body: n.body, route: d.route }); E.toast((n.title ? n.title + ': ' : '') + (n.body || ''), 'success'); });
      M.addListener('notificationActionPerformed', ev => { const d = (ev.notification && ev.notification.data) || {}; if (E.notify) E.notify.open(d.route); else if (d.route && E.R[d.route]) location.hash = '#/' + d.route; });
    } catch (e) { console.warn('push', e); }
  }

  /* ---- 4. New app version check (version.json on your website) ---- */
  async function checkUpdate(manual) {
    try {
      const A = P('App'); if (A) { const i = await A.getInfo(); st.build = +i.build || 0; st.version = i.version; }
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw 0;
      const v = (await r.json()).android || {};
      if (st.build && v.versionCode > st.build) {
        const force = v.minVersionCode && v.minVersionCode > st.build;
        E.modal('App update available', `<p>Version <b>${E.esc(v.versionName || v.versionCode)}</b> is ready. You have ${E.esc(st.version || st.build)}.</p>${v.notes ? '<p class="muted" style="margin-top:8px">' + E.esc(v.notes) + '</p>' : ''}${force ? '<p class="bad" style="margin-top:8px">This update is required.</p>' : ''}`,
          (force ? '' : '<button class="btn" data-a="close">Later</button>') + '<button class="btn p" data-a="mobUpdateGo">Download update</button>');
        E._updUrl = v.url;
      } else if (manual) E.toast('You have the latest version', 'success');
    } catch (e) { if (manual) E.toast('Could not check for updates', 'error'); }
  }
  E.A.mobUpdateGo = () => { const u = E._updUrl; if (!u) return; const B = P('Browser'); if (B) B.open({ url: u }); else window.open(u, '_system'); };

  /* ---- 5. Screen: System > Mobile & Notifications ---- */
  E.nav('System', 'mobile', '📱', 'Mobile & Notifications');
  E.route('mobile', 'Mobile & Notifications', () => {
    const chk = (k, d, a, t) => `<label class="f" style="flex-direction:row;gap:8px"><input type="checkbox" ${LS.get(k, d) ? 'checked' : ''} data-a="${a}" style="width:auto"> ${t}</label>`;
    return `<div class="kp">${E.kpi('Running as', native ? 'Android app' : 'Web browser', native ? 'version ' + (st.version || '…') : 'install for the full app')}${E.kpi('Notifications', st.perm === 'granted' ? 'On' : st.perm === 'denied' ? 'Blocked' : 'Not enabled')}${E.kpi('Connection', navigator.onLine ? 'Online' : 'Offline')}</div>
    <div class="card"><h3>Notifications</h3><p class="muted">Alerts, reminders and team messages are now managed in the Notification Center.</p>
      <div class="bar"><button class="btn p" data-a="goNotify">Open Notification Center</button><button class="btn" data-a="mobEnable">Allow notifications</button><button class="btn" data-a="mobCheck">Check for app update</button></div>
      ${native ? '' : '<p class="muted">Updates and phone notifications work in the Android app.</p>'}</div>`;
  });
  E.A.mobChq = (id, e) => { LS.set('chq', e.target.checked); schedule(); };
  E.A.mobProd = (id, e) => { LS.set('prod', e.target.checked); schedule(); };
  E.hooks.push(e => { if (e.target && e.target.id === 'm_pt') { LS.set('prodTime', e.target.value || '17:00'); schedule(); } });
  E.A.mobEnable = async () => { if (!native) return E.toast('Open this in the Android app', 'error'); await perm(true); await pushInit(); await schedule(); E.go(); E.toast(st.perm === 'granted' ? 'Notifications enabled' : 'Notifications are blocked in phone settings', st.perm === 'granted' ? 'success' : 'error'); };
  E.A.mobTest = async () => { const n = LN(); if (!n) return E.toast('Open this in the Android app', 'error'); if ((await perm(true)) !== 'granted') return E.toast('Notifications are blocked', 'error'); await n.schedule({ notifications: [{ id: 9001, title: 'Lanka Slipper ERP', body: 'Test notification works.', schedule: { at: new Date(Date.now() + 2000) } }] }); E.toast('Test sent. It arrives in 2 seconds', 'success'); };
  E.A.mobCheck = () => checkUpdate(true);
  E.A.mobBroadcast = async () => { try { const t = E.val('m_bt').trim(), b = E.val('m_bm').trim(); if (!b) throw new Error('Write a message'); await firebase.firestore().collection('erp_notify').add({ title: t || 'Lanka Slipper ERP', body: b, by: E.user || '', at: new Date().toISOString() }); E.toast('Message queued', 'success'); } catch (e) { E.toast(e.message, 'error'); } };

  if (!native) return;
  const A = P('App');
  if (A) A.addListener('appStateChange', s => { if (s.isActive) { schedule(); checkUpdate(false); } });
  /* Android back button: close pop-up or menu first, then go back, then exit */
  if (A) A.addListener('backButton', () => {
    if (E.notify && E.notify.closePanel()) return;
    const mw = document.getElementById('mw');
    if (mw && mw.classList.contains('o')) return E.closeM();
    if (document.body.classList.contains('mopen')) return document.body.classList.remove('mopen');
    if ((location.hash.replace(/^#\/?/, '') || 'dashboard') !== 'dashboard') return history.back();
    A.exitApp();
  });
  const SB = P('StatusBar'); if (SB) { SB.setBackgroundColor({ color: '#2a1758' }).catch(() => {}); SB.setStyle({ style: 'DARK' }).catch(() => {}); }
  const SP = P('SplashScreen'); if (SP) setTimeout(() => SP.hide().catch(() => {}), 600);
  /* once the user is signed in and data is open */
  let t = setInterval(() => { if (E.sync && E.sync.granted && E.fid) { clearInterval(t); setupLocal(); pushInit(); schedule(); checkUpdate(false); } }, 1500);
})(window.ERP);
