/* Notification Center — one system for the browser, the Windows app and the Android app.
   1. ALERTS are worked out from your own data (cheques due, overdue invoices, low stock, late jobs ...). They need no server.
   2. MESSAGES come from other people (owner broadcast, "goods released") through the Firestore collection erp_notify.
   3. DELIVERY: bell + panel inside the app; Windows pop-ups (tray app, taskbar badge); Android notifications
      (scheduled daily digest that also works when the app is closed, plus push); browser notifications.
   Everything is per person and per factory and is kept on the device (settings, read marks, history). */
(E => {
  'use strict';
  const W = window.erpWin || null;                       /* Windows app bridge (windows/preload.js) */
  const AND = () => !!(E.native && E.native.is);         /* Android app (js/native.js) */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const hm = s => { const a = String(s || '0:0').split(':'); return (+a[0] || 0) * 60 + (+a[1] || 0); };
  const R = c => { try { return E.fid ? E.rows(c) : []; } catch (e) { return []; } };
  const me = () => { const u = E.sync && E.sync.user; return ((u && u.email) || (E.profile && E.profile.email) || '').toLowerCase(); };
  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const key = n => 'erp_ntf_' + n + '_' + (E.fid || 'x') + '_' + (me() || 'local');
  const canSend = () => E.role === 'owner' || E.role === 'accountant' || (E.isOwner && E.isOwner());
  const here = () => (location.hash.replace(/^#\/?/, '') || 'dashboard');

  /* ---------------- settings ---------------- */
  const DEF = {
    on: true, sys: true, sound: true, digest: '09:00',
    quiet: { on: false, from: '21:00', to: '07:00' },
    rules: {
      chqDue: { on: true, days: 3 }, chqOver: { on: true }, invOver: { on: true, days: 30 }, billDue: { on: true, days: 30 },
      lowStock: { on: true }, jobLate: { on: true }, quoteExp: { on: true, days: 3 }, prodMiss: { on: false, time: '17:00' },
      offline: { on: true }, backup: { on: true, days: 7 }
    },
    events: { release: true }
  };
  const merge = (a, b) => { const o = {}; for (const k in a) o[k] = (a[k] && typeof a[k] === 'object') ? merge(a[k], (b && b[k]) || {}) : (b && b[k] !== undefined ? b[k] : a[k]); return o; };
  let SET = null, SETK = '';
  const settings = () => { const k = key('set'); if (SET && SETK === k) return SET; SETK = k; SET = merge(DEF, ls.get(k, {})); return SET; };
  const setPath = (p, v) => { const S = settings(), a = p.split('.'); let o = S; for (let i = 0; i < a.length - 1; i++) o = o[a[i]]; o[a[a.length - 1]] = v; ls.set(SETK, S); };

  const RULES = [
    { id: 'chqDue', t: 'Cheques due soon', d: 'Cheques you issue or receive that fall due in the next few days', p: { k: 'days', l: 'days ahead' } },
    { id: 'chqOver', t: 'Cheques past their date', d: 'Pending cheques whose date has already passed' },
    { id: 'invOver', t: 'Overdue customer invoices', d: 'Customer invoices still unpaid after a number of days', p: { k: 'days', l: 'days after invoice date' } },
    { id: 'billDue', t: 'Supplier bills to pay', d: 'Supplier bills still unpaid after a number of days', p: { k: 'days', l: 'days after bill date' } },
    { id: 'lowStock', t: 'Low stock', d: 'Items at or below the minimum level set in Items' },
    { id: 'jobLate', t: 'Late jobs', d: 'Jobs in progress that are past their due date' },
    { id: 'quoteExp', t: 'Quotations expiring', d: 'Quotations close to their valid-until date', p: { k: 'days', l: 'days ahead' } },
    { id: 'prodMiss', t: 'Production not logged', d: 'Reminder if nothing was logged today (Monday to Saturday)', p: { k: 'time', l: 'remind at', type: 'time' } },
    { id: 'offline', t: 'Offline warning', d: 'When this device loses its internet connection' },
    { id: 'backup', t: 'Local backup is old', d: 'Windows app only: the copy in the local database has not been refreshed', p: { k: 'days', l: 'days' }, win: true }
  ];

  /* ---------------- the alert rules ---------------- */
  const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function scan(as, o) {
    o = o || {}; const S = settings(), r = S.rules, out = [], today = E.today(), isToday = as === today && !o.future, m = E.m;
    const add = a => out.push(a);
    if (r.chqDue.on || r.chqOver.on) {
      const ch = R('cheques').filter(c => c.status === 'Pending');
      if (r.chqDue.on) {
        const lim = addDays(as, r.chqDue.days | 0);
        [['out', 'Cheques to be cleared (issued)', 'Make sure the bank account has the funds.', 'warn', '💸'], ['in', 'Cheques to deposit (received)', 'Take them to the bank.', 'info', '🏦']].forEach(([dir, t, tip, lv, ic]) => {
          const l = ch.filter(c => c.dir === dir && c.date >= as && c.date <= lim);
          if (l.length) add({ key: 'chqDue:' + dir, rule: 'chqDue', level: lv, icon: ic, title: t, body: plural(l.length, 'cheque') + ' due within ' + plural(r.chqDue.days | 0, 'day') + ', total ' + m(sum(l, c => c.amount)) + '. ' + tip, n: l.length, route: 'chqdesk' });
        });
      }
      if (r.chqOver.on) {
        const l = ch.filter(c => c.date && c.date < as);
        if (l.length) add({ key: 'chqOver', rule: 'chqOver', level: 'critical', icon: '⚠️', title: 'Cheques past their date', body: plural(l.length, 'cheque') + ' still pending after the cheque date, total ' + m(sum(l, c => c.amount)) + '.', n: l.length, route: 'chqdesk' });
      }
    }
    if (r.invOver.on) {
      const lim = addDays(as, -(r.invOver.days | 0)), l = R('invoices').filter(x => !x.cancelled && (x.total || 0) - (x.paid || 0) > 1 && x.date && x.date <= lim);
      if (l.length) add({ key: 'invOver', rule: 'invOver', level: 'warn', icon: '🧾', title: 'Overdue customer invoices', body: plural(l.length, 'invoice') + ' unpaid for more than ' + plural(r.invOver.days | 0, 'day') + '. To collect: ' + m(sum(l, x => (x.total || 0) - (x.paid || 0))) + '.', n: l.length, route: 'sales' });
    }
    if (r.billDue.on) {
      const lim = addDays(as, -(r.billDue.days | 0)), l = R('purchases').filter(x => !x.cancelled && (x.total || 0) - (x.paid || 0) > 1 && x.date && x.date <= lim);
      if (l.length) add({ key: 'billDue', rule: 'billDue', level: 'warn', icon: '📦', title: 'Supplier bills to pay', body: plural(l.length, 'bill') + ' unpaid for more than ' + plural(r.billDue.days | 0, 'day') + '. To pay: ' + m(sum(l, x => (x.total || 0) - (x.paid || 0))) + '.', n: l.length, route: 'purchases' });
    }
    if (r.lowStock.on && !o.future) {
      const sm = E.stockMap(), l = E.skuList().filter(k => k.min && ((sm[k.itemId + '|' + k.variantId] || { qty: 0 }).qty <= k.min));
      if (l.length) add({ key: 'lowStock', rule: 'lowStock', level: 'warn', icon: '📉', title: 'Low stock', body: plural(l.length, 'item') + ' at or below the minimum: ' + l.slice(0, 3).map(k => k.code || k.name).join(', ') + (l.length > 3 ? ' and ' + (l.length - 3) + ' more' : '') + '.', n: l.length, route: 'stock' });
    }
    if (r.jobLate.on) {
      const l = R('jobs').filter(j => j.status === 'In Progress' && j.due && j.due < as);
      if (l.length) add({ key: 'jobLate', rule: 'jobLate', level: 'warn', icon: '⏰', title: 'Late jobs', body: plural(l.length, 'job') + ' past the due date: ' + l.slice(0, 3).map(j => j.no).join(', ') + (l.length > 3 ? ' and ' + (l.length - 3) + ' more' : '') + '.', n: l.length, route: 'jobs' });
    }
    if (r.quoteExp.on) {
      const lim = addDays(as, r.quoteExp.days | 0), l = R('quotes').filter(q => q.validUntil && q.validUntil >= as && q.validUntil <= lim && q.status !== 'Accepted' && q.status !== 'Rejected');
      if (l.length) add({ key: 'quoteExp', rule: 'quoteExp', level: 'info', icon: '📝', title: 'Quotations expiring', body: plural(l.length, 'quotation') + ' will expire within ' + plural(r.quoteExp.days | 0, 'day') + '.', n: l.length, route: 'quotes' });
    }
    if (isToday && r.prodMiss.on) {
      const now = new Date(), logs = R('prodLogs');
      if (now.getDay() !== 0 && logs.length && now.getHours() * 60 + now.getMinutes() >= hm(r.prodMiss.time) && !logs.some(l => l.date === today))
        add({ key: 'prodMiss', rule: 'prodMiss', level: 'warn', icon: '🏭', title: 'Production not logged today', body: 'Nothing has been entered for today yet.', n: 1, route: 'production' });
    }
    if (isToday && r.offline.on && !navigator.onLine)
      add({ key: 'offline', rule: 'offline', level: 'info', icon: '📡', title: 'You are offline', body: 'Your work is saved on this device and uploads when the connection returns.', n: 1, route: 'syncstatus' });
    if (isToday && r.backup.on && W && W.getSettings) {
      const last = ls.get('erp_localdb_last', null), at = last && last.at ? Date.parse(last.at) : 0;
      if (R('invoices').length + R('journalEntries').length > 0 && (!at || (Date.now() - at) > (r.backup.days | 0) * 864e5))
        add({ key: 'backup', rule: 'backup', level: 'info', icon: '💾', title: 'Local backup is old', body: at ? 'The local database was last refreshed ' + Math.floor((Date.now() - at) / 864e5) + ' days ago.' : 'The local database copy has not been made yet.', n: 1, route: 'localdb' });
    }
    return out;
  }

  /* ---------------- state: read marks and messages ---------------- */
  let ACTIVE = [], MSG = [], MSGK = '', ACK = {}, ACKK = '';
  const loadAck = () => { const k = key('ack'); if (ACKK !== k) { ACKK = k; ACK = ls.get(k, {}); } };
  const isRead = a => { loadAck(); const v = ACK[a.key]; if (!v) return false; const p = v.split('|'); return p[0] === E.today() && (+p[1] || 0) >= a.n; };
  const markRead = a => { loadAck(); ACK[a.key] = E.today() + '|' + a.n; const t = E.today(); for (const k in ACK) if (ACK[k].split('|')[0] !== t) delete ACK[k]; ls.set(ACKK, ACK); };
  const loadMsgs = () => { const k = key('msgs'); if (MSGK !== k) { MSGK = k; MSG = ls.get(k, []); } };
  const saveMsgs = () => ls.set(MSGK, MSG.slice(0, 100));
  function addMessage(m) {
    loadMsgs(); const id = m.id || ('m' + Date.now() + Math.random().toString(36).slice(2, 6));
    if (MSG.some(x => x.id === id)) return null;
    const r = { id, at: m.at || new Date().toISOString(), title: m.title || 'Lanka Slipper ERP', body: m.body || '', route: m.route || '', level: m.level || 'info', by: m.by || '', read: false };
    MSG.unshift(r); saveMsgs(); refreshUI(); return r;
  }
  const unread = () => { loadMsgs(); return ACTIVE.filter(a => !isRead(a)).length + MSG.filter(x => !x.read).length; };

  /* ---------------- delivery ---------------- */
  const quiet = () => { const q = settings().quiet; if (!q.on) return false; const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), f = hm(q.from), t = hm(q.to); return f <= t ? (m >= f && m < t) : (m >= f || m < t); };
  function androidNow(n) {
    const L = E.native && E.native.local && E.native.local(); if (!L) return;
    L.schedule({ notifications: [{ id: 9100 + Math.floor(Math.random() * 800), title: n.title, body: n.body, channelId: n.kind === 'team' ? 'team' : 'alerts', schedule: { at: new Date(Date.now() + 800) }, extra: { route: n.route || '' } }] }).catch(() => {});
  }
  function sys(n, force) {
    const S = settings();
    if (!force && (!S.sys || (quiet() && n.level !== 'critical'))) return false;
    if (W && W.notify) { W.notify({ title: n.title, body: n.body, route: n.route || '', tag: n.tag || '', silent: !S.sound || (quiet() && !force), urgent: n.level === 'critical' }); return true; }
    if (AND()) { androidNow(n); return true; }
    if (window.Notification && Notification.permission === 'granted') {
      const opt = { body: n.body, tag: n.tag || undefined, silent: !S.sound, icon: 'icons/icon.svg', data: { route: n.route || '' } };
      const reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null);
      reg.then(r => { if (r && r.showNotification) r.showNotification(n.title, opt); else { const x = new Notification(n.title, opt); x.onclick = () => { window.focus(); open(n.route); x.close(); }; } }).catch(() => {});
      return true;
    }
    return false;
  }
  function open(route) {
    closePanel();
    if (route && E.R[route]) location.hash = '#/' + route;
  }
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'erp-nav') open(e.data.route); });
  if (W && W.onNavigate) W.onNavigate(r => open(r));

  /* ---------------- the check cycle ---------------- */
  const ready = () => !!(E.fid && E.sync && E.sync.granted);
  let FIRST = true, SEEN = new Set(), LASTCNT = -1, PLANSIG = '', PLANAT = 0;
  function winBadge(n) {
    if (!W || !W.badge) return; let url = '';
    if (n > 0) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#d92d20'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold ' + (n > 9 ? 30 : 38) + 'px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n > 99 ? '99+' : String(n), 32, 35); url = c.toDataURL('image/png'); }
    W.badge({ count: n, overlay: url });
  }
  function tick() {
    if (!ready()) return;
    const S = settings(), today = E.today(); loadAck(); loadMsgs();
    try { ACTIVE = S.on ? scan(today) : []; } catch (e) { console.warn('notify scan', e); ACTIVE = []; }
    const fired = ls.get(key('fired'), {}), now = new Date(), afterDigest = now.getHours() * 60 + now.getMinutes() >= hm(S.digest);
    const fresh = ACTIVE.filter(a => { const f = fired[a.key]; return (!f || f.d !== today || a.n > f.n) && (afterDigest || a.level === 'critical') && !isRead(a); });
    if (fresh.length && !AND()) {
      const crit = fresh.some(a => a.level === 'critical');
      const sent = fresh.length === 1 ? sys({ title: fresh[0].title, body: fresh[0].body, route: fresh[0].route, level: fresh[0].level, tag: fresh[0].key })
        : sys({ title: fresh.length + ' alerts need attention', body: fresh.slice(0, 4).map(a => a.title).join('\n'), route: fresh[0].route, level: crit ? 'critical' : 'info', tag: 'digest' });
      if (sent) { fresh.forEach(a => { fired[a.key] = { d: today, n: a.n }; }); ls.set(key('fired'), fired); }
    }
    const newOnes = ACTIVE.filter(a => !SEEN.has(a.key + '|' + a.n)); ACTIVE.forEach(a => SEEN.add(a.key + '|' + a.n));
    if (!FIRST && newOnes.length && document.visibilityState === 'visible') { E.toast('🔔 ' + (newOnes.length === 1 ? newOnes[0].title : newOnes.length + ' new alerts'), 'success'); ring(); }
    FIRST = false;
    refreshUI();
    if (AND()) { const sig = JSON.stringify([ACTIVE.map(a => a.key + a.n), S]); if (sig !== PLANSIG || Date.now() - PLANAT > 6 * 36e5) { PLANSIG = sig; PLANAT = Date.now(); androidPlan(); } }
  }
  const replan = () => { PLANSIG = ''; };

  /* ---------------- Android: a daily digest scheduled ahead, so it works with the app closed ---------------- */
  async function androidPlan() {
    const n = E.native && E.native.local && E.native.local(); if (!n || !ready()) return;
    if ((await E.native.askPerm(false)) !== 'granted') return;
    const S = settings(), ids = [{ id: 1001 }, { id: 1002 }]; for (let i = 0; i < 8; i++) ids.push({ id: 2000 + i });
    await n.cancel({ notifications: ids }).catch(() => {});
    if (!S.on || !S.sys) return;
    const list = [], h = Math.floor(hm(S.digest) / 60), mi = hm(S.digest) % 60, now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(h, mi, 0, 0); if (d <= now) continue;
      const al = scan(iso(d), { future: i > 0 }); if (!al.length) continue;
      list.push({ id: 2000 + i, channelId: 'alerts', title: al.length === 1 ? al[0].title : al.length + ' alerts · Lanka Slipper ERP', body: al.length === 1 ? al[0].body : al.slice(0, 3).map(a => a.title).join(' · '), largeBody: al.map(a => a.title + ': ' + a.body).join('\n'), schedule: { at: d, allowWhileIdle: true }, extra: { route: al[0].route } });
    }
    if (S.rules.prodMiss.on) {
      const t = S.rules.prodMiss.time.split(':'), d = new Date(); d.setHours(+t[0] || 17, +t[1] || 0, 0, 0); if (d < now) d.setDate(d.getDate() + 1);
      list.push({ id: 1002, channelId: 'reminders', title: 'Daily production', body: "Don't forget to log today's production.", schedule: { at: d, every: 'day', allowWhileIdle: true }, extra: { route: 'production' } });
    }
    if (list.length) await n.schedule({ notifications: list }).catch(e => console.warn('plan', e));
  }

  /* ---------------- team messages (Firestore erp_notify) ---------------- */
  let unsub = null;
  function handleFeed(id, d) {
    if (d.factoryId && d.factoryId !== E.fid) return;
    if (d.to === 'managers' && !(E.role === 'owner' || E.role === 'accountant')) return;
    if (d.by && String(d.by).toLowerCase() === me() && d.kind !== 'test') return;
    const r = addMessage({ id, at: d.at, title: d.title, body: d.body, route: d.route, level: d.level, by: d.by }); if (!r) return;
    E.toast('🔔 ' + r.title + (r.body ? ': ' + r.body : ''), 'success'); ring();
    sys({ title: r.title, body: r.body, route: r.route, level: r.level, kind: 'team', tag: id });
  }
  function listen() {
    if (unsub || !ready() || !window.firebase || !firebase.firestore) return;
    const sk = 'erp_ntf_since_' + (me() || 'local'); let since = ls.get(sk, '') || new Date(Date.now() - 2 * 864e5).toISOString();
    try {
      unsub = firebase.firestore().collection('erp_notify').where('at', '>', since).onSnapshot(s => {
        s.docChanges().forEach(c => { if (c.type !== 'added') return; const d = c.doc.data(); if (d.at && d.at > since) { since = d.at; ls.set(sk, since); } handleFeed(c.doc.id, d); });
      }, err => { console.warn('notify feed', err && err.code); unsub = null; });
    } catch (e) { unsub = null; }
  }
  async function publish(m) {
    if (!window.firebase || !E.fid) throw new Error('Not connected to the cloud');
    const p = firebase.firestore().collection('erp_notify').add({ factoryId: E.fid, title: m.title || 'Lanka Slipper ERP', body: m.body || '', route: m.route || '', level: m.level || 'info', to: m.to || 'all', kind: m.kind || 'message', by: me() || E.user || '', at: new Date().toISOString() });
    await Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error('Could not reach the cloud. Check the internet connection.')), 9000))]);
  }

  /* goods released → tell the other devices (switch off in the Notification Center) */
  const o2 = E.A.saveRel;
  if (o2 && !o2.__ntf) {
    E.A.saveRel = async function (id) {
      const before = {}; R('jobLines').filter(l => l.jobId === id).forEach(l => { before[l.id] = l.released || 0; });
      await o2.apply(this, arguments);
      try {
        const rel = R('jobLines').filter(l => l.jobId === id && (l.released || 0) - (before[l.id] || 0) > 0.0001);
        if (rel.length && settings().events.release && canSend()) {
          const j = R('jobs').find(x => x.id === id) || {}, packs = Math.round(sum(rel, l => (l.released || 0) - (before[l.id] || 0)) * 100) / 100;
          publish({ title: 'Goods released', body: (j.no ? j.no + ': ' : '') + packs + ' pack(s) released to finished stock (' + rel.slice(0, 3).map(l => l.code).join(', ') + (rel.length > 3 ? '…' : '') + ')', route: 'stock', kind: 'event' }).catch(() => {});
        }
      } catch (e) { console.warn('notify release', e); }
    };
    E.A.saveRel.__ntf = 1;
    if (o2.__lbl) E.A.saveRel.__lbl = 1;
  }

  /* ---------------- bell + panel ---------------- */
  const css = `
.nbell{position:relative;font-size:16px;line-height:1;padding:7px 10px}
.nbadge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#d92d20;color:#fff;font:700 10px/17px Arial,sans-serif;text-align:center;display:none;box-shadow:0 0 0 2px var(--bg,#fff)}
.nbell.has .nbadge{display:block}
.nbell.ring{animation:nring .9s ease}
@keyframes nring{0%,100%{transform:rotate(0)}15%{transform:rotate(16deg)}30%{transform:rotate(-14deg)}45%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}}
@media (prefers-reduced-motion:reduce){.nbell.ring{animation:none}}
#npanel{position:fixed;z-index:1000001;top:58px;right:14px;width:390px;max-width:calc(100vw - 20px);max-height:78vh;display:none;flex-direction:column;background:var(--s,#fff);color:var(--tx,#1b1b1f);border:1px solid var(--bd,#ddd);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}
#npanel.o{display:flex}
.np-h{display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:1px solid var(--bd,#ddd)}.np-h b{flex:1;font-size:15px}
.np-h button,.np-tabs button{background:none;border:0;color:inherit;cursor:pointer;font:inherit}
.np-h .lnk{font-size:12px;color:var(--ac,#6d3df0);padding:4px 6px}
.np-tabs{display:flex;border-bottom:1px solid var(--bd,#ddd)}
.np-tabs button{flex:1;padding:9px 6px;font-size:13px;opacity:.65;border-bottom:2px solid transparent}
.np-tabs button.on{opacity:1;font-weight:700;border-bottom-color:var(--ac,#6d3df0)}
.np-tabs i{font-style:normal;background:#d92d20;color:#fff;border-radius:9px;padding:0 6px;font-size:10px;margin-left:4px}
.np-b{overflow:auto;flex:1;min-height:120px}
.ni{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid var(--bd,#eee);cursor:pointer;border-left:4px solid transparent}
.ni:hover{background:rgba(127,127,127,.08)}
.ni.critical{border-left-color:#d92d20}.ni.warn{border-left-color:#f5a623}.ni.info{border-left-color:#3b82f6}
.ni.rd{opacity:.55}
.ni .ic{font-size:20px;line-height:1.2}.ni .tx{flex:1;min-width:0}.ni .tt{font-weight:700;font-size:13px}.ni .bd{font-size:12.5px;margin-top:2px;opacity:.85;line-height:1.4}.ni .tm{font-size:11px;opacity:.55;margin-top:3px}
.ni .ok{background:none;border:0;cursor:pointer;opacity:.5;font-size:15px;align-self:flex-start}.ni .ok:hover{opacity:1}
.np-e{padding:34px 18px;text-align:center;opacity:.65;font-size:13px}
@media (max-width:720px){#npanel{top:0;right:0;left:0;bottom:0;width:auto;max-width:none;max-height:none;border-radius:0;border:0;padding-top:env(safe-area-inset-top,0)}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const tr = document.querySelector('header.top .tr');
  const bell = document.createElement('button'); bell.className = 'btn nbell'; bell.id = 'nbell'; bell.dataset.a = 'nToggle'; bell.title = 'Notifications'; bell.setAttribute('aria-label', 'Notifications'); bell.innerHTML = '🔔<span class="nbadge" id="nbadge"></span>';
  if (tr) tr.insertBefore(bell, tr.firstChild);
  const panel = document.createElement('div'); panel.id = 'npanel'; document.body.appendChild(panel);
  let TAB = 'alerts';
  const esc = s => E.esc(String(s == null ? '' : s));
  const ago = at => { const s = Math.max(0, (Date.now() - Date.parse(at)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : new Date(at).toLocaleDateString(); };
  function ring() { bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring'); }
  function renderPanel() {
    loadMsgs(); const ua = ACTIVE.filter(a => !isRead(a)).length, um = MSG.filter(x => !x.read).length;
    let body;
    if (TAB === 'alerts') {
      const l = ACTIVE.slice().sort((a, b) => (isRead(a) - isRead(b)) || ({ critical: 0, warn: 1, info: 2 }[a.level] - { critical: 0, warn: 1, info: 2 }[b.level]));
      body = l.length ? l.map(a => `<div class="ni ${a.level}${isRead(a) ? ' rd' : ''}" data-a="nGo" data-id="${esc(a.key)}"><span class="ic">${a.icon}</span><div class="tx"><div class="tt">${esc(a.title)}</div><div class="bd">${esc(a.body)}</div></div>${isRead(a) ? '' : `<button class="ok" data-a="nRead" data-id="${esc(a.key)}" title="Mark as read">✓</button>`}</div>`).join('') : '<div class="np-e">✅ Nothing needs your attention right now.</div>';
    } else {
      body = MSG.length ? MSG.slice(0, 40).map(x => `<div class="ni ${x.level}${x.read ? ' rd' : ''}" data-a="nGoM" data-id="${esc(x.id)}"><span class="ic">💬</span><div class="tx"><div class="tt">${esc(x.title)}</div><div class="bd">${esc(x.body)}</div><div class="tm">${esc(ago(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</div></div></div>`).join('') : '<div class="np-e">No messages yet. Messages from the owner and team events appear here.</div>';
    }
    panel.innerHTML = `<div class="np-h"><b>🔔 Notifications</b><button class="lnk" data-a="nReadAll">Mark all read</button><button class="lnk" data-a="nSettings">⚙ Settings</button><button data-a="nClose" aria-label="Close" style="font-size:16px;padding:2px 6px">✕</button></div>
      <div class="np-tabs"><button data-a="nTab" data-id="alerts" class="${TAB === 'alerts' ? 'on' : ''}">Alerts${ua ? '<i>' + ua + '</i>' : ''}</button><button data-a="nTab" data-id="msgs" class="${TAB === 'msgs' ? 'on' : ''}">Messages${um ? '<i>' + um + '</i>' : ''}</button></div><div class="np-b">${body}</div>`;
  }
  function refreshUI() {
    const n = unread(); bell.classList.toggle('has', n > 0); E.$('nbadge').textContent = n > 99 ? '99+' : n;
    if (n > LASTCNT && LASTCNT >= 0) ring(); if (n !== LASTCNT) winBadge(n); LASTCNT = n;
    document.title = (n ? '(' + n + ') ' : '') + 'Lanka Slipper ERP';
    if (panel.classList.contains('o')) renderPanel();
  }
  const closePanel = () => { const was = panel.classList.contains('o'); panel.classList.remove('o'); return was; };
  document.addEventListener('click', e => { if (panel.classList.contains('o') && !e.target.closest('#npanel') && !e.target.closest('#nbell')) closePanel(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  E.A.nToggle = () => { if (panel.classList.contains('o')) return closePanel(); tick(); TAB = ACTIVE.length || !MSG.some(x => !x.read) ? 'alerts' : 'msgs'; renderPanel(); panel.classList.add('o'); };
  E.A.nClose = () => closePanel();
  E.A.nTab = id => { TAB = id; renderPanel(); };
  E.A.nGo = id => { const a = ACTIVE.find(x => x.key === id); if (!a) return; markRead(a); refreshUI(); open(a.route); };
  E.A.nRead = (id, e) => { if (e && e.stopPropagation) e.stopPropagation(); const a = ACTIVE.find(x => x.key === id); if (a) { markRead(a); refreshUI(); } };
  E.A.nGoM = id => { loadMsgs(); const x = MSG.find(m => m.id === id); if (!x) return; x.read = true; saveMsgs(); refreshUI(); open(x.route); };
  E.A.nReadAll = () => { ACTIVE.forEach(markRead); loadMsgs(); MSG.forEach(m => { m.read = true; }); saveMsgs(); refreshUI(); };
  E.A.nSettings = () => open('notify');
  E.A.goNotify = () => open('notify');

  /* ---------------- screen: System > Notification Center ---------------- */
  let WS = null;
  if (W && W.getSettings) W.getSettings().then(s => { WS = s; if (here() === 'notify') E.go(); }).catch(() => {});
  const permState = () => W ? 'Windows pop-ups' : AND() ? ((E.native.state.perm === 'granted') ? 'On' : E.native.state.perm === 'denied' ? 'Blocked' : 'Not enabled') : (window.Notification ? (Notification.permission === 'granted' ? 'On' : Notification.permission === 'denied' ? 'Blocked' : 'Not enabled') : 'Not supported');
  E.nav('System', 'notify', '🔔', 'Notification Center');
  E.route('notify', 'Notification Center', () => {
    const S = settings(); loadMsgs();
    const chk = (p, v, t) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-n="${p}" ${v ? 'checked' : ''} style="width:auto"> ${t}</label>`;
    const rows = RULES.filter(x => !x.win || W).map(x => { const c = S.rules[x.id]; return `<tr><td style="width:34px"><input type="checkbox" data-n="rules.${x.id}.on" ${c.on ? 'checked' : ''}></td><td><b>${esc(x.t)}</b><div class="muted" style="font-size:12px">${esc(x.d)}</div></td><td class="r" style="white-space:nowrap">${x.p ? `<input class="fs" style="width:${x.p.type === 'time' ? 110 : 70}px;text-align:right" type="${x.p.type || 'number'}" ${x.p.type ? '' : 'min="1" max="365"'} data-n="rules.${x.id}.${x.p.k}" value="${esc(c[x.p.k])}"> <span class="muted" style="font-size:12px">${esc(x.p.l)}</span>` : ''}</td></tr>`; }).join('');
    const dev = W ? `<div class="card"><h3>This PC (Windows app)</h3><p class="muted">Alerts appear as Windows pop-ups and a red number on the taskbar icon. For this the app must keep running, so closing the window sends it to the system tray (next to the clock).</p>
        <div style="display:grid;gap:8px;margin:10px 0">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-a="nWinTray" ${WS && WS.tray === false ? '' : 'checked'} style="width:auto"> Keep running in the system tray when the window is closed (recommended)</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-a="nWinAuto" ${WS && WS.autostart ? 'checked' : ''} style="width:auto"> Start Slipper ERP when Windows starts (opens quietly in the tray)</label></div>
        <p class="muted" style="font-size:12px">Use the installer version (Slipper ERP Setup). The portable version may not show Windows pop-ups.</p></div>`
      : AND() ? `<div class="card"><h3>This phone (Android app)</h3><p class="muted">A daily digest is scheduled on the phone, so it arrives even when the app is closed and the phone is offline. Team messages arrive as push notifications.</p><div class="bar"><button class="btn p" data-a="mobEnable">Allow notifications</button></div><p class="muted" style="font-size:12px">If alerts do not arrive, open Android Settings → Apps → Slipper ERP → Battery and choose “Unrestricted”.</p></div>`
      : `<div class="card"><h3>This browser</h3><p class="muted">Pop-ups work while the page is open. For alerts when you are away, use the Windows or Android app.</p><div class="bar"><button class="btn p" data-a="nBrowserPerm">Allow browser notifications</button></div></div>`;
    const send = canSend() ? `<div class="card"><h3>Send a message to the team</h3><div class="g2"><div class="f">Title<input id="n_t" value="Lanka Slipper ERP"></div><div class="f">Send to<select id="n_to"><option value="all">Everyone with access to this factory</option><option value="managers">Owner and accountants only</option></select></div></div>
        <div class="f">Message<textarea id="n_m" rows="2" placeholder="e.g. Month-end close tomorrow at 10:00"></textarea></div>
        <div class="bar"><select id="n_lv" class="fs" style="width:auto"><option value="info">Normal</option><option value="critical">Urgent (pop-up even in quiet hours)</option></select><button class="btn p" data-a="nSend">Send message</button></div>
        <p class="muted" style="font-size:12px">Devices that are running (Windows tray, open apps, browsers) receive it straight away. Phones with the app closed need the optional Cloud Function (functions/index.js).</p></div>` : '';
    return `<div class="kp">${E.kpi('Alerts now', ACTIVE.length, ACTIVE.filter(a => a.level === 'critical').length + ' urgent')}${E.kpi('Unread messages', MSG.filter(x => !x.read).length)}${E.kpi('This device', W ? 'Windows app' : AND() ? 'Android app' : 'Browser', permState())}</div>
    <div class="card"><h3>Notifications</h3><div style="display:grid;gap:8px">${chk('on', S.on, 'Alerts on')}${chk('sys', S.sys, 'Show pop-ups / system notifications')}${chk('sound', S.sound, 'Play a sound')}${chk('events.release', S.events.release, 'Tell the other devices when I release goods')}</div>
      <div class="g2" style="margin-top:12px"><div class="f">Daily digest time<input type="time" data-n="digest" value="${esc(S.digest)}"></div><div class="f">Quiet hours (no pop-ups, except urgent)<div style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-n="quiet.on" ${S.quiet.on ? 'checked' : ''} style="width:auto"><input type="time" data-n="quiet.from" value="${esc(S.quiet.from)}"> to <input type="time" data-n="quiet.to" value="${esc(S.quiet.to)}"></div></div></div>
      <div class="bar" style="margin-top:12px"><button class="btn p" data-a="nTest">🔔 Send a test notification</button></div></div>
    ${dev}
    <div class="card"><h3>What should alert me</h3><div class="tw"><table><tbody>${rows}</tbody></table></div><p class="muted" style="font-size:12px;margin-top:8px">These settings are for you on this device. Read marks reset each day, so open items remind you again tomorrow.</p></div>
    ${send}
    <div class="card"><h3>Recent messages</h3>${MSG.length ? '<div class="tw"><table><tbody>' + MSG.slice(0, 15).map(x => `<tr><td style="white-space:nowrap">${esc(ago(x.at))}</td><td><b>${esc(x.title)}</b> ${esc(x.body)}</td></tr>`).join('') + '</tbody></table></div><div class="bar"><button class="btn" data-a="nClearMsgs">Clear</button></div>' : '<p class="muted">None yet.</p>'}</div>`;
  });
  E.hooks.push(e => {
    const t = e.target, n = t && t.dataset && t.dataset.n; if (!n) return;
    setPath(n, t.type === 'checkbox' ? t.checked : t.type === 'number' ? (parseFloat(t.value) || 0) : t.value);
    replan(); tick();
  });
  E.A.nTest = async () => {
    addMessage({ title: 'Test notification', body: 'If you can see this, notifications work on this device.', route: 'notify' }); E.toast('🔔 Test notification sent', 'success'); ring();
    if (AND()) { const p = await E.native.askPerm(true); if (p !== 'granted') return E.toast('Notifications are blocked in the phone settings', 'error'); }
    else if (!W && window.Notification && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
    if (!sys({ title: 'Test notification', body: 'If you can see this, notifications work on this device.', route: 'notify', level: 'info', kind: 'team', tag: 'test' }, true)) E.toast('No system pop-up: allow notifications for this browser first', 'error');
  };
  E.A.nBrowserPerm = async () => { if (!window.Notification) return E.toast('This browser cannot show notifications', 'error'); try { await Notification.requestPermission(); } catch (e) {} E.go(); E.toast(Notification.permission === 'granted' ? 'Browser notifications are on' : 'Notifications are blocked. Allow them in the site settings of your browser.', Notification.permission === 'granted' ? 'success' : 'error'); };
  E.A.nWinTray = (id, e) => W && W.setSettings({ tray: e.target.checked }).then(s => { WS = s; E.toast(s.tray ? 'The app will keep running in the tray' : 'The app will quit when the window is closed', 'success'); });
  E.A.nWinAuto = (id, e) => W && W.setSettings({ autostart: e.target.checked }).then(s => { WS = s; E.toast(s.autostart ? 'Slipper ERP will start with Windows' : 'Automatic start is off', 'success'); });
  E.A.nSend = async () => {
    try { const t = E.val('n_t').trim(), b = E.val('n_m').trim(); if (!b) throw new Error('Write a message'); await publish({ title: t, body: b, to: E.val('n_to'), level: E.val('n_lv'), route: '' }); E.$('n_m').value = ''; E.toast('Message sent', 'success'); }
    catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.nClearMsgs = () => { loadMsgs(); MSG = []; saveMsgs(); refreshUI(); E.go(); };

  E.notify = { scan, tick, addMessage, publish, open, closePanel, androidPlan, sys, state: () => ({ active: ACTIVE, messages: MSG, settings: settings() }) };

  /* ---------------- start ---------------- */
  setInterval(() => { if (ready()) { tick(); listen(); } }, 60000);
  const boot = setInterval(() => { if (ready()) { clearInterval(boot); tick(); listen(); } }, 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  window.addEventListener('online', () => setTimeout(tick, 500)); window.addEventListener('offline', () => setTimeout(tick, 500));
  let lastFid = ''; setInterval(() => { if (E.fid !== lastFid) { lastFid = E.fid; SEEN = new Set(); FIRST = true; LASTCNT = -1; PLANSIG = ''; if (ready()) tick(); } }, 3000);
})(window.ERP);
