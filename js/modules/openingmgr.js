/* Opening Balances manager — enter, CORRECT and permanently remove opening balances at any past date.
   Lists every opening entry (cash & bank, customers, suppliers, stock, employee advances) with Edit and Delete. A correction posts the new
   entry first, updates the linked record, then removes the old entry, so the books are never left half-changed. */
(E => {
  const can = () => E.role === 'owner' || E.role === 'accountant';
  const od = () => E.setting('openingDate') || E.today();
  const party = id => (E.rows('parties').find(p => p.id === id) || {}).name || '';
  const OJ = () => E.rows('journalEntries').filter(j => j.source === 'opening' && !j.reversedBy).sort((a, b) => (a.date + a.no).localeCompare(b.date + b.no));
  const sumDr = (j, f) => j.lines.filter(f).reduce((s, l) => s + l.dr, 0);
  const sumCr = (j, f) => j.lines.filter(f).reduce((s, l) => s + l.cr, 0);
  const flush = async () => { try { await firebase.firestore().waitForPendingWrites(); } catch (x) { } };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* unit cost already entered in Items: materials = purchase price; finished goods = cost per pair x pairs in the pack (cost per pack) */
  const itemUnit = iid => { const it = E.D.items.find(x => x.id === iid); if (!it) return 0; return it.cat === 'Finished Good' ? Math.round((it.cost || 0) * (it.pack || 1)) : (it.buyPrice || 0); };
  E.A.opCalc = () => { const q = parseFloat(E.val('oe_q')) || 0, u = E.c(E.val('oe_u')), a = E.$('oe_a'); if (a) a.value = (Math.round(q * u) / 100).toFixed(2); };
  E.A.obStockCalc = fromItem => {
    const s = E.skuFind(E.val('ost_i'));
    if (fromItem && s) { const u = itemUnit(s.itemId); if (u && E.$('ost_c')) E.$('ost_c').value = (u / 100).toFixed(2); }
    const q = parseFloat(E.val('ost_q')) || 0, c = E.c(E.val('ost_c')), v = E.$('ost_v'); if (v) v.value = (Math.round(q * c) / 100).toFixed(2);
  };
  function classify(j) {
    const has = c => j.lines.some(l => l.acc === c);
    const moves = E.rows('stockMoves').filter(m => m.type === 'opening' && m.ref === j.ref);
    if (has('1200')) { const r = E.rows('invoices').find(x => x.jeId === j.id) || E.rows('invoices').find(x => x.opening && x.no === j.ref); return { k: 'cust', t: 'Customer', rec: r, name: r ? party(r.partyId) : '', amt: sumDr(j, l => l.acc === '1200') }; }
    if (has('2000')) { const r = E.rows('purchases').find(x => x.jeId === j.id) || E.rows('purchases').find(x => x.opening && x.no === j.ref); return { k: 'supp', t: 'Supplier', rec: r, name: r ? party(r.partyId) : '', amt: sumCr(j, l => l.acc === '2000') }; }
    if ((has('1300') || has('1320')) && moves.length) { const s = E.skuList().find(x => x.itemId === moves[0].itemId && x.variantId === (moves[0].variantId || '')); return { k: 'stock', t: 'Stock', moves, name: s ? s.label : 'Item', amt: sumDr(j, l => l.acc !== '3200'), qty: moves.reduce((a, m) => a + m.qty, 0) }; }
    if (has('1250')) { const r = E.rows('wageRuns').find(x => x.kind === 'advance' && (x.jeId === j.id || x.no === j.ref)); const em = r && E.rows('employees').find(e => e.id === r.empId); return { k: 'adv', t: 'Employee advance', rec: r, name: em ? em.name : '', amt: sumDr(j, l => l.acc === '1250') }; }
    return { k: 'bank', t: 'Cash / bank', name: j.lines.filter(l => l.acc !== '3200').map(l => (E.acct(l.acc) || {}).name || l.acc).join(', '), amt: sumDr(j, l => l.acc !== '3200') };
  }

  E.route('opening', 'Opening Balances', () => {
    if (!can()) return '<div class="card muted">Only the owner or accountant can manage opening balances.</div>';
    const d0 = od(), ps = E.rows('parties').filter(p => p.active), sp = ps.filter(p => p.type !== 'Customer'), cp = ps.filter(p => p.type !== 'Supplier');
    const ba = E.rows('coa').filter(a => a.bank || a.code === '1010').sort((a, b) => a.code.localeCompare(b.code));
    const rows = OJ().map(j => ({ j, c: classify(j) }));
    const eq = E.bal('3200');
    const list = rows.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Name / item</th><th>Ref</th><th class="r">Amount</th><th></th></tr></thead><tbody>${rows.map(({ j, c }) => `<tr><td>${j.date}</td><td>${c.t}</td><td>${E.esc(c.name)}</td><td>${E.esc(j.ref || '')}</td><td class="r">${E.m(c.amt)}${c.k === 'stock' ? `<div class="muted">${Math.round(c.qty * 1000) / 1000} units</div>` : ''}</td><td class="r"><button class="btn sm" data-a="opEdit" data-id="${j.id}">✏ Edit</button> <button class="btn sm d" data-a="opDel" data-id="${j.id}">🗑 Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No opening entries yet.</p>';
    const pick = list => list.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('');
    return `<div class="kp">${E.kpi('Opening date', d0, 'default for all entries below')}${E.kpi('Opening entries', rows.length, 'listed below')}${E.kpi('Owner capital (balancing)', E.m(eq), 'assets − liabilities')}</div>
    <div class="card"><h3>0 · Opening date</h3><p class="muted">Running factory? Set the day your books start (for example the 10th). Every opening entry below defaults to this date; enter all transactions from this date onward.</p>
      <div class="bar"><div class="f" style="margin:0">Books start on<input id="od_d" type="date" value="${d0}"></div><button class="btn p" data-a="opSetDate">Save opening date</button></div></div>
    <div class="card"><h3>Existing opening entries — edit or delete</h3><p class="muted">Wrong figures from the incharge? Edit the amount/date, or delete the line and enter it again. Nothing stays half-changed.</p>${list}
      <div class="bar" style="margin-top:10px"><span class="gap"></span><button class="btn d" data-a="opWipe">🗑 Delete ALL opening entries</button></div></div>
    <div class="card"><h3>1 · Cash & bank balances</h3><div class="f">As at date<input id="o_d" type="date" value="${d0}"></div>${ba.map(a => `<div class="f">${a.code} · ${E.esc(a.name)} (Rs)<input class="ob" data-acc="${a.code}" type="number" step="0.01"></div>`).join('')}<button class="btn p" data-a="obBank">Post cash & bank opening</button><p class="muted">Dr each account / Cr Owner Capital. To change a balance later, edit or delete the line above.</p></div>
    <div class="card"><h3>2 · Amounts you owe suppliers</h3><div class="g2"><div class="f">Supplier<select id="os_p">${pick(sp)}</select></div><div class="f">Bill / reference<input id="os_r"></div><div class="f">Bill date<input id="os_d" type="date" value="${d0}"></div><div class="f">Amount owing (Rs)<input id="os_a" type="number" step="0.01"></div></div><button class="btn p" data-a="obSup">Add supplier opening bill</button></div>
    <div class="card"><h3>3 · Amounts customers owe you</h3><div class="g2"><div class="f">Customer<select id="oc_p">${pick(cp)}</select></div><div class="f">Invoice / reference<input id="oc_r"></div><div class="f">Invoice date<input id="oc_d" type="date" value="${d0}"></div><div class="f">Amount owed (Rs)<input id="oc_a" type="number" step="0.01"></div></div><button class="btn p" data-a="obCus">Add customer opening invoice</button></div>
    <div class="card"><h3>4 · Opening stock</h3><datalist id="sk">${E.skuOpts()}</datalist><div class="g2"><div class="f">Item / colour<input id="ost_i" list="sk" placeholder="Search item" oninput="E.A.obStockCalc(1)"></div><div class="f">Date<input id="ost_d" type="date" value="${d0}"></div><div class="f">Quantity (packs for finished goods)<input id="ost_q" type="number" step="0.01" oninput="E.A.obStockCalc()"></div><div class="f">Cost per unit (Rs; per PACK for finished goods) — filled from Items<input id="ost_c" type="number" step="0.01" oninput="E.A.obStockCalc()"></div><div class="f">Total value (Rs)<input id="ost_v" readonly style="background:var(--s2)"></div></div><button class="btn p" data-a="obStock">Add opening stock</button></div>
    <div class="card"><h3>5 · Employee advances</h3><div class="g2"><div class="f">Employee<select id="oa_e">${E.rows('employees').filter(e => e.active !== false).map(e => `<option value="${e.id}">${E.esc(e.name)}</option>`).join('')}</select></div><div class="f">Date<input id="oa_d" type="date" value="${d0}"></div><div class="f">Advance outstanding (Rs)<input id="oa_a" type="number" step="0.01"></div></div><button class="btn p" data-a="obAdv">Add opening advance</button></div>`;
  });

  E.A.opSetDate = async () => { try { const d = E.val('od_d'); if (!d) throw new Error('Choose a date'); await E.setSetting({ openingDate: d }); E.go(); E.toast('Opening date saved', 'success'); } catch (e) { E.toast(e.message, 'error'); } };

  /* ---- add: stock and advances (customers, suppliers and cash/bank use the existing forms) ---- */
  E.A.obStock = async () => {
    try {
      const s = E.skuFind(E.val('ost_i')), q = parseFloat(E.val('ost_q')) || 0, c = E.c(E.val('ost_c')), d = E.val('ost_d');
      if (!s) throw new Error('Choose an item from the list'); if (!(q > 0)) throw new Error('Enter the quantity'); if (!(c > 0)) throw new Error('Enter the cost per unit'); if (!d) throw new Error('Choose a date');
      const val = Math.round(q * c), ref = await E.next('ADJ'), acc = s.cat === 'Finished Good' ? '1320' : '1300';
      await E.postThen({ date: d, ref, narr: 'Opening stock · ' + s.label, source: 'opening', lines: [{ acc, dr: val }, { acc: '3200', cr: val }] },
        () => E.stockIn({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, value: val, type: 'opening', ref }));
      E.go(); E.toast(ref + ' added', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.obAdv = async () => {
    try {
      const em = E.rows('employees').find(x => x.id === E.val('oa_e')), a = E.c(E.val('oa_a')), d = E.val('oa_d');
      if (!em) throw new Error('Choose an employee'); if (!(a > 0)) throw new Error('Enter the amount'); if (!d) throw new Error('Choose a date');
      const no = await E.next('ADV');
      await E.postThen({ date: d, ref: no, narr: 'Opening advance · ' + em.name, source: 'opening', lines: [{ acc: '1250', dr: a }, { acc: '3200', cr: a }] },
        je => E.save('wageRuns', { no, kind: 'advance', empId: em.id, date: d, amount: a, note: 'Opening advance', jeId: je.id, opening: true, cancelled: false }));
      E.go(); E.toast(no + ' added', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---- edit ---- */
  const find = id => { const j = E.rows('journalEntries').find(x => x.id === id); return j && { j, c: classify(j) }; };
  E.A.opEdit = id => {
    const f = find(id); if (!f) return E.toast('Entry not found', 'error');
    const { j, c } = f; let body = `<div class="f">Date<input id="oe_d" type="date" value="${j.date}"></div>`;
    if (c.k === 'bank') body += j.lines.filter(l => l.acc !== '3200').map(l => `<div class="f">${l.acc} · ${E.esc((E.acct(l.acc) || {}).name || '')} (Rs)<input class="oeb" data-acc="${l.acc}" type="number" step="0.01" value="${(l.dr / 100).toFixed(2)}"></div>`).join('');
    else if (c.k === 'stock') {
      const m0 = c.moves[0], fgI = (E.D.items.find(x => x.id === m0.itemId) || {}).cat === 'Finished Good', u0 = itemUnit(m0.itemId) || Math.round(c.amt / (c.qty || 1));
      body += `<div class="g2"><div class="f">Quantity${fgI ? ' (packs)' : ''}<input id="oe_q" type="number" step="0.01" value="${Math.round(c.qty * 1000) / 1000}" oninput="E.A.opCalc()"></div><div class="f">Unit cost (Rs${fgI ? ' per pack' : ''}) — from Items<input id="oe_u" type="number" step="0.01" value="${(u0 / 100).toFixed(2)}" oninput="E.A.opCalc()"></div></div><div class="f">Total value (Rs) = quantity × unit cost<input id="oe_a" readonly style="background:var(--s2)" value="${(c.amt / 100).toFixed(2)}"></div><p class="muted">${E.esc(c.name)}. The value follows the quantity automatically, using the cost already entered in Items.</p>`;
    }
    else body += `<div class="f">Amount (Rs)<input id="oe_a" type="number" step="0.01" value="${(c.amt / 100).toFixed(2)}"></div><p class="muted">${E.esc(c.t)}${c.name ? ' · ' + E.esc(c.name) : ''} · ${E.esc(j.ref || '')}</p>`;
    E.modal('Edit opening · ' + c.t, body, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opEditSave" data-id="${id}">Save correction</button>`);
  };
  async function swap(j, lines, after) {          /* post new → update linked records → delete old */
    const nje = await E.post({ date: E.val('oe_d') || j.date, ref: j.ref, narr: j.narr, source: 'opening', lines });
    try { await after(nje); } catch (err) { try { await E.del('journalEntries', nje.id); } catch (x) { } throw err; }
    await E.audit('opening-edit', 'journalEntries', j.id, j, nje); await E.del('journalEntries', j.id);
  }
  E.A.opEditSave = async id => {
    try {
      const f = find(id); if (!f) throw new Error('Entry not found'); const { j, c } = f, d = E.val('oe_d'); if (!d) throw new Error('Choose a date');
      if (c.k === 'bank') {
        const L = [...document.querySelectorAll('.oeb')].map(i => ({ acc: i.dataset.acc, dr: E.c(i.value) })).filter(x => x.dr > 0), t = L.reduce((s, x) => s + x.dr, 0);
        if (!L.length) throw new Error('Enter at least one balance, or delete the entry');
        await swap(j, L.concat([{ acc: '3200', cr: t }]), async () => { });
      } else if (c.k === 'cust' || c.k === 'supp') {
        const a = E.c(E.val('oe_a')); if (!(a > 0)) throw new Error('Enter the amount');
        if (c.rec && (c.rec.paid || 0) > 0) throw new Error('Payments already exist against this entry. Reverse them first.');
        const col = c.k === 'cust' ? 'invoices' : 'purchases';
        const lines = c.k === 'cust' ? [{ acc: '1200', dr: a }, { acc: '3200', cr: a }] : [{ acc: '3200', dr: a }, { acc: '2000', cr: a }];
        await swap(j, lines, async nje => { if (!c.rec) return; const b = clone(c.rec); c.rec.date = d; c.rec.total = a; if (c.k === 'cust') c.rec.gross = a; c.rec.jeId = nje.id; await E.save(col, c.rec, b); });
      } else if (c.k === 'adv') {
        const a = E.c(E.val('oe_a')); if (!(a > 0)) throw new Error('Enter the amount');
        await swap(j, [{ acc: '1250', dr: a }, { acc: '3200', cr: a }], async nje => { if (!c.rec) return; const b = clone(c.rec); c.rec.date = d; c.rec.amount = a; c.rec.jeId = nje.id; await E.save('wageRuns', c.rec, b); });
      } else if (c.k === 'stock') {
        const q = parseFloat(E.val('oe_q')) || 0, u = E.c(E.val('oe_u')), a = Math.round(q * u); if (!(q > 0) || !(u > 0)) throw new Error('Enter the quantity and the unit cost');
        if (c.moves.length !== 1) throw new Error('This entry has several stock lines. Delete it and add again.');
        const m = c.moves[0]; if (E.stock(m.itemId, m.variantId).qty - m.qty + q < -1e-9) throw new Error('Stock was already used; the quantity cannot go below what has been issued.');
        const acc = j.lines.find(l => l.acc !== '3200').acc;
        await swap(j, [{ acc, dr: a }, { acc: '3200', cr: a }], async () => { await E.put('stockMoves', Object.assign(m, { date: d, qty: q, value: a })); });
      }
      await flush(); E.closeM(); E.go(); E.toast('Opening entry corrected', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---- delete ---- */
  async function remove(j, c) {
    if (c.k === 'cust' || c.k === 'supp') { if (c.rec && (c.rec.paid || 0) > 0) throw new Error('Payments exist against this entry. Reverse them first.'); }
    if (c.k === 'stock') { for (const m of c.moves) if (E.stock(m.itemId, m.variantId).qty - m.qty < -1e-9) throw new Error('This stock was already issued/sold, so it cannot be deleted.'); }
    await E.audit('opening-delete', 'journalEntries', j.id, j, null);
    await E.del('journalEntries', j.id);
    if (c.k === 'cust' && c.rec) await E.del('invoices', c.rec.id);
    if (c.k === 'supp' && c.rec) await E.del('purchases', c.rec.id);
    if (c.k === 'adv' && c.rec) await E.del('wageRuns', c.rec.id);
    if (c.k === 'stock') for (const m of c.moves) await E.del('stockMoves', m.id);
  }
  E.A.opDel = async id => {
    try { const f = find(id); if (!f) throw new Error('Entry not found'); if (!confirm('Delete this opening entry permanently?\n' + f.c.t + ' · ' + f.c.name + ' · ' + E.m(f.c.amt))) return; await remove(f.j, f.c); await flush(); E.go(); E.toast('Deleted', 'success'); }
    catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opWipe = async () => {
    try {
      const rows = OJ(); if (!rows.length) throw new Error('No opening entries');
      if (!confirm('Delete ALL ' + rows.length + ' opening entries permanently? Use this to start the opening balances again from zero.')) return;
      if (prompt('Type ERASE to confirm') !== 'ERASE') return;
      let n = 0, bad = [];
      for (const j of rows) { const c = classify(j); try { await remove(j, c); n++; } catch (e) { bad.push(j.ref + ': ' + e.message); } }
      await flush(); E.go(); E.toast(n + ' deleted' + (bad.length ? ' · ' + bad.length + ' kept (' + bad[0] + ')' : ''), bad.length ? 'warning' : 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);
