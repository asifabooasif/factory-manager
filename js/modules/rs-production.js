/* REPORT SUITE — PRODUCTION & COSTING
   The Production Account follows the money through the factory: raw material stock (1300) -> work in progress (1310) -> finished goods (1320) -> cost of sales (5400).
   Each stage is a roll-forward (opening + additions - transfers = closing) that is proved against the ledger and the stock records. */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const CATS = ['Material', 'Labour', 'Overhead', 'Release', 'Costing', 'Absorbed', 'Other'];
  /* costing-only allocations (piece wages, salaries, expenses, shared overhead) of one job, optionally to a date and one article ('' = whole job) */
  const allocCat = (id, to, art) => { const m = { Material: 0, Labour: 0, Overhead: 0 }; (E.allocRows ? E.allocRows(id) : []).filter(a => (!to || a.date <= to) && (art === undefined || (a.art || '') === art)).forEach(a => { m[a.cat] = (m[a.cat] || 0) + a.amount; }); return m; };
  const wipCats = (from, to) => { const r = { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Absorbed: 0, Other: 0 }; D.lines().forEach(x => { if (x.acc !== '1310' || (from && x.date < from) || (to && x.date > to)) return; r[CATS.includes(x.cat) ? x.cat : 'Other'] += x.dr - x.cr; }); return r; };
  const effSrc = x => { if (x.src !== 'reversal') return x.src; const o = D.jeMap()['#' + x.j.ref]; return o ? (o.source || 'manual') : 'reversal'; };
  const bySrc = (acc, from, to, skip) => { const r = {}; D.lines().forEach(x => { if (x.acc !== acc || x.date < from || x.date > to) return; if (skip && skip(x)) return; const k = effSrc(x); r[k] = (r[k] || 0) + x.dr - x.cr; }); return r; };
  const packsOut = (from, to) => D.moves().filter(m => m.type === 'release' && m.date >= from && m.date <= to).reduce((s, m) => s + m.qty, 0);
  const pairsOut = (from, to) => D.moves().filter(m => m.type === 'release' && m.date >= from && m.date <= to).reduce((s, m) => s + m.qty * D.pairsPerPack(m.itemId), 0);
  const stockVal = (d, fg) => D.stockValueOf(D.stockAt(d), i => fg ? D.isFG(i) : !D.isFG(i));
  const RMN = { purchase: 'Purchases of materials, accessories & packing (net of returns and cancellations)', opening: 'Opening stock entered', adjust: 'Stock adjustments, gains and losses', issue: 'Less: issued to production jobs (net of returns)', release: 'Less: unused job material written off', payment: 'Other (supplier-related)', manual: 'Manual journal entries' };

  /* ═══════════════ PRODUCTION ACCOUNT ═══════════════ */
  add({
    id: 'mfg', g: 'prd', t: 'Production Account (Manufacturing Statement)', d: 'The complete factory cost story: materials, labour and overhead into work-in-progress, cost of goods manufactured, finished goods and cost of sales - every stage proved against the ledger.', kw: 'production account manufacturing account cost of production factory cost wip finished goods',
    f: ['range', 'cmp', 'detail'], preset: 'fy', def: { detail: true }, detailLabel: 'Show every overhead account',
    build(P) {
      const A = [{ from: P.from, to: P.to, label: RS.periodLabel(P.from, P.to), short: 'current' }], c = RS.cmpRange(P.from, P.to, P.cmp); if (c) A.push({ from: c[0], to: c[1], label: RS.periodLabel(c[0], c[1]), short: 'compared' });
      A.forEach(p => { p.m = D.range(p.from, p.to); p.w0 = wipCats(p.from, p.to); p.abs = -D.natC('5291', p.m) - p.w0.Absorbed; p.div = E.rows('journalEntries').filter(j => j.date >= p.from && j.date <= p.to).reduce((s, j) => s + j.lines.filter(l => l.acc === '5390' && l.cat === 'Costing').reduce((x, l) => x + (l.cr || 0) - (l.dr || 0), 0), 0); p.w = wipCats(p.from, p.to); p.wo = D.natC('1310', D.upTo(dt.addDays(p.from, -1))); p.wc = D.natC('1310', D.upTo(p.to)); p.pk = packsOut(p.from, p.to); p.pr = pairsOut(p.from, p.to); p.xfer = -(p.w.Release + p.w.Costing); p.charged = p.w.Material + p.w.Labour + p.w.Overhead + p.w.Other + p.w.Absorbed; p.rmo = stockLedger('1300', dt.addDays(p.from, -1)); p.rmc = stockLedger('1300', p.to); p.fgo = stockLedger('1320', dt.addDays(p.from, -1)); p.fgc = stockLedger('1320', p.to); p.rm = bySrc('1300', p.from, p.to); p.fg = bySrc('1320', p.from, p.to, x => x.cat === 'Release' || x.cat === 'Costing'); p.fgIn = (() => { let s = 0; D.lines().forEach(x => { if (x.acc === '1320' && x.date >= p.from && x.date <= p.to && (x.cat === 'Release' || x.cat === 'Costing')) s += x.dr - x.cr; }); return s; })(); });
      function stockLedger(acc, d) { return D.natC(acc, D.upTo(d)); }
      const S = RS.stmt(A, { first: 'Particulars' }), oh = D.coa().filter(a => a.type === 'expense' && a.nature === 'oh' && a.code !== '5260' && a.code !== '5290');
      const per = (n, f) => p => p.pk ? f(p) / p.pk : 0;
      /* 1. raw material */
      S.head('1. RAW MATERIALS, ACCESSORIES & PACKING (ledger 1300)');
      S.row('Opening stock', p => p.rmo, { always: true });
      const ord = k => ({ purchase: 0, opening: 1, adjust: 2, issue: 8, release: 9 })[k] != null ? ({ purchase: 0, opening: 1, adjust: 2, issue: 8, release: 9 })[k] : 5, keys = [...new Set(A.flatMap(p => Object.keys(p.rm)))].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
      keys.forEach(k => S.row(RMN[k] || 'Other: ' + RS.srcName(k), p => p.rm[k] || 0));
      S.sub('Closing stock', p => p.rmc, { i: 0 });
      /* 2. WIP */
      S.sp(); S.head('2. PRODUCTION COST & WORK IN PROGRESS (ledger 1310)');
      S.row('Direct materials issued to jobs (net of returns and write-offs)', p => p.w.Material, { always: true });
      S.row('Direct labour charged to jobs (piece wages, daily wages, salaries, EPF/ETF)', p => p.w.Labour, { always: true });
      S.sub('PRIME COST', p => p.w.Material + p.w.Labour, { i: 0 });
      S.row('Factory overhead absorbed into jobs', p => p.w.Overhead, { always: true });
      S.row('Other charges to jobs', p => p.w.Other);
      S.row('Wages & overheads tagged to jobs, absorbed into WIP as incurred (the expenses stay in their own ledgers; credit 5291)', p => p.w.Absorbed, { always: true });
      S.sub('TOTAL PRODUCTION COST CHARGED TO JOBS', p => p.charged, { i: 0 });
      S.row('Add: opening work in progress', p => p.wo, { always: true });
      S.row('Less: closing work in progress', p => -p.wc, { always: true });
      S.row('Add: wages & overheads absorbed straight into finished goods at release / completion (from period expenses)', p => p.abs, { always: true });
      S.tot('COST OF GOODS MANUFACTURED (transferred to finished goods)', p => p.wo + p.charged - p.wc + p.abs);
      S.row('Packs completed (released to finished goods)', p => p.pk, { t: 'qty', always: true }); S.row('Pairs completed', p => p.pr, { t: 'qty', always: true });
      S.row('Factory cost per pack', p => p.pk ? Math.round((p.wo + p.charged - p.wc + p.abs) / p.pk) : 0, { always: true }); S.row('Factory cost per pair', p => p.pr ? Math.round((p.wo + p.charged - p.wc + p.abs) / p.pr) : 0, { always: true });
      /* 3. overhead */
      S.sp(); S.head('3. FACTORY OVERHEAD ACCOUNT (incurred versus absorbed)');
      if (P.detail) oh.forEach(a => S.acc(a));
      S.sub('Indirect factory overhead incurred', p => D.sum(p.m, a => a.type === 'expense' && a.nature === 'oh' && a.code !== '5260' && a.code !== '5290'), { i: 0 });
      S.row('Less: overhead absorbed into job costs (credit to 5290)', p => D.natC('5290', p.m));
      S.sub('Under / (over) absorbed overhead - period cost', p => D.sum(p.m, a => a.type === 'expense' && a.nature === 'oh' && a.code !== '5260') + D.natC('5290', p.m) - D.natC('5260', p.m), { i: 0 });
      S.row('Depreciation of factory machinery (period cost, not in product cost)', p => D.natC('5260', p.m));
      S.row('Factory losses - wastage, damage, stock losses (period cost)', p => D.sum(p.m, a => a.type === 'expense' && a.nature === 'loss'));
      S.row('Completed-job adjustments (5390)', p => D.natC('5390', p.m));
      /* 4. FG */
      S.sp(); S.head('4. FINISHED GOODS & COST OF SALES (ledger 1320)');
      S.row('Opening finished goods', p => p.fgo, { always: true });
      S.row('Add: cost of goods manufactured (from work in progress)', p => p.fgIn, { always: true });
      const fk = [...new Set(A.flatMap(p => Object.keys(p.fg)))].sort();
      fk.forEach(k => S.row(k === 'sale' ? 'Less: cost of goods sold (net of returns and cancellations)' : k === 'opening' ? 'Opening stock entered' : k === 'adjust' ? 'Stock adjustments' : 'Other: ' + RS.srcName(k), p => p.fg[k] || 0));
      S.sub('Closing finished goods', p => p.fgc, { i: 0 });
      S.row('Cost of goods sold per ledger (5400)', p => D.natC('5400', p.m), { always: true });
      S.sp(); S.head('5. FULL COST (for pricing decisions only)');
      S.row('Factory cost of production', p => p.wo + p.charged - p.wc + p.abs, { always: true });
      S.row('Add: administration, selling & finance expenses', p => D.sum(p.m, a => a.type === 'expense' && ['adm', 'sel', 'fin', 'oth'].includes(a.nature)));
      S.row('Add: factory overhead not absorbed + depreciation + losses', p => D.sum(p.m, a => a.type === 'expense' && (a.nature === 'oh' || a.nature === 'loss' || a.nature === 'contra' || a.nature === 'dl') && a.code !== '5390'));
      S.tot('FULL COST OF PRODUCTION', p => (p.wo + p.charged - p.wc + p.abs) + D.sum(p.m, a => a.type === 'expense' && ['adm', 'sel', 'fin', 'oth'].includes(a.nature)) + D.sum(p.m, a => a.type === 'expense' && (a.nature === 'oh' || a.nature === 'loss' || a.nature === 'contra' || a.nature === 'dl') && a.code !== '5390'));
      S.row('Full cost per pack', p => p.pk ? Math.round(((p.wo + p.charged - p.wc + p.abs) + D.sum(p.m, a => a.type === 'expense' && ['adm', 'sel', 'fin', 'oth'].includes(a.nature)) + D.sum(p.m, a => a.type === 'expense' && (a.nature === 'oh' || a.nature === 'loss' || a.nature === 'contra' || a.nature === 'dl') && a.code !== '5390')) / p.pk) : 0, { always: true });
      const p0 = A[0], checks = [];
      const rmStock = stockVal(p0.to, false), fgStock = stockVal(p0.to, true);
      checks.push([p0.wo + p0.charged + p0.xfer * -1 === p0.wc, 'Work in progress: opening + costs charged - transferred to finished goods = closing', p0.wo + p0.charged - p0.xfer === p0.wc ? E.m(p0.wc) : 'Difference ' + E.m(p0.wo + p0.charged - p0.xfer - p0.wc)]);
      checks.push([p0.fgIn === p0.xfer + p0.abs + p0.div, 'Cost of goods manufactured agrees with what finished goods received', p0.fgIn === p0.xfer + p0.abs + p0.div ? E.m(p0.fgIn) : 'Finished goods received ' + E.m(p0.fgIn) + ' vs transferred out of WIP ' + E.m(p0.xfer) + ' + absorbed ' + E.m(p0.abs) + ' + released to job-closing variance ' + E.m(p0.div)]);
      checks.push([rmStock === p0.rmc, 'Raw material closing = stock records', rmStock === p0.rmc ? E.m(rmStock) : 'Ledger ' + E.m(p0.rmc) + ' vs stock records ' + E.m(rmStock)]);
      checks.push([fgStock === p0.fgc, 'Finished goods closing = stock records', fgStock === p0.fgc ? E.m(fgStock) : 'Ledger ' + E.m(p0.fgc) + ' vs stock records ' + E.m(fgStock)]);
      const jobWip = Object.values(D.jobCost('', p0.to)).reduce((s, r) => s + r.bal, 0); checks.push([jobWip === p0.wc, 'Closing work in progress = sum of all job balances', jobWip === p0.wc ? E.m(p0.wc) : 'Jobs ' + E.m(jobWip) + ' vs ledger ' + E.m(p0.wc)]);
      const cogm = p0.wo + p0.charged - p0.wc + p0.abs, fac = p0.w.Material + p0.w.Labour + p0.w.Overhead + p0.w.Absorbed + p0.abs;
      return { cols: S.cols, rows: S.rows, sub: RS.periodLabel(P.from, P.to), cmpLabel: A[1] && A[1].label, kpis: [['Materials used', E.m(p0.w.Material), fac ? (p0.w.Material * 100 / fac).toFixed(0) + '% of production cost' : ''], ['Labour charged to jobs', E.m(p0.w.Labour), fac ? (p0.w.Labour * 100 / fac).toFixed(0) + '%' : ''], ['Overhead absorbed', E.m(p0.w.Overhead), fac ? (p0.w.Overhead * 100 / fac).toFixed(0) + '%' : ''], ['Wages & overheads absorbed into stock', E.m(p0.abs + p0.w.Absorbed), fac ? ((p0.abs + p0.w.Absorbed) * 100 / fac).toFixed(0) + '%' : ''], ['Cost of goods manufactured', E.m(cogm)], ['Factory cost per pack', p0.pk ? E.m(Math.round(cogm / p0.pk)) : '-', p0.pk + ' packs']], checks, land: true, notes: ['Depreciation, administration, selling and finance costs are period costs and are never added to stock; the full cost in section 5 is for pricing decisions only.', 'Overhead absorbed is the amount charged into jobs; the difference from overhead actually incurred is the under/(over) absorbed amount shown in section 3.'] };
    }
  });

  /* ═══════════════ JOB COST SUMMARY ═══════════════ */
  add({
    id: 'jobcost', g: 'prd', t: 'Job Costing Summary (all jobs)', d: 'Every job: progress, material, labour, overhead, total cost, value released, WIP balance, cost per pack and pair, and the sales profit earned on it.', kw: 'job cost costing summary jobs profitability',
    f: ['range', 'cust', { k: 'st', l: 'Job status', o: [['In Progress', 'In progress'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']], all: 'All jobs' }], preset: 'all',
    build(P) {
      const jc = D.jobCost('', P.to), sales = {}; D.salesIn('', '').forEach(x => { if (!x.job) return; const s = sales[x.job] || (sales[x.job] = { n: 0, c: 0 }); s.n += x.gross - x.ret - x.disc; s.c += x.cost; });
      const rows = E.rows('jobs').filter(j => j.date >= P.from && j.date <= P.to && (!P.party || j.partyId === P.party) && (!P.extra.st || j.status === P.extra.st)).sort((a, b) => b.no.localeCompare(a.no)).map(j => {
        const c = jc[j.id] || { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Other: 0, bal: 0 }, pk = D.jobPacks(j.id), A = allocCat(j.id, P.to), tot = c.Material + c.Labour + c.Overhead + c.Other + A.Material + A.Labour + A.Overhead, rel = -(c.Release + c.Costing), s = sales[j.id] || { n: 0, c: 0 }, late = j.due && j.status !== 'Completed' && j.due < E.today() ? dt.diff(j.due, E.today()) : 0;
        return { k: 'd', c: { no: j.no, cust: D.pname(j.partyId), date: j.date, due: j.due || '', st: j.status || '', late: late || '', target: pk.target, rel: pk.released, pct: pk.target ? pk.released * 100 / pk.target : '', mat: c.Material + A.Material, lab: c.Labour + A.Labour, oh: c.Overhead + c.Other + A.Overhead, tot, fg: rel, wip: c.bal, cpp: pk.released ? Math.round(rel / pk.released) : (pk.started ? Math.round(tot / pk.started) : ''), sales: s.n, gp: s.n - s.c }, drill: { r: 'jobsheet', p: { job: j.id } } };
      });
      const T = f => rows.reduce((s, r) => s + (+r.c[f] || 0), 0);
      return { cols: [{ k: 'no', l: 'Job', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 160 }, { k: 'date', l: 'Started', t: 'text' }, { k: 'due', l: 'Due', t: 'text' }, { k: 'st', l: 'Status', t: 'text' }, { k: 'late', l: 'Days late', t: 'days', tot: false }, { k: 'target', l: 'Target packs', t: 'qty' }, { k: 'rel', l: 'Packs released', t: 'qty' }, { k: 'pct', l: 'Complete %', t: 'pct', tot: false }, { k: 'mat', l: 'Materials', t: 'money' }, { k: 'lab', l: 'Labour', t: 'money' }, { k: 'oh', l: 'Overhead & other', t: 'money' }, { k: 'tot', l: 'Total cost charged', t: 'money', always: true }, { k: 'fg', l: 'Released to finished goods', t: 'money' }, { k: 'wip', l: 'WIP balance', t: 'money', always: true }, { k: 'cpp', l: 'Cost per pack released', t: 'money', tot: false }, { k: 'sales', l: 'Net sales from job', t: 'money' }, { k: 'gp', l: 'Sales profit', t: 'money' }], rows, flat: true, sub: 'Costs to ' + P.to + ' · jobs started ' + RS.periodLabel(P.from, P.to), kpis: [['Jobs', String(rows.length)], ['Total cost charged', E.m(T('tot'))], ['WIP on these jobs', E.m(T('wip'))], ['Sales profit', E.m(T('gp'))]], land: true, notes: ['Labour and overhead include the costs allocated to each job for costing (piece wages, salaries, wages, expenses, shared overhead); they are already in the ledger as normal expenses. WIP balance holds materials (and any labour charged to WIP before this change).', 'Cost per pack uses the value released to finished goods; for jobs with nothing released yet it uses cost charged per pack started.'] };
    }
  });

  /* ═══════════════ JOB COST SHEET ═══════════════ */
  add({
    id: 'jobsheet', g: 'prd', t: 'Job Cost Sheet (single job)', d: 'One job in full: cost by article and colour, materials issued, labour by operation and worker, and every ledger posting.', kw: 'job cost sheet job card materials labour overhead article',
    f: ['job1', 'mode'], modes: [['sheet', 'Cost by article / colour'], ['mat', 'Materials issued'], ['lab', 'Labour by operation & worker'], ['ledger', 'Every cost posting'], ['alloc', 'Costing allocations (expenses, wages)']],
    build(P) {
      const j = D.job(P.job); if (!j) return null; const L = D.jobLines(j.id), head = j.no + ' · ' + D.pname(j.partyId) + ' · ' + (j.status || '') + (j.due ? ' · due ' + j.due : '');
      const lines = D.lines().filter(x => x.acc === '1310' && x.job === j.id), jc = D.jobCost('', '')[j.id] || { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Other: 0, bal: 0 };
      const JA = allocCat(j.id, ''), kp = [['Materials', E.m(jc.Material + JA.Material)], ['Labour', E.m(jc.Labour + JA.Labour)], ['Overhead & other', E.m(jc.Overhead + jc.Other + JA.Overhead)], ['Released to FG', E.m(-(jc.Release + jc.Costing))], ['WIP balance', E.m(jc.bal)]];
      if (P.mode === 'mat') { const R = {}; D.moves().filter(m => m.job === j.id && (m.type === 'issue' || m.type === 'return')).forEach(m => { const k = m.itemId + '|' + (m.variantId || ''), r = R[k] || (R[k] = { code: D.code(m.itemId, m.variantId), name: D.name(m.itemId), unit: (D.item(m.itemId) || {}).unit || '', iq: 0, iv: 0, rq: 0, rv: 0, first: m.date, last: m.date }); if (m.type === 'issue') { r.iq -= m.qty; r.iv -= m.value; } else { r.rq += m.qty; r.rv += m.value; } r.last = m.date; }); const rows = Object.values(R).map(r => ({ k: 'd', c: Object.assign(r, { nq: r.iq - r.rq, nv: r.iv - r.rv, rate: r.iq ? Math.round(r.iv / r.iq) : '' }) })); return { cols: [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Material', t: 'text', w: 200 }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'iq', l: 'Issued', t: 'qty' }, { k: 'rq', l: 'Returned', t: 'qty' }, { k: 'nq', l: 'Net used', t: 'qty', always: true }, { k: 'rate', l: 'Avg cost', t: 'money', tot: false }, { k: 'nv', l: 'Net value', t: 'money', always: true }, { k: 'first', l: 'First issue', t: 'text' }, { k: 'last', l: 'Last movement', t: 'text' }], rows, flat: true, sub: head, kpis: kp }; }
      if (P.mode === 'lab') { const R = {}; E.rows('prodLogs').filter(l => l.jobId === j.id).forEach(l => { const k = (l.opName || '') + '|' + l.empId, r = R[k] || (R[k] = { op: l.opName || '', emp: D.emp(l.empId).name || '', n: 0, packs: 0, pairs: 0, amt: 0, paid: 0, acc: 0 }); r.n++; r.packs += l.qty || 0; r.pairs += l.pairs || 0; r.amt += l.amount; if (l.status === 'paid') r.paid += l.amount; else if (l.status !== 'cancelled') r.acc += l.amount; }); return { cols: [{ k: 'op', l: 'Operation', t: 'text', always: true }, { k: 'emp', l: 'Worker', t: 'text', w: 160 }, { k: 'n', l: 'Entries', t: 'int' }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'pairs', l: 'Pairs', t: 'qty' }, { k: 'amt', l: 'Wage amount', t: 'money', always: true }, { k: 'paid', l: 'Paid', t: 'money' }, { k: 'acc', l: 'Accrued, unpaid', t: 'money' }], rows: Object.values(R).sort((a, b) => a.op.localeCompare(b.op)).map(r => ({ k: 'd', c: r })), flat: true, sub: head, kpis: kp, notes: ['Piece-rate production entries. Daily wages and salaries charged to the job appear in the cost ledger view.'] }; }
      if (P.mode === 'alloc') { const al = (E.allocRows ? E.allocRows(j.id) : []).slice().sort((a, b) => a.date.localeCompare(b.date)); let run = 0; const rows = al.map(a => { run += a.amount; return { k: 'd', c: { date: a.date, no: a.jeNo || '', head: a.head + ' — ' + (a.headName || ''), cat: a.cat || '', narr: a.narr || '', amt: a.amount, run } }; }); return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'head', l: 'Expense account', t: 'text', w: 200 }, { k: 'cat', l: 'Cost type', t: 'text' }, { k: 'narr', l: 'Narration', t: 'text', w: 260 }, { k: 'amt', l: 'Allocated', t: 'money', always: true }, { k: 'run', l: 'Running total', t: 'money', tot: false }], rows, flat: true, sub: head, kpis: [['Held in WIP (materials)', E.m(jc.Material + jc.Labour + jc.Overhead + jc.Other)], ['Allocated expenses & wages', E.m(run)], ['Complete cost', E.m(jc.Material + jc.Labour + jc.Overhead + jc.Other + run)]], notes: ['Costing only. These costs are already in the ledger as normal expenses (expense account / cash or bank). They are shown here so the job gets its full cost; they are never added to WIP.'] }; }
      if (P.mode === 'ledger') { let run = 0; const rows = lines.map(x => { run += x.dr - x.cr; const l = L.find(q => q.id === x.art); return { k: 'd', c: { date: x.date, no: x.no, src: RS.srcName(x.src), cat: x.cat || '', art: l ? l.code : '', narr: x.l.narr || x.j.narr || '', dr: x.dr, cr: x.cr, bal: run } }; }); return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'src', l: 'Source', t: 'text' }, { k: 'cat', l: 'Cost type', t: 'text' }, { k: 'art', l: 'Article / colour', t: 'text' }, { k: 'narr', l: 'Narration', t: 'text', w: 260 }, { k: 'dr', l: 'Cost added', t: 'money', always: true }, { k: 'cr', l: 'Released / credited', t: 'money', always: true }, { k: 'bal', l: 'WIP balance', t: 'money', tot: false, always: true }], rows, flat: true, sub: head, kpis: kp }; }
      const by = {}; lines.forEach(x => { const k = x.art || '', r = by[k] || (by[k] = { Material: 0, Labour: 0, Overhead: 0, Other: 0, rel: 0, bal: 0 }), cat = CATS.includes(x.cat) ? x.cat : 'Other', v = x.dr - x.cr; if (cat === 'Release' || cat === 'Costing') r.rel -= v; else r[cat] += v; r.bal += v; });
      const rows = L.map(l => { const r = by[l.id] || { Material: 0, Labour: 0, Overhead: 0, Other: 0, rel: 0, bal: 0 }, AL = allocCat(j.id, '', l.id), tot = r.Material + r.Labour + r.Overhead + r.Other + AL.Material + AL.Labour + AL.Overhead; return { k: 'd', c: { code: l.code, name: l.name, target: l.target, started: l.started || 0, rel: l.released || 0, mat: r.Material + AL.Material, lab: r.Labour + AL.Labour, oh: r.Overhead + r.Other + AL.Overhead, tot, fg: l.fgValue || r.rel, wip: r.bal, cpp: l.released ? Math.round((l.fgValue || r.rel) / l.released) : '' } }; });
      const JL0 = allocCat(j.id, '', '');
      if (by[''] || JL0.Material + JL0.Labour + JL0.Overhead) { const r = by[''] || { Material: 0, Labour: 0, Overhead: 0, Other: 0, rel: 0, bal: 0 }, tot = r.Material + r.Labour + r.Overhead + r.Other + JL0.Material + JL0.Labour + JL0.Overhead; rows.push({ k: 'd', c: { code: '(job level)', name: 'Costs not yet tied to an article', target: '', started: '', rel: '', mat: r.Material + JL0.Material, lab: r.Labour + JL0.Labour, oh: r.Overhead + r.Other + JL0.Overhead, tot, fg: r.rel, wip: r.bal, cpp: '' } }); }
      return { cols: [{ k: 'code', l: 'Article / colour', t: 'text', always: true }, { k: 'name', l: 'Description', t: 'text', w: 180 }, { k: 'target', l: 'Target packs', t: 'qty' }, { k: 'started', l: 'Started', t: 'qty' }, { k: 'rel', l: 'Released', t: 'qty' }, { k: 'mat', l: 'Materials', t: 'money' }, { k: 'lab', l: 'Labour', t: 'money' }, { k: 'oh', l: 'Overhead & other', t: 'money' }, { k: 'tot', l: 'Total cost', t: 'money', always: true }, { k: 'fg', l: 'Released to FG', t: 'money' }, { k: 'wip', l: 'WIP balance', t: 'money', always: true }, { k: 'cpp', l: 'Cost per pack', t: 'money', tot: false }], rows, flat: true, sub: head, kpis: kp, land: true };
    }
  });

  /* ═══════════════ WIP STATEMENT ═══════════════ */
  add({
    id: 'wip', g: 'prd', t: 'Work-in-Progress Statement', d: 'Cost sitting in unfinished jobs as at a date, by job and cost type, with days open and last activity - proved against ledger 1310.', kw: 'wip work in progress unfinished jobs',
    f: ['asat', 'cust', 'zero'],
    build(P) {
      const R = {}, last = {}; D.lines().forEach(x => { if (x.acc !== '1310' || x.date > P.asat) return; const r = R[x.job || ''] || (R[x.job || ''] = { Material: 0, Labour: 0, Overhead: 0, Other: 0, out: 0, bal: 0 }), c = CATS.includes(x.cat) ? x.cat : 'Other', v = x.dr - x.cr; if (c === 'Release' || c === 'Costing') r.out -= v; else r[c] += v; r.bal += v; if (!last[x.job || ''] || x.date > last[x.job || '']) last[x.job || ''] = x.date; });
      const rows = []; Object.keys(R).forEach(id => { const j = D.job(id), r = R[id]; if (!P.zero && !r.bal) return; if (P.party && (!j || j.partyId !== P.party)) return; rows.push({ k: 'd', c: { no: j ? j.no : '(no job)', cust: j ? D.pname(j.partyId) : '', st: j ? j.status : '', date: j ? j.date : '', open: j ? dt.diff(j.date, P.asat) : '', last: last[id] || '', idle: last[id] ? dt.diff(last[id], P.asat) : '', mat: r.Material, lab: r.Labour, oh: r.Overhead + r.Other, out: r.out, bal: r.bal }, drill: j ? { r: 'jobsheet', p: { job: id } } : undefined }); });
      rows.sort((a, b) => b.c.bal - a.c.bal); const tot = rows.reduce((s, r) => s + r.c.bal, 0), gl = D.natC('1310', D.upTo(P.asat));
      return { cols: [{ k: 'no', l: 'Job', t: 'text', always: true }, { k: 'cust', l: 'Customer', t: 'text', w: 160 }, { k: 'st', l: 'Status', t: 'text' }, { k: 'date', l: 'Job date', t: 'text' }, { k: 'open', l: 'Days open', t: 'days', tot: false }, { k: 'last', l: 'Last activity', t: 'text' }, { k: 'idle', l: 'Days idle', t: 'days', tot: false }, { k: 'mat', l: 'Materials', t: 'money' }, { k: 'lab', l: 'Labour', t: 'money' }, { k: 'oh', l: 'Overhead & other', t: 'money' }, { k: 'out', l: 'Released to FG', t: 'money' }, { k: 'bal', l: 'WIP balance', t: 'money', always: true }], rows, flat: true, sub: 'As at ' + P.asat, kpis: [['Total WIP', E.m(tot)], ['Jobs with WIP', String(rows.length)]], checks: P.party ? [] : [[tot === gl, 'Agrees with ledger 1310 (Work In Progress)', tot === gl ? E.m(gl) : 'Differs by ' + E.m(tot - gl)]], land: true, notes: ['Jobs idle for a long time with WIP still on them may need to be completed or written off.'] };
    }
  });

  /* ═══════════════ PRODUCTION OUTPUT ═══════════════ */
  add({
    id: 'prodout', g: 'prd', t: 'Production Output Report', d: 'Packs and pairs completed (released to finished goods) by article, colour, category, job, day or month, with value and cost per pack and pair.', kw: 'production output completed packs pairs released finished goods daily',
    f: ['range', 'gb', 'fg', 'cat', 'job'], preset: 'mtd', gb: [['sku', 'Article / colour'], ['item', 'Article'], ['cat', 'Category'], ['job', 'Job'], ['month', 'Month'], ['day', 'Day']],
    build(P) {
      const R = {}; let cost = 0; D.moves().filter(m => (m.type === 'release' || m.type === 'costing') && m.date >= P.from && m.date <= P.to && (!P.job || m.job === P.job)).forEach(m => {
        const i = D.item(m.itemId), cat = D.catOf(i); if ((P.item && m.itemId !== P.item) || (P.cat && cat !== P.cat)) return; const k = P.gb === 'sku' ? m.itemId + '|' + (m.variantId || '') : P.gb === 'item' ? m.itemId : P.gb === 'cat' ? cat : P.gb === 'job' ? m.job : P.gb === 'month' ? m.date.slice(0, 7) : m.date;
        const r = R[k] || (R[k] = { code: P.gb === 'sku' ? D.code(m.itemId, m.variantId) : '', name: P.gb === 'sku' ? D.name(m.itemId) + (D.colour(m.variantId) ? ' · ' + D.colour(m.variantId) : '') : P.gb === 'item' ? D.name(m.itemId) : P.gb === 'cat' ? cat : P.gb === 'job' ? D.jobNo(m.job) : P.gb === 'month' ? dt.monLabel(k) : k, sort: k, packs: 0, pairs: 0, val: 0, jobId: m.job });
        r.packs += m.qty; r.pairs += m.qty * D.pairsPerPack(m.itemId); r.val += m.value; cost += m.value;
      });
      const rows = Object.values(R).sort((a, b) => ['month', 'day'].includes(P.gb) ? a.sort.localeCompare(b.sort) : b.val - a.val).map(r => ({ k: 'd', c: Object.assign(r, { cpack: r.packs ? Math.round(r.val / r.packs) : '', cpair: r.pairs ? Math.round(r.val / r.pairs) : '' }), drill: P.gb === 'job' && r.jobId ? { r: 'jobsheet', p: { job: r.jobId } } : undefined }));
      const g = D.lines().filter(x => x.acc === '1320' && (x.cat === 'Release' || x.cat === 'Costing') && x.date >= P.from && x.date <= P.to).reduce((s, x) => s + x.dr - x.cr, 0), full = !P.item && !P.cat && !P.job;
      return { cols: [{ k: 'code', l: 'Code', t: 'text', always: P.gb === 'sku' }, { k: 'name', l: { sku: 'Article / colour', item: 'Article', cat: 'Category', job: 'Job', month: 'Month', day: 'Date' }[P.gb], t: 'text', always: true, w: 220 }, { k: 'packs', l: 'Packs completed', t: 'qty', always: true }, { k: 'pairs', l: 'Pairs completed', t: 'qty' }, { k: 'val', l: 'Value (factory cost)', t: 'money' }, { k: 'cpack', l: 'Cost per pack', t: 'money', tot: false }, { k: 'cpair', l: 'Cost per pair', t: 'money', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Packs completed', String(Math.round(rows.reduce((s, r) => s + r.c.packs, 0) * 1000) / 1000)], ['Pairs completed', String(Math.round(rows.reduce((s, r) => s + r.c.pairs, 0)))], ['Factory cost', E.m(cost)]], checks: full ? [[g === cost, 'Value agrees with finished goods received in the ledger (1320)', g === cost ? E.m(cost) : 'Differs by ' + E.m(cost - g)]] : [] };
    }
  });

  /* ═══════════════ OPERATIONS & WORKERS ═══════════════ */
  add({
    id: 'operations', g: 'prd', t: 'Operation-wise & Worker-wise Production Wages', d: 'Piece-rate production by operation, worker, article, job, day or month: packs, pairs, wages, average rate and paid/accrued status.', kw: 'piece rate operation worker production wages cutting sewing',
    f: ['range', 'gb', 'emp', 'job', 'fg'], preset: 'mtd', gb: [['op', 'Operation'], ['emp', 'Worker'], ['opemp', 'Operation × worker'], ['sku', 'Article / colour'], ['job', 'Job'], ['month', 'Month'], ['day', 'Day']],
    build(P) {
      const R = {}; E.rows('prodLogs').filter(l => l.status !== 'cancelled' && l.date >= P.from && l.date <= P.to && (!P.emp || l.empId === P.emp) && (!P.job || l.jobId === P.job) && (!P.item || l.itemId === P.item)).forEach(l => {
        const e = D.emp(l.empId), k = P.gb === 'op' ? l.opName : P.gb === 'emp' ? l.empId : P.gb === 'opemp' ? l.opName + '|' + l.empId : P.gb === 'sku' ? l.itemId + '|' + (l.variantId || '') : P.gb === 'job' ? l.jobId : P.gb === 'month' ? l.date.slice(0, 7) : l.date;
        const r = R[k] || (R[k] = { name: P.gb === 'op' ? l.opName : P.gb === 'emp' ? ((e.code ? e.code + ' · ' : '') + (e.name || '?')) : P.gb === 'opemp' ? l.opName : P.gb === 'sku' ? D.code(l.itemId, l.variantId) : P.gb === 'job' ? D.jobNo(l.jobId) : P.gb === 'month' ? dt.monLabel(k) : k, emp: P.gb === 'opemp' ? (e.name || '?') : '', sort: k, n: 0, packs: 0, pairs: 0, amt: 0, paid: 0, acc: 0 }); r.n++; r.packs += l.qty || 0; r.pairs += l.pairs || 0; r.amt += l.amount; if (l.status === 'paid') r.paid += l.amount; else r.acc += l.amount; });
      const rows = Object.values(R).sort((a, b) => ['month', 'day'].includes(P.gb) ? a.sort.localeCompare(b.sort) : b.amt - a.amt).map(r => ({ k: 'd', c: Object.assign(r, { rate: r.pairs ? Math.round(r.amt / r.pairs) : '' }) }));
      const acc = E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0), gl = E.acct('2210') ? E.bal('2210') : 0;
      return { cols: [{ k: 'name', l: { op: 'Operation', emp: 'Worker', opemp: 'Operation', sku: 'Article / colour', job: 'Job', month: 'Month', day: 'Date' }[P.gb], t: 'text', always: true, w: 200 }, ...(P.gb === 'opemp' ? [{ k: 'emp', l: 'Worker', t: 'text', w: 160 }] : []), { k: 'n', l: 'Entries', t: 'int' }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'pairs', l: 'Pairs', t: 'qty' }, { k: 'amt', l: 'Wages earned', t: 'money', always: true }, { k: 'rate', l: 'Avg wage per pair', t: 'money', tot: false }, { k: 'paid', l: 'Paid', t: 'money' }, { k: 'acc', l: 'Accrued, unpaid', t: 'money' }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Wages earned', E.m(rows.reduce((s, r) => s + r.c.amt, 0))], ['Pairs', String(Math.round(rows.reduce((s, r) => s + r.c.pairs, 0)))], ['Unpaid (all dates)', E.m(acc)]], checks: [[acc === gl, 'Unpaid piece wages (all dates) = ledger 2210', acc === gl ? E.m(gl) : 'Production logs ' + E.m(acc) + ' vs ledger ' + E.m(gl)]] };
    }
  });

  /* ═══════════════ OVERHEAD ANALYSIS ═══════════════ */
  add({
    id: 'overhead', g: 'prd', t: 'Factory Overhead Analysis', d: 'Indirect factory costs by account or behaviour (fixed / variable), absorbed into jobs versus incurred, and the cost per pack.', kw: 'overhead analysis factory expenses absorbed under over applied fixed variable',
    f: ['range', 'gb'], preset: 'fy', gb: [['acct', 'By account'], ['beh', 'By behaviour (fixed / variable / semi)'], ['month', 'By month - incurred vs absorbed']],
    build(P) {
      const m = D.range(P.from, P.to), oh = D.coa().filter(a => a.type === 'expense' && a.nature === 'oh' && a.code !== '5290'), pk = packsOut(P.from, P.to), absorbed = -D.natC('5290', m), tot = oh.reduce((s, a) => s + D.nat(a, m[a.code]), 0);
      const kp = [['Overhead incurred', E.m(tot)], ['Absorbed into jobs', E.m(absorbed)], ['Under / (over) absorbed', E.m(tot - absorbed)], ['Per pack completed', pk ? E.m(Math.round(tot / pk)) : '-']];
      const BEH = { fixed: 'Fixed', variable: 'Variable', semi: 'Semi-variable', '': 'Unclassified' };
      if (P.gb === 'month') { const bm = D.byMonth(P.from, P.to), rows = dt.monthsBetween(P.from, P.to).map(mo => { const mm = bm[mo] || {}, inc = oh.reduce((s, a) => s + D.nat(a, mm[a.code]), 0), ab = -D.natC('5290', mm); return { k: 'd', c: { name: dt.monLabel(mo), inc, ab, un: inc - ab, pk: packsOut(mo + '-01', dt.monthEnd(mo + '-01')) } }; }); rows.forEach(r => r.c.pp = r.c.pk ? Math.round(r.c.inc / r.c.pk) : ''); return { cols: [{ k: 'name', l: 'Month', t: 'text', always: true }, { k: 'inc', l: 'Overhead incurred', t: 'money' }, { k: 'ab', l: 'Absorbed into jobs', t: 'money' }, { k: 'un', l: 'Under / (over) absorbed', t: 'money', always: true }, { k: 'pk', l: 'Packs completed', t: 'qty' }, { k: 'pp', l: 'Overhead per pack', t: 'money', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: kp }; }
      const rows = P.gb === 'beh' ? Object.entries(oh.reduce((g, a) => { const k = a.beh || ''; g[k] = (g[k] || 0) + D.nat(a, m[a.code]); return g; }, {})).map(([k, v]) => ({ k: 'd', c: { code: '', name: BEH[k], beh: '', amt: v, share: tot ? v * 100 / tot : 0, pp: pk ? Math.round(v / pk) : '' } })) : oh.filter(a => D.nat(a, m[a.code])).map(a => ({ k: 'd', c: { code: a.code, name: a.name, beh: BEH[a.beh || ''], amt: D.nat(a, m[a.code]), share: tot ? D.nat(a, m[a.code]) * 100 / tot : 0, pp: pk ? Math.round(D.nat(a, m[a.code]) / pk) : '' }, drill: { r: 'gl', p: { acct: a.code, from: P.from, to: P.to } } }));
      rows.sort((a, b) => b.c.amt - a.c.amt);
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: P.gb === 'beh' ? 'Behaviour' : 'Overhead account', t: 'text', always: true, w: 260 }, { k: 'beh', l: 'Behaviour', t: 'text' }, { k: 'amt', l: 'Incurred', t: 'money', always: true }, { k: 'share', l: '% of overhead', t: 'pct', tot: false }, { k: 'pp', l: 'Per pack completed', t: 'money', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: kp, notes: ['Depreciation of machinery (5260) is included here as an overhead the factory carries; it is not charged into product cost.'] };
    }
  });

  /* ═══════════════ WASTAGE & LOSSES ═══════════════ */
  add({
    id: 'wastage', g: 'prd', t: 'Wastage & Factory Loss Report', d: 'Every wastage, damage and stock-loss write-off to Factory Loss (5300): by entry, job, month or source, as a share of material used.', kw: 'wastage waste loss damage factory loss write off scrap',
    f: ['range', 'gb', 'job'], preset: 'fy', gb: [['list', 'Every entry'], ['job', 'By job'], ['month', 'By month'], ['src', 'By source']],
    build(P) {
      const L = D.lines().filter(x => x.acc === '5300' && x.date >= P.from && x.date <= P.to && (!P.job || x.job === P.job)), tot = L.reduce((s, x) => s + x.dr - x.cr, 0), used = wipCats(P.from, P.to).Material;
      let rows; if (P.gb === 'list') rows = L.map(x => ({ k: 'd', c: { name: x.date, no: x.no, src: RS.srcName(x.src), narr: x.l.narr || x.j.narr || '', job: D.jobNo(x.job), amt: x.dr - x.cr }, drill: { r: 'daybook', p: { q: x.no, preset: 'all', mode: 'lines' } } })); else { const g = {}; L.forEach(x => { const k = P.gb === 'job' ? D.jobNo(x.job) || '(no job)' : P.gb === 'month' ? x.date.slice(0, 7) : RS.srcName(x.src), r = g[k] || (g[k] = { name: P.gb === 'month' ? dt.monLabel(k) : k, sort: k, no: '', src: '', narr: '', job: '', amt: 0 }); r.amt += x.dr - x.cr; }); rows = Object.values(g).sort((a, b) => P.gb === 'month' ? a.sort.localeCompare(b.sort) : b.amt - a.amt).map(r => ({ k: 'd', c: r })); }
      return { cols: [{ k: 'name', l: P.gb === 'list' ? 'Date' : { job: 'Job', month: 'Month', src: 'Source' }[P.gb], t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'src', l: 'Source', t: 'text' }, { k: 'narr', l: 'Narration', t: 'text', w: 300 }, { k: 'job', l: 'Job', t: 'text' }, { k: 'amt', l: 'Loss amount', t: 'money', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Total factory loss', E.m(tot)], ['Material charged to jobs', E.m(used)], ['Loss as % of material', used ? (tot * 100 / used).toFixed(2) + '%' : '-']], notes: ['Includes unused job material written off at job completion and stock-take or adjustment losses posted to Factory Loss.'] };
    }
  });

  /* ═══════════════ BOM VARIANCE ═══════════════ */
  add({
    id: 'bomvar', g: 'prd', t: 'BOM Standard vs Actual Material Usage', d: 'Material that should have been used (bill of materials x pairs started) against material actually issued, per job - overuse and savings in quantity and value.', kw: 'bom variance standard actual consumption material usage efficiency',
    f: ['job', 'mat'],
    build(P) {
      const rows = []; let missing = 0;
      E.rows('jobs').filter(j => !P.job || j.id === P.job).forEach(j => {
        const exp = {}; D.jobLines(j.id).forEach(l => { const it = D.item(l.itemId), pairs = (l.started || l.released || 0) * D.pairsPerPack(l.itemId); if (!it || !(it.bom || []).length) { if (pairs) missing++; return; } it.bom.forEach(b => { const k = b.itemId + '|' + (b.variantId || ''); exp[k] = (exp[k] || 0) + b.qty * pairs; }); });
        const act = {}, val = {}; D.moves().filter(m => m.job === j.id && (m.type === 'issue' || m.type === 'return')).forEach(m => { const k = m.itemId + '|' + (m.variantId || ''); act[k] = (act[k] || 0) - m.qty; val[k] = (val[k] || 0) - m.value; });
        new Set([...Object.keys(exp), ...Object.keys(act)]).forEach(k => { const [itemId, variantId] = k.split('|'); if (P.item && itemId !== P.item) return; const e = exp[k] || 0, a = act[k] || 0; if (!e && !a) return; const unit = a ? val[k] / a : 0, v = a - e;
          rows.push({ k: 'd', c: { job: j.no, code: D.code(itemId, variantId), name: D.name(itemId), unit: (D.item(itemId) || {}).unit || '', exp: Math.round(e * 1000) / 1000, act: Math.round(a * 1000) / 1000, v: Math.round(v * 1000) / 1000, vp: e ? v * 100 / e : '', vv: Math.round(v * unit), flag: !e ? 'Not in BOM' : v > e * 0.05 ? 'OVERUSE' : v < -e * 0.05 ? 'Saving' : 'On standard' }, drill: { r: 'jobsheet', p: { job: j.id } } }); });
      });
      rows.sort((a, b) => b.c.vv - a.c.vv);
      return { cols: [{ k: 'job', l: 'Job', t: 'text', always: true }, { k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Material', t: 'text', w: 200 }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'exp', l: 'Standard qty (BOM)', t: 'qty', tot: false }, { k: 'act', l: 'Actual qty issued (net)', t: 'qty', tot: false }, { k: 'v', l: 'Variance qty (+ overuse)', t: 'qty', tot: false }, { k: 'vp', l: 'Variance %', t: 'pct', tot: false }, { k: 'vv', l: 'Variance value', t: 'money', always: true }, { k: 'flag', l: 'Result', t: 'text', always: true }], rows, flat: true, kpis: [['Net variance value', E.m(rows.reduce((s, r) => s + r.c.vv, 0))], ['Overuse lines', String(rows.filter(r => r.c.flag === 'OVERUSE').length)]], notes: ['Standard quantity = BOM quantity per pair x pairs started (or released). ' + (missing ? missing + ' job line(s) with production have no bill of materials and are not compared.' : '')], land: true };
    }
  });

  /* ═══════════════ COST TREND ═══════════════ */
  add({
    id: 'costtrend', g: 'prd', t: 'Cost per Pack Trend (Monthly)', d: 'Month by month: materials, labour and overhead charged to jobs, packs completed and the factory cost per pack and per pair.', kw: 'cost trend per pack per pair monthly unit cost',
    f: ['range'], preset: 'l12',
    build(P) {
      const months = dt.monthsBetween(P.from, P.to), W = {}; D.lines().forEach(x => { if (x.acc !== '1310' || x.date < P.from || x.date > P.to) return; const k = x.date.slice(0, 7), r = W[k] || (W[k] = { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Other: 0 }); r[CATS.includes(x.cat) ? x.cat : 'Other'] += x.dr - x.cr; });
      const rows = months.map(mo => { const w = W[mo] || { Material: 0, Labour: 0, Overhead: 0, Release: 0, Costing: 0, Other: 0 }, f = mo + '-01', t = dt.monthEnd(f), pk = packsOut(f, t), pr = pairsOut(f, t), ch = w.Material + w.Labour + w.Overhead + w.Other, x = -(w.Release + w.Costing); return { k: 'd', c: { name: dt.monLabel(mo), mat: w.Material, lab: w.Labour, oh: w.Overhead + w.Other, ch, matp: ch ? w.Material * 100 / ch : '', x, pk, pr, cpk: pk ? Math.round(x / pk) : '', cpr: pr ? Math.round(x / pr) : '' } }; });
      return { cols: [{ k: 'name', l: 'Month', t: 'text', always: true }, { k: 'mat', l: 'Materials', t: 'money' }, { k: 'lab', l: 'Labour', t: 'money' }, { k: 'oh', l: 'Overhead & other', t: 'money' }, { k: 'ch', l: 'Total charged to jobs', t: 'money', always: true }, { k: 'matp', l: 'Materials % of cost', t: 'pct', tot: false }, { k: 'x', l: 'Transferred to finished goods', t: 'money' }, { k: 'pk', l: 'Packs completed', t: 'qty' }, { k: 'pr', l: 'Pairs completed', t: 'qty' }, { k: 'cpk', l: 'Cost per pack', t: 'money', tot: false, always: true }, { k: 'cpr', l: 'Cost per pair', t: 'money', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), land: true, notes: ['Cost per pack = value transferred to finished goods in the month / packs released that month. Costs charged and transfers do not always fall in the same month.'] };
    }
  });

  /* ═══════════════ QUALITY ═══════════════ */
  add({
    id: 'qcrep', g: 'prd', t: 'Quality & Reject Report', d: 'Inspections by article, job, stage, defect or month: pieces inspected, rejected and reject rate.', kw: 'quality control rejects defects inspection rejection rate',
    f: ['range', 'gb', 'job'], preset: 'fy', gb: [['sku', 'Article / colour'], ['job', 'Job'], ['stage', 'Stage'], ['defect', 'Defect'], ['month', 'Month']],
    build(P) {
      const R = {}; E.rows('qc').filter(q => q.date >= P.from && q.date <= P.to && (!P.job || q.jobId === P.job)).forEach(q => { const k = P.gb === 'sku' ? q.code : P.gb === 'job' ? q.jobId : P.gb === 'stage' ? q.stage : P.gb === 'defect' ? (q.defect || '(none recorded)') : q.date.slice(0, 7), r = R[k] || (R[k] = { name: P.gb === 'job' ? D.jobNo(k) : P.gb === 'month' ? dt.monLabel(k) : k, sort: k, n: 0, insp: 0, rej: 0 }); r.n++; r.insp += q.inspected || 0; r.rej += q.rejected || 0; });
      const rows = Object.values(R).sort((a, b) => P.gb === 'month' ? a.sort.localeCompare(b.sort) : b.rej - a.rej).map(r => ({ k: 'd', c: Object.assign(r, { rate: r.insp ? r.rej * 100 / r.insp : '' }) })), I = rows.reduce((s, r) => s + r.c.insp, 0), Rj = rows.reduce((s, r) => s + r.c.rej, 0);
      return { cols: [{ k: 'name', l: { sku: 'Article / colour', job: 'Job', stage: 'Stage', defect: 'Defect', month: 'Month' }[P.gb], t: 'text', always: true, w: 220 }, { k: 'n', l: 'Inspections', t: 'int' }, { k: 'insp', l: 'Inspected', t: 'qty' }, { k: 'rej', l: 'Rejected', t: 'qty' }, { k: 'rate', l: 'Reject rate %', t: 'pct', tot: false, always: true, f: rs => { const a = rs.reduce((s, r) => s + r.c.insp, 0), b = rs.reduce((s, r) => s + r.c.rej, 0); return a ? b * 100 / a : ''; } }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Inspected', String(I)], ['Rejected', String(Rj)], ['Reject rate', I ? (Rj * 100 / I).toFixed(2) + '%' : '-']], notes: ['Quality records are for information; they do not post to the accounts.'] };
    }
  });

  /* ═══════════════ CONTRIBUTION & BREAK-EVEN ═══════════════ */
  add({
    id: 'contrib', g: 'prd', t: 'Contribution & Break-even Analysis', d: 'Splits costs into variable and fixed (from each account’s behaviour setting) to show contribution, break-even sales and margin of safety.', kw: 'break even contribution margin fixed variable cost safety',
    f: ['range', { k: 'semi', l: 'Semi-variable costs treated as variable %', def: 50 }], preset: 'fy',
    build(P) {
      const m = D.range(P.from, P.to), semi = Math.min(100, Math.max(0, parseFloat(P.extra.semi) || 50)) / 100, ns = D.natC('4000', m) + D.natC('4010', m), oi = D.sum(m, a => a.type === 'income' && a.code !== '4000' && a.code !== '4010');
      const ex = D.coa().filter(a => a.type === 'expense' && D.nat(a, m[a.code])), cls = a => a.code === '5400' ? 'variable' : (a.beh || (a.nature === 'adm' || a.nature === 'fin' ? 'fixed' : 'variable'));
      let v = 0, f = 0; const rows = [], vr = [], fr = []; ex.forEach(a => { const x = D.nat(a, m[a.code]), c = cls(a), vx = c === 'variable' ? x : c === 'semi' ? Math.round(x * semi) : 0, fx = x - vx; v += vx; f += fx; if (vx) vr.push([a.name, vx]); if (fx) fr.push([a.name, fx]); });
      const R = (n, val, k) => rows.push({ k: k || 'd', c: { n, v: val } }), cm = ns + oi - v, cmr = ns ? cm / ns : 0, be = cmr > 0 ? Math.round(f / cmr) : 0, np = cm - f;
      R('Net sales', ns, 's'); R('Other income', oi); R('Less: variable costs (incl. cost of goods sold)', -v); vr.sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(x => R('   ' + x[0], -x[1])); R('CONTRIBUTION', cm, 't'); R('Contribution ratio %', { v: cmr * 100, t: 'pct' }); R('Less: fixed costs', -f); fr.sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(x => R('   ' + x[0], -x[1])); R('NET PROFIT / (LOSS)', np, 't');
      rows.push({ k: 'sp', c: { n: '' } }); R('BREAK-EVEN SALES for this period', be, 't'); R('Margin of safety (sales above break-even)', ns - be); R('Margin of safety %', { v: ns ? (ns - be) * 100 / ns : 0, t: 'pct' });
      const days = Math.max(1, dt.diff(P.from, P.to) + 1); R('Break-even sales per day', Math.round(be / days)); R('Fixed costs per day', Math.round(f / days));
      return { cols: [{ k: 'n', l: 'Particulars', t: 'text', always: true, w: 380 }, { k: 'v', l: 'Amount', t: 'money', always: true }], rows, sub: RS.periodLabel(P.from, P.to), kpis: [['Contribution ratio', (cmr * 100).toFixed(1) + '%'], ['Break-even sales', E.m(be)], ['Actual net sales', E.m(ns)], ['Margin of safety', ns ? ((ns - be) * 100 / ns).toFixed(1) + '%' : '-']], checks: [[cm - f === D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense'), 'Contribution - fixed costs = net profit (ties to Profit & Loss)', E.m(np)]], notes: ['Cost of goods sold is treated as variable although it contains some absorbed fixed overhead, so the break-even point is an estimate. Set each account’s behaviour in the chart of accounts for sharper results.'] };
    }
  });
})(window.ERP);
