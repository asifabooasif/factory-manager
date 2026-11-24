/* REPORT SUITE — DATA LAYER
   Every report reads through these functions so that the same number is calculated the same way everywhere.
   Ledger figures: journal entries only. Stock: stock moves only. Sales / purchases: the delivery, invoice, bill and return records,
   re-tied to the ledger accounts (4000, 4010, 5400, 1300, 1320, 1310 ...) by the Control reports. */
(E => {
  const RS = E.RS, D = RS.d = {}, memo = RS.memo;
  const isDebitNature = t => t === 'asset' || t === 'expense';

  /* ───────── chart of accounts ───────── */
  D.acct = c => E.acct(c) || { code: c, name: c, type: 'asset' };
  D.coa = () => memo('coa', () => E.rows('coa').slice().sort((a, b) => a.code.localeCompare(b.code)));
  D.nat = (a, x) => !x ? 0 : (isDebitNature(a.type) ? x.dr - x.cr : x.cr - x.dr);
  D.natC = (code, m) => { const a = E.acct(code); return a ? D.nat(a, m[code]) : 0; };

  /* ───────── journal ───────── */
  D.entries = () => memo('je', () => E.rows('journalEntries').slice().sort((a, b) => a.date.localeCompare(b.date) || (a.no || '').localeCompare(b.no || '')));
  D.jeMap = () => memo('jeMap', () => { const m = {}; E.rows('journalEntries').forEach(j => { m[j.id] = j; m['#' + j.no] = j; }); return m; });
  /* date on which a cancelled document was reversed in the ledger (null if never reversed) */
  D.revDate = jeId => { const m = D.jeMap(), j = m[jeId]; if (!j || !j.reversedBy) return null; const r = m['#' + j.reversedBy]; return r ? r.date : null; };
  /* flat list of lines with the entry attached - used by every ledger style report */
  D.lines = () => memo('lines', () => { const out = []; D.entries().forEach(j => j.lines.forEach((l, i) => out.push({ j, l, date: j.date, no: j.no, acc: l.acc, dr: l.dr || 0, cr: l.cr || 0, job: l.job || '', cat: l.cat || '', art: l.art || '', head: l.head || '', src: j.source || 'manual', i }))); return out; });
  /* {acc:{dr,cr}} for a date range ('' = open ended) */
  D.range = (from, to, f) => {
    const m = {}; D.lines().forEach(x => { if ((from && x.date < from) || (to && x.date > to)) return; if (f && !f(x)) return; const a = m[x.acc] || (m[x.acc] = { dr: 0, cr: 0 }); a.dr += x.dr; a.cr += x.cr; }); return m;
  };
  D.upTo = (to, f) => D.range('', to, f);
  D.before = (d, f) => D.range('', RS.dt.addDays(d, -1), f);
  /* natural-sign total of accounts matching a test, from a range map */
  D.sum = (m, test) => D.coa().filter(test).reduce((s, a) => s + D.nat(a, m[a.code]), 0);
  D.dayBefore = d => RS.dt.addDays(d, -1);

  /* account classification (same rules the Balance Sheet always used) */
  D.isFixed = a => a.code === '1400' || a.code === '1410' || /^14\d\d$/.test(a.code);
  D.isLoan = a => /^24(0[1-9]|[1-9]\d)$/.test(a.code);
  D.isCash = a => a.type === 'asset' && (a.bank || a.code === '1000' || a.code === '1010');
  D.isInv = a => a.type === 'asset' && /^13/.test(a.code);
  D.isRecv = a => a.type === 'asset' && !D.isCash(a) && !D.isInv(a) && !D.isFixed(a);
  D.stockAcc = ['1300', '1310', '1320'];

  /* ───────── items & parties ───────── */
  D.item = id => E.D.items.find(x => x.id === id);
  D.variant = id => id && E.D.variants.find(x => x.id === id);
  D.isFG = i => !!i && i.cat === 'Finished Good';
  D.catOf = i => !i ? 'Unknown' : (i.cat === 'Finished Good' ? (i.sub || 'Other (finished goods)') : i.cat);
  D.kindOf = i => !i ? 'Unknown' : (i.cat === 'Finished Good' ? 'Finished goods' : i.cat);
  D.code = (itemId, variantId) => { const v = D.variant(variantId), i = D.item(itemId); return v ? (v.sku || (i && i.art) || '') : ((i && i.art) || ''); };
  D.name = itemId => { const i = D.item(itemId); return i ? i.name : '(deleted item)'; };
  D.colour = variantId => { const v = D.variant(variantId); return v ? (v.color || '') : ''; };
  D.party = id => E.D.parties.find(x => x.id === id) || {};
  D.pname = id => (D.party(id).name) || (id ? '(deleted party)' : '');
  D.emp = id => E.D.employees.find(x => x.id === id) || {};
  D.job = id => E.D.jobs.find(x => x.id === id);
  D.jobNo = id => { const j = D.job(id); return j ? j.no : (id ? '(deleted job)' : ''); };
  D.pairsPerPack = itemId => { const i = D.item(itemId); return (i && i.pack) || E.setting('packSize') || 1; };

  /* ───────── stock ───────── */
  D.moves = () => memo('moves', () => E.rows('stockMoves').slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')));
  const rq = v => Math.round(v * 1000) / 1000;
  /* {itemId|variantId: {qty,value,itemId,variantId}} as at a date (inclusive) */
  D.stockAt = date => memo('stk' + date, () => { const m = {}; D.moves().forEach(x => { if (date && x.date > date) return; const k = x.itemId + '|' + (x.variantId || ''), a = m[k] || (m[k] = { qty: 0, value: 0, itemId: x.itemId, variantId: x.variantId || '' }); a.qty += x.qty; a.value += x.value; }); for (const k in m) m[k].qty = rq(m[k].qty); return m; });
  /* movements between two dates by key and type: {key:{type:{qty,value}}} */
  D.flow = (from, to) => { const m = {}; D.moves().forEach(x => { if ((from && x.date < from) || (to && x.date > to)) return; const k = x.itemId + '|' + (x.variantId || ''), a = m[k] || (m[k] = {}), t = a[x.type || 'other'] || (a[x.type || 'other'] = { qty: 0, value: 0 }); t.qty += x.qty; t.value += x.value; }); return m; };
  D.moveTypes = { opening: 'Opening stock entered', purchase: 'Purchases received', gain: 'Stock-take gain / found', release: 'Production released to finished goods', return: 'Returned from jobs', sreturn: 'Customer returns', cancel: 'Cancellations / reversals', costing: 'Final costing true-up', issue: 'Issued to jobs', sale: 'Sold (delivered)', loss: 'Losses / write-offs', preturn: 'Purchase returns', other: 'Other' };
  D.stockValueOf = (map, test) => { let s = 0; for (const k in map) { const i = D.item(map[k].itemId); if (!test || test(i)) s += map[k].value; } return s; };
  /* who a stock move came from / went to */
  D.moveParty = x => {
    const t = x.type;
    if (t === 'purchase') { const p = E.rows('purchases').find(b => b.no === x.ref); return p ? D.pname(p.partyId) : ''; }
    if (t === 'cancel' || t === 'sale') { const d = E.rows('deliveries').find(b => b.no === x.ref); if (d) return D.pname(d.partyId); const p = E.rows('purchases').find(b => b.no === x.ref); return p ? D.pname(p.partyId) : ''; }
    if (t === 'sreturn') { const r = E.rows('receipts').find(b => b.no === x.ref); return r ? D.pname(r.partyId) : ''; }
    if (t === 'preturn') { const r = E.rows('payments').find(b => b.no === x.ref); return r ? D.pname(r.partyId) : ''; }
    return '';
  };

  /* ───────── sales events (deliveries, credit notes, cancellations, discounts) ─────────
     Revenue is recognised at delivery (Dr 1210 / Cr 4000). Cancelled deliveries/invoices are reversed in the ledger on the day they were cancelled,
     so the same two-event treatment is used here: the original on its own date, the reversal on the cancel date. Period totals therefore agree with 4000 / 4010 / 5400. */
  D.salesEvents = () => memo('salesEv', () => {
    const ev = [], pk = (itemId) => D.pairsPerPack(itemId);
    const push = (o) => ev.push(Object.assign({ date: '', doc: '', ref: '', party: '', itemId: '', variantId: '', packs: 0, pairs: 0, gross: 0, ret: 0, retPacks: 0, retPairs: 0, disc: 0, cost: 0, job: '', t: 'sale', inv: '' }, o));
    E.rows('deliveries').forEach(d => {
      const cancelled = d.status === 'Cancelled', cd = cancelled ? (D.revDate(d.jeId) || d.date) : '';
      (d.lines || []).forEach(l => {
        const pairs = l.pairs != null ? l.pairs : l.qty * pk(l.itemId);
        push({ t: 'sale', date: d.date, doc: d.no, party: d.partyId, itemId: l.itemId, variantId: l.variantId || '', packs: l.qty, pairs, gross: l.amount, cost: l.cost || 0, job: d.jobId || '', inv: d.invId || '' });
        if (cancelled) push({ t: 'cancel', date: cd, doc: d.no, party: d.partyId, itemId: l.itemId, variantId: l.variantId || '', ret: l.amount, retPacks: l.qty, retPairs: pairs, cost: -(l.cost || 0), job: d.jobId || '' });
      });
    });
    E.rows('receipts').filter(r => r.kind === 'credit').forEach(r => (r.lines || []).forEach(l => push({ t: 'return', date: r.date, doc: r.no, party: r.partyId, itemId: l.itemId, variantId: l.variantId || '', ret: l.value, retPacks: l.qty, retPairs: l.qty * pk(l.itemId), cost: -(l.cost || 0), inv: r.invId })));
    E.rows('invoices').forEach(inv => {
      if (!inv.disc || !(inv.dnIds || []).length) return;
      const lines = []; inv.dnIds.forEach(id => { const d = E.D.deliveries.find(x => x.id === id); if (d) (d.lines || []).forEach(l => lines.push({ d, l })); });
      if (!lines.length) return;
      const base = lines.reduce((s, x) => s + x.l.amount, 0) || 1, cd = inv.cancelled ? (D.revDate(inv.jeId) || inv.date) : '';
      let left = inv.disc;
      lines.forEach((x, i) => { const a = i === lines.length - 1 ? left : Math.round(inv.disc * x.l.amount / base); left -= a; push({ t: 'disc', date: inv.date, doc: inv.no, party: inv.partyId, itemId: x.l.itemId, variantId: x.l.variantId || '', disc: a, job: x.d.jobId || '' }); if (inv.cancelled) push({ t: 'disc', date: cd, doc: inv.no, party: inv.partyId, itemId: x.l.itemId, variantId: x.l.variantId || '', disc: -a, job: x.d.jobId || '' }); });
    });
    return ev;
  });
  D.salesIn = (from, to, f) => D.salesEvents().filter(x => (!from || x.date >= from) && (!to || x.date <= to) && (!f || f(x)));

  /* ───────── purchase events ───────── */
  D.purchaseEvents = () => memo('purEv', () => {
    const ev = [];
    E.rows('purchases').forEach(p => {
      if (p.opening || !(p.lines || []).length) return;
      const cd = p.cancelled ? (D.revDate(p.jeId) || p.date) : '';
      p.lines.forEach(l => {
        ev.push({ t: 'buy', date: p.date, doc: p.no, supInv: p.invNo || '', party: p.partyId, itemId: l.itemId, variantId: l.variantId || '', qty: l.qty, rate: l.rate, amount: l.amount });
        if (p.cancelled) ev.push({ t: 'cancel', date: cd, doc: p.no, supInv: p.invNo || '', party: p.partyId, itemId: l.itemId, variantId: l.variantId || '', qty: -l.qty, rate: l.rate, amount: -l.amount });
      });
    });
    E.rows('payments').filter(r => r.kind === 'debit').forEach(r => (r.lines || []).forEach(l => ev.push({ t: 'return', date: r.date, doc: r.no, supInv: '', party: r.partyId, itemId: l.itemId, variantId: l.variantId || '', qty: -l.qty, rate: l.qty ? Math.round(l.value / l.qty) : 0, amount: -l.value })));
    return ev;
  });
  D.purchasesIn = (from, to, f) => D.purchaseEvents().filter(x => (!from || x.date >= from) && (!to || x.date <= to) && (!f || f(x)));

  /* ───────── jobs: cost posted to work-in-progress (1310) ───────── */
  /* {jobId:{Material,Labour,Overhead,Release,Costing,Other,bal}} where every value is (dr - cr) in the range */
  D.jobCost = (from, to) => { const m = {}; D.lines().forEach(x => { if (x.acc !== '1310' || !x.job) return; if ((from && x.date < from) || (to && x.date > to)) return; const r = m[x.job] || (m[x.job] = { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Other: 0, bal: 0 }), k = ['Material', 'Labour', 'Overhead', 'Release', 'Costing'].includes(x.cat) ? x.cat : 'Other', v = x.dr - x.cr; r[k] += v; r.bal += v; }); return m; };
  D.jobLines = jobId => E.rows('jobLines').filter(l => l.jobId === jobId);
  D.jobPacks = jobId => { const L = D.jobLines(jobId); return { target: L.reduce((s, l) => s + (l.target || 0), 0), released: L.reduce((s, l) => s + (l.released || 0), 0), started: L.reduce((s, l) => s + (l.started || 0), 0), pairs: L.reduce((s, l) => s + (l.released || 0) * D.pairsPerPack(l.itemId), 0) }; };

  /* ───────── receivables / payables documents ───────── */
  D.addDays = RS.dt.addDays;
  D.dueOf = (doc) => RS.dt.addDays(doc.date, D.party(doc.partyId).days || 0);
  /* open items. kind 'ar' = invoices, 'ap' = purchase bills. Opening balances are included with their own flag. */
  D.openDocs = kind => (kind === 'ar' ? E.rows('invoices') : E.rows('purchases')).filter(d => !d.cancelled && d.total - d.paid > 0).map(d => ({ d, id: d.id, no: d.no, date: d.date, party: d.partyId, due: D.dueOf(d), total: d.total, paid: d.paid, bal: d.total - d.paid, opening: !!d.opening, ref: kind === 'ar' ? ((d.dnIds || []).map(k => (E.D.deliveries.find(q => q.id === k) || {}).no).filter(Boolean).join(', ') || d.ref || '') : ((d.invNo ? 'Supplier inv ' + d.invNo : '') + (d.grnNo ? ' GRN ' + d.grnNo : '')).trim() }));
  /* party running ledger from the Report Center (cheques, advances, credit notes all included) */
  D.partyLedger = (pid, from, to) => (E.partyLedger ? E.partyLedger(pid, from, to) : { open: 0, rows: [], dr: 0, cr: 0, close: 0 });
  D.lastReceipt = pid => { let d = ''; E.rows('receipts').filter(r => r.partyId === pid && r.kind !== 'credit' && !r.reversed).forEach(r => { if (r.date > d) d = r.date; }); E.rows('cheques').filter(c => c.partyId === pid && c.dir === 'in').forEach(c => { if ((c.recvDate || c.date) > d) d = c.recvDate || c.date; }); return d; };
  D.lastPayment = pid => { let d = ''; E.rows('payments').filter(r => r.partyId === pid && r.kind !== 'debit' && !r.reversed).forEach(r => { if (r.date > d) d = r.date; }); E.rows('cheques').filter(c => c.partyId === pid && c.dir === 'out').forEach(c => { if ((c.recvDate || c.date) > d) d = c.recvDate || c.date; }); return d; };

  /* ───────── helpers shared by reports ───────── */
  D.sumBy = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  D.pct = (a, b) => b ? a * 100 / b : 0;
  D.monthKey = d => d.slice(0, 7);
  /* split a rupee-cent amount in proportion (last part takes the remainder, so the parts always add up exactly) */
  D.split = (total, weights) => { const w = weights.reduce((s, x) => s + x, 0); let left = total; return weights.map((x, i) => { const a = i === weights.length - 1 ? left : Math.round(total * (w ? x / w : 0)); left -= a; return a; }); };
  D.pickParty = p => p.party || '';
  D.itemInCat = (i, cat) => !cat || D.catOf(i) === cat;
})(window.ERP);
