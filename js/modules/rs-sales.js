/* REPORT SUITE — SALES & PURCHASES
   Sales come from delivery notes (revenue is recognised at delivery), credit notes, cancellations and invoice discounts - the same events that post to ledger 4000, 4010 and 5400,
   so the totals are checked against those accounts. Purchases come from goods-received bills, purchase returns and cancellations, checked against the stock records. */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const zero = () => ({ packs: 0, retPacks: 0, pairs: 0, retPairs: 0, gross: 0, ret: 0, disc: 0, cost: 0, docs: new Set() });
  const catOfEv = x => D.catOf(D.item(x.itemId));
  const skuOk = (x, P) => (!P.party || x.party === P.party) && (!P.item || x.itemId === P.item) && (!P.job || x.job === P.job) && (!P.cat || catOfEv(x) === P.cat);
  const keyOf = (gb, x) => gb === 'sku' ? x.itemId + '|' + x.variantId : gb === 'item' ? x.itemId : gb === 'cat' ? catOfEv(x) : gb === 'cust' ? x.party : gb === 'month' ? x.date.slice(0, 7) : gb === 'job' ? (x.job || '') : gb === 'custitem' ? x.party + '|' + x.itemId : gb === 'day' ? x.date : x.itemId;
  const labelOf = (gb, x) => gb === 'sku' ? { sub: D.code(x.itemId, x.variantId), name: D.name(x.itemId) + (D.colour(x.variantId) ? ' · ' + D.colour(x.variantId) : '') } : gb === 'item' ? { sub: (D.item(x.itemId) || {}).art || '', name: D.name(x.itemId) } : gb === 'cat' ? { sub: '', name: catOfEv(x) } : gb === 'cust' ? { sub: (D.party(x.party).code) || '', name: D.pname(x.party) } : gb === 'month' ? { sub: '', name: dt.monLabel(x.date.slice(0, 7)) } : gb === 'job' ? { sub: '', name: x.job ? D.jobNo(x.job) : '(no job)' } : gb === 'custitem' ? { sub: D.pname(x.party), name: D.name(x.itemId) } : { sub: '', name: x.date };
  function salesGroups(P, from, to, gb) {
    const G = {};
    D.salesIn(from, to, x => skuOk(x, P)).forEach(x => { const k = keyOf(gb, x), r = G[k] || (G[k] = Object.assign(zero(), labelOf(gb, x), { key: k, party: x.party, itemId: x.itemId, jobId: x.job })); r.packs += x.packs; r.retPacks += x.retPacks; r.pairs += x.pairs; r.retPairs += x.retPairs; r.gross += x.gross; r.ret += x.ret; r.disc += x.disc; r.cost += x.cost; if (x.doc) r.docs.add(x.doc); });
    return G;
  }
  const GB = [['sku', 'Article / colour'], ['item', 'Article (all colours)'], ['cat', 'Category'], ['cust', 'Customer'], ['month', 'Month'], ['job', 'Job'], ['custitem', 'Customer × article']];
  const glCheck = (P, from, to, T) => {
    if (P.party || P.item || P.job || P.cat) return [];
    const m = D.range(from, to), s = D.natC('4000', m), dsc = -D.natC('4010', m), cg = D.natC('5400', m), a = T.gross - T.ret, b = T.disc, c = T.cost;
    return [[a === s, 'Gross sales less returns = ledger 4000 (Sales Revenue)', a === s ? E.m(s) : 'Report ' + E.m(a) + ' vs ledger ' + E.m(s) + ' (difference ' + E.m(a - s) + ')'], [b === dsc, 'Discounts = ledger 4010', b === dsc ? E.m(dsc) : 'Report ' + E.m(b) + ' vs ledger ' + E.m(dsc)], [c === cg, 'Cost of sales = ledger 5400', c === cg ? E.m(cg) : 'Report ' + E.m(c) + ' vs ledger ' + E.m(cg) + ' (difference ' + E.m(c - cg) + ')']];
  };

  const salesSpec = (id, t, d, gb0, kw) => ({
    id, g: 'sal', t, d, kw, f: ['range', 'cmp', 'gb', 'cust', 'fg', 'cat', 'job'], preset: 'fy', gb: GB.slice().sort((a, b) => (a[0] === gb0 ? -1 : b[0] === gb0 ? 1 : 0)),
    build(P) {
      const cur = salesGroups(P, P.from, P.to, P.gb), c = RS.cmpRange(P.from, P.to, P.cmp), prev = c ? salesGroups(P, c[0], c[1], P.gb) : null, T = zero();
      Object.values(cur).forEach(r => ['packs', 'retPacks', 'pairs', 'retPairs', 'gross', 'ret', 'disc', 'cost'].forEach(k => T[k] += r[k]));
      const net = r => r.gross - r.ret - r.disc, tnet = net(T);
      const rows = Object.values(cur).map(r => { const n = net(r), np = prev ? net(prev[r.key] || zero()) : 0; return { k: 'd', c: { sub: r.sub, name: r.name, packs: r.packs, retPacks: r.retPacks, npacks: r.packs - r.retPacks, npairs: r.pairs - r.retPairs, gross: r.gross, ret: r.ret, disc: r.disc, net: n, cost: r.cost, gp: n - r.cost, gpp: n ? (n - r.cost) * 100 / n : '', rate: r.pairs - r.retPairs ? Math.round(n / (r.pairs - r.retPairs)) : '', share: tnet ? n * 100 / tnet : 0, prev: np, chg: np ? (n - np) * 100 / Math.abs(np) : '' }, drill: P.gb === 'cust' ? { r: 'statement', p: { party: r.party, preset: 'fy' } } : (P.gb === 'job' && r.jobId ? { r: 'jobsheet', p: { job: r.jobId } } : undefined) }; });
      rows.sort((a, b) => P.gb === 'month' || P.gb === 'day' ? a.c.name.localeCompare(b.c.name) : b.c.net - a.c.net);
      const lab = { sku: 'Article / colour', item: 'Article', cat: 'Category', cust: 'Customer', month: 'Month', job: 'Job', custitem: 'Article' }[P.gb];
      const cols = [{ k: 'sub', l: P.gb === 'custitem' ? 'Customer' : 'Code', t: 'text', always: P.gb === 'custitem' }, { k: 'name', l: lab, t: 'text', always: true, w: 210 }, { k: 'packs', l: 'Packs sold', t: 'qty' }, { k: 'retPacks', l: 'Packs returned / cancelled', t: 'qty' }, { k: 'npacks', l: 'Net packs', t: 'qty' }, { k: 'npairs', l: 'Net pairs', t: 'qty' }, { k: 'gross', l: 'Gross sales', t: 'money' }, { k: 'ret', l: 'Returns & cancellations', t: 'money' }, { k: 'disc', l: 'Discounts', t: 'money' }, { k: 'net', l: 'Net sales', t: 'money', always: true }, { k: 'cost', l: 'Cost of sales', t: 'money' }, { k: 'gp', l: 'Gross profit', t: 'money', always: true }, { k: 'gpp', l: 'GP %', t: 'pct', tot: false, f: rs => { const n = rs.reduce((s, r) => s + r.c.net, 0), g = rs.reduce((s, r) => s + r.c.gp, 0); return n ? g * 100 / n : ''; } }, { k: 'rate', l: 'Avg net rate / pair', t: 'money', tot: false }, { k: 'share', l: '% of total sales', t: 'pct', tot: false }];
      if (prev) cols.push({ k: 'prev', l: 'Net sales - compared period', t: 'money' }, { k: 'chg', l: 'Change %', t: 'pct', tot: false });
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to) + (c ? ' compared with ' + RS.periodLabel(c[0], c[1]) : ''), kpis: [['Net sales', E.m(tnet)], ['Cost of sales', E.m(T.cost)], ['Gross profit', E.m(tnet - T.cost), tnet ? ((tnet - T.cost) * 100 / tnet).toFixed(1) + '%' : ''], ['Net pairs', String(Math.round(T.pairs - T.retPairs))]], checks: glCheck(P, P.from, P.to, T), notes: ['Revenue is counted on the delivery date; returns on the credit-note date; discounts on the invoice date (shared out over the delivery lines). Cancelled deliveries show as returns & cancellations on the day they were cancelled.'], land: true };
    }
  });
  add(salesSpec('salesitem', 'Sales Analysis - Item Wise', 'Net sales, cost and gross profit of every article and colour: packs, pairs, returns, discounts, average rate, share and margin.', 'sku', 'sales item article colour wise profit margin'));
  add(salesSpec('salescat', 'Sales Analysis - Category Wise', 'Sales, cost and profit by category (Flat, PU ...) with comparison to an earlier period.', 'cat', 'sales category wise flat pu'));
  add(salesSpec('salescust', 'Sales Analysis - Customer Wise', 'Sales, margin and share by customer. Click a customer to open the statement.', 'cust', 'sales customer wise party'));

  /* ═══════════════ SALES TREND MATRIX ═══════════════ */
  add({
    id: 'salesmonth', g: 'sal', t: 'Sales Trend by Month', d: 'Month-by-month net sales, quantity or profit for every article, category or customer, with a total column.', kw: 'monthly sales trend matrix month wise',
    f: ['range', 'gb', 'mode', 'cust', 'fg', 'cat'], preset: 'l12', gb: [['item', 'By article'], ['cat', 'By category'], ['cust', 'By customer'], ['sku', 'By article / colour']], modes: [['net', 'Net sales'], ['pairs', 'Net pairs'], ['gp', 'Gross profit']],
    build(P) {
      const months = dt.monthsBetween(P.from, P.to), R = {};
      D.salesIn(P.from, P.to, x => skuOk(x, P)).forEach(x => { const k = keyOf(P.gb, x), r = R[k] || (R[k] = Object.assign({ name: labelOf(P.gb, x).name, tot: 0 }, {})), m = 'm' + x.date.slice(0, 7), v = P.mode === 'pairs' ? x.pairs - x.retPairs : P.mode === 'gp' ? x.gross - x.ret - x.disc - x.cost : x.gross - x.ret - x.disc; r[m] = (r[m] || 0) + v; r.tot += v; });
      const T = P.mode === 'pairs' ? 'qty' : 'money', cols = [{ k: 'name', l: { item: 'Article', cat: 'Category', cust: 'Customer', sku: 'Article / colour' }[P.gb], t: 'text', always: true, w: 200 }, ...months.map(m => ({ k: 'm' + m, l: dt.monLabel(m), t: T })), { k: 'tot', l: 'Total', t: T, always: true }];
      const rows = Object.values(R).sort((a, b) => b.tot - a.tot).map(r => ({ k: 'd', c: r }));
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to) + ' · ' + ({ net: 'net sales', pairs: 'net pairs', gp: 'gross profit' })[P.mode], land: true };
    }
  });

  /* ═══════════════ CUSTOMER × ARTICLE MATRIX ═══════════════ */
  add({
    id: 'salesmatrix', g: 'sal', t: 'Customer × Article Sales Matrix', d: 'Net sales of each customer across the leading articles - see who buys what.', kw: 'matrix customer article cross tab',
    f: ['range', { k: 'top', l: 'Articles to show', def: 8 }, 'cust'], preset: 'fy',
    build(P) {
      const ev = D.salesIn(P.from, P.to, x => (!P.party || x.party === P.party)), byI = {}; ev.forEach(x => byI[x.itemId] = (byI[x.itemId] || 0) + x.gross - x.ret - x.disc);
      const n = Math.max(1, parseInt(P.extra.top) || 8), top = Object.keys(byI).sort((a, b) => byI[b] - byI[a]).slice(0, n), R = {};
      ev.forEach(x => { const r = R[x.party] || (R[x.party] = { name: D.pname(x.party), tot: 0, oth: 0 }), v = x.gross - x.ret - x.disc; if (top.includes(x.itemId)) r['i' + x.itemId] = (r['i' + x.itemId] || 0) + v; else r.oth += v; r.tot += v; });
      const cols = [{ k: 'name', l: 'Customer', t: 'text', always: true, w: 200 }, ...top.map(i => ({ k: 'i' + i, l: D.name(i), t: 'money' })), { k: 'oth', l: 'Other articles', t: 'money' }, { k: 'tot', l: 'Total', t: 'money', always: true }];
      return { cols, rows: Object.values(R).sort((a, b) => b.tot - a.tot).map(r => ({ k: 'd', c: r })), flat: true, sub: RS.periodLabel(P.from, P.to), land: true };
    }
  });

  /* ═══════════════ SALES REGISTER ═══════════════ */
  add({
    id: 'salesreg', g: 'sal', t: 'Sales Register (Delivery Notes, Invoices, Returns)', d: 'Every delivery note, invoice or credit note in the period with customer, job, values, profit, due date and status.', kw: 'sales register invoices delivery notes list credit notes',
    f: ['range', 'mode', 'cust', 'job'], preset: 'mtd', modes: [['dn', 'Delivery notes'], ['inv', 'Invoices'], ['ret', 'Credit notes (sales returns)']],
    build(P) {
      const inR = d => d >= P.from && d <= P.to, ok = x => !P.party || x.partyId === P.party;
      if (P.mode === 'inv') {
        const L = E.rows('invoices').filter(i => inR(i.date) && ok(i)).sort((a, b) => a.date.localeCompare(b.date));
        return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Invoice', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 200 }, { k: 'dn', l: 'Delivery notes', t: 'text' }, { k: 'due', l: 'Due date', t: 'text' }, { k: 'gross', l: 'Gross', t: 'money' }, { k: 'disc', l: 'Discount', t: 'money' }, { k: 'total', l: 'Invoice total', t: 'money', always: true }, { k: 'paid', l: 'Settled', t: 'money' }, { k: 'bal', l: 'Balance', t: 'money' }, { k: 'st', l: 'Status', t: 'text' }], rows: L.map(i => ({ k: 'd', c: { date: i.date, no: i.no, cust: D.pname(i.partyId), dn: (i.dnIds || []).map(k => (E.D.deliveries.find(q => q.id === k) || {}).no).filter(Boolean).join(', '), due: D.dueOf(i), gross: i.gross || i.total, disc: i.disc || 0, total: i.total, paid: i.paid, bal: i.cancelled ? 0 : i.total - i.paid, st: i.cancelled ? 'Cancelled' : i.total - i.paid <= 0 ? 'Paid' : i.paid > 0 ? 'Part paid' : (D.dueOf(i) < E.today() ? 'Overdue' : 'Open') }, drill: { r: 'statement', p: { party: i.partyId, preset: 'fy' } } })), flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['Cancelled invoices are listed but not counted in the balance.'] };
      }
      if (P.mode === 'ret') {
        const L = E.rows('receipts').filter(r => r.kind === 'credit' && inR(r.date) && ok(r)).sort((a, b) => a.date.localeCompare(b.date));
        return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Credit note', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 200 }, { k: 'inv', l: 'Invoice', t: 'text' }, { k: 'items', l: 'Articles returned', t: 'text', w: 220 }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'val', l: 'Credit value', t: 'money', always: true }, { k: 'cost', l: 'Cost reversed', t: 'money' }, { k: 'refund', l: 'Refunded from', t: 'text' }], rows: L.map(r => ({ k: 'd', c: { date: r.date, no: r.no, cust: D.pname(r.partyId), inv: (E.D.invoices.find(i => i.id === r.invId) || {}).no || '', items: (r.lines || []).map(l => l.code).join(', '), packs: (r.lines || []).reduce((s, l) => s + l.qty, 0), val: r.amount, cost: r.cost || 0, refund: r.refund ? ((E.acct(r.refund) || {}).name || r.refund) : 'Reduced amount owed' } })), flat: true, sub: RS.periodLabel(P.from, P.to) };
      }
      const L = E.rows('deliveries').filter(d => inR(d.date) && ok(d) && (!P.job || d.jobId === P.job)).sort((a, b) => a.date.localeCompare(b.date));
      return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Delivery note', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 200 }, { k: 'job', l: 'Job', t: 'text' }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'pairs', l: 'Pairs', t: 'qty' }, { k: 'val', l: 'Value', t: 'money', always: true }, { k: 'cost', l: 'Cost', t: 'money' }, { k: 'gp', l: 'Profit', t: 'money' }, { k: 'inv', l: 'Invoice', t: 'text' }, { k: 'st', l: 'Status', t: 'text' }], rows: L.map(d => ({ k: 'd', c: { date: d.date, no: d.no, cust: D.pname(d.partyId), job: D.jobNo(d.jobId), packs: (d.lines || []).reduce((s, l) => s + l.qty, 0), pairs: (d.lines || []).reduce((s, l) => s + (l.pairs || 0), 0), val: d.total, cost: d.cogs || 0, gp: d.total - (d.cogs || 0), inv: (E.D.invoices.find(i => i.id === d.invId) || {}).no || '', st: d.status === 'Delivered' ? 'Not invoiced' : d.status }, cls: d.status === 'Cancelled' ? 'muted' : '' })), flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['Cancelled delivery notes are listed but are included in the totals; use Sales Analysis for net figures.'] };
    }
  });

  /* ═══════════════ UNBILLED DELIVERIES ═══════════════ */
  add({
    id: 'unbilled', g: 'sal', t: 'Delivered but Not Invoiced', d: 'Delivery notes still waiting to be invoiced (ledger 1210), oldest first, with days waiting.', kw: 'unbilled uninvoiced delivered pending invoice',
    f: ['cust'],
    build(P) {
      const L = E.rows('deliveries').filter(d => d.status === 'Delivered' && (!P.party || d.partyId === P.party)).sort((a, b) => a.date.localeCompare(b.date)), t = E.today(), tot = L.reduce((s, d) => s + d.total, 0), gl = E.acct('1210') ? E.bal('1210') : 0;
      return { cols: [{ k: 'date', l: 'Delivered on', t: 'text', always: true }, { k: 'no', l: 'Delivery note', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 200 }, { k: 'job', l: 'Job', t: 'text' }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'days', l: 'Days waiting', t: 'days', tot: false }, { k: 'val', l: 'Value', t: 'money', always: true }], rows: L.map(d => ({ k: 'd', c: { date: d.date, no: d.no, cust: D.pname(d.partyId), job: D.jobNo(d.jobId), packs: (d.lines || []).reduce((s, l) => s + l.qty, 0), days: dt.diff(d.date, t), val: d.total }, drill: { r: 'statement', p: { party: d.partyId, preset: 'fy' } } })), flat: true, kpis: [['Waiting to be invoiced', E.m(tot)], ['Delivery notes', String(L.length)]], checks: P.party ? [] : [[tot === gl, 'Agrees with ledger 1210 (Unbilled Receivable)', tot === gl ? E.m(gl) : 'Differs by ' + E.m(tot - gl)]] };
    }
  });

  /* ═══════════════ SELLING PRICE ANALYSIS ═══════════════ */
  add({
    id: 'pricean', g: 'sal', t: 'Selling Price & Margin Analysis', d: 'For every article and colour: lowest, average, highest and latest selling rate per pair against cost per pair; sales below cost.', kw: 'price analysis selling rate margin below cost',
    f: ['range', 'fg', 'cat', 'cust'], preset: 'fy',
    build(P) {
      const R = {}; E.rows('deliveries').filter(d => d.status !== 'Cancelled' && d.date >= P.from && d.date <= P.to && (!P.party || d.partyId === P.party)).forEach(d => (d.lines || []).forEach(l => {
        if (P.item && l.itemId !== P.item || (P.cat && D.catOf(D.item(l.itemId)) !== P.cat)) return; const k = l.itemId + '|' + (l.variantId || ''), p = l.pairs || l.qty * D.pairsPerPack(l.itemId), rate = p ? Math.round(l.amount / p) : 0, r = R[k] || (R[k] = { code: D.code(l.itemId, l.variantId), name: D.name(l.itemId), colour: D.colour(l.variantId), pairs: 0, val: 0, cost: 0, min: 1e15, max: 0, last: 0, ld: '', below: 0, bq: 0, itemId: l.itemId });
        r.pairs += p; r.val += l.amount; r.cost += l.cost || 0; r.min = Math.min(r.min, rate); r.max = Math.max(r.max, rate); if (d.date >= r.ld) { r.ld = d.date; r.last = rate; } if (p && (l.cost || 0) > l.amount) { r.below++; r.bq += p; }
      }));
      const rows = Object.values(R).map(r => ({ k: 'd', c: { code: r.code, name: r.name, colour: r.colour, pairs: r.pairs, min: r.min, avg: r.pairs ? Math.round(r.val / r.pairs) : 0, max: r.max, last: r.last, ld: r.ld, cpp: r.pairs ? Math.round(r.cost / r.pairs) : 0, mpp: r.pairs ? Math.round((r.val - r.cost) / r.pairs) : 0, mp: r.val ? (r.val - r.cost) * 100 / r.val : '', below: r.below, spread: r.max - r.min }, drill: { r: 'itemcard', p: { item: r.itemId, preset: 'fy' } } })).sort((a, b) => a.c.code.localeCompare(b.c.code));
      return { cols: [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Article', t: 'text', w: 180 }, { k: 'colour', l: 'Colour', t: 'text' }, { k: 'pairs', l: 'Pairs sold', t: 'qty' }, { k: 'min', l: 'Lowest rate', t: 'money', tot: false }, { k: 'avg', l: 'Average rate', t: 'money', tot: false, always: true }, { k: 'max', l: 'Highest rate', t: 'money', tot: false }, { k: 'last', l: 'Latest rate', t: 'money', tot: false }, { k: 'ld', l: 'Latest sale', t: 'text' }, { k: 'spread', l: 'Rate spread', t: 'money', tot: false }, { k: 'cpp', l: 'Cost / pair', t: 'money', tot: false }, { k: 'mpp', l: 'Profit / pair', t: 'money', tot: false }, { k: 'mp', l: 'Margin %', t: 'pct', tot: false }, { k: 'below', l: 'Lines sold below cost', t: 'int' }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), land: true, notes: ['Rates are per pair, from delivery notes. A wide spread between lowest and highest rate usually means inconsistent price lists.'] };
    }
  });

  /* ═══════════════ PURCHASE ANALYSIS ═══════════════ */
  const pKey = (gb, x) => gb === 'item' ? x.itemId + '|' + x.variantId : gb === 'cat' ? D.catOf(D.item(x.itemId)) : gb === 'supp' ? x.party : gb === 'month' ? x.date.slice(0, 7) : x.party + '|' + x.itemId + '|' + x.variantId;
  add({
    id: 'purchitem', g: 'pur', t: 'Purchase Analysis', d: 'What you bought - by material, category, supplier or month: quantity, value, lowest / average / highest / latest rate and price movement.', kw: 'purchases analysis supplier wise item wise material rate',
    f: ['range', 'cmp', 'gb', 'supp', 'mat', 'cat'], preset: 'fy', gb: [['item', 'Material / accessory'], ['cat', 'Category'], ['supp', 'Supplier'], ['month', 'Month'], ['suppitem', 'Supplier × material']],
    build(P) {
      const flt = x => (!P.party || x.party === P.party) && (!P.item || x.itemId === P.item) && (!P.cat || D.catOf(D.item(x.itemId)) === P.cat);
      const grp = (from, to) => { const G = {}; D.purchasesIn(from, to, flt).forEach(x => { const k = pKey(P.gb, x), i = D.item(x.itemId), r = G[k] || (G[k] = { key: k, code: P.gb === 'item' || P.gb === 'suppitem' ? D.code(x.itemId, x.variantId) : '', name: P.gb === 'item' ? D.name(x.itemId) : P.gb === 'cat' ? D.catOf(i) : P.gb === 'supp' ? D.pname(x.party) : P.gb === 'month' ? dt.monLabel(k) : D.name(x.itemId), supp: P.gb === 'suppitem' ? D.pname(x.party) : '', unit: P.gb === 'item' || P.gb === 'suppitem' ? (i && i.unit) || '' : '', bq: 0, rq: 0, bv: 0, rv: 0, min: 1e15, max: 0, last: 0, ld: '', party: x.party, itemId: x.itemId }); if (x.t === 'buy') { r.bq += x.qty; r.bv += x.amount; if (x.rate) { r.min = Math.min(r.min, x.rate); r.max = Math.max(r.max, x.rate); } if (x.date >= r.ld) { r.ld = x.date; r.last = x.rate; } } else { r.rq -= x.qty; r.rv -= x.amount; } }); return G; };
      const cur = grp(P.from, P.to), c = RS.cmpRange(P.from, P.to, P.cmp), prev = c ? grp(c[0], c[1]) : null, nv = r => r.bv - r.rv, tot = Object.values(cur).reduce((s, r) => s + nv(r), 0);
      const rows = Object.values(cur).map(r => { const p = prev && prev[r.key], np = p ? nv(p) : 0; return { k: 'd', c: { code: r.code, name: r.name, supp: r.supp, unit: r.unit, bq: r.bq, rq: r.rq, nq: r.bq - r.rq, bv: r.bv, rv: r.rv, nv: nv(r), avg: r.bq ? Math.round(r.bv / r.bq) : '', min: r.min === 1e15 ? '' : r.min, max: r.max || '', last: r.last || '', ld: r.ld, share: tot ? nv(r) * 100 / tot : 0, prev: np, chg: np ? (nv(r) - np) * 100 / Math.abs(np) : '', pm: p && p.bq && r.bq ? ((r.bv / r.bq) - (p.bv / p.bq)) * 100 / (p.bv / p.bq) : '' }, drill: P.gb === 'supp' ? { r: 'statement', p: { party: r.party, preset: 'fy' } } : (P.gb === 'item' ? { r: 'itemcard', p: { item: r.itemId, preset: 'fy' } } : undefined) }; }).sort((a, b) => P.gb === 'month' ? a.c.name.localeCompare(b.c.name) : b.c.nv - a.c.nv);
      const unitCols = ['item', 'suppitem'].includes(P.gb), cols = [{ k: 'code', l: 'Code', t: 'text', always: unitCols }, { k: 'name', l: { item: 'Material', cat: 'Category', supp: 'Supplier', month: 'Month', suppitem: 'Material' }[P.gb], t: 'text', always: true, w: 200 }, ...(P.gb === 'suppitem' ? [{ k: 'supp', l: 'Supplier', t: 'text', w: 160 }] : []), ...(unitCols ? [{ k: 'unit', l: 'Unit', t: 'text' }, { k: 'bq', l: 'Qty bought', t: 'qty' }, { k: 'rq', l: 'Qty returned / cancelled', t: 'qty' }, { k: 'nq', l: 'Net qty', t: 'qty', always: true }] : []), { k: 'bv', l: 'Purchases', t: 'money' }, { k: 'rv', l: 'Returns & cancellations', t: 'money' }, { k: 'nv', l: 'Net purchases', t: 'money', always: true }, ...(unitCols ? [{ k: 'avg', l: 'Average rate', t: 'money', tot: false }, { k: 'min', l: 'Lowest rate', t: 'money', tot: false }, { k: 'max', l: 'Highest rate', t: 'money', tot: false }, { k: 'last', l: 'Latest rate', t: 'money', tot: false }, { k: 'ld', l: 'Latest purchase', t: 'text' }] : []), { k: 'share', l: '% of total', t: 'pct', tot: false }];
      if (prev) cols.push({ k: 'prev', l: 'Net purchases - compared period', t: 'money' }, { k: 'chg', l: 'Change %', t: 'pct', tot: false }, ...(unitCols ? [{ k: 'pm', l: 'Avg rate change %', t: 'pct', tot: false }] : []));
      let checks = []; if (!P.party && !P.item && !P.cat) { const bills = new Set(E.rows('purchases').map(p => p.no)), mv = D.moves().filter(m => m.date >= P.from && m.date <= P.to && (m.type === 'purchase' || m.type === 'preturn' || (m.type === 'cancel' && bills.has(m.ref)))).reduce((s, m) => s + m.value, 0); checks = [[mv === tot, 'Net purchases = stock received (stock records)', mv === tot ? E.m(tot) : 'Report ' + E.m(tot) + ' vs stock records ' + E.m(mv)]]; }
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to) + (c ? ' compared with ' + RS.periodLabel(c[0], c[1]) : ''), kpis: [['Net purchases', E.m(tot)], ['Lines', String(rows.length)]], checks, land: true };
    }
  });

  /* ═══════════════ SUPPLIER PRICE COMPARISON ═══════════════ */
  add({
    id: 'supcompare', g: 'pur', t: 'Supplier Price Comparison', d: 'For each material, what every supplier charged: lowest, average, highest and latest rate - find the cheapest source.', kw: 'supplier price comparison cheapest rate benchmark',
    f: ['range', 'mat', 'supp'], preset: 'fy',
    build(P) {
      const R = {}; D.purchasesIn(P.from, P.to, x => x.t === 'buy' && (!P.party || x.party === P.party) && (!P.item || x.itemId === P.item)).forEach(x => { const k = x.itemId + '|' + x.variantId + '|' + x.party, r = R[k] || (R[k] = { code: D.code(x.itemId, x.variantId), name: D.name(x.itemId), supp: D.pname(x.party), n: 0, q: 0, v: 0, min: 1e15, max: 0, last: 0, ld: '', itemKey: x.itemId + '|' + x.variantId }); r.n++; r.q += x.qty; r.v += x.amount; r.min = Math.min(r.min, x.rate); r.max = Math.max(r.max, x.rate); if (x.date >= r.ld) { r.ld = x.date; r.last = x.rate; } });
      const best = {}; Object.values(R).forEach(r => { const a = r.q ? r.v / r.q : 0; if (!best[r.itemKey] || a < best[r.itemKey]) best[r.itemKey] = a; });
      const rows = Object.values(R).sort((a, b) => a.code.localeCompare(b.code) || a.v / a.q - b.v / b.q).map(r => { const avg = r.q ? Math.round(r.v / r.q) : 0; return { k: 'd', c: { code: r.code, name: r.name, supp: r.supp, n: r.n, q: r.q, v: r.v, min: r.min, avg, max: r.max, last: r.last, ld: r.ld, vs: best[r.itemKey] ? (avg - best[r.itemKey]) * 100 / best[r.itemKey] : 0 } }; });
      return { cols: [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Material', t: 'text', w: 180 }, { k: 'supp', l: 'Supplier', t: 'text', always: true, w: 180 }, { k: 'n', l: 'Purchases', t: 'int' }, { k: 'q', l: 'Qty', t: 'qty' }, { k: 'v', l: 'Value', t: 'money' }, { k: 'min', l: 'Lowest rate', t: 'money', tot: false }, { k: 'avg', l: 'Average rate', t: 'money', tot: false, always: true }, { k: 'max', l: 'Highest rate', t: 'money', tot: false }, { k: 'last', l: 'Latest rate', t: 'money', tot: false }, { k: 'ld', l: 'Latest purchase', t: 'text' }, { k: 'vs', l: 'Avg rate vs cheapest supplier %', t: 'pct', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), land: true, notes: ['The last column shows how much dearer this supplier’s average rate is than the cheapest supplier of the same material (0% = cheapest).'] };
    }
  });

  /* ═══════════════ PURCHASE REGISTER ═══════════════ */
  add({
    id: 'purchreg', g: 'pur', t: 'Purchase Register (Bills & Returns)', d: 'Every goods-received bill or purchase return with supplier invoice, GRN, due date, amount paid and balance.', kw: 'purchase register bills grn supplier invoice list',
    f: ['range', 'mode', 'supp'], preset: 'mtd', modes: [['bill', 'Purchase bills'], ['ret', 'Purchase returns (debit notes)']],
    build(P) {
      const inR = d => d >= P.from && d <= P.to, ok = x => !P.party || x.partyId === P.party;
      if (P.mode === 'ret') { const L = E.rows('payments').filter(r => r.kind === 'debit' && inR(r.date) && ok(r)).sort((a, b) => a.date.localeCompare(b.date)); return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Debit note', t: 'text', always: true }, { k: 'sup', l: 'Supplier', t: 'text', w: 200 }, { k: 'bill', l: 'Bill', t: 'text' }, { k: 'items', l: 'Materials returned', t: 'text', w: 220 }, { k: 'val', l: 'Value', t: 'money', always: true }, { k: 'refund', l: 'Refund received to', t: 'text' }], rows: L.map(r => ({ k: 'd', c: { date: r.date, no: r.no, sup: D.pname(r.partyId), bill: (E.D.purchases.find(b => b.id === r.billId) || {}).no || '', items: (r.lines || []).map(l => l.code).join(', '), val: r.amount, refund: r.refund ? ((E.acct(r.refund) || {}).name || r.refund) : 'Reduced amount owed' } })), flat: true, sub: RS.periodLabel(P.from, P.to) }; }
      const L = E.rows('purchases').filter(p => inR(p.date) && ok(p)).sort((a, b) => a.date.localeCompare(b.date));
      return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Bill', t: 'text', always: true }, { k: 'sup', l: 'Supplier', t: 'text', w: 200 }, { k: 'inv', l: 'Supplier invoice', t: 'text' }, { k: 'grn', l: 'GRN', t: 'text' }, { k: 'n', l: 'Lines', t: 'int' }, { k: 'due', l: 'Due date', t: 'text' }, { k: 'total', l: 'Bill total', t: 'money', always: true }, { k: 'paid', l: 'Settled', t: 'money' }, { k: 'bal', l: 'Balance', t: 'money' }, { k: 'st', l: 'Status', t: 'text' }], rows: L.map(p => ({ k: 'd', c: { date: p.date, no: p.no, sup: D.pname(p.partyId), inv: p.invNo || '', grn: p.grnNo || '', n: (p.lines || []).length, due: D.dueOf(p), total: p.total, paid: p.paid, bal: p.cancelled ? 0 : p.total - p.paid, st: p.cancelled ? 'Cancelled' : p.opening ? 'Opening balance' : p.total - p.paid <= 0 ? 'Paid' : p.paid > 0 ? 'Part paid' : (D.dueOf(p) < E.today() ? 'Overdue' : 'Open') }, drill: { r: 'statement', p: { party: p.partyId, preset: 'fy' } } })), flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['Cancelled bills are listed but their balance is not counted.'] };
    }
  });

  /* ═══════════════ SUPPLIER PERFORMANCE ═══════════════ */
  add({
    id: 'suppperf', g: 'pur', t: 'Supplier Purchases vs Payments', d: 'For each supplier: net purchases, payments, closing balance and days of purchases outstanding.', kw: 'supplier payments performance creditor days',
    f: ['range'], preset: 'fy',
    build(P) {
      const buy = {}; D.purchasesIn(P.from, P.to).forEach(x => buy[x.party] = (buy[x.party] || 0) + x.amount);
      const pay = {}; E.rows('payments').filter(r => r.kind !== 'debit' && !r.reversed && r.date >= P.from && r.date <= P.to).forEach(r => pay[r.partyId] = (pay[r.partyId] || 0) + r.amount);
      E.rows('cheques').filter(c => c.dir === 'out' && !['Bounced', 'Cancelled'].includes(c.status) && (c.recvDate || c.date) >= P.from && (c.recvDate || c.date) <= P.to).forEach(c => pay[c.partyId] = (pay[c.partyId] || 0) + c.amount);
      const days = Math.max(1, dt.diff(P.from, P.to) + 1), rows = [];
      new Set([...Object.keys(buy), ...Object.keys(pay)]).forEach(pid => { const L = D.partyLedger(pid, P.from, P.to), b = buy[pid] || 0; rows.push({ k: 'd', c: { name: D.pname(pid), buy: b, pay: pay[pid] || 0, close: -L.close, dpo: b && L.close < 0 ? -L.close * days / b : '', terms: D.party(pid).days || 0 }, drill: { r: 'statement', p: { party: pid, from: P.from, to: P.to } } }); });
      rows.sort((a, b) => b.c.buy - a.c.buy);
      return { cols: [{ k: 'name', l: 'Supplier', t: 'text', always: true, w: 220 }, { k: 'buy', l: 'Net purchases', t: 'money' }, { k: 'pay', l: 'Payments (cash + cheques)', t: 'money' }, { k: 'close', l: 'We owe (closing)', t: 'money', always: true }, { k: 'dpo', l: 'Days of purchases outstanding', t: 'days', tot: false }, { k: 'terms', l: 'Credit days given', t: 'int', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to) };
    }
  });
})(window.ERP);
