/* Grouped dropdown menu (ported from the Gem ERP menu).
   Sidebar: animated dropdown sections with icons, item counts and a filter box.
   Top bar: breadcrumb "Group / Page" where each part opens a dropdown list of screens.
   It reads the menu the router builds, so every screen and every role rule keeps working. */
(E => {
  const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (x) { return d; } };
  const SV = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let open = LS('erp_nav2', {}), q = '', groups = [], lastGroup = '';

  /* ---- read the menu the router just built ---- */
  function read() {
    const nav = document.getElementById('nav'); if (!nav) return;
    groups = [...nav.querySelectorAll(':scope > .ng')].map(h => {
      const b = h.nextElementSibling, t = (h.querySelector('span') || h).textContent.trim(), sp = t.indexOf(' ');
      return {
        id: h.dataset.grp, ico: sp > 0 ? t.slice(0, sp) : '•', name: sp > 0 ? t.slice(sp + 1) : t,
        items: [...b.querySelectorAll('.ni')].map(n => {
          const s = n.querySelectorAll('span');
          return { id: n.dataset.nav, ico: s[0] ? s[0].textContent : '', label: s[1] ? s[1].textContent : n.dataset.nav, soon: n.classList.contains('soon'), on: n.classList.contains('on') };
        })
      };
    });
  }
  const curGroup = () => groups.find(g => g.items.some(i => i.on));

  /* ---- sidebar ---- */
  function draw() {
    const nav = document.getElementById('nav'); if (!nav) return;
    const ql = q.trim().toLowerCase(), cg = curGroup();
    if (cg && cg.id !== lastGroup) { open[cg.id] = true; SV('erp_nav2', open); }
    lastGroup = cg ? cg.id : lastGroup;
    const h = groups.map(g => {
      const its = g.items.filter(i => !ql || (i.label + ' ' + g.name).toLowerCase().includes(ql));
      if (!its.length) return '';
      const o = ql ? true : open[g.id] === true;
      return `<div class="mg ${o ? 'open' : ''}" data-g="${esc(g.id)}"><button type="button" class="mgh" aria-expanded="${o}"><span class="gi">${g.ico}</span><span class="gn">${esc(g.name)}</span><em>${g.items.length}</em><i class="cv">▸</i></button>`
        + `<div class="mgl"><div>${its.map(i => `<div class="ni ${i.on ? 'on' : ''} ${i.soon ? 'soon' : ''}" data-nav="${esc(i.id)}"><span>${i.ico}</span><span>${esc(i.label)}</span></div>`).join('')}</div></div></div>`;
    }).join('');
    nav.innerHTML = h || '<div class="nomatch">No menu item matches.</div>';
  }

  /* ---- dropdown panel ---- */
  const DD = {
    el: null, a: null,
    show(a, html) {
      DD.close();
      const d = document.createElement('div'); d.className = 'nmdd'; d.innerHTML = html; document.body.appendChild(d);
      const r = a.getBoundingClientRect(), w = d.offsetWidth, hh = d.offsetHeight;
      d.style.left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - w - 8)) + 'px';
      let y = r.bottom + 6; if (y + hh > innerHeight - 8) y = Math.max(8, innerHeight - hh - 8); d.style.top = y + 'px';
      requestAnimationFrame(() => d.classList.add('on'));
      a.setAttribute('aria-expanded', 'true'); DD.el = d; DD.a = a;
      const f = d.querySelector('.ddi.on') || d.querySelector('.ddi'); if (f) f.focus({ preventScroll: true });
    },
    close() { if (DD.el) { DD.el.remove(); DD.el = null; } if (DD.a) { DD.a.setAttribute('aria-expanded', 'false'); DD.a = null; } }
  };
  const ddItem = i => `<button type="button" class="ddi ${i.on ? 'on' : ''} ${i.soon ? 'soon' : ''}" data-nav="${esc(i.id)}"><span class="ic">${i.ico}</span><span>${esc(i.label)}</span></button>`;

  /* ---- breadcrumb ---- */
  function crumb() {
    const top = document.querySelector('.top'), pt = document.getElementById('pt'); if (!top || !pt) return;
    let c = document.getElementById('crumb');
    if (!c) { c = document.createElement('div'); c.id = 'crumb'; c.className = 'crumb'; top.insertBefore(c, pt); top.classList.add('hascrumb'); }
    const g = curGroup(), page = pt.textContent;
    c.innerHTML = (g ? `<button type="button" class="cr g" data-dd="groups" aria-haspopup="true" aria-expanded="false"><span>${g.ico} ${esc(g.name)}</span><i class="cv">▾</i></button><span class="sl">/</span>` : '')
      + `<button type="button" class="cr p" data-dd="pages" aria-haspopup="true" aria-expanded="false"><span>${esc(page)}</span><i class="cv">▾</i></button>`;
  }

  function enhance() {
    try {
      read(); draw(); crumb(); DD.close();
      const sb = document.querySelector('.sb'), nav = document.getElementById('nav');
      if (sb && nav && !document.getElementById('mf')) {
        const w = document.createElement('div'); w.className = 'sbf';
        w.innerHTML = '<input id="mf" type="search" placeholder="Filter menu…  ( / )" aria-label="Filter menu" autocomplete="off">';
        sb.insertBefore(w, nav);
        const mf = w.firstChild;
        mf.addEventListener('input', () => { q = mf.value; draw(); });
        mf.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { const f = document.querySelector('#nav .ni:not(.soon)'); if (f) { location.hash = '#/' + f.dataset.nav; mf.value = ''; q = ''; draw(); mf.blur(); } }
          if (ev.key === 'Escape') { mf.value = ''; q = ''; draw(); mf.blur(); }
        });
      }
    } catch (e) { console.warn('navmenu', e); }
  }

  /* ---- events (once) ---- */
  document.addEventListener('click', ev => {
    const gh = ev.target.closest('#nav .mgh');
    if (gh) {
      const mg = gh.parentElement, id = mg.dataset.g, o = !mg.classList.contains('open');
      mg.classList.toggle('open', o); gh.setAttribute('aria-expanded', String(o));
      if (!q) { open[id] = o; SV('erp_nav2', open); }
      return;
    }
    const b = ev.target.closest('#crumb [data-dd]');
    if (b) {
      if (DD.a === b) return DD.close();
      const g = curGroup();
      if (b.dataset.dd === 'groups') DD.show(b, groups.map(x => `<div class="ddl">${x.ico} ${esc(x.name)}</div>` + x.items.map(ddItem).join('')).join(''));
      else DD.show(b, g ? `<div class="ddl">${g.ico} ${esc(g.name)}</div>` + g.items.map(ddItem).join('') : '');
      return;
    }
    if (DD.el && DD.el.contains(ev.target)) { setTimeout(() => DD.close(), 0); return; }
    if (DD.el) DD.close();
  });
  document.addEventListener('keydown', ev => {
    if (DD.el) {
      if (ev.key === 'Escape') { const a = DD.a; DD.close(); if (a) a.focus(); return; }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault(); const l = [...DD.el.querySelectorAll('.ddi')], i = l.indexOf(document.activeElement);
        l[(i + (ev.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus();
      }
      return;
    }
    const t = ev.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (!typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key === '/') { const mf = document.getElementById('mf'); if (mf) { ev.preventDefault(); document.body.classList.add('mopen'); mf.focus(); } }
  });
  addEventListener('resize', () => DD.close());
  addEventListener('hashchange', enhance);   /* the router's own listener runs first, then this one */

  const go = E.go;
  E.go = function () { const r = go.apply(this, arguments); enhance(); return r; };
})(window.ERP);
