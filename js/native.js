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
      M.addListener('notificationReceived', ev => { const n = ev.notification || {}; E.toast((n.title ? n.title + ': ' : '') + (n.body || ''), 'success'); });
      M.addListener('notificationActionPerformed', ev => { const d = (ev.notification && ev.notification.data) || {}; if (d.route && E.R[d.route]) location.hash = '#/' + d.route; });
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
    <div class="card"><h3>Reminders on this phone</h3>
      ${chk('chq', true, 'mobChq', 'Daily 9:00 reminder when cheques are due within 3 days')}
      ${chk('prod', false, 'mobProd', "Daily reminder to log production at <input id=\"m_pt\" type=\"time\" value=\"" + (LS.get('prodTime', '17:00')) + "\" class=\"fs\" style=\"width:auto\">")}
      <div class="bar"><button class="btn p" data-a="mobEnable">Enable notifications</button><button class="btn" data-a="mobTest">Send test</button><button class="btn" data-a="mobCheck">Check for app update</button></div>
      ${native ? '' : '<p class="muted">Notifications and updates work in the Android app. In a browser only the layout is mobile-friendly.</p>'}</div>
    ${E.isOwner && E.isOwner() ? `<div class="card"><h3>Send a message to every phone</h3><div class="f">Title<input id="m_bt" value="Lanka Slipper ERP"></div><div class="f">Message<textarea id="m_bm" rows="2"></textarea></div><button class="btn p" data-a="mobBroadcast">Send to all devices</button><p class="muted" style="margin-top:8px">Needs the Cloud Function in functions/index.js deployed (see ANDROID.md).</p></div>` : ''}`;
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
    const mw = document.getElementById('mw');
    if (mw && mw.classList.contains('o')) return E.closeM();
    if (document.body.classList.contains('mopen')) return document.body.classList.remove('mopen');
    if ((location.hash.replace(/^#\/?/, '') || 'dashboard') !== 'dashboard') return history.back();
    A.exitApp();
  });
  const SB = P('StatusBar'); if (SB) { SB.setBackgroundColor({ color: '#2a1758' }).catch(() => {}); SB.setStyle({ style: 'DARK' }).catch(() => {}); }
  const SP = P('SplashScreen'); if (SP) setTimeout(() => SP.hide().catch(() => {}), 600);
  /* once the user is signed in and data is open */
  let t = setInterval(() => { if (E.sync && E.sync.granted && E.fid) { clearInterval(t); pushInit(); schedule(); checkUpdate(false); } }, 1500);
})(window.ERP);
