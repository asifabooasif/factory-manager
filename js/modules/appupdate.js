/* APP VERSION + UPDATE CHECK.
   Shows the version that is really running (top bar badge), compares it with the version on the server and, when the browser is
   still running old files, shows a red "Update available" badge. One tap clears the offline cache and reloads the newest files. */
(E => {
  const VER = 'v101'; window.APP_VERSION = VER; E.version = VER;
  const badge = () => document.getElementById('appver');
  const mount = () => {
    if (badge()) return;
    const tr = document.querySelector('header.top .tr'); if (!tr) return;
    const b = document.createElement('button'); b.id = 'appver'; b.className = 'btn'; b.dataset.a = 'forceUpdate';
    b.style.cssText = 'font-size:11px;padding:3px 8px'; b.title = 'App version. Tap to clear the offline cache and load the newest files.'; b.textContent = VER;
    tr.insertBefore(b, tr.firstChild);
  };
  E.A.forceUpdate = async () => {
    if (!confirm('Load the newest version now?\n\nThis clears the offline copy of the app on this device and reloads it. Your data is not touched.')) return;
    try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); } catch (e) { }
    try { const ks = await caches.keys(); for (const k of ks) await caches.delete(k); } catch (e) { }
    location.replace(location.pathname + '?u=' + Date.now());
  };
  /* what the server has right now (never from cache) */
  E.serverVersion = async () => { try { const r = await fetch('sw.js?t=' + Date.now(), { cache: 'no-store' }); const m = /const V = 'lanka-erp-(v[0-9]+)'/.exec(await r.text()); return m ? m[1] : ''; } catch (e) { return ''; } };
  const check = async () => {
    mount(); const b = badge(); if (!b) return;
    const sv = await E.serverVersion();
    if (sv && sv !== VER) { b.textContent = '⬆ Update ' + sv; b.classList.add('d'); b.title = 'This device runs ' + VER + ' but the server has ' + sv + '. Tap to update.'; try { E.toast('A newer version (' + sv + ') is available. Tap the red badge at the top to update.', 'warning'); } catch (e) { } }
    else { b.textContent = VER; b.classList.remove('d'); b.title = 'You are on the newest version (' + VER + '). Tap to reload clean.'; }
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(check, 800)); if (document.readyState !== 'loading') setTimeout(check, 800);
  setInterval(mount, 3000);                       /* the header can be re-drawn; keep the badge there */
  setInterval(check, 10 * 60 * 1000);             /* long-open tabs notice a new deployment */
})(window.ERP);
