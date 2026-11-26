const { chromium } = require('playwright');
exports.start = async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(async () => {
    const E = window.ERP; E.role = 'owner'; await E.initDB(); await E.reload();
    await E.newFactory('Test Factory', 'TST'); E.role = 'owner'; E.user = 'tester';
    window.log = [];
    window.fill = o => { let d = document.getElementById('__fill'); if (!d) { d = document.createElement('div'); d.id = '__fill'; document.body.appendChild(d) } for (const k in o) { let e = document.getElementById(k); if (!e) { e = document.createElement('input'); e.id = k; d.appendChild(e) } e.value = o[k] } };
    window.toasts = []; const ot = E.toast; E.toast = (m, t) => { window.toasts.push((t || '') + ': ' + m); try { ot(m, t) } catch (e) {} };
    window.chk = () => E.healthChecks().filter(c => !c[0]).map(c => c[1] + ' → ' + c[2]);
    window.tb = () => { const t = E.totals(); let d = 0, c = 0; for (const k in t) { d += t[k].dr; c += t[k].cr } return { d, c, diff: d - c } };
    window.balances = () => { const t = E.totals(), o = {}; for (const k in t) { const b = E.bal(k, t); if (b) o[k + ' ' + (E.acct(k) || {}).name] = b / 100 } return o };
  });
  return { b, p, errs, ev: (f, a) => p.evaluate(f, a) };
};
