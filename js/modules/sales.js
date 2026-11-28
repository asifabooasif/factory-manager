/* PART 5 (v3) — Sales with per-pair pricing.
   Item price stored as cents per pair. Invoice shows rate/pair, computes amount = pairs × rate.
*/
(E => {
  const n = E.N.find(x => x.id === 'sales'); if (n) n.soon = 0;
  const F = { q: '', sc: false };
  const cu = id => E.D.parties.find(x => x.id === id), ib = i => i.total - i.paid, fg = i => i.cat === 'Finished Good';
  const cname = id => E.esc((cu(id) || {}).name);
  const dst = d => d.status, ist = i => i.cancelled ? 'Cancelled' : i.paid >= i.total ? 'Paid' : i.paid > 0 ? 'Part paid' : 'Open';
  const pp = (l) => { const it = E.D.items.find(x => x.id === l.itemId); return (it && it.pack) || 1; };

  function tbl() {
    const s = F.q.toLowerCase();
    const ok = (n, p) => !s || (n + (cu(p) || {}).name).toLowerCase().includes(s);
    const D = E.rows('deliveries').filter(d => (F.sc || d.status !== 'Cancelled') && ok(d.no, d.partyId)).sort((a, b) => b.no.localeCompare(a.no));
    const I = E.rows('invoices').filter(i => (F.sc || !i.cancelled) && ok(i.no, i.partyId)).sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="card"><h3>Delivery notes</h3><div class="tw"><table>
      <thead><tr><th>D/N</th><th>Date</th><th>Customer</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Value</th><th>Status</th><th></th></tr></thead>
      <tbody>${D.map(d => {
        const packs = d.lines.reduce((a, l) => a + l.qty, 0);
        const pairs = d.lines.reduce((a, l) => a + l.qty * pp(l), 0);
        return `<tr style="${d.status === 'Cancelled' ? 'opacity:.5' : ''}">
          <td>${d.no}</td><td>${d.date}</td><td>${cname(d.partyId)}</td>
          <td class="r">${packs}</td><td class="r muted">${pairs}</td>
          <td class="r">${E.m(d.total)}</td>
          <td><span class="tag">${dst(d)}</span></td>
          <td class="r"><button class="btn sm" data-a="prDN" data-id="${d.id}" title="Print delivery note">🖨</button> ${d.status === 'Delivered' ? `<button class="btn sm d" data-a="canDN" data-id="${d.id}">Cancel</button>` : ''}${d.status === 'Cancelled' ? `<button class="btn sm d" data-a="delDN" data-id="${d.id}">Delete</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">No delivery notes</td></tr>'}</tbody>
    </table></div></div>
    <div class="card"><h3>Invoices</h3><div class="tw"><table>
      <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${I.map(i => `<tr style="${i.cancelled ? 'opacity:.5' : ''}">
        <td>${i.no}</td><td>${i.date}</td><td>${cname(i.partyId)}</td>
        <td class="r">${E.m(i.total)}</td><td class="r">${E.m(i.paid)}</td>
        <td class="r"><b>${i.cancelled ? '—' : E.m(ib(i))}</b></td>
        <td><span class="tag">${ist(i)}</span></td>
        <td class="r"><button class="btn sm" data-a="prInv" data-id="${i.id}" title="Print invoice">🖨</button> ${!i.cancelled && !i.paid ? `<button class="btn sm d" data-a="canInv" data-id="${i.id}">Cancel</button>` : ''}${i.cancelled ? `<button class="btn sm d" data-a="delInv" data-id="${i.id}">Delete</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No invoices</td></tr>'}</tbody>
    </table></div></div>`;
  }

  E.route('sales', 'Sales & Receivables', () => {
    const open = E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + ib(i), 0);
    const pend = E.rows('deliveries').filter(d => d.status === 'Delivered');
    return `<div class="kp">
      ${E.kpi('Receivables', E.m(open), open === E.bal('1200') ? '<span class="ok">Agrees 1200</span>' : '<span class="bad">Differs 1200</span>')}
      ${E.kpi('Delivered, uninvoiced', E.m(pend.reduce((s, d) => s + d.total, 0)), pend.length + ' notes · ' + (E.bal('1210') === pend.filter(d => d.unbilled).reduce((s, d) => s + d.total, 0) ? '<span class="ok">Agrees 1210</span>' : '<span class="bad">Differs 1210</span>'))}
      ${E.kpi('Customer credit', E.m(E.custCreditTotal()), (E.acct('2400') ? E.bal('2400') : 0) === E.custCreditTotal() ? '<span class="ok">Agrees 2400</span>' : '<span class="bad">Differs 2400</span>')}
      ${E.kpi('FG stock', E.m(E.bal('1320')), 'at cost')}
    </div>
    ${legacyDN().length && (E.role === 'owner' || E.role === 'accountant') ? `<div class="card"><b>${legacyDN().length} old delivery note(s)</b> were posted before sales revenue was recognised at delivery. <button class="btn p" data-a="dnMigrate">Move to Unbilled Receivable</button></div>` : ''}
    <div class="bar">
      <input class="fs" style="max-width:300px" placeholder="Search…" data-f="sl.q" value="${E.esc(F.q)}"> <label class="muted" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" data-f="sl.sc" ${F.sc ? 'checked' : ''}> Show cancelled</label>
      <span class="gap"></span>
      <button class="btn" data-a="cuList">Customer credit</button>
      <button class="btn" data-a="rcptList">Receipts</button>
      <button class="btn" data-a="recv">Receive Payment</button>
      <button class="btn" data-a="newInv">+ Invoice</button>
      <button class="btn p" data-a="newDN">+ Delivery</button>
    </div><div id="tbl">${tbl()}</div>`;
  });

  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f === 'sl.q') { F.q = e.target.value; E.$('tbl').innerHTML = tbl(); } if (f === 'sl.sc') { F.sc = e.target.checked; E.$('tbl').innerHTML = tbl(); } });

  /* Delivery note — price per pair */
  const dlRow = () => `<div class="jl dl" style="grid-template-columns:2.2fr .7fr 1fr .9fr .8fr 1fr 1fr 30px"><input list="fgs" placeholder="Article"><input type="number" placeholder="Packs"><input readonly placeholder="Pairs"><input readonly placeholder="Cost/pair"><input type="number" step="0.01" placeholder="Margin %"><input type="number" step="0.01" placeholder="Rate/pair"><input readonly placeholder="Amount"><button class="btn sm d" data-a="rmDl">✕</button></div>`;
  const dlRead = () => [...document.querySelectorAll('#dlr .dl')].map(r => { const c = r.children, s = E.skuFind(c[0].value, fg); return { s, q: parseInt(c[1].value) || 0, rate: E.c(c[5].value), c }; });

  function dlTot(t) {
    const r = t.closest('.dl'), c = r.children, s = E.skuFind(c[0].value, fg);
    let pairsPerPack = 1;
    if (s) {
      const it = E.D.items.find(x => x.id === s.itemId);
      pairsPerPack = (it && it.pack) || 1;
      const q = parseInt(c[1].value) || 1;
      let costPerPair = 0;
      try { costPerPair = Math.round(E.outValue(s.itemId, s.variantId, q) / (q * pairsPerPack)); }
      catch (x) { const st = E.stock(s.itemId, s.variantId); costPerPair = st.qty > 0 ? Math.round(st.value / st.qty / pairsPerPack) : 0; }
      r.dataset.costPair = costPerPair;
      c[3].value = costPerPair ? (costPerPair / 100).toFixed(2) : '';
    }
    c[2].value = s ? (parseInt(c[1].value) || 0) * pairsPerPack : '';
    const costPair = +r.dataset.costPair || 0, it = s && E.D.items.find(x => x.id === s.itemId);
    if (t === c[0] && it && it.price) c[5].value = (it.price / 100).toFixed(2);
    if (t === c[4] && costPair && c[4].value !== '') c[5].value = (costPair * (1 + parseFloat(c[4].value) / 100) / 100).toFixed(2);
    else if (costPair && c[5].value && t !== c[4]) c[4].value = ((E.c(c[5].value) / costPair - 1) * 100).toFixed(1);
    let tot = 0, cg = 0;
    dlRead().forEach(l => {
      if (!l.s) return;
      const itm = E.D.items.find(x => x.id === l.s.itemId);
      const ppp = (itm && itm.pack) || 1;
      const pairs = l.q * ppp;
      const amount = Math.round(pairs * l.rate);
      tot += amount;
      cg += Math.round((+l.c[0].parentElement.dataset.costPair || 0) * pairs);
      l.c[6].value = amount ? E.m(amount) : '';
    });
    if (E.$('dl_t')) E.$('dl_t').textContent = E.m(tot);
    if (E.$('dl_p')) { const pr = tot - cg; E.$('dl_p').className = pr < 0 ? 'bad' : 'ok'; E.$('dl_p').textContent = cg ? 'Cost ' + E.m(cg) + ' · Profit ' + E.m(pr) + (tot ? ' (' + (pr / tot * 100).toFixed(1) + '%)' : '') : '—'; }
  }
  E.A.rmDl = (_, e) => { e.target.closest('.dl').remove(); };
  E.A.addDl = () => E.$('dlr').insertAdjacentHTML('beforeend', dlRow());

  E.hooks.push(e => { if (e.target.closest && e.target.closest('.dl')) dlTot(e.target); });

  E.A.newDN = () => {
    const cs = E.rows('parties').filter(p => p.active && p.type !== 'Supplier');
    if (!cs.length) return E.toast('Add customer first', 'error');
    const js = E.rows('jobs');
    E.modal('New Delivery Note', `
      <div class="g2">
        <div class="f">Customer *<select id="d_p">${cs.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Date<input id="d_d" type="date" value="${E.today()}"></div>
      </div>
      <div class="f">Job (optional)<select id="d_j"><option value="">—</option>${js.map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select></div>
      <datalist id="fgs">${E.skuOpts(fg)}</datalist>
      <div id="dlr">${dlRow() + dlRow()}</div>
      <button class="btn sm" data-a="addDl">+ Add line</button>
      <div class="tot"><span>Delivery value</span><span id="dl_t">Rs 0</span></div>
      <div class="tot"><span>Profit</span><span id="dl_p">—</span></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveDN">Post</button>`, 1);
  };

  E.A.saveDN = async () => {
    try {
      const m = {};
      dlRead().filter(l => l.q || l.rate || l.c[0].value).forEach((l, i) => {
        if (!l.s) throw new Error('Line ' + (i + 1) + ' invalid');
        if (l.q <= 0 || l.rate <= 0) throw new Error('Line ' + (i + 1) + ' enter packs + rate/pair');
        const k = l.s.itemId + '|' + l.s.variantId;
        if (m[k]) throw new Error(l.s.code + ' appears twice');
        m[k] = l;
      });
      const L = Object.values(m);
      if (!L.length) throw new Error('Add at least one line');
      const low = L.filter(l => l.rate < (+l.c[0].parentElement.dataset.costPair || 0));
      if (low.length && !confirm('Selling below cost: ' + low.map(l => l.s.code).join(', ') + '. Continue?')) return;
      const d = E.val('d_d'), pid = E.val('d_p'), jb = E.val('d_j'), no = await E.next('DN');
      const lines = L.map(l => {
        const itm = E.D.items.find(x => x.id === l.s.itemId), ppp = (itm && itm.pack) || 1;
        const pairs = l.q * ppp;
        return { itemId: l.s.itemId, variantId: l.s.variantId, code: l.s.code, name: l.s.name, qty: l.q, pairs, rate: l.rate, amount: Math.round(pairs * l.rate), cost: E.outValue(l.s.itemId, l.s.variantId, l.q) };
      });
      const cogs = lines.reduce((s, l) => s + l.cost, 0), total = lines.reduce((s, l) => s + l.amount, 0);
      if (cogs <= 0) throw new Error('These goods have no cost. Complete a job first.');
      if (!E.acct('1210')) await E.ensureCoa();
      /* Revenue is recognised at delivery: Dr Unbilled Receivable / Cr Sales, plus cost of goods sold. The invoice later moves Unbilled to Receivable. */
      await E.postThen({ date: d, ref: no, narr: 'Delivery ' + no, source: 'sale',
        lines: [{ acc: '5400', dr: cogs, job: jb }, { acc: '1320', cr: cogs, job: jb }, { acc: '1210', dr: total }, { acc: '4000', cr: total }] }, async je => {
        const out = [];
        try {
          for (const l of lines) { await E.stockOut({ date: d, itemId: l.itemId, variantId: l.variantId, qty: l.qty, type: 'sale', ref: no, job: jb }); out.push(l); }
          await E.save('deliveries', { no, date: d, partyId: pid, jobId: jb, lines, total, cogs, status: 'Delivered', jeId: je.id, invId: '', unbilled: true });
        } catch (err) { for (const l of out) try { await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: l.qty, value: l.cost, type: 'cancel', ref: no, job: jb }); } catch (x) { console.error(x); } throw err; }
      });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.canDN = async id => {
    try {
      const d = E.D.deliveries.find(x => x.id === id);
      if (d.status !== 'Delivered') throw new Error('Only delivered can be cancelled');
      if (!confirm('Cancel ' + d.no + '?')) return;
      /* one unit: stock back + status first, the ledger reversal last; if anything fails every step is undone */
      const u = E.undoStack();
      try {
        for (const l of d.lines) { const mv = await E.stockIn({ date: E.today(), itemId: l.itemId, variantId: l.variantId, qty: l.qty, value: l.cost, type: 'cancel', ref: d.no, job: d.jobId }); u.push(() => E.del('stockMoves', mv.id)); }
        await E.saveU(u, 'deliveries', d, r => { r.status = 'Cancelled'; });
        if (d.jeId && !E.isReversed(d.jeId)) await E.reverse(d.jeId);
        if (d.unbilledJeId && !E.isReversed(d.unbilledJeId)) await E.reverse(d.unbilledJeId);
      } catch (err) { await u.rollback(); err.message = (err.message || 'Failed') + ' (nothing was changed)'; throw err; }
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Invoice */
  function dnList() {
    const l = E.rows('deliveries').filter(d => d.status === 'Delivered' && d.partyId === E.val('n_p'));
    E.$('n_l').innerHTML = l.map(d => `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" class="dnk" data-id="${d.id}" checked style="width:auto"> ${d.no} · ${d.date} · ${d.lines.reduce((a, x) => a + x.qty, 0)} packs · ${E.m(d.total)}</label>`).join('');
  }
  function invCalc() {
    const sel = [...document.querySelectorAll('.dnk:checked')].map(i => E.D.deliveries.find(x => x.id === i.dataset.id));
    const g = sel.reduce((s, d) => s + d.total, 0);
    const rs = E.c(E.val('n_rs')), disc = rs || Math.round(g * (parseFloat(E.val('n_pc')) || 0) / 100);
    return { sel, g, disc, total: g - disc };
  }
  function invTot() { if (!E.$('n_t')) return; const c = invCalc(); E.$('n_t').textContent = E.m(c.g) + ' − ' + E.m(c.disc) + ' = ' + E.m(c.total); }
  E.hooks.push(e => { if (e.target.id === 'n_p') dnList(); if (e.target.id === 'n_pc' || e.target.id === 'n_rs' || (e.target.classList && e.target.classList.contains('dnk'))) invTot(); });

  E.A.newInv = () => {
    const ids = [...new Set(E.rows('deliveries').filter(d => d.status === 'Delivered').map(d => d.partyId))];
    if (!ids.length) return E.toast('No delivered notes to invoice', 'error');
    E.modal('New Invoice', `
      <div class="g2">
        <div class="f">Customer<select id="n_p">${ids.map(i => `<option value="${i}">${cname(i)}</option>`).join('')}</select></div>
        <div class="f">Invoice date<input id="n_d" type="date" value="${E.today()}"></div>
      </div>
      <b>Delivery notes</b><div id="n_l"></div>
      <div class="g2"><div class="f">Discount %<input id="n_pc" type="number" step="0.01"></div><div class="f">or discount Rs<input id="n_rs" type="number" step="0.01"></div></div>
      <div class="tot"><span>Gross − discount = total</span><span id="n_t"></span></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveInv">Create</button>`);
    dnList();
  };

  E.A.saveInv = async () => {
    try {
      const { sel, g, disc, total } = invCalc(), pid = E.val('n_p');
      if (!sel.length) throw new Error('Select at least one');
      if (total <= 0) throw new Error('Invalid total');
      if (disc < 0 || disc > g) throw new Error('Invalid discount');
      const p = cu(pid), out = E.rows('invoices').filter(i => i.partyId === pid && !i.cancelled).reduce((s, i) => s + ib(i), 0);
      const credit = E.custCredit ? E.custCredit(pid) : 0;
      if (p.limit && out - credit + total > p.limit && !confirm('Exceeds credit limit ' + E.m(p.limit) + '. Continue?')) return;
      if (disc > 0 && !E.acct('4010')) await E.ensureCoa();
      const d = E.val('n_d'), no = await E.next('INV');
      /* invoice entry + invoice record + delivery-note status are ONE unit */
      const inv = await E.postThen({ date: d, ref: no, narr: 'Invoice ' + no, source: 'sale', lines: invLines(sel, g, disc, total) }, async je => {
        const u = E.undoStack();
        try {
          const iv = await E.save('invoices', { no, date: d, partyId: pid, dnIds: sel.map(x => x.id), gross: g, disc, total, paid: 0, jeId: je.id, cancelled: false });
          u.push(() => E.del('invoices', iv.id));
          for (const x of sel) await E.saveU(u, 'deliveries', x, r => { r.status = 'Invoiced'; r.invId = iv.id; });
          return iv;
        } catch (err) { await u.rollback(); throw err; }
      });
      E.closeM();
      if (credit > 0 && confirm(cname(pid) + ' has ' + E.m(credit) + ' credit on account.\n\nApply ' + E.m(Math.min(credit, total)) + ' of it to ' + no + ' now?')) {
        try { await applyCredit(pid, [{ id: inv.id, a: Math.min(credit, total) }], d); } catch (e2) { E.toast(e2.message, 'error'); }
      }
      E.go(); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Invoice entry: Dr Receivable (net) + Dr Sales (discount) / Cr Unbilled Receivable (delivery notes posted at delivery).
     Old delivery notes posted before revenue-at-delivery have no 'unbilled' flag, so their revenue is still credited here. */
  function invLines(sel, g, disc, total) {
    const gNew = sel.filter(x => x.unbilled).reduce((s, x) => s + x.total, 0), gOld = g - gNew, lines = [{ acc: '1200', dr: total }];
    if (disc > 0) lines.push({ acc: '4010', dr: disc });
    if (gNew > 0) lines.push({ acc: '1210', cr: gNew });
    if (gOld > 0) lines.push({ acc: '4000', cr: gOld });
    return lines;
  }
  const legacyDN = () => E.rows('deliveries').filter(d => d.status === 'Delivered' && !d.unbilled);
  /* One-time: bring delivery notes delivered before this change into Unbilled Receivable */
  E.A.dnMigrate = async () => {
    try {
      const L = legacyDN();
      if (!L.length) return E.toast('Nothing to move', 'success');
      if (!confirm('Move ' + L.length + ' old delivery note(s) into Unbilled Receivable? This posts Dr 1210 / Cr 4000 for their sales value.')) return;
      if (!E.acct('1210')) await E.ensureCoa();
      for (const d of L) {
        await E.postThen({ date: d.date, ref: d.no, narr: 'Revenue at delivery (moved) ' + d.no, source: 'sale', lines: [{ acc: '1210', dr: d.total }, { acc: '4000', cr: d.total }] }, async je => { const u = E.undoStack(); await E.saveU(u, 'deliveries', d, q => { q.unbilled = true; q.unbilledJeId = je.id; }); });
      }
      E.go(); E.toast('Moved ' + L.length + ' delivery note(s)', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Permanently remove CANCELLED delivery notes / invoices. Ledger keeps the original + reversal pair (nets to zero; entries are never deleted). */
  E.A.delDN = async id => { try { const d = E.D.deliveries.find(x => x.id === id); if (!d || d.status !== 'Cancelled') throw new Error('Only cancelled delivery notes can be deleted'); if (!confirm('Permanently delete ' + d.no + '? This cannot be undone.')) return;
    for (const m of E.rows('stockMoves').filter(m => m.ref === d.no)) await E.del('stockMoves', m.id);
    await E.audit('delete', 'deliveries', d.id, d, null); await E.del('deliveries', d.id); E.go(); E.toast('Deleted ' + d.no, 'success'); } catch (e) { E.toast(e.message, 'error'); } };
  E.A.delInv = async id => { try { const i = E.D.invoices.find(x => x.id === id); if (!i || !i.cancelled) throw new Error('Only cancelled invoices can be deleted'); if (!confirm('Permanently delete ' + i.no + '? This cannot be undone.')) return;
    await E.audit('delete', 'invoices', i.id, i, null); await E.del('invoices', i.id); E.go(); E.toast('Deleted ' + i.no, 'success'); } catch (e) { E.toast(e.message, 'error'); } };
  E.A.canInv = async id => {
    try {
      const i = E.D.invoices.find(x => x.id === id);
      if (i.paid) throw new Error('Payments exist');
      if (!confirm('Cancel ' + i.no + '?')) return;
      const jid = E.jeOf(i);
      if (!jid) throw new Error('Ledger entry for ' + i.no + ' not found');
      /* An earlier cancel may have stopped after reversing the ledger: then just finish the job. */
      const u = E.undoStack();
      try {
        for (const k of (i.dnIds || [])) { const x = E.D.deliveries.find(q => q.id === k); if (!x) continue; await E.saveU(u, 'deliveries', x, r => { r.status = 'Delivered'; r.invId = ''; }); }
        await E.saveU(u, 'invoices', i, r => { r.cancelled = true; });
        if (!E.isReversed(jid)) await E.reverse(jid);
      } catch (err) { await u.rollback(); err.message = (err.message || 'Failed') + ' (nothing was changed)'; throw err; }
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Receipt */
  /* ═══════════════════════════════════════════════════════════════════════════════════
     CUSTOMER CREDIT  (overpayments and advances)
     • When a customer pays MORE than the invoices you tick, the excess is not lost and not
       hidden in Receivables. It is posted to 2400 "Customer Advances" (a LIABILITY: we owe
       the customer goods or money):      Dr Bank (all received)
                                          Cr 1200 Trade Receivables (the part applied to invoices)
                                          Cr 2400 Customer Advances (the excess)
     • Using it later:   Dr 2400 / Cr 1200   (one entry per invoice, invoice "Paid" goes up)
     • Refunding it:     Dr 2400 / Cr Bank
     • Every rupee is tracked on the receipt it came from (receipt.advance, receipt.applied[]),
       together with advance cheques (Cheque Desk), so "credit left" is always exact and
       the sum of all customer credit always equals the ledger balance of 2400.
     ═══════════════════════════════════════════════════════════════════════════════════ */
  const sumOf = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  const live = r => (r.applied || []).filter(x => !x.reversed);
  const rcAdv = r => (!r || r.reversed || r.kind === 'credit') ? 0 : Math.max(0, (r.advance || 0) - sumOf(live(r), x => x.a));
  const chqAdv = c => (E.chqAdvLeft && c && c.dir === 'in') ? E.chqAdvLeft(c) : 0;
  const recvOn = c => c.recvDate || (c.createdAt || '').slice(0, 10) || c.date;
  const sources = pid => {                                   // credit sources, oldest first
    const s = [];
    E.rows('receipts').filter(r => r.partyId === pid && rcAdv(r) > 0).forEach(r => s.push({ t: 'r', id: r.id, d: r.date, ref: r.no, left: rcAdv(r) }));
    E.rows('cheques').filter(c => c.dir === 'in' && c.partyId === pid && chqAdv(c) > 0).forEach(c => s.push({ t: 'c', id: c.id, d: recvOn(c), ref: 'Cheque ' + c.chqNo, left: chqAdv(c) }));
    return s.sort((a, b) => a.d.localeCompare(b.d) || a.ref.localeCompare(b.ref));
  };
  E.rcptAdvLeft = rcAdv;
  E.custCredit = pid => sumOf(sources(pid), x => x.left);                 // credit one customer has with us
  E.custCreditRcpt = () => sumOf(E.rows('receipts'), rcAdv);              // part that came from receipts
  E.custCreditTotal = () => E.custCreditRcpt() + (E.chqAdvTotal ? E.chqAdvTotal('in') : 0);   // must equal ledger 2400
  const need2400 = async () => { if (!E.acct('2400')) await E.ensureCoa(); if (!E.acct('2400')) throw new Error('Account 2400 Customer Advances is missing'); };

  /* use credit to pay invoices.  allocs = [{id: invoiceId, a: cents}] */
  async function applyCredit(pid, allocs, date) {
    const tot = sumOf(allocs, x => x.a), src = sources(pid), credit = sumOf(src, x => x.left);
    if (tot <= 0) throw new Error('Enter the amounts to apply');
    if (tot > credit) throw new Error('More than the credit available (' + E.m(credit) + ')');
    if (E.locked(date)) throw new Error('The period is locked up to ' + E.setting('lockedUntil'));
    for (const x of allocs) {
      const inv = E.D.invoices.find(q => q.id === x.id);
      if (!inv || inv.cancelled || inv.partyId !== pid) throw new Error('Invoice not available');
      if (x.a > ib(inv)) throw new Error(inv.no + ': ' + E.m(x.a) + ' is more than its balance ' + E.m(ib(inv)));
    }
    await need2400();
    for (const x of allocs) {
      if (x.a <= 0) continue;
      const inv = E.D.invoices.find(q => q.id === x.id), no = await E.next('CAP');
      let left = x.a; const used = [];
      for (const sx of src) {
        if (left <= 0) break;
        const take = Math.min(left, sx.left); if (take <= 0) continue;
        sx.left -= take; left -= take; used.push({ t: sx.t, id: sx.id, a: take });
      }
      await E.postThen({ date, ref: no, narr: 'Customer credit applied to ' + inv.no + ' · ' + cname(pid), source: 'receipt',
        lines: [{ acc: '2400', dr: x.a }, { acc: '1200', cr: x.a }] }, async je => {
      for (const u of used) {
        if (u.t === 'r') {
          const r = E.D.receipts.find(q => q.id === u.id), b = clone(r);
          r.applied = (r.applied || []).concat([{ appId: no, kind: 'invoice', date, a: u.a, invId: inv.id, jeId: je.id }]);
          await E.save('receipts', r, b);
        } else {
          const c = E.D.cheques.find(q => q.id === u.id), b = clone(c);
          c.applied = (c.applied || []).concat([{ appId: no, kind: 'invoice', date, jeId: je.id, id: inv.id, a: u.a }]);
          (c.log = c.log || []).push({ date: E.today(), at: new Date().toISOString(), ev: 'Advance applied', note: E.m(u.a) + ' to ' + inv.no, user: E.user });
          await E.save('cheques', c, b);
        }
      }
      const b = clone(inv);
      inv.paid += x.a; inv.creditApps = (inv.creditApps || []).concat([{ no, date, a: x.a, jeId: je.id, src: used }]);
      await E.save('invoices', inv, b);
      });
    }
    return tot;
  }

  /* ── Customer credit list ── */
  E.A.cuList = () => {
    const ids = [...new Set(E.rows('receipts').map(r => r.partyId).concat(E.rows('cheques').filter(c => c.dir === 'in').map(c => c.partyId)))];
    const R = ids.map(id => ({ id, rc: sumOf(E.rows('receipts').filter(r => r.partyId === id), rcAdv), ch: sumOf(E.rows('cheques').filter(c => c.dir === 'in' && c.partyId === id), chqAdv) })).filter(x => x.rc + x.ch > 0)
      .sort((a, b) => cname(a.id).localeCompare(cname(b.id)));
    const led = E.acct('2400') ? E.bal('2400') : 0, tot = E.custCreditTotal();
    E.modal('Customer credit (overpayments & advances)', `
      <div class="kp"><div class="kpi"><div class="l">Customer credit held</div><div class="v">${E.m(tot)}</div></div><div class="kpi"><div class="l">Ledger 2400</div><div class="v">${E.m(led)}</div><div class="s">${led === tot ? '<span class="ok">Agrees</span>' : '<span class="bad">Differs by ' + E.m(led - tot) + '</span>'}</div></div></div>
      <div class="tw"><table><thead><tr><th>Customer</th><th class="r">From receipts</th><th class="r">From advance cheques</th><th class="r">Credit left</th><th class="r">Unpaid invoices</th><th></th></tr></thead><tbody>
      ${R.map(x => { const o = sumOf(E.rows('invoices').filter(i => i.partyId === x.id && !i.cancelled), ib);
        return `<tr><td><b>${cname(x.id)}</b></td><td class="r">${E.m(x.rc)}</td><td class="r">${E.m(x.ch)}</td><td class="r"><b>${E.m(x.rc + x.ch)}</b></td><td class="r">${E.m(o)}</td>
        <td class="r"><button class="btn sm p" data-a="cuApply" data-id="${x.id}">Apply to invoices</button> ${x.rc > 0 ? `<button class="btn sm" data-a="cuRefund" data-id="${x.id}">Refund</button>` : ''} <button class="btn sm" data-a="cuHist" data-id="${x.id}">History</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No customer has credit with us</td></tr>'}
      </tbody></table></div>
      <p class="muted">Credit comes from receipts that were more than the invoices selected (use <b>Receive Payment</b>) and from advance cheques. It is a liability in account 2400 until applied or refunded.</p>`, `<button class="btn" data-a="close">Close</button>`, 1);
  };

  /* ── Apply credit to invoices ── */
  function cuSum() {
    const pid = E.$('cu_p').dataset.id, cr = E.custCredit(pid), al = sumOf([...document.querySelectorAll('.cua')], i => E.c(i.value)), e = E.$('cu_s');
    if (e) e.innerHTML = `Applying <b>${E.m(al)}</b> of ${E.m(cr)} · ${al > cr ? '<b class="bad">More than the credit available</b>' : 'credit left <b>' + E.m(cr - al) + '</b>'}`;
  }
  E.hooks.push(e => { if (e.target.classList && e.target.classList.contains('cua')) cuSum(); });
  E.A.cuApply = pid => {
    const cr = E.custCredit(pid), inv = E.rows('invoices').filter(i => i.partyId === pid && !i.cancelled && ib(i) > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (!(cr > 0)) return E.toast('This customer has no credit', 'error');
    if (!inv.length) return E.toast('No unpaid invoices for ' + cu(pid).name + ' yet. The credit stays on account.', 'error');
    let left = cr;
    E.modal('Apply credit · ' + cu(pid).name, `<p>Credit available <b>${E.m(cr)}</b></p>
      <div class="f" style="max-width:220px">Date<input id="cu_d" type="date" value="${E.today()}"></div><span id="cu_p" data-id="${pid}"></span>
      <div class="tw"><table><thead><tr><th>Invoice</th><th>Date</th><th class="r">Balance</th><th class="r">Apply</th></tr></thead><tbody>
      ${inv.map(i => { const a = Math.min(left, ib(i)); left -= a; return `<tr><td>${i.no}</td><td>${i.date}</td><td class="r">${E.m(ib(i))}</td><td><input class="cua" type="number" step="0.01" data-id="${i.id}" value="${a ? (a / 100).toFixed(2) : ''}" style="width:100px"></td></tr>`; }).join('')}
      </tbody></table></div><div class="tot" id="cu_s"></div>
      <p class="muted">Posts Dr Customer Advances (2400) / Cr Trade Receivables (1200) for each invoice.</p>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cuApplySave" data-id="${pid}">Apply</button>`, 1);
    cuSum();
  };
  E.A.cuApplySave = async pid => {
    try {
      const al = [...document.querySelectorAll('.cua')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0), d = E.val('cu_d') || E.today();
      const t = await applyCredit(pid, al, d);
      E.closeM(); E.go(); E.toast('Credit of ' + E.m(t) + ' applied', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── Refund credit to the customer ── */
  E.A.cuRefund = pid => {
    const rc = sumOf(E.rows('receipts').filter(r => r.partyId === pid), rcAdv);
    if (!(rc > 0)) return E.toast('Only credit that came from receipts can be refunded here (advance cheques are handled in the Cheque Desk)', 'error');
    E.modal('Refund credit · ' + cu(pid).name, `<p>Refundable credit <b>${E.m(rc)}</b></p>
      <div class="g2"><div class="f">Date<input id="rf_d" type="date" value="${E.today()}"></div>
      <div class="f">Amount<input id="rf_a" type="number" step="0.01" value="${(rc / 100).toFixed(2)}"></div>
      <div class="f">Paid from<select id="rf_s"><option value="">—</option>${E.opts(a => a.bank)}</select></div>
      <div class="f">Note<input id="rf_n" placeholder="e.g. returned by bank transfer"></div></div>
      <p class="muted">Posts Dr Customer Advances (2400) / Cr the cash or bank account you choose.</p>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cuRefundSave" data-id="${pid}">Refund</button>`, 1);
  };
  E.A.cuRefundSave = async pid => {
    try {
      const amt = E.c(E.val('rf_a')), acc = E.val('rf_s'), d = E.val('rf_d') || E.today();
      const rs = E.rows('receipts').filter(r => r.partyId === pid && rcAdv(r) > 0).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no)), rc = sumOf(rs, rcAdv);
      if (!(amt > 0)) throw new Error('Enter amount');
      if (amt > rc) throw new Error('More than the refundable credit (' + E.m(rc) + ')');
      if (!acc) throw new Error('Choose the cash / bank account');
      if (E.bal(acc) < amt) throw new Error('Insufficient funds in the account (' + E.m(E.bal(acc)) + ')');
      await need2400();
      const no = await E.next('CRF');
      await E.postThen({ date: d, ref: no, narr: 'Refund of customer credit · ' + cname(pid) + (E.val('rf_n') ? ' · ' + E.val('rf_n') : ''), source: 'receipt',
        lines: [{ acc: '2400', dr: amt }, { acc, cr: amt }] }, async je => {
        let left = amt;
        for (const r of rs) {
          if (left <= 0) break;
          const take = Math.min(left, rcAdv(r)); if (take <= 0) continue;
          const b = clone(r); r.applied = (r.applied || []).concat([{ rid: E.uid(), appId: no, kind: 'refund', date: d, a: take, acc, jeId: je.id }]); left -= take;
          await E.save('receipts', r, b);
        }
      });
      E.closeM(); E.go(); E.toast(E.m(amt) + ' refunded (' + no + ')', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── History / undo ── */
  E.A.cuHist = pid => {
    const rs = E.rows('receipts').filter(r => r.partyId === pid && r.kind !== 'credit' && !r.reversed && (r.advance || 0) > 0).sort((a, b) => a.date.localeCompare(b.date));
    const cs = E.rows('cheques').filter(c => c.dir === 'in' && c.partyId === pid && (c.applied || []).length);
    const ev = [];
    rs.forEach(r => (r.applied || []).forEach(x => ev.push({ d: x.date, ref: r.no, t: x.kind === 'refund' ? 'Refund' : 'Applied to ' + ((E.D.invoices.find(q => q.id === x.invId) || {}).no || '?'), a: x.a, rev: x.reversed, k: x.kind === 'refund' ? 'rf|' + r.id + '|' + x.rid : 'ap|' + x.invId + '|' + x.appId })));
    E.rows('invoices').filter(i => i.partyId === pid).forEach(i => (i.creditApps || []).forEach(x => { if (x.src.some(s => s.t === 'c')) ev.push({ d: x.date, ref: x.no, t: 'Cheque advance applied to ' + i.no, a: sumOf(x.src.filter(s => s.t === 'c'), s => s.a), rev: x.reversed, k: 'ap|' + i.id + '|' + x.no, chq: 1 }); }));
    ev.sort((a, b) => a.d.localeCompare(b.d));
    E.modal('Credit history · ' + cu(pid).name, `
      <div class="tw"><table><thead><tr><th>Receipt</th><th>Date</th><th class="r">Received</th><th class="r">Kept on account</th><th class="r">Used / refunded</th><th class="r">Left</th></tr></thead><tbody>
      ${rs.map(r => `<tr><td>${r.no}</td><td>${r.date}</td><td class="r">${E.m(r.amount)}</td><td class="r">${E.m(r.advance)}</td><td class="r">${E.m(sumOf(live(r), x => x.a))}</td><td class="r"><b>${E.m(rcAdv(r))}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No overpayments on receipts</td></tr>'}
      </tbody></table></div>
      <h4 style="margin:12px 0 4px">Applications and refunds</h4>
      <div class="tw"><table><thead><tr><th>Date</th><th>Ref</th><th>What</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${ev.map(x => `<tr style="${x.rev ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${x.d}</td><td>${E.esc(x.ref)}</td><td>${E.esc(x.t)}</td><td class="r">${E.m(x.a)}</td><td class="r">${x.rev ? '<span class="tag">Undone</span>' : (E.role === 'owner' || E.role === 'accountant' ? `<button class="btn sm d" data-a="cuUndo" data-id="${x.k}" data-pid="${pid}">Undo</button>` : '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing applied or refunded yet</td></tr>'}
      </tbody></table></div>`, `<button class="btn" data-a="close">Close</button>`, 1);
  };
  E.A.cuUndo = async key => {
    try {
      if (!(E.role === 'owner' || E.role === 'accountant')) throw new Error('Only an Owner or Accountant can undo this');
      const [kind, a, b2] = key.split('|');
      if (kind === 'rf') {                                                   /* undo a refund:  a = receipt id, b2 = refund id */
        const r = E.D.receipts.find(q => q.id === a), x = r && (r.applied || []).find(q => q.rid === b2);
        if (!x || x.reversed) throw new Error('Already undone');
        if (!confirm('Undo this refund of ' + E.m(x.a) + '? The money goes back on account as credit.')) return;
        await E.reverse(x.jeId);
        const bf = clone(r); x.reversed = true; await E.save('receipts', r, bf);
      } else {                                                               /* undo an application:  a = invoice id, b2 = application no */
        const inv = E.D.invoices.find(q => q.id === a), ap = inv && (inv.creditApps || []).find(q => q.no === b2);
        if (!ap || ap.reversed) throw new Error('Already undone');
        const entries = ap.src.map(s => {
          const o = s.t === 'r' ? E.D.receipts.find(q => q.id === s.id) : E.D.cheques.find(q => q.id === s.id);
          return { o, x: o && (o.applied || []).find(q => q.appId === ap.no && !q.reversed), s };
        });
        if (entries.some(e => !e.x)) throw new Error('This application was already reversed elsewhere (for example a bounced cheque)');
        if (!confirm('Undo applying ' + E.m(ap.a) + ' to ' + inv.no + '? The invoice becomes unpaid again and the credit returns.')) return;
        await E.reverse(ap.jeId);
        for (const e of entries) { const bf = clone(e.o); e.x.reversed = true; await E.save(e.s.t === 'r' ? 'receipts' : 'cheques', e.o, bf); }
        const bi = clone(inv); inv.paid = Math.max(0, inv.paid - ap.a); ap.reversed = true; await E.save('invoices', inv, bi);
      }
      E.closeM(); E.go(); E.toast('Undone', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ═════════════ Receive payment (now accepts overpayments) ═════════════ */
  function rBills() {
    const pid = E.val('k_p'), b = E.rows('invoices').filter(i => i.partyId === pid && !i.cancelled && ib(i) > 0).sort((a, b) => a.date.localeCompare(b.date));
    E.$('k_b').innerHTML = b.length ? `<div class="tw"><table><thead><tr><th>Invoice</th><th>Date</th><th class="r">Balance</th><th class="r">Receive</th></tr></thead><tbody>${b.map(i => `<tr><td>${i.no}</td><td>${i.date}</td><td class="r">${E.m(ib(i))}</td><td><input class="kal" type="number" step="0.01" data-id="${i.id}" style="width:100px"></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">This customer has no unpaid invoices. Anything received will be kept as customer credit.</p>';
    const cr = pid ? E.custCredit(pid) : 0;
    E.$('k_cr').innerHTML = cr > 0 ? `<p class="muted">This customer already has <b>${E.m(cr)}</b> credit on account.</p>` : '';
    rSum();
  }
  function rSum() {
    const e = E.$('k_sm'); if (!e) return;
    const amt = E.c(E.val('k_a')), al = sumOf([...document.querySelectorAll('.kal')], i => E.c(i.value)), rem = amt - al;
    e.innerHTML = `Received <b>${E.m(amt)}</b> · applied to invoices <b>${E.m(al)}</b> · ` + (rem < 0 ? '<b class="bad">applied more than received</b>' : rem > 0 ? 'kept as customer credit <b class="ok">' + E.m(rem) + '</b>' : 'fully applied');
  }
  function rFifo() {
    let left = E.c(E.val('k_a'));
    document.querySelectorAll('.kal').forEach(i => { const a = Math.min(left, ib(E.D.invoices.find(x => x.id === i.dataset.id))); left -= a; i.value = a ? (a / 100).toFixed(2) : ''; });
    rSum();
  }
  E.hooks.push(e => {
    if (e.target.id === 'k_p') { rBills(); rFifo(); }
    if (e.target.id === 'k_a') rFifo();
    if (e.target.classList && e.target.classList.contains('kal')) rSum();
  });

  E.A.recv = pid0 => {
    const custs = E.rows('parties').filter(p => p.active !== false && p.type !== 'Supplier').sort((a, b) => a.name.localeCompare(b.name));
    if (!custs.length) return E.toast('Add a customer first', 'error');
    const pre = (typeof pid0 === 'string' && pid0) ? pid0 : '';
    E.modal('Receive payment', `
      <div class="g2">
        <div class="f">Customer<select id="k_p">${custs.map(p => `<option value="${p.id}" ${p.id === pre ? 'selected' : ''}>${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Date<input id="k_d" type="date" value="${E.today()}"></div>
        <div class="f">Received into<select id="k_s"><option value="">—</option>${E.opts(a => a.bank)}</select></div>
        <div class="f">Amount received<input id="k_a" type="number" step="0.01"></div>
      </div>
      <div id="k_cr"></div><div id="k_b"></div><div class="tot" id="k_sm"></div>
      <p class="muted">If the customer pays <b>more</b> than the invoices you tick (or has no invoices), the extra is kept as <b>customer credit</b> (account 2400) and can be applied to a later invoice or refunded.</p>
      <div class="f">Notes<input id="k_n"></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRecv">Post</button>`, 1);
    rBills();
  };

  E.A.rcptList = () => {
    const R = E.rows('receipts').filter(r => r.kind !== 'credit' && r.jeId).sort((a, b) => b.no.localeCompare(a.no));
    E.modal('Customer receipts', `<div class="tw"><table><thead><tr><th>No</th><th>Date</th><th>Customer</th><th class="r">Amount</th><th>Applied to</th><th class="r">Credit kept</th><th></th></tr></thead><tbody>${R.map(r => `<tr style="${r.reversed ? 'opacity:.5' : ''}"><td>${r.no}</td><td>${r.date}</td><td>${E.esc((cu(r.partyId) || {}).name || '?')}</td><td class="r">${E.m(r.amount)}</td><td class="muted">${(r.allocs || []).map(x => { const i = E.D.invoices.find(q => q.id === x.id); return (i ? i.no : '?') + ' ' + E.m(x.a); }).join(', ')}</td><td class="r">${(r.advance || 0) > 0 ? E.m(r.advance) + (rcAdv(r) < r.advance ? ' <span class="muted">(' + E.m(rcAdv(r)) + ' left)</span>' : '') : ''}</td><td class="r"><button class="btn sm" data-a="prRcpt" data-id="${r.id}">🖨</button> ${r.reversed ? '<span class="tag">Reversed ' + (r.reversedOn || '') + '</span>' : '<button class="btn sm d" data-a="revRecv" data-id="' + r.id + '">Reverse</button>'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No receipts</td></tr>'}</tbody></table></div>
      <p class="muted">Reversing posts the opposite journal entry today and puts the amount back on the invoice(s). A receipt whose credit has already been applied or refunded must have those undone first (Customer credit → History).</p>`, `<button class="btn" data-a="close">Close</button>`, 1);
  };
  E.A.revRecv = async id => {
    try {
      if (!(E.role === 'owner' || E.role === 'accountant')) throw new Error('Only an Owner or Accountant can reverse a receipt');
      const r = E.D.receipts.find(x => x.id === id);
      if (!r || r.kind === 'credit') throw new Error('Receipt not found');
      if (r.reversed) throw new Error('Already reversed');
      if ((r.advance || 0) > 0 && live(r).length) throw new Error('Part of the credit on this receipt was already applied or refunded. Undo that first (Sales → Customer credit → History).');
      if (!confirm('Reverse ' + r.no + ' (' + E.m(r.amount) + ')? The invoices become unpaid again' + ((r.advance || 0) > 0 ? ' and the ' + E.m(r.advance) + ' customer credit is removed.' : '.'))) return;
      const u = E.undoStack();
      try {
        for (const x of (r.allocs || [])) { const i = E.D.invoices.find(q => q.id === x.id); if (!i) continue; await E.saveU(u, 'invoices', i, q => { q.paid = Math.max(0, q.paid - x.a); }); }
        await E.saveU(u, 'receipts', r, q => { q.reversed = true; q.reversedOn = E.today(); });
        if (r.jeId && !E.isReversed(r.jeId)) await E.reverse(r.jeId);
      } catch (err) { await u.rollback(); err.message = (err.message || 'Failed') + ' (nothing was changed)'; throw err; }
      E.closeM(); E.go(); E.toast(r.no + ' reversed', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.saveRecv = async () => {
    try {
      const amt = E.c(E.val('k_a')), s = E.val('k_s'), pid = E.val('k_p'), d = E.val('k_d');
      if (!pid) throw new Error('Choose the customer');
      if (amt <= 0) throw new Error('Enter amount');
      if (!s) throw new Error('Select account');
      if (!d) throw new Error('Choose the date');
      const al = [...document.querySelectorAll('.kal')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0), allocT = sumOf(al, x => x.a);
      if (allocT > amt) throw new Error('You applied ' + E.m(allocT) + ' to invoices but only received ' + E.m(amt));
      for (const x of al) {
        const i = E.D.invoices.find(q => q.id === x.id);
        if (!i || i.cancelled || i.partyId !== pid) throw new Error('Invoice not available');
        if (x.a > ib(i)) throw new Error(i.no + ': allocation ' + E.m(x.a) + ' is more than the balance ' + E.m(ib(i)));
      }
      const rem = amt - allocT;
      if (rem > 0 && !confirm(E.m(rem) + ' is not applied to any invoice.\n\nKeep it as customer credit (advance / overpayment) for ' + cu(pid).name + '?\nIt will be held in account 2400 and can be applied to a later invoice or refunded.')) return;
      if (rem > 0) await need2400();
      const no = await E.next('RCT');
      const lines = [{ acc: s, dr: amt }];
      if (allocT > 0) lines.push({ acc: '1200', cr: allocT });
      if (rem > 0) lines.push({ acc: '2400', cr: rem });
      await E.postThen({ date: d, ref: no, narr: (E.val('k_n') || 'Receipt') + ' · ' + cu(pid).name + (rem > 0 ? ' · incl. credit ' + E.m(rem) : ''), source: 'receipt', lines }, async je => {
        for (const x of al) { const i = E.D.invoices.find(q => q.id === x.id), b = JSON.parse(JSON.stringify(i)); i.paid += x.a; await E.save('invoices', i, b); }
        await E.save('receipts', { no, date: d, partyId: pid, acc: s, amount: amt, allocs: al, advance: rem, applied: [], jeId: je.id });
      });
      E.closeM(); E.go(); E.toast(no + ' posted' + (rem > 0 ? ' · ' + E.m(rem) + ' kept as customer credit' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);
