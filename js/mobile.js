/* Phone layer: drawer menu, bottom tabs, offline label, "update ready" prompt. Does nothing on desktop widths. */
(E=>{
  const top = document.querySelector('.top'), tr = top && top.querySelector('b');
  if (!top || !tr) return;
  const btn = document.createElement('button'); btn.id = 'mbtn'; btn.className = 'btn'; btn.setAttribute('aria-label', 'Menu'); btn.textContent = '☰';
  top.insertBefore(btn, top.firstChild);
  const scrim = document.createElement('div'); scrim.id = 'mscrim'; document.body.appendChild(scrim);
  const TABS = [['dashboard', '🏠', 'Home'], ['production', '🏭', 'Production'], ['sales', '🛒', 'Sales'], ['inventory', '📦', 'Stock']];
  const bar = document.createElement('nav'); bar.id = 'mbar';
  bar.innerHTML = TABS.map(t => `<button data-tab="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('') + '<button data-tab="__menu"><span>☰</span>More</button>';
  document.body.appendChild(bar);
  const close = () => document.body.classList.remove('mopen');
  const mark = () => { const cur = location.hash.replace(/^#\/?/, '') || 'dashboard'; bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === cur)); };
  btn.onclick = () => document.body.classList.toggle('mopen');
  scrim.onclick = close;
  bar.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.tab === '__menu') return document.body.classList.toggle('mopen'); close(); if (E.R[b.dataset.tab]) location.hash = '#/' + b.dataset.tab; else E.toast('That screen is not available', 'error'); };
  /* choosing a screen in the drawer closes it */
  document.addEventListener('click', e => { if (e.target.closest('.sb [data-nav]')) setTimeout(close, 0); });
  addEventListener('hashchange', () => { close(); mark(); window.scrollTo(0, 0); });
  mark();
  const off = () => document.body.classList.toggle('offline', !navigator.onLine);
  addEventListener('online', off); addEventListener('offline', off); off();
  /* new version of the web app downloaded by the service worker */
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => {
    if (!r) return;
    const ask = w => w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { E.toast('Update ready. Tap to reload', 'success'); const t = document.querySelector('#ts .ts:last-child'); if (t) { t.style.cursor = 'pointer'; t.onclick = () => location.reload(); } } });
    if (r.waiting && navigator.serviceWorker.controller) E.toast('Update ready. Reload the app to use it', 'success');
    r.addEventListener('updatefound', () => r.installing && ask(r.installing));
    r.update().catch(() => {});
  });
})(window.ERP);
