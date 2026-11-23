/* PART 8 — Ledger search, financial reports, health check.
   FIX: Health Check 1250 now includes staff loans. Variable rename (pairs→packsReleased).
*/
(E => {
  const at = E.N.findIndex(n => n.id === 'settings');
  [['ledger', '📖', 'Ledger Search'], ['reports', '📈', 'Financial Reports'], ['health', '🩺', 'Health Check']].forEach((x, i) => E.N.splice(at + i, 0, { g: 'Reports', id: x[0], ico: x[1], label: x[2] }));
  const rt = (f, t) => { const m = {}; E.rows('journalEntries').forEach(j => { if ((f && j.date < f) || (t && j.date > t)) return; j.lines.forEach(l => { const x = m[l.acc] || (m[l.acc] = { dr: 0, cr: 0 }); x.dr += l.dr; x.cr += l.cr }) }); return m };
  const nat = (a, x) => x ? ((a.type === 'asset' || a.type === 'expense') ? x.dr - x.cr : x.cr - x.dr) : 0, cs = (a, b) => a.code.localeCompare(b.code);
  const L = { acc: '', q: '', from: '', to: '' }, F = { tab: 'pl', from: '', to: E.today() };
  /* Financial year: start month is a per-factory setting (1 = January; Sri Lanka companies often use 4 = April) */
  const fyM = () => Math.min(12, Math.max(1, parseInt(E.setting('fyMonth')) || 1));
  const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const fyStart = (off) => { const t = E.today(), y = +t.slice(0, 4), m = +t.slice(5, 7), fm = fyM(); const sy = (m >= fm ? y : y - 1) + (off || 0); return iso(sy, fm, 1); };
  const fyEnd = (off) => { const st = fyStart(off), y = +st.slice(0, 4), fm = fyM(); const ey = fm === 1 ? y : y + 1, em = fm === 1 ? 12 : fm - 1; return iso(ey, em, new Date(ey, em, 0).getDate()); };

  function ltbl() {
    const q = L.q.toLowerCase(), a = E.acct(L.acc), dn = a && (a.type === 'asset' || a.type === 'expense');
    let run = 0, rows = [];
    E.rows('journalEntries').slice().sort((x, y) => x.date.localeCompare(y.date) || x.no.localeCompare(y.no)).forEach(j => j.lines.forEach(l => {
      if (L.acc && l.acc !== L.acc) return;
      if (L.from && j.date < L.from) { if (a) run += dn ? l.dr - l.cr : l.cr - l.dr; return }
      if (L.to && j.date > L.to) return;
      const jb = l.job ? (E.D.jobs.find(x => x.id === l.job)?.no || '') : '', ac = E.acct(l.acc);
      if (q && !(j.no + ' ' + j.ref + ' ' + j.narr + ' ' + jb + ' ' + l.acc + ' ' + (ac?.name || '') + ' ' + ((l.dr || l.cr) / 100)).toLowerCase().includes(q)) return;
      if (a) run += dn ? l.dr - l.cr : l.cr - l.dr;
      rows.push(`<tr><td>${j.date}</td><td>${j.no}</td>${a ? '' : `<td>${l.acc} ${E.esc(ac?.name)}</td>`}<td>${E.esc(j.narr)}</td><td>${jb}</td><td class="r">${l.dr ? E.m(l.dr) : ''}</td><td class="r">${l.cr ? E.m(l.cr) : ''}</td>${a ? `<td class="r"><b>${E.m(run)}</b></td>` : ''}</tr>`)
    }));
    return `<div class="tw"><table><thead><tr><th>Date</th><th>Entry</th>${a ? '' : '<th>Account</th>'}<th>Narration</th><th>Job</th><th class="r">Debit</th><th class="r">Credit</th>${a ? '<th class="r">Balance</th>' : ''}</tr></thead><tbody>${rows.join('') || '<tr><td colspan="8" class="muted">No matching entries</td></tr>'}</tbody></table></div><p class="muted">${rows.length} line(s)</p>`;
  }
  E.route('ledger', 'Ledger Search', () => `<div class="bar"><select class="fs" data-f="lg.acc" style="max-width:300px"><option value="">All accounts</option>${E.opts(null, L.acc)}</select><input class="fs" style="min-width:240px" data-f="lg.q" placeholder="Search narration, entry, job, account, amount…" value="${E.esc(L.q)}"><input class="fs" type="date" data-f="lg.from" value="${L.from}" title="From"><input class="fs" type="date" data-f="lg.to" value="${L.to}" title="To"></div><div id="tbl">${ltbl()}</div>`);
  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f && f.startsWith('lg.')) { L[f.slice(3)] = e.target.value; E.$('tbl').innerHTML = ltbl() } });

  const R = (n, v, b) => `<tr><td>${b ? '<b>' : ''}${n}${b ? '</b>' : ''}</td><td class="r">${b ? '<b>' : ''}${E.m(v)}${b ? '</b>' : ''}</td></tr>`,
    H = t => `<tr><td colspan="2" style="background:var(--s2)"><b>${t}</b></td></tr>`,
    T = b => `<div class="tw"><table><tbody>${b}</tbody></table></div>`;
  const sum = (ac, m, f) => ac.filter(f).reduce((s, a) => s + nat(a, m[a.code]), 0),
    lst = (ac, m, f) => ac.filter(a => f(a) && nat(a, m[a.code])).sort(cs).map(a => R(a.code + ' · ' + E.esc(a.name), nat(a, m[a.code]))).join('');

  const SEC = ['dm', 'dl', 'oh', 'contra', 'loss', 'adm', 'sel', 'fin', 'oth', ''];
  const SECN = { dm: 'Direct material', dl: 'Direct labour', oh: 'Factory overheads', contra: 'Factory overheads absorbed into jobs (contra)', loss: 'Factory losses (wastage / damage / stock loss)', adm: 'Administrative expenses', sel: 'Selling & distribution expenses', fin: 'Finance costs', oth: 'Other expenses', '': 'Unclassified expenses' };
  const stockAcc = ['1300', '1310', '1320'];
  const stockBal = (m) => stockAcc.reduce((s, c) => s + (m[c] ? m[c].dr - m[c].cr : 0), 0);
  function dayBefore(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }
  /* TRADING ACCOUNT (Busy style): Opening stock + purchases + direct costs - closing stock = cost of sales; every figure comes from the ledger.
     The cost of sales worked out this way is CHECKED against the Cost of Goods Sold account (5400). */
  function trading() {
    const A = E.rows('coa'), m = rt(F.from, F.to), op = rt('', dayBefore(F.from)), cl = rt('', F.to);
    const sales = sum(A, m, a => a.code === '4000'), disc = sum(A, m, a => a.code === '4010');
    const by = {};
    E.rows('journalEntries').forEach(j => { if (j.date < F.from || j.date > F.to) return; j.lines.forEach(l => { if (stockAcc.includes(l.acc)) by[j.source] = (by[j.source] || 0) + l.dr - l.cr; }); });
    const known = ['purchase', 'issue', 'release', 'sale', 'adjust', 'opening', 'reversal'];
    const purchases = by.purchase || 0, adj = (by.adjust || 0) + (by.opening || 0), rev = by.reversal || 0, internal = (by.issue || 0) + (by.release || 0);
    const direct = Object.keys(by).filter(k => !known.includes(k)).reduce((s, k) => s + by[k], 0);
    const opening = stockBal(op), closing = stockBal(cl);
    const cogs = opening + purchases + direct + adj + rev + internal - closing, booked = sum(A, m, a => a.code === '5400'), gp = sales + disc - cogs;
    const diff = cogs - booked;
    const stockRows = lst(A, m, a => ['4000', '4010'].includes(a.code));
    return T(H('Sales') + stockRows + R('Net sales', sales + disc, 1) + H('Cost of sales') + R('Opening stock (materials + WIP + finished goods)', opening) + R('Add: purchases of materials & accessories (net of returns)', purchases) + R('Add: direct labour & expenses charged to production', direct) + (adj || rev || internal ? R('Add / (less): stock adjustments, cancellations & transfers', adj + rev + internal) : '') + R('Less: closing stock (materials + WIP + finished goods)', -closing) + R('COST OF SALES', cogs, 1) + R('GROSS PROFIT / (LOSS)', gp, 1) + R('Gross profit %', 0).replace('Rs 0.00', (sales + disc ? (gp * 100 / (sales + disc)).toFixed(1) : '0.0') + ' %')) + `<p class="${diff === 0 ? 'ok' : 'bad'}">${diff === 0 ? '✓ Agrees with the Cost of Goods Sold account (5400)' : '✗ Differs from Cost of Goods Sold account (5400) by ' + E.m(diff) + ' - check manual journals posted to stock accounts'}</p><p class="muted">Stock losses written off (wastage, stock-take shortages) are NOT in cost of sales; they appear under factory losses in the Profit & Loss.</p>`;
  }
  function pl() {
    const m = rt(F.from, F.to), A = E.rows('coa');
    const inc = sum(A, m, a => a.type === 'income'), cg = sum(A, m, a => a.code === '5400');
    let body = H('Income') + lst(A, m, a => a.type === 'income') + R('Net income (sales less discounts)', inc, 1) + H('Cost of goods sold') + lst(A, m, a => a.code === '5400') + R('GROSS PROFIT', inc - cg, 1);
    let ex = 0;
    SEC.forEach(n => {
      const f = a => a.type === 'expense' && a.code !== '5400' && (a.nature || '') === n, v = sum(A, m, f);
      if (!v && !A.some(a => f(a) && nat(a, m[a.code]))) return;
      body += H(SECN[n]) + lst(A, m, f) + R('Total ' + SECN[n].toLowerCase(), v, 1); ex += v;
    });
    return T(body + R('Total expenses', ex, 1) + R('NET PROFIT / (LOSS)', inc - cg - ex, 1));
  }
  function bs() {
    const m = rt('', F.to), A = E.rows('coa'), pr = sum(A, m, a => a.type === 'income') - sum(A, m, a => a.type === 'expense');
    /* split cumulative profit into prior financial years (retained) and the financial year that contains the report date */
    const fm = fyM(), ty = +F.to.slice(0, 4), tm = +F.to.slice(5, 7), fys = iso(tm >= fm ? ty : ty - 1, fm, 1), m0 = rt('', dayBefore(fys));
    const prPrior = sum(A, m0, a => a.type === 'income') - sum(A, m0, a => a.type === 'expense'), prCur = pr - prPrior;
    const isFixed = a => a.code === '1400' || a.code === '1410', isLoan = a => /^24(0[1-9]|[1-9]\d)$/.test(a.code);
    const cash = a => a.type === 'asset' && (a.bank || a.code === '1000' || a.code === '1010'), inv = a => a.type === 'asset' && /^13/.test(a.code), fixed = a => a.type === 'asset' && isFixed(a);
    const recv = a => a.type === 'asset' && !cash(a) && !inv(a) && !fixed(a);
    const g = (title, f) => { const v = sum(A, m, f); return { v, html: lst(A, m, f) ? H(title) + lst(A, m, f) + R('Total ' + title.toLowerCase(), v, 1) : '' }; };
    const fa = g('Fixed assets (cost less accumulated depreciation)', fixed), ca1 = g('Cash & bank', cash), ca2 = g('Receivables, cheques & advances', recv), ca3 = g('Inventories (materials, WIP, finished goods)', inv);
    const ca = ca1.v + ca2.v + ca3.v, as = fa.v + ca;
    const cl = g('Current liabilities', a => a.type === 'liability' && !isLoan(a)), nl = g('Loans & borrowings (long-term and instalments)', a => a.type === 'liability' && isLoan(a));
    const eq = sum(A, m, a => a.type === 'equity'), li = cl.v + nl.v, tl = li + eq + pr;
    return `<p class="muted">As at ${F.to}</p>` + T(H('ASSETS') + fa.html + H('Current assets') + ca1.html + ca2.html + ca3.html + R('Total current assets', ca, 1) + R('TOTAL ASSETS', as, 1) + H('EQUITY & LIABILITIES') + H('Equity') + lst(A, m, a => a.type === 'equity') + (prPrior ? R('Retained profit / (loss) of earlier financial years', prPrior) : '') + R('Profit / (loss) for the financial year from ' + fys, prCur) + R('Total equity', eq + pr, 1) + nl.html + cl.html + R('Total liabilities', li, 1) + R('TOTAL EQUITY & LIABILITIES', tl, 1)) + `<p class="${as === tl ? 'ok' : 'bad'}">${as === tl ? '✓ Balance sheet balances' : '✗ Out of balance by ' + E.m(as - tl)}</p><p class="muted">Loan balances are shown in full; the portion due within 12 months is not split out.</p>`;
  }
  function prod() {
    const j = E.rows('journalEntries').filter(x => x.date >= F.from && x.date <= F.to), m = rt(F.from, F.to), A = E.rows('coa'), jr = {};
    j.forEach(x => x.lines.forEach(l => { if (l.acc === '1310' && l.job && ['Material', 'Labour', 'Overhead'].includes(l.cat)) { const r = jr[l.job] || (jr[l.job] = { Material: 0, Labour: 0, Overhead: 0 }); r[l.cat] += l.dr - l.cr } }));
    const ids = Object.keys(jr), jt = ids.reduce((s, k) => s + jr[k].Material + jr[k].Labour + jr[k].Overhead, 0),
      g = (codes, n) => `${H(n)}${lst(A, m, a => codes.includes(a.code))}${R('Total ' + n.toLowerCase(), sum(A, m, a => codes.includes(a.code)), 1)}`,
      byN = (ns, def) => { const c = A.filter(x => x.type === 'expense' && ns.includes(x.nature)).map(x => x.code); return c.length ? c : def },
      mt = byN(['oh'], ['5210', '5220', '5230']).filter(c => c !== '5260'), dp = ['5260'], ad = byN(['adm', 'sel', 'oth'], ['6050', '6030', '6020']), fi = byN(['fin'], ['6060']),
      ab = (E.acct('5290') ? nat(E.acct('5290'), m['5290']) : 0) || 0,
      ot = [...mt, ...ad, ...fi].reduce((s, c) => s + nat(E.acct(c), m[c]), 0) + ab;
    /* FIX: renamed pairs → packsReleased */
    const packsReleased = E.rows('stockMoves').filter(x => x.type === 'release' && x.date >= F.from && x.date <= F.to).reduce((s, x) => s + x.qty, 0);
    const ohAll = mt.reduce((x, c) => x + nat(E.acct(c), m[c]), 0), dpv = dp.reduce((x, c) => x + (E.acct(c) ? nat(E.acct(c), m[c]) : 0), 0), fac = jt + ohAll + ab, tot = jt + ot + dpv;
    return T(H('Production costs for the period (all jobs together)') + R('Materials used', ids.reduce((s, k) => s + jr[k].Material, 0)) + R('Production wages (labour)', ids.reduce((s, k) => s + jr[k].Labour, 0)) + R('Overheads charged to production', ids.reduce((s, k) => s + jr[k].Overhead, 0)) + R('Total production costs', jt, 1) + g(mt, 'Indirect factory overhead') + (ab ? R('Less: overhead absorbed into jobs (already in job costs above)', ab) : '') + R('FACTORY COST OF PRODUCTION (materials + labour + factory overhead)', fac, 1) + g(dp, 'Depreciation of factory machinery (period expense, not in product cost)') + g(ad, 'Administration, selling & other expenses') + g(fi, 'Finance expenses') + R('FULL COST (factory cost + administration, selling & finance)', tot, 1)) + `<p class="muted">Packs released to finished goods in the period: <b>${packsReleased}</b>${packsReleased ? ' · <b>factory cost per pack: ' + E.m(Math.round(fac / packsReleased)) + '</b> (this is the product cost used for stock) · full cost per pack including administration, selling and finance: ' + E.m(Math.round(tot / packsReleased)) + ' (for pricing decisions only; these period expenses are never added to stock)' : ''}. Wastage booked as factory loss is excluded.</p>`;
  }
  function cf() {
    const A = E.rows('coa').filter(a => a.bank), cod = new Set(A.map(a => a.code)), open = E.rows('journalEntries').filter(j => j.date < F.from).reduce((s, j) => s + j.lines.filter(l => cod.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0), 0), by = {};
    E.rows('journalEntries').filter(j => j.date >= F.from && j.date <= F.to).forEach(j => { const v = j.lines.filter(l => cod.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0); if (v) by[j.source] = (by[j.source] || 0) + v });
    const N = { receipt: 'Customer receipts', payment: 'Supplier payments', payroll: 'Payroll, advances & EPF/ETF', petty: 'Petty cash', jobcost: 'Factory production costs paid', cheque: 'Cheques cleared', adjust: 'Adjustments', manual: 'Manual journals', sale: 'Sales', purchase: 'Purchases' },
      ks = Object.keys(by), net = ks.reduce((s, k) => s + by[k], 0);
    return T(R('Opening cash & bank', open, 1) + ks.map(k => R(N[k] || k, by[k])).join('') + R('Net movement', net, 1) + R('Closing cash & bank', open + net, 1));
  }
  E.route('reports', 'Financial Reports', () => {
    if (!F.from) F.from = fyStart(0);
    const tabs = [['tr', 'Trading A/c'], ['pl', 'Profit & Loss'], ['bs', 'Balance Sheet'], ['pa', 'Production Account'], ['cf', 'Cash Flow']];
    return `<div class="bar">${tabs.map(t => `<button class="btn ${F.tab === t[0] ? 'p' : ''}" data-a="rtab" data-id="${t[0]}">${t[1]}</button>`).join('')}<span class="gap"></span><select class="fs" id="r_fy" title="Period"><option value="">Period…</option><option value="c">This financial year</option><option value="p">Last financial year</option><option value="m">This month</option></select><select class="fs" id="r_fm" title="Financial year starts in">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((n, i) => `<option value="${i + 1}" ${fyM() === i + 1 ? 'selected' : ''}>FY starts ${n}</option>`).join('')}</select>${F.tab === 'bs' ? '' : '<input id="r_f" type="date" class="fs" value="' + F.from + '">'}<input id="r_t" type="date" class="fs" value="${F.to}"><button class="btn" data-a="rapply">Apply</button><button class="btn" data-a="rprint">Print</button></div><div id="rep">${({ tr: trading, pl, bs, pa: prod, cf })[F.tab]()}</div>`;
  });
  E.A.rtab = t => { F.tab = t; E.go(); };
  E.hooks.push(e => { if (!e.target) return; if (e.target.id === 'r_fy') { const v = e.target.value; if (v === 'c') { F.from = fyStart(0); F.to = E.today(); } else if (v === 'p') { F.from = fyStart(-1); F.to = fyEnd(-1); } else if (v === 'm') { F.from = E.today().slice(0, 8) + '01'; F.to = E.today(); } else return; E.go(); }
    if (e.target.id === 'r_fm') { E.setSetting({ fyMonth: +e.target.value }).then(() => { F.from = fyStart(0); E.go(); }); } });
  E.A.rapply = () => { F.from = E.val('r_f') || F.from; F.to = E.val('r_t') || F.to; E.go(); };
  E.A.rprint = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write('<html><head><title>Report</title><style>body{font:13px Arial;padding:20px}table{width:100%;border-collapse:collapse}td{padding:5px;border-bottom:1px solid #ccc}.r{text-align:right}</style></head><body><h2>' + E.esc(E.factory().name) + '</h2>' + E.$('rep').innerHTML + '</body></html>'); w.document.close(); setTimeout(() => w.print(), 300) };

  /* Health check — FIX 1250 with staff loans */
  /* the checks live in a function so the Guardian (guardian.js) can run exactly the same controls */
  E.healthChecks = () => {
    const t = E.totals(), sm = E.stockMap(), it = id => E.D.items.find(x => x.id === id), C = [];
    let rm = 0, fg = 0, neg = 0;
    for (const k in sm) { const i = it(k.split('|')[0]); if (i) i.cat === 'Finished Good' ? fg += sm[k].value : rm += sm[k].value; if (sm[k].qty < 0) neg++ }
    const dr = Object.values(t).reduce((s, x) => s + x.dr, 0), cr = Object.values(t).reduce((s, x) => s + x.cr, 0),
      je = E.rows('journalEntries').filter(j => j.lines.reduce((s, l) => s + l.dr - l.cr, 0) !== 0).length;
    const wipJ = E.rows('journalEntries').flatMap(j => j.lines).filter(l => l.acc === '1310' && l.job).reduce((s, l) => s + l.dr - l.cr, 0),
      pc = E.rows('cheques').filter(c => c.dir === 'in' && c.status === 'Pending').reduce((s, c) => s + c.amount, 0),
      pi = E.rows('cheques').filter(c => c.dir === 'out' && c.status === 'Pending').reduce((s, c) => s + c.amount, 0);
    const ck = (n, a, b, d) => C.push([a === b, n, a === b ? 'Agrees' : d + ' differs by ' + E.m(a - b)]);
    C.push([dr === cr, 'Total debits equal total credits', dr === cr ? E.m(dr) : 'Difference ' + E.m(dr - cr)]);
    C.push([je === 0, 'Every journal entry is balanced', je ? je + ' unbalanced entries' : 'All balanced']);
    ck('Materials stock = ledger 1300', rm, E.bal('1300'), 'Stock records');
    ck('Finished goods stock = ledger 1320', fg, E.bal('1320'), 'Stock records');
    ck('Supplier bills = ledger 2000', E.rows('purchases').filter(p => !p.cancelled).reduce((s, p) => s + p.total - p.paid, 0), E.bal('2000'), 'Bills');
    ck('Customer invoices = ledger 1200', E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + i.total - i.paid, 0), E.bal('1200'), 'Invoices');
    ck('Delivered, not invoiced = ledger 1210', E.rows('deliveries').filter(d => d.status === 'Delivered' && d.unbilled).reduce((s, d) => s + d.total, 0), E.acct('1210') ? E.bal('1210') : 0, 'Delivery notes');
    const oldDn = E.rows('deliveries').filter(d => d.status === 'Delivered' && !d.unbilled).length;
    C.push([oldDn === 0, 'Old delivery notes moved to Unbilled Receivable', oldDn ? oldDn + ' note(s) to move (Sales screen)' : 'OK']);
    ck('Job WIP = ledger 1310', wipJ, E.bal('1310'), 'Job records');
    ck('Cheques in hand = ledger 1110', pc, E.bal('1110'), 'Cheque list');
    ck('Issued cheques = ledger 2150', pi, E.acct('2150') ? E.bal('2150') : 0, 'Cheque list');
    ck('Customer credit (overpayments + advance cheques) = ledger 2400', (E.chqAdvTotal ? E.chqAdvTotal('in') : 0) + (E.custCreditRcpt ? E.custCreditRcpt() : 0), E.acct('2400') ? E.bal('2400') : 0, 'Cheque list');
    ck('Supplier advances (cheques) = ledger 1260', E.chqAdvTotal ? E.chqAdvTotal('out') : 0, E.acct('1260') ? E.bal('1260') : 0, 'Cheque list');
    C.push([neg === 0, 'No negative stock', neg ? neg + ' item(s) negative' : 'OK']);
    C.push([E.bal('1010') >= 0, 'Petty cash not negative', E.m(E.bal('1010'))]);
    E.rows('coa').filter(a => a.bank).forEach(a => { if (E.bal(a.code) < 0) C.push([false, a.name + ' is overdrawn', E.m(E.bal(a.code))]) });
    const wr = E.rows('wageRuns').filter(r => r.kind === 'run' && !r.cancelled), emps = E.rows('employees');
    /* FIX: advances + staff loans */
    const advBalances = emps.reduce((s, e) => s + (E.advBal ? E.advBal(e.id) : 0), 0);
    const loanBalances = E.rows('staffLoans').filter(l => !l.cancelled && !l.settled)
      .reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
    ck('Employee advances + staff loans = ledger 1250', advBalances + loanBalances, E.acct('1250') ? E.bal('1250') : 0, 'Staff balances');
    const la = E.staffLoanAudit ? E.staffLoanAudit() : { issues: [] };
    C.push([!la.issues.length, 'Staff loan records match payroll and the ledger', la.issues.length ? la.issues.length + ' problem(s). Open People & Payroll → Loan Integrity Check' : 'OK']);
    ck('Wages & salaries payable = unpaid runs (ledger 2200)', wr.filter(r => !r.paid).reduce((s, r) => s + r.net, 0), E.acct('2200') ? E.bal('2200') : 0, 'Unpaid runs');
    ck('Piece wages accrued = unpaid production logs (ledger 2210)', E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0), E.acct('2210') ? E.bal('2210') : 0, 'Production logs');
    const nb = emps.filter(e => E.advBal && E.advBal(e.id) < 0); C.push([!nb.length, 'No worker has recovered more advance than given', nb.length ? nb.map(e => e.name).join(', ') : 'OK']);
    const dup = ['invoices', 'deliveries', 'purchases', 'quotes', 'jobs', 'receipts', 'wageRuns'].filter(c => { const n = E.rows(c).map(x => x.no).filter(Boolean); return n.length !== new Set(n).size }); C.push([!dup.length, 'No duplicate document numbers', dup.length ? 'Duplicates in: ' + dup.join(', ') : 'OK']);
    const ov = E.rows('invoices').filter(i => !i.cancelled && i.paid > i.total).length + E.rows('purchases').filter(p => !p.cancelled && p.paid > p.total).length; C.push([!ov, 'No invoice or bill paid more than its total', ov ? ov + ' document(s) overpaid' : 'OK']);
    return C;
  };
  E.route('health', 'Health Check', () => {
    const C = E.healthChecks();
    const bad = C.filter(c => !c[0]).length;
    return `<div class="kp">${E.kpi('Status', bad ? '<span class="bad">' + bad + ' issue(s)</span>' : '<span class="ok">All checks passed</span>', C.length + ' checks')}</div><div class="tw"><table><thead><tr><th></th><th>Check</th><th>Result</th></tr></thead><tbody>${C.map(c => `<tr><td>${c[0] ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td><td>${c[1]}</td><td>${c[2]}</td></tr>`).join('')}</tbody></table></div><p class="muted">A difference on supplier or customer checks can come from manual journal entries posted straight to Payables / Receivables.</p>`;
  });
})(window.ERP);