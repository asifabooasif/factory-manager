/* Cancelled & Delete — permanently remove cancelled / reversed documents together with their ledger entries.
   Safe by design: a document is only deletable when every ledger entry linked to it has been REVERSED (net nil), so deleting the
   entry AND its reversal never changes any balance, stock quantity or report. Live documents can never be deleted from here. */
(E => {
  const DOCS = [
    { col: 'invoices', label: 'Sales invoices', t: r => r.cancelled, amt: r => r.total, who: r => r.partyId },
    { col: 'purchases', label: 'Purchase bills', t: r => r.cancelled, amt: r => r.total, who: r => r.partyId },
    { col: 'expenses', label: 'Expenses', t: r => r.cancelled, amt: r => r.amount, who: r => r.headName },
    { col: 'costRuns', label: 'Overhead absorption runs', t: r => r.cancelled, amt: r => r.amount, who: r => r.basis },
    { col: 'wageRuns', label: 'Payroll runs & advances', t: r => r.cancelled, amt: r => r.amount || r.net || r.total || 0, who: r => r.kind },
    { col: 'receipts', label: 'Customer receipts', t: r => r.reversed, amt: r => r.amount, who: r => r.partyId },
    { col: 'payments', label: 'Supplier payments', t: r => r.reversed, amt: r => r.amount, who: r => r.partyId },
    { col: 'loans', label: 'Loans', t: r => r.cancelled, amt: r => r.amount || r.principal || 0, who: r => r.name || '' }
  ];
  const JE = () => E.rows('journalEntries'), jeById = id => JE().find(j => j.id === id);
  const jeIdsOf = r => { const o = []; Object.keys(r).forEach(k => { if (/je(id)?s?$/i.test(k) || /jeid$/i.test(k)) { const v = r[k]; if (typeof v === 'string' && v) o.push(v); else if (Array.isArray(v)) v.forEach(x => typeof x === 'string' && x && o.push(x)); } }); return [...new Set(o)].filter(id => jeById(id)); };
  const pairOf = je => { const o = [je]; if (je.reversedBy) { const r = JE().find(x => x.source === 'reversal' && x.no === je.reversedBy); if (r) o.push(r); } return o; };
  const name = id => { const p = E.rows('parties').find(x => x.id === id); return p ? p.name : (id || ''); };

  /* what would be deleted for a document, and can it be deleted? */
  function plan(d, r) {
    const ids = jeIdsOf(r), jes = [], why = [];
    ids.forEach(id => { const j = jeById(id); if (!j) return; if (!j.reversedBy && j.source !== 'reversal') why.push('ledger entry ' + j.no + ' is still active'); pairOf(j).forEach(x => { if (!jes.some(y => y.id === x.id)) jes.push(x); }); });
    const moves = E.rows('stockMoves').filter(m => m.ref && m.ref === r.no);
    if (moves.length) { const net = {}; moves.forEach(m => { const k = m.itemId + '|' + (m.variantId || ''); (net[k] = net[k] || { q: 0, v: 0 }); net[k].q += m.qty; net[k].v += m.value; }); if (Object.values(net).some(x => Math.abs(x.q) > 1e-6 || Math.abs(x.v) > 1)) why.push('stock movements are not fully reversed'); }
    return { jes, moves: why.length ? [] : moves, why };
  }

  async function purgeDoc(d, r) {
    const p = plan(d, r); if (p.why.length) throw new Error(p.why.join('; '));
    const jeIds = p.jes.map(j => j.id);
    for (const j of p.jes) await E.del('journalEntries', j.id);
    for (const m of p.moves) await E.del('stockMoves', m.id);
    for (const v of E.rows('closedJobVariances').filter(v => jeIds.includes(v.sourceJeId))) await E.del('closedJobVariances', v.id);
    for (const a of E.rows('costAllocations').filter(a => jeIds.includes(a.jeId))) await E.del('costAllocations', a.id);
    await E.audit('purge', d.col, r.id, r, null);
    await E.del(d.col, r.id);
  }
  /* reversed ledger pairs that belong to no document (e.g. a manual journal that was reversed) */
  function orphans() {
    const used = new Set(); Object.keys(E.D).forEach(k => { if (k === 'journalEntries' || !Array.isArray(E.D[k])) return; E.D[k].forEach(r => { if (r && typeof r === 'object') jeIdsOf(r).forEach(i => used.add(i)); }); });
    return JE().filter(j => j.reversedBy && j.source !== 'reversal' && !used.has(j.id));
  }
  const flush = async () => { try { await firebase.firestore().waitForPendingWrites(); } catch (x) { } };
  const can = () => E.role === 'owner' || E.role === 'accountant';

  E.nav('System', 'cancelled', '🗑', 'Cancelled & Delete');
  E.route('cancelled', 'Cancelled & Delete', () => {
    if (!can()) return '<div class="card muted">Only the owner or accountant can delete records.</div>';
    const groups = DOCS.map(d => ({ d, rows: E.rows(d.col).filter(d.t) })).filter(g => g.rows.length);
    const orph = orphans();
    const total = groups.reduce((s, g) => s + g.rows.length, 0) + orph.length;
    const body = groups.map(g => `<div class="card"><h3>${g.d.label} (${g.rows.length})</h3><div class="tw"><table><thead><tr><th>No</th><th>Date</th><th>Party / detail</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>${g.rows.map(r => { const p = plan(g.d, r); return `<tr><td>${E.esc(r.no || '')}</td><td>${r.date || ''}</td><td>${E.esc(name(g.d.who(r)))}</td><td class="r">${E.m(g.d.amt(r) || 0)}</td><td>${p.why.length ? `<span class="bad">${E.esc(p.why[0])}</span>` : '<span class="ok">Safe to delete</span>'}</td><td class="r">${p.why.length ? '' : `<button class="btn sm d" data-a="pgOne" data-id="${g.d.col}|${r.id}">🗑 Delete</button>`}</td></tr>`; }).join('')}</tbody></table></div></div>`).join('');
    const ob = orph.length ? `<div class="card"><h3>Reversed journal entries (${orph.length})</h3><p class="muted">Entries that were reversed and belong to no document. Deleting an entry and its reversal changes no balance.</p><div class="tw"><table><thead><tr><th>Entry</th><th>Date</th><th>Narration</th><th></th></tr></thead><tbody>${orph.map(j => `<tr><td>${j.no} ↔ ${j.reversedBy}</td><td>${j.date}</td><td>${E.esc(j.narr || '')}</td><td class="r"><button class="btn sm d" data-a="pgJe" data-id="${j.id}">🗑 Delete pair</button></td></tr>`).join('')}</tbody></table></div></div>` : '';
    return `<div class="kp">${E.kpi('Cancelled / reversed records', total, 'waiting to be deleted')}</div>
      <div class="card"><p class="muted">Cancelling keeps a record for audit. Here you can remove cancelled documents <b>permanently</b>. Only fully reversed documents are listed as safe: the document, its ledger entry and its reversal are all removed together, so no balance, stock quantity or report changes. A backup download is offered first. Live (not cancelled) documents are never deleted here.</p>
      <div class="bar"><button class="btn" data-a="backup">⬇ Download backup first</button><span class="gap"></span><button class="btn d" data-a="pgAll" ${total ? '' : 'disabled'}>🗑 Delete ALL safe cancelled records</button></div></div>${body}${ob}${total ? '' : '<div class="card muted">Nothing cancelled. Everything is clean.</div>'}`;
  });
  const online = () => E.sync && E.sync.granted && E.sync.user && navigator.onLine;
  const warnOffline = () => online() || confirm('This device is not connected to the cloud. The deletion will happen here and be sent to the cloud when you are online again. Make sure you do not close the app before it syncs. Continue?');

  E.A.pgOne = async id => {
    try {
      const [col, rid] = id.split('|'), d = DOCS.find(x => x.col === col), r = E.rows(col).find(x => x.id === rid);
      if (!d || !r || !d.t(r)) throw new Error('Not a cancelled record');
      if (!confirm('Delete ' + (r.no || 'this record') + ' permanently? Its ledger entry and reversal are removed too. This cannot be undone.')) return;
      if (!warnOffline()) return;
      await purgeDoc(d, r); await flush(); E.go(); E.toast('Deleted permanently', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.pgJe = async id => {
    try {
      const j = jeById(id); if (!j || !j.reversedBy) throw new Error('Entry is not reversed');
      if (!confirm('Delete ' + j.no + ' and its reversal permanently?')) return;
      for (const x of pairOf(j)) await E.del('journalEntries', x.id);
      await E.audit('purge', 'journalEntries', j.id, j, null); await flush(); E.go(); E.toast('Deleted permanently', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.pgAll = async () => {
    try {
      const list = []; DOCS.forEach(d => E.rows(d.col).filter(d.t).forEach(r => { if (!plan(d, r).why.length) list.push([d, r]); }));
      const orph = orphans();
      if (!list.length && !orph.length) throw new Error('Nothing safe to delete');
      if (!confirm('Permanently delete ' + (list.length + orph.length) + ' cancelled record(s) with their ledger entries? This cannot be undone. (Tip: download a backup first.)')) return;
      if (!warnOffline()) return;
      let n = 0, bad = 0;
      for (const [d, r] of list) { try { await purgeDoc(d, r); n++; } catch (e) { bad++; } }
      for (const j of orph) { try { for (const x of pairOf(j)) await E.del('journalEntries', x.id); n++; } catch (e) { bad++; } }
      await flush(); E.go(); E.toast(n + ' deleted' + (bad ? ', ' + bad + ' skipped' : ''), bad ? 'warning' : 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.purgeDoc = purgeDoc;
})(window.ERP);
