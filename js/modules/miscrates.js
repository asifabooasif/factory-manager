/* Miscellaneous per Pair — thread, glue, labels, small consumables that cannot be counted in stock are costed as an AMOUNT per pair.
   One default rate applies to every finished-good article; the few articles that need more get their own (higher) rate here.
   The amount is charged to the job on every pair when materials are issued by BOM (costing record; the real expense is entered once in Expenses). */
(E => {
  const can = () => E.role === 'owner' || E.role === 'accountant';
  const NOT = ['contra', 'cogs', 'loss'], SKIP = ['5290', '5291', '5295', '5390'];
  const heads = () => E.rows('coa').filter(a => a.type === 'expense' && !SKIP.includes(a.code) && !NOT.includes(a.nature) && E.natureTreat(a.nature) !== 'period').sort((a, b) => a.code.localeCompare(b.code));
  const fg = () => E.rows('items').filter(i => i.cat === 'Finished Good' && i.active !== false).sort((a, b) => String(a.art).localeCompare(String(b.art)));
  const rs = c => (c / 100).toFixed(2);

  E.nav('Purchases & Stock', 'miscrates', '🧵', 'Misc. per Pair');
  E.route('miscrates', 'Miscellaneous per Pair', () => {
    if (!can()) return '<div class="card muted">Only the owner or accountant can change miscellaneous rates.</div>';
    const r = E.miscRate(), list = fg(), cust = list.filter(i => i.miscPair != null && i.miscPair !== ''), hs = heads();
    const warn = r.amt > 0 && !r.acc ? '<p class="bad">Choose the expense head below, otherwise the default amount is not charged.</p>' : '';
    return `<div class="kp">${E.kpi('Default per pair', 'Rs ' + rs(r.amt), r.acc ? 'head ' + r.acc : 'head not chosen')}${E.kpi('Articles on default', list.length - cust.length, 'of ' + list.length)}${E.kpi('Articles with own rate', cust.length, 'higher / lower than default')}</div>
    <div class="card"><h3>1 · Default miscellaneous amount (every slipper article)</h3><p class="muted">One amount added to the cost of every pair. Set it once here. It is charged when materials are issued to a job by BOM (pairs × amount).</p>${warn}
      <div class="g2"><div class="f">Amount per pair (Rs)<input id="mr_d" type="number" step="0.01" min="0" value="${r.amt ? rs(r.amt) : ''}"></div><div class="f">Expense head it belongs to<select id="mr_h"><option value="">— choose —</option>${hs.map(a => `<option value="${a.code}" ${a.code === r.acc ? 'selected' : ''}>${a.code} · ${E.esc(a.name)}</option>`).join('')}</select></div><div class="f">Description on job costing<input id="mr_n" value="${E.esc(r.name)}"></div></div>
      <button class="btn p" data-a="mrSaveDef">Save default</button></div>
    <div class="card"><h3>2 · Articles that need a different amount</h3><p class="muted">Leave the box empty to use the default. Type a higher amount for the two or three articles that need it (type 0 for an article that should carry none).</p>
      <div class="tw"><table><thead><tr><th>Article</th><th class="r">Pairs / pack</th><th class="r">Rs per pair</th><th class="r">Charged per pair</th><th class="r">Per pack</th><th></th></tr></thead><tbody>${list.map(i => { const own = i.miscPair != null && i.miscPair !== '', eff = own ? i.miscPair : r.amt; return `<tr><td>${E.esc(i.art)} <span class="muted">${E.esc(i.name || '')}</span></td><td class="r">${i.pack || 1}</td><td class="r"><input type="number" step="0.01" min="0" class="fs mrr" style="width:90px;text-align:right" data-id="${i.id}" placeholder="default" value="${own ? rs(i.miscPair) : ''}"></td><td class="r">Rs ${rs(eff)} <span class="muted">${own ? 'own rate' : 'default'}</span></td><td class="r">Rs ${rs(eff * (i.pack || 1))}</td><td></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No finished-good articles yet.</td></tr>'}</tbody></table></div>
      <div class="bar" style="margin-top:10px"><button class="btn p" data-a="mrSaveRates">Save article rates</button><span class="gap"></span><button class="btn" data-a="mrReset">Reset all to default</button></div></div>
    <div class="card muted"><b>How it is used:</b> when you create a job (or issue materials) by BOM, the confirmation screen lists this amount for each article and you can still change it for that time only. The amount is a costing record on the job. Enter the real consumables bill once in Expenses, and do not also list the same items as stock in the BOM, so the cost is counted once.</div>`;
  });

  E.A.mrSaveDef = async () => {
    try {
      const amt = E.c(E.val('mr_d')), acc = E.val('mr_h'), name = (E.val('mr_n') || '').trim() || 'Miscellaneous';
      if (amt < 0) throw new Error('Amount cannot be negative');
      if (amt > 0 && !acc) throw new Error('Choose the expense head');
      if (acc && !heads().some(a => a.code === acc)) throw new Error('This head cannot be charged to a job');
      await E.setSetting({ miscRate: { amt, acc, name } }); E.go(); E.toast('Default saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.mrSaveRates = async () => {
    try {
      const rows = [...document.querySelectorAll('.mrr')]; let n = 0;
      if (rows.some(i => i.value.trim() !== '' && E.c(i.value) > 0) && !E.miscRate().acc) throw new Error('Set the default amount and expense head first (box 1)');
      for (const inp of rows) {
        const it = E.D.items.find(x => x.id === inp.dataset.id); if (!it) continue;
        const v = inp.value.trim(), nv = v === '' ? null : E.c(v), cur = it.miscPair == null || it.miscPair === '' ? null : it.miscPair;
        if (nv !== null && nv < 0) throw new Error('Rate cannot be negative');
        if (nv === cur) continue; const b = JSON.parse(JSON.stringify(it)); it.miscPair = nv; await E.save('items', it, b); n++;
      }
      E.go(); E.toast(n ? n + ' article rate(s) saved' : 'No changes', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.mrReset = async () => {
    try {
      const l = fg().filter(i => i.miscPair != null && i.miscPair !== ''); if (!l.length) throw new Error('Every article already uses the default');
      if (!confirm('Remove the own rate of ' + l.length + ' article(s) and use the default for all?')) return;
      for (const it of l) { const b = JSON.parse(JSON.stringify(it)); it.miscPair = null; await E.save('items', it, b); }
      E.go(); E.toast('All articles use the default', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);
