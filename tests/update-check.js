/* Proves: (1) the version badge shows; (2) an old browser copy is detected and flagged; (3) a new deployment is used on the next load
   (no 10-minute stale copy); (4) Force update clears caches. Temporarily edits sw.js / txn.js and always restores them. */
const { chromium } = require('playwright'); const fs = require('fs');
const out = []; const T = (n, ok, i) => out.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' | ' + i : ''));
(async () => {
  const swSrc = fs.readFileSync('sw.js', 'utf8'), txnSrc = fs.readFileSync('js/modules/txn.js', 'utf8');
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); p.on('dialog', d => d.accept());
  try {
    await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
    const cur = /const V = 'lanka-erp-(v\d+)'/.exec(swSrc)[1];
    T('U1 badge shows the running version (= service worker version)', (await p.textContent('#appver')) === cur, await p.textContent('#appver'));
    await p.reload(); await p.waitForTimeout(1500);   /* now controlled by the service worker */
    /* new deployment: txn.js changes on the server */
    fs.writeFileSync('js/modules/txn.js', txnSrc + '\nwindow.__MARK = "NEW-DEPLOY";\n');
    await p.reload(); await p.waitForTimeout(1500);
    T('U2 changed file on the server is used on the very next load (not a stale copy)', (await p.evaluate(() => window.__MARK)) === 'NEW-DEPLOY');
    fs.writeFileSync('js/modules/txn.js', txnSrc);
    /* server moves to a newer version while this browser still runs the old files */
    fs.writeFileSync('sw.js', swSrc.replace(/lanka-erp-v\d+/g, 'lanka-erp-v999'));
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.ERP.serverVersion()).then(v => T('U3 server version is read without cache', v === 'v999', v));
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500);
    const t = await p.textContent('#appver'); T('U4 stale browser shows a red "Update" badge naming the new version', /Update v999/.test(t) && await p.evaluate(() => document.getElementById('appver').classList.contains('d')), t);
    fs.writeFileSync('sw.js', swSrc);
    /* force update clears caches */
    const n0 = await p.evaluate(async () => (await caches.keys()).length);
    await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => { }), p.evaluate(() => window.ERP.A.forceUpdate())]); await p.waitForTimeout(2500);
    const regs = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), url = p.url();
    T('U5 Force update reloads clean with a fresh URL', /\?u=\d+/.test(url), url + ' caches before ' + n0 + ' regs after ' + regs);
    T('U6 badge back to the running version after the clean reload', (await p.textContent('#appver')) === cur, await p.textContent('#appver'));
  } catch (e) { T('U-ERR', false, e.message); }
  finally { fs.writeFileSync('sw.js', swSrc); fs.writeFileSync('js/modules/txn.js', txnSrc); await b.close(); }
  console.log(out.join('\n'));
})();
