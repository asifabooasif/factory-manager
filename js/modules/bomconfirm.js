/* BOM confirmation — one shared review screen shown BEFORE a job is created or materials are issued by BOM.
   Shows every article with its bill of materials, stock on hand, the cost basis and the value, plus miscellaneous costs.
   For each material you can change the quantity and choose the cost basis (average / latest purchase price / typed price) FOR THIS TIME,
   and decide whether the change also updates the BOM for future jobs. Nothing is posted until you press Confirm. */
(E => {
  const q3 = x => Math.round(x * 1000) / 1000;
  const item = id => E.D.items.find(x => x.id === id);
  const latest = (iid, vid) => {
    let b = null;
    E.rows('purchases').filter(p => !p.cancelled && !p.opening).forEach(p => (p.lines || []).forEach(l => { if (l.itemId === iid && (l.variantId || '') === (vid || '') && l.rate > 0 && (!b || p.date >= b.d)) b = { d: p.date, r: l.rate }; }));
    return b ? b.r : ((item(iid) || {}).buyPrice || 0);
  };
  let S = null;

  function build(cfg) {
    return cfg.groups.map((g, gi) => {
      const it = item(g.itemId) || {}, pp = it.pack || 1, pairs = g.pairs != null ? g.pairs : g.packs * pp;
      const mats = (it.bom || []).map((b, mi) => {
        const st = E.stock(b.itemId, b.variantId), sk = E.skuList().find(x => x.itemId === b.itemId && x.variantId === (b.variantId || ''));
        return { k: b.itemId + '|' + (b.variantId || ''), iid: b.itemId, vid: b.variantId || '', label: sk ? sk.label : 'Material', unit: sk ? sk.unit : '', per: b.qty, std: q3(b.qty * pairs), st, avg: st.qty > 0 ? st.value / st.qty : 0, lat: latest(b.itemId, b.variantId) };
      });
      return { g, gi, it, pairs, mats, misc: E.miscLines(it).map(m => ({ name: m.name, acc: m.acc, per: m.amt || 0, src: m.src })) };
    });
  }
  const aEl = id => document.getElementById(id);

  function html(cfg, B) {
    const issue = cfg.issue;
    const body = B.map(x => `<div class="card" style="margin:8px 0"><h3 style="margin:0 0 4px">${E.esc(x.g.code)} <span class="muted">· ${q3(x.g.packs)} packs = ${q3(x.pairs)} pairs</span></h3>
      ${x.mats.length ? `<div class="tw"><table><thead><tr><th>Material</th><th class="r">BOM / pair</th><th class="r">Qty ${issue ? 'to issue' : 'needed'}</th><th class="r">In stock</th>${issue ? '<th>Cost basis</th>' : ''}<th class="r">Unit cost</th><th class="r">Value</th><th></th></tr></thead><tbody>
      ${x.mats.map((m, mi) => `<tr><td>${E.esc(m.label)}</td><td class="r">${q3(m.per)}</td>
        <td class="r"><input type="number" step="0.001" min="0" class="fs cbq" style="width:90px;text-align:right" data-g="${x.gi}" data-m="${mi}" value="${m.std}" ${issue ? '' : 'disabled'}> ${E.esc(m.unit)}</td><td class="r">${q3(m.st.qty)}</td>
        ${issue ? `<td><select class="fs cbb" data-g="${x.gi}" data-m="${mi}"><option value="avg">Average (${E.m(Math.round(m.avg))})</option><option value="lat">Latest purchase (${E.m(m.lat)})</option><option value="man">Type a price…</option></select><input type="number" step="0.01" class="fs cbp" style="width:80px;display:none" data-g="${x.gi}" data-m="${mi}" placeholder="Rs/unit"></td>` : ''}
        <td class="r" id="cbu_${x.gi}_${mi}"></td><td class="r" id="cbv_${x.gi}_${mi}"></td><td id="cbf_${x.gi}_${mi}"></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="bad" style="margin:6px 0">No materials in the BOM for this article.</p>'}
      ${x.misc.length ? `<div class="tw"><table><thead><tr><th>Miscellaneous (not in inventory)</th><th class="r">Rs / pair</th><th class="r">Amount</th></tr></thead><tbody>${x.misc.map((m, ii) => `<tr><td>${E.esc(m.name)} <span class="muted">→ ${m.acc}</span></td><td class="r"><input type="number" step="0.01" class="fs cbm" style="width:80px;text-align:right" data-g="${x.gi}" data-i="${ii}" value="${(m.per / 100).toFixed(2)}" ${issue ? '' : 'disabled'}></td><td class="r" id="cbmv_${x.gi}_${ii}"></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`).join('');
    return `<p class="muted">${issue ? 'Check every quantity and cost below. Change anything for this time only if the BOM is not right today. Nothing is posted until you press Confirm.' : 'These are the articles and their BOMs for this job. Materials are NOT issued now.'}</p>${body}
      <div class="card" style="margin:8px 0"><div id="cbtot"></div><div id="cbscope" style="display:none;margin-top:8px"><b>You changed quantities or prices.</b><br><label><input type="radio" name="cb_sc" value="once" checked style="width:auto"> Apply to this time only</label><br><label><input type="radio" name="cb_sc" value="bom" style="width:auto"> Also update the BOM quantities for future jobs</label></div></div>`;
  }
  function buttons(cfg) {
    return `<button class="btn" data-a="cbBack">${cfg.inline ? '← Back' : 'Cancel'}</button>${cfg.altLabel ? `<button class="btn" data-a="cbAlt" id="cb_alt">${E.esc(cfg.altLabel)}</button>` : ''}<button class="btn p" data-a="cbOk" id="cb_ok">${E.esc(cfg.okLabel || 'Confirm')}</button>`;
  }
  E.confirmBom = cfg => {
    const B = build(cfg); S = { cfg, B };
    const h = html(cfg, B);
    if (cfg.inline) {
      const m = document.querySelector('#mw .m'); if (!m) return;
      [...m.children].forEach(c => { if (c.id !== 'cbpanel') c.dataset.hid = c.style.display || '1', c.style.display = 'none'; });
      const p = document.createElement('div'); p.id = 'cbpanel'; p.className = 'mb'; p.innerHTML = `<h3 style="margin:0 0 6px">${E.esc(cfg.title)}</h3>${h}<div class="mf" style="margin-top:10px">${buttons(cfg)}</div>`; m.appendChild(p);
    } else E.modal(cfg.title, h, buttons(cfg), 1);
    E.A.cbCalc();
  };

  const read = () => S.B.map(x => ({
    x, mats: x.mats.map((m, mi) => {
      const q = parseFloat(document.querySelector(`.cbq[data-g="${x.gi}"][data-m="${mi}"]`).value) || 0;
      const sel = document.querySelector(`.cbb[data-g="${x.gi}"][data-m="${mi}"]`), basis = sel ? sel.value : 'avg', pin = document.querySelector(`.cbp[data-g="${x.gi}"][data-m="${mi}"]`);
      const man = pin ? E.c(pin.value) : 0, unit = basis === 'lat' ? m.lat : basis === 'man' ? man : m.avg;
      return { m, q, basis, unit, man };
    }),
    misc: x.misc.map((mm, ii) => ({ mm, per: E.c((document.querySelector(`.cbm[data-g="${x.gi}"][data-i="${ii}"]`) || { value: 0 }).value) }))
  }));

  E.A.cbCalc = () => {
    if (!S) return; const issue = S.cfg.issue; let mat = 0, misc = 0, short = 0, changed = false, bad = 0;
    read().forEach(r => {
      r.mats.forEach((c, mi) => {
        const { m, q, basis, unit } = c, key = `${r.x.gi}_${mi}`, sel = document.querySelector(`.cbb[data-g="${r.x.gi}"][data-m="${mi}"]`), pin = document.querySelector(`.cbp[data-g="${r.x.gi}"][data-m="${mi}"]`);
        if (pin) pin.style.display = basis === 'man' ? '' : 'none';
        let v = (q > 0 && q >= m.st.qty - 1e-9) ? m.st.value : Math.min(Math.round(q * unit), m.st.value);
        mat += v;
        const notes = [];
        if (q > m.st.qty + 1e-9) { short++; notes.push(`<span class="bad">Short by ${q3(q - m.st.qty)}</span>`); }
        if (Math.abs(q - m.std) > 1e-9) { changed = true; notes.push('<span class="tag" style="background:#fef3c7;color:#b45309">changed</span>'); }
        if (basis !== 'avg') changed = true;
        if (basis === 'man' && !(unit > 0)) { bad++; notes.push('<span class="bad">enter price</span>'); }
        if (m.avg > 0 && Math.abs(m.lat - m.avg) / m.avg > 0.01) notes.push(`<span class="muted" title="Latest purchase price differs from the stock average">price moved</span>`);
        const u = aEl('cbu_' + key), vv = aEl('cbv_' + key), f = aEl('cbf_' + key); if (u) u.textContent = E.m(Math.round(unit)); if (vv) vv.textContent = E.m(v); if (f) f.innerHTML = notes.join(' ');
      });
      r.misc.forEach((c, ii) => { const a = Math.round(c.per * r.x.pairs); misc += a; const e = aEl(`cbmv_${r.x.gi}_${ii}`); if (e) e.textContent = E.m(a); if (c.per !== r.x.misc[ii].per) changed = true; });
    });
    const t = aEl('cbtot'); if (t) t.innerHTML = `<div class="kp"><div class="k"><small>Materials</small><div>${E.m(mat)}</div></div><div class="k"><small>Miscellaneous</small><div>${E.m(misc)}</div></div><div class="k"><small>Total charged to the job</small><div>${E.m(mat + misc)}</div></div></div>${short ? `<p class="bad">${short} material(s) short in stock — reduce the quantity or receive stock first.</p>` : ''}`;
    const sc = aEl('cbscope'); if (sc) sc.style.display = issue && changed ? '' : 'none';
    const ok = aEl('cb_ok'); if (ok) ok.disabled = !!(issue && (short || bad));
  };
  document.addEventListener('input', e => { if (S && e.target.closest && e.target.closest('#mw') && /cbq|cbp|cbm/.test(e.target.className)) E.A.cbCalc(); });
  document.addEventListener('change', e => { if (S && e.target.classList && e.target.classList.contains('cbb')) E.A.cbCalc(); });

  const collect = () => {
    const byKey = {}, edits = [];
    read().forEach(r => {
      const o = { mat: {}, misc: {} }; let any = false;
      r.mats.forEach(c => { const ch = Math.abs(c.q - c.m.std) > 1e-9, pr = c.basis !== 'avg'; if (ch || pr) { o.mat[c.m.k] = { qty: c.q }; if (pr) o.mat[c.m.k].price = c.unit; any = true; if (ch) edits.push({ x: r.x, m: c.m, q: c.q }); } });
      r.misc.forEach((c, ii) => { if (c.per !== r.x.misc[ii].per) { o.misc[ii] = c.per; any = true; edits.push({ x: r.x, misc: ii, per: c.per }); } });
      if (any) byKey[r.x.g.key] = o;
    });
    return { byKey, edits };
  };
  async function saveToBom(edits) {
    const done = new Set();
    for (const e of edits) {
      const it = item(e.x.g.itemId); if (!it || !(e.x.pairs > 0)) continue; if (!done.has(it.id)) { done.add(it.id); it._b = JSON.parse(JSON.stringify(it)); }
      if (e.m) { const b = (it.bom || []).find(z => z.itemId + '|' + (z.variantId || '') === e.m.k); if (b) b.qty = Math.round(e.q / e.x.pairs * 1e6) / 1e6; }
      else {
        const lines = E.miscLines(it), ln = lines[e.misc];
        if (ln && ln.src !== 'old') it.miscPair = e.per;
        else { const k = e.misc - lines.filter(z => z.src !== 'old').length; if (it.bomMisc && it.bomMisc[k]) it.bomMisc[k].amt = e.per; }
      }
    }
    for (const id of done) { const it = item(id), b = it._b; delete it._b; await E.save('items', it, b); }
  }
  async function run(fn, alt) {
    const c = S.cfg, ok = aEl('cb_ok'), al = aEl('cb_alt'); if (ok) ok.disabled = true; if (al) al.disabled = true;
    try {
      const r = collect(), scope = (document.querySelector('input[name=cb_sc]:checked') || {}).value;
      await (alt ? c.onAlt() : c.onConfirm(r.byKey));
      if (!alt && scope === 'bom' && r.edits.length) await saveToBom(r.edits);
      S = null;
    } catch (e) { E.toast(e.message, 'error'); E.A.cbCalc(); if (al) al.disabled = false; }
  }
  E.A.cbOk = () => run(), E.A.cbAlt = () => run(0, 1);
  E.A.cbBack = () => { const c = S && S.cfg; S = null; if (c && c.inline) { const p = aEl('cbpanel'), m = document.querySelector('#mw .m'); if (p) p.remove(); if (m) [...m.children].forEach(x => { if (x.dataset.hid) { x.style.display = x.dataset.hid === '1' ? '' : x.dataset.hid; delete x.dataset.hid; } }); } else E.closeM(); };
})(window.ERP);
