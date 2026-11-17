/* Finished Goods Rules: tell the system, for each ARTICLE CATEGORY (and for single articles that are different),
   which operations must be completed before a pair counts as finished goods.
   One operation ticked  = the pair is finished after that one operation (for example "Full making").
   Several ticked        = the pair is finished only when ALL of them are done (for example Top preparing + Sole making + Assembly).
   An article's own routing (Operations & rates > Article routing) always wins over its category rule. */
(E => {
  const op = id => E.D.operations.find(x => x.id === id);
  const ops = () => E.rows('operations').filter(o => o.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const can = () => E.role === 'owner' || E.role === 'accountant';
  const rules = () => { const c = E.setting('catRouting'); return c && typeof c === 'object' ? c : {}; };
  const catOf = i => i.sub || 'Other';
  const cats = () => [...new Set([...E.fgCats(), ...E.rows('items').filter(i => i.cat === 'Finished Good').map(catOf)])];
  const fg = () => E.rows('items').filter(i => i.cat === 'Finished Good' && i.active !== false);
  const base = E.itemRouting;
  if (!base) return;
  /* an article uses its own routing if it has one, otherwise the rule of its category */
  E.itemRouting = item => {
    if (item && (item.routing || []).length) return base(item);
    const r = rules()[catOf(item || {})];
    return r && r.length ? base({ routing: r }) : [];
  };
  const source = i => (i.routing || []).length ? 'own' : ((rules()[catOf(i)] || []).length ? 'category' : 'none');
  const chips = rt => rt.length ? rt.map((x, k) => `${k ? (x.wait ? ' <b>→</b> ' : ' <b>+</b> ') : ''}<span class="tag">${E.esc(x.op.name)}</span>`).join('') : '<span class="bad">No rule</span>';
  const finishText = rt => !rt.length ? '' : rt.length === 1 ? `Finished goods after <b>${E.esc(rt[0].op.name)}</b> only` : `Finished goods only when <b>all ${rt.length}</b> are done`;
  let FC = '';

  { const ti = E.N.findIndex(n => n.id === 'tracker'); const n = { g: 'Factory', id: 'fgrules', ico: '🏁', label: 'Finished Goods Rules' }; if (ti >= 0) E.N.splice(ti + 1, 0, n); else E.N.push(n); }

  E.route('fgrules', 'Finished Goods Rules', () => {
    const items = fg().sort((a, b) => (catOf(a) + a.name).localeCompare(catOf(b) + b.name)), cs = cats();
    const none = items.filter(i => source(i) === 'none').length, edit = can();
    const catRows = cs.map(c => { const list = items.filter(i => catOf(i) === c), rt = base({ routing: rules()[c] || [] }), own = list.filter(i => source(i) === 'own').length;
      return `<tr><td><b>${E.esc(c)}</b></td><td class="r">${list.length}</td><td>${chips(rt)}<div class="muted" style="font-size:11px">${finishText(rt)}</div></td><td class="r">${own ? own + ' with own routing' : ''}</td>${edit ? `<td class="r"><button class="btn sm p" data-a="crEdit" data-id="${encodeURIComponent(c)}">Set rule</button> ${rt.length ? `<button class="btn sm" data-a="crClear" data-id="${encodeURIComponent(c)}">Clear</button>` : ''}</td>` : ''}</tr>`; }).join('');
    const artRows = items.filter(i => !FC || catOf(i) === FC).map(i => { const rt = E.itemRouting(i), s = source(i);
      return `<tr><td><b>${E.esc(i.name)}</b><div class="muted" style="font-size:11px">${E.esc(i.art || '')}</div></td><td>${E.esc(catOf(i))}</td><td>${chips(rt)}</td><td>${s === 'own' ? '<span class="tag">own routing</span>' : s === 'category' ? '<span class="tag" style="background:#e0f2fe">category rule</span>' : '<span class="bad">none</span>'}</td>${edit ? `<td class="r"><button class="btn sm" data-a="rtEdit" data-id="${i.id}">Own routing</button> ${s === 'own' && (rules()[catOf(i)] || []).length ? `<button class="btn sm" data-a="crUse" data-id="${i.id}">Use category rule</button>` : ''}</td>` : ''}</tr>`; }).join('');
    return `<div class="card"><h3>🏁 Finished Goods Rules</h3>
      <p>Tell the system <b>which operations a product must complete before it counts as finished goods</b>. You do it once for each article category, and only add an own routing for an article that is different.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:10px 0">
        <div class="card" style="margin:0;background:var(--s2)"><b>One operation</b><div class="muted">Tick only <i>Full making</i>. Goods are finished when Full making is logged, by one worker.</div></div>
        <div class="card" style="margin:0;background:var(--s2)"><b>Two or more operations</b><div class="muted">Tick <i>Sole making</i> and <i>Assembly</i>. Goods are finished only when <b>both</b> are logged for the same pairs, whoever did them.</div></div></div>
      <p class="muted"><b>How it flows:</b> workers log each operation in Daily Production → the lowest completed count across the ticked operations becomes <b>completed pairs</b> → press <b>Release</b> on the job and those pairs move from work-in-progress into <b>finished goods stock</b>.</p>
      ${none ? `<p class="bad"><b>${none} article(s) have no rule yet.</b> Their completion can only be estimated.</p>` : '<p class="ok"><b>Every article has a rule.</b></p>'}</div>
    <div class="card"><h3>1 · Rule for each category</h3><div class="tw"><table><thead><tr><th>Category</th><th class="r">Articles</th><th>Operations to complete (→ needs earlier stage, + parallel)</th><th class="r">Exceptions</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${catRows || '<tr><td colspan="5" class="muted">No categories yet. Add them in Settings (Finished goods categories).</td></tr>'}</tbody></table></div></div>
    <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">2 · What each article will use</h3><select class="fs" data-f="fg.c"><option value="">All categories</option>${cs.map(c => `<option ${FC === c ? 'selected' : ''}>${E.esc(c)}</option>`).join('')}</select></div>
      <div class="tw"><table><thead><tr><th>Article</th><th>Category</th><th>Operations to complete</th><th>Source</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${artRows || '<tr><td colspan="5" class="muted">No finished-goods articles.</td></tr>'}</tbody></table></div></div>`;
  });
  E.hooks.push(e => { if (e.target && e.target.dataset && e.target.dataset.f === 'fg.c') { FC = e.target.value; E.go(); } });

  E.A.crEdit = enc => {
    const cat = decodeURIComponent(enc), O = ops(), cur = rules()[cat] || [];
    if (!O.length) return E.toast('Add operations first (Daily Production > Operations & rates)', 'error');
    E.modal('Rule for category: ' + cat, `<p class="muted">Tick every operation a pair of <b>${E.esc(cat)}</b> must complete. Tick only one operation if one worker makes it completely. Untick “Needs earlier stage” for an operation that can run at the same time as another (for example top preparing while the sole is made).</p>
      <div class="tw"><table><thead><tr><th>Must complete</th><th>Operation</th><th>Needs earlier stage first</th></tr></thead><tbody>${O.map(o => { const r = cur.find(x => x.opId === o.id); return `<tr><td><input type="checkbox" class="cr-i" data-op="${o.id}" ${r ? 'checked' : ''}></td><td>${E.esc(o.name)}</td><td><input type="checkbox" class="cr-w" data-op="${o.id}" ${!r || r.wait !== false ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table></div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="cr_clr"> Remove the own routing of articles in this category, so every article follows this rule</label>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="crSave" data-id="${enc}">Save rule</button>`);
  };
  E.A.crSave = async enc => {
    try {
      const cat = decodeURIComponent(enc);
      const sel = [...document.querySelectorAll('.cr-i')].filter(c => c.checked).map(c => ({ opId: c.dataset.op, wait: !!([...document.querySelectorAll('.cr-w')].find(w => w.dataset.op === c.dataset.op) || {}).checked })).filter(r => op(r.opId)).sort((a, b) => (op(a.opId).order || 0) - (op(b.opId).order || 0));
      if (!sel.length) throw new Error('Tick at least one operation');
      sel[0].wait = false;
      const all = Object.assign({}, rules()); all[cat] = sel; await E.setSetting({ catRouting: all });
      let n = 0;
      if (E.$('cr_clr') && E.$('cr_clr').checked) for (const x of fg().filter(i => catOf(i) === cat && (i.routing || []).length)) { const b = JSON.parse(JSON.stringify(x)); x.routing = []; await E.save('items', x, b); n++; }
      E.closeM(); E.go(); E.toast('Rule saved for ' + cat + (n ? ' · ' + n + ' article(s) now follow it' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.crClear = async enc => {
    const cat = decodeURIComponent(enc); if (!confirm('Remove the rule for ' + cat + '? Articles without their own routing will have no rule.')) return;
    const all = Object.assign({}, rules()); delete all[cat]; await E.setSetting({ catRouting: all }); E.go(); E.toast('Rule removed', 'success');
  };
  E.A.crUse = async id => {
    const x = E.D.items.find(i => i.id === id); if (!x) return; if (!confirm('Remove the own routing of ' + x.name + ' and use the rule of category ' + catOf(x) + '?')) return;
    const b = JSON.parse(JSON.stringify(x)); x.routing = []; await E.save('items', x, b); E.go(); E.toast('Now follows the category rule', 'success');
  };
})(window.ERP);
