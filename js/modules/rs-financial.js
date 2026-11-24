/* REPORT SUITE — FINANCIAL STATEMENTS
   Trial balance, profit & loss (with comparatives and monthly trend), trading account, balance sheet, cash flow (direct, indirect, by bank),
   ratio analysis, general ledger, day book, cash & bank summary. Everything is read from the journal. */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const SECN = { dm: 'Direct material', dl: 'Direct labour', oh: 'Factory overheads', contra: 'Factory overheads absorbed into jobs (contra)', loss: 'Factory losses (wastage / damage / stock loss)', adm: 'Administrative expenses', sel: 'Selling & distribution expenses', fin: 'Finance costs', oth: 'Other expenses', '': 'Unclassified expenses' };
  const SEC = ['dm', 'dl', 'oh', 'contra', 'loss', 'adm', 'sel', 'fin', 'oth', ''];
  const TYPEN = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
  const isDep = a => a.type === 'expense' && (/deprec/i.test(a.name) || a.code === '5260' || a.code === '6150');

  /* ───────── statement builder: one row = one line, with a value per period (and % of base, variance when comparing) ───────── */
  RS.stmt = (periods, o) => {
    o = o || {}; const cmp = periods.length > 1, rows = [], base = o.base || [];
    const cols = [{ k: 'l', l: o.first || 'Particulars', t: 'text', always: true, w: 340 }];
    periods.forEach((p, i) => { cols.push({ k: 'v' + i, l: p.label, t: 'money', always: i === 0 }); if (o.base) cols.push({ k: 'p' + i, l: (cmp ? '% ' : '% of ') + (o.baseName || 'sales') + (cmp ? ' (' + p.short + ')' : ''), t: 'pct' }); });
    if (cmp) { cols.push({ k: 'dv', l: 'Change', t: 'money' }); cols.push({ k: 'dp', l: 'Change %', t: 'pct' }); }
    const S = {
      cols, rows,
      head: l => rows.push({ k: 'h', c: { l } }),
      sp: () => rows.push({ k: 'sp', c: { l: '' } }),
      row(label, fn, op) {
        op = op || {}; const vals = periods.map((p, i) => op.t ? (Math.round((fn(p, i) || 0) * 1000) / 1000) : Math.round(fn(p, i) || 0));
        if (!op.always && vals.every(v => !v)) return vals;
        const c = { l: label }, T = op.t; /* op.t = show this row as a quantity / other type instead of money */
        vals.forEach((v, i) => { c['v' + i] = T ? { v, t: T } : v; if (o.base) c['p' + i] = !T && base[i] ? v * 100 / base[i] : ''; });
        if (cmp) { c.dv = T ? { v: vals[0] - vals[1], t: T } : vals[0] - vals[1]; c.dp = !T && vals[1] ? (vals[0] - vals[1]) * 100 / Math.abs(vals[1]) : ''; }
        rows.push({ k: op.k || 'd', i: op.i == null ? (op.k ? 0 : 1) : op.i, c, drill: op.drill }); return vals;
      },
      sub: (label, fn, op) => S.row(label, fn, Object.assign({ k: 's', always: true }, op)),
      tot: (label, fn, op) => S.row(label, fn, Object.assign({ k: 't', always: true }, op)),
      acc: (a, op) => S.row(a.code + ' · ' + a.name, p => op && op.f ? op.f(a, p) : D.nat(a, p.m[a.code]), { drill: { r: 'gl', p: { acct: a.code, from: o.glFrom || '', to: o.glTo || '' } }, i: 2 })
    };
    return S;
  };
  const periodsFor = (P, spec) => {
    const A = [{ from: P.from, to: P.to, label: RS.periodLabel(P.from, P.to), short: 'current' }], c = RS.cmpRange(P.from, P.to, P.cmp);
    if (c) A.push({ from: c[0], to: c[1], label: RS.periodLabel(c[0], c[1]), short: 'compared' });
    A.forEach(p => { p.m = D.range(p.from, p.to); }); return A;
  };
  const baseSales = ps => ps.map(p => D.sum(p.m, a => a.code === '4000' || a.code === '4010'));

  /* ═══════════════ TRIAL BALANCE ═══════════════ */
  add({
    id: 'tb', g: 'fin', t: 'Trial Balance', d: 'Every account with opening, period movement and closing balance. Choose a plain closing list, or the full movement format.', kw: 'tb ledger balances debit credit',
    f: ['range', 'mode', 'gb', 'zero'], preset: 'fy', modes: [['closing', 'Closing balances only'], ['movement', 'Opening + period + closing']], gb: [['type', 'Group by account type'], ['none', 'One list by code']],
    build(P) {
      const op = D.before(P.from), pm = D.range(P.from, P.to), cl = D.upTo(P.to), mv = P.mode === 'movement', rows = [];
      const cols = [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Account', t: 'text', always: true, w: 240 }, { k: 'type', l: 'Type', t: 'text' }];
      if (mv) cols.push({ k: 'od', l: 'Opening Dr', t: 'money' }, { k: 'oc', l: 'Opening Cr', t: 'money' }, { k: 'pd', l: 'Period Dr', t: 'money' }, { k: 'pc', l: 'Period Cr', t: 'money' });
      cols.push({ k: 'cd', l: 'Closing Dr', t: 'money', always: true }, { k: 'cc', l: 'Closing Cr', t: 'money', always: true });
      const T = { od: 0, oc: 0, pd: 0, pc: 0, cd: 0, cc: 0 };
      const line = (a, x) => {
        const o = (op[a.code] ? op[a.code].dr - op[a.code].cr : 0), p = pm[a.code] || { dr: 0, cr: 0 }, c = (cl[a.code] ? cl[a.code].dr - cl[a.code].cr : 0);
        if (!P.zero && !o && !p.dr && !p.cr && !c) return null;
        const r = { code: a.code, name: a.name, type: a.type, od: o > 0 ? o : 0, oc: o < 0 ? -o : 0, pd: p.dr, pc: p.cr, cd: c > 0 ? c : 0, cc: c < 0 ? -c : 0 };
        Object.keys(T).forEach(k => T[k] += r[k]); return r;
      };
      const mk = r => ({ k: 'd', c: r, drill: { r: 'gl', p: { acct: r.code, from: P.from, to: P.to } } });
      if (P.gb === 'type') {
        ['asset', 'liability', 'equity', 'income', 'expense'].forEach(t => {
          const L = D.coa().filter(a => a.type === t).map(a => line(a)).filter(Boolean); if (!L.length) return;
          rows.push({ k: 'h', c: { code: TYPEN[t] } }); L.forEach(r => rows.push(mk(r)));
          const s = {}; ['od', 'oc', 'pd', 'pc', 'cd', 'cc'].forEach(k => s[k] = L.reduce((q, r) => q + r[k], 0)); rows.push({ k: 's', c: Object.assign({ code: '', name: 'Total ' + TYPEN[t].toLowerCase() }, s) });
        });
      } else D.coa().forEach(a => { const r = line(a); if (r) rows.push(mk(r)); });
      rows.push({ k: 't', c: Object.assign({ code: '', name: 'TOTAL' }, T) });
      const ok = T.cd === T.cc, okm = !mv || (T.od === T.oc && T.pd === T.pc);
      return { cols, rows, kpis: [['Total debit', E.m(T.cd)], ['Total credit', E.m(T.cc)], ['Check', ok && okm ? '<span class="ok">Balanced</span>' : '<span class="bad">OUT BY ' + E.m(Math.abs(T.cd - T.cc)) + '</span>']], sub: 'As at ' + P.to, checks: [[ok, 'Closing debits equal closing credits', ok ? E.m(T.cd) : 'Difference ' + E.m(T.cd - T.cc)], ...(mv ? [[T.pd === T.pc, 'Period debits equal period credits', E.m(T.pd)]] : [])], notes: ['Profit & loss accounts show their balance from the start of the books. Click any account to open its ledger for the period.'] };
    }
  });

  /* ═══════════════ PROFIT & LOSS ═══════════════ */
  add({
    id: 'pl', g: 'fin', t: 'Profit & Loss Statement', d: 'Income, cost of sales, gross profit, expenses by nature and net profit - with % of sales and an optional comparison period.', kw: 'income statement p&l profit loss',
    f: ['range', 'cmp', 'detail'], preset: 'fy', def: { detail: true }, detailLabel: 'Show every account (untick for section totals only)',
    build(P) {
      const ps = periodsFor(P), base = baseSales(ps), S = RS.stmt(ps, { base, baseName: 'sales', glFrom: P.from, glTo: P.to }), A = D.coa(), det = P.detail;
      const inc = ps.map(p => D.sum(p.m, a => a.type === 'income' && a.code !== '4000' && a.code !== '4010')), accs = f => A.filter(f);
      S.head('INCOME');
      if (det) { accs(a => a.code === '4000' || a.code === '4010').forEach(a => S.acc(a)); } else { S.row('Sales revenue', p => D.natC('4000', p.m)); S.row('Sales discounts', p => D.natC('4010', p.m)); }
      S.sub('Net sales (revenue less discounts)', p => D.natC('4000', p.m) + D.natC('4010', p.m), { i: 0 });
      if (det) accs(a => a.type === 'income' && a.code !== '4000' && a.code !== '4010').forEach(a => S.acc(a));
      S.sub('Other income', p => D.sum(p.m, a => a.type === 'income' && a.code !== '4000' && a.code !== '4010'), { i: 0, always: false });
      S.sp(); S.head('COST OF GOODS SOLD');
      if (det) accs(a => a.code === '5400').forEach(a => S.acc(a));
      S.sub('Cost of goods sold', p => D.natC('5400', p.m), { i: 0 });
      S.tot('GROSS PROFIT', p => D.natC('4000', p.m) + D.natC('4010', p.m) - D.natC('5400', p.m));
      S.sp(); S.head('OPERATING & PERIOD EXPENSES');
      const sec = n => a => a.type === 'expense' && a.code !== '5400' && (a.nature || '') === n;
      SEC.forEach(n => {
        if (!ps.some(p => A.some(a => sec(n)(a) && D.nat(a, p.m[a.code])))) return;
        S.head(SECN[n]); if (det) accs(sec(n)).forEach(a => S.acc(a));
        S.sub('Total ' + SECN[n].toLowerCase(), p => D.sum(p.m, sec(n)), { i: 0 });
      });
      const ex = S.sub('Total expenses', p => D.sum(p.m, a => a.type === 'expense' && a.code !== '5400'), { i: 0 });
      S.tot('NET PROFIT / (LOSS)', p => D.sum(p.m, a => a.type === 'income') - D.sum(p.m, a => a.type === 'expense'));
      S.sp(); S.head('MEMORANDUM');
      S.row('Operating profit (before finance costs)', p => D.sum(p.m, a => a.type === 'income') - D.sum(p.m, a => a.type === 'expense') + D.sum(p.m, sec('fin')), { i: 1 });
      S.row('EBITDA (operating profit + depreciation)', p => D.sum(p.m, a => a.type === 'income') - D.sum(p.m, a => a.type === 'expense') + D.sum(p.m, sec('fin')) + D.sum(p.m, isDep), { i: 1 });
      S.row('Depreciation charged', p => D.sum(p.m, isDep), { i: 1 });
      const np = ps.map(p => D.sum(p.m, a => a.type === 'income') - D.sum(p.m, a => a.type === 'expense')), gp = ps.map((p, i) => base[i] - D.natC('5400', p.m));
      return { cols: S.cols, rows: S.rows, sub: RS.periodLabel(P.from, P.to), cmpLabel: ps[1] && ps[1].label, kpis: [['Net sales', E.m(base[0])], ['Gross profit', E.m(gp[0]), base[0] ? (gp[0] * 100 / base[0]).toFixed(1) + '% of sales' : ''], ['Total expenses', E.m(D.sum(ps[0].m, a => a.type === 'expense' && a.code !== '5400'))], ['Net profit / (loss)', np[0] < 0 ? '<span class="bad">' + E.m(np[0]) + '</span>' : E.m(np[0]), base[0] ? (np[0] * 100 / base[0]).toFixed(1) + '% of sales' : '']], notes: ['Click an account line to open its ledger. Stock losses and wastage are shown under factory losses, not in cost of goods sold.'] };
    }
  });

  /* ═══════════════ MONTHLY PROFIT & LOSS ═══════════════ */
  D.byMonth = (from, to) => { const out = {}; D.lines().forEach(x => { if (x.date < from || x.date > to) return; const k = x.date.slice(0, 7), m = out[k] || (out[k] = {}), a = m[x.acc] || (m[x.acc] = { dr: 0, cr: 0 }); a.dr += x.dr; a.cr += x.cr; }); return out; };
  add({
    id: 'plm', g: 'fin', t: 'Monthly Profit & Loss', d: 'Month-by-month income, cost of sales, expenses and profit across the period, with a total column.', kw: 'trend monthly month wise',
    f: ['range', 'detail'], preset: 'l12', def: { detail: false }, detailLabel: 'Show every account',
    build(P) {
      const months = dt.monthsBetween(P.from, P.to), bm = D.byMonth(P.from, P.to), A = D.coa(), cols = [{ k: 'l', l: 'Particulars', t: 'text', always: true, w: 280 }];
      months.forEach(m => cols.push({ k: 'm' + m, l: dt.monLabel(m), t: 'money' })); cols.push({ k: 'tot', l: 'Total', t: 'money', always: true });
      const rows = [], row = (label, fn, o) => { o = o || {}; const c = { l: label }; let t = 0; months.forEach(m => { const v = Math.round(fn(bm[m] || {}) || 0); c['m' + m] = v; t += v; }); c.tot = t; if (!o.always && !t && months.every(m => !c['m' + m])) return; rows.push({ k: o.k || 'd', i: o.i == null ? 1 : o.i, c, drill: o.drill }); };
      const pctRow = (label, num, den) => { const c = { l: label }; let tn = 0, td = 0; months.forEach(m => { const n = num(bm[m] || {}), d = den(bm[m] || {}); tn += n; td += d; c['m' + m] = d ? { v: n * 100 / d, t: 'pct' } : ''; }); c.tot = td ? { v: tn * 100 / td, t: 'pct' } : ''; rows.push({ k: 'd', i: 1, c }); };
      const ns = m => D.natC('4000', m) + D.natC('4010', m), cg = m => D.natC('5400', m), sec = n => a => a.type === 'expense' && a.code !== '5400' && (a.nature || '') === n, exAll = m => D.sum(m, a => a.type === 'expense' && a.code !== '5400');
      rows.push({ k: 'h', c: { l: 'INCOME' } });
      row('Net sales', ns, { k: 's', i: 0 }); row('Other income', m => D.sum(m, a => a.type === 'income' && a.code !== '4000' && a.code !== '4010'));
      row('Cost of goods sold', cg, { k: 's', i: 0 }); row('GROSS PROFIT', m => ns(m) - cg(m), { k: 't', i: 0, always: true });
      pctRow('Gross profit %', m => ns(m) - cg(m), ns);
      rows.push({ k: 'h', c: { l: 'EXPENSES' } });
      SEC.forEach(n => { if (!A.some(a => sec(n)(a) && months.some(mm => D.nat(a, (bm[mm] || {})[a.code])))) return; if (P.detail) A.filter(sec(n)).forEach(a => row(a.code + ' · ' + a.name, m => D.nat(a, m[a.code]), { i: 2, drill: { r: 'gl', p: { acct: a.code, from: P.from, to: P.to } } })); row('Total ' + SECN[n].toLowerCase(), m => D.sum(m, sec(n)), { k: 's', i: 0 }); });
      row('Total expenses', exAll, { k: 's', i: 0, always: true });
      row('NET PROFIT / (LOSS)', m => D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense'), { k: 't', i: 0, always: true });
      pctRow('Net profit %', m => D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense'), ns);
      return { cols, rows, sub: RS.periodLabel(P.from, P.to), land: true };
    }
  });

  /* ═══════════════ TRADING ACCOUNT ═══════════════ */
  const trading = (from, to) => {
    const m = D.range(from, to), op = D.upTo(dt.addDays(from, -1)), cl = D.upTo(to), by = {};
    const jm = D.jeMap();
    /* a reversal belongs to the same group as the entry it reverses (a cancelled delivery reverses cost of sales, a cancelled bill reverses purchases) */
    D.lines().forEach(x => { if (x.date < from || x.date > to || !D.stockAcc.includes(x.acc)) return; let src = x.src; if (src === 'reversal') { const o = jm['#' + x.j.ref]; src = o ? (o.source || 'manual') : src; } by[src] = (by[src] || 0) + x.dr - x.cr; });
    const known = ['purchase', 'issue', 'release', 'sale', 'adjust', 'opening', 'reversal'], stock = mm => D.stockAcc.reduce((s, c) => s + (mm[c] ? mm[c].dr - mm[c].cr : 0), 0);
    const sales = D.natC('4000', m), disc = D.natC('4010', m), purchases = by.purchase || 0, adj = (by.adjust || 0) + (by.opening || 0), rev = by.reversal || 0, internal = (by.issue || 0) + (by.release || 0);
    const direct = Object.keys(by).filter(k => !known.includes(k)).reduce((s, k) => s + by[k], 0), opening = stock(op), closing = stock(cl);
    const cogs = opening + purchases + direct + adj + rev + internal - closing, booked = D.natC('5400', m);
    return { sales, disc, opening, purchases, direct, other: adj + rev + internal, closing, cogs, booked, gp: sales + disc - cogs };
  };
  add({
    id: 'trading', g: 'fin', t: 'Trading Account', d: 'Opening stock + purchases + direct costs - closing stock = cost of sales, checked against the Cost of Goods Sold account.', kw: 'gross profit cost of sales trading',
    f: ['range', 'cmp'], preset: 'fy',
    build(P) {
      const ps = periodsFor(P); ps.forEach(p => { p.t = trading(p.from, p.to); }); const base = ps.map(p => p.t.sales + p.t.disc), S = RS.stmt(ps, { base, baseName: 'sales' });
      S.head('SALES'); S.row('Sales revenue', p => p.t.sales); S.row('Less: sales discounts', p => p.t.disc); S.sub('Net sales', p => p.t.sales + p.t.disc, { i: 0 });
      S.sp(); S.head('COST OF SALES');
      S.row('Opening stock (materials + work in progress + finished goods)', p => p.t.opening, { always: true });
      S.row('Add: purchases of materials & accessories (net of returns)', p => p.t.purchases);
      S.row('Add: direct labour & expenses charged to production', p => p.t.direct);
      S.row('Add / (less): stock adjustments, cancellations & transfers', p => p.t.other);
      S.row('Less: closing stock (materials + work in progress + finished goods)', p => -p.t.closing, { always: true });
      S.sub('COST OF SALES', p => p.t.cogs, { i: 0 }); S.tot('GROSS PROFIT / (LOSS)', p => p.t.gp);
      const diff = ps[0].t.cogs - ps[0].t.booked;
      return { cols: S.cols, rows: S.rows, sub: RS.periodLabel(P.from, P.to), cmpLabel: ps[1] && ps[1].label, kpis: [['Net sales', E.m(base[0])], ['Cost of sales', E.m(ps[0].t.cogs)], ['Gross profit', E.m(ps[0].t.gp), base[0] ? (ps[0].t.gp * 100 / base[0]).toFixed(1) + '%' : '']], checks: [[diff === 0, 'Agrees with Cost of Goods Sold account (5400)', diff === 0 ? '' : 'Differs by ' + E.m(diff) + ' - check manual journals posted to stock accounts']], notes: ['Stock losses written off (wastage, stock-take shortages) are NOT in cost of sales; they appear under factory losses in the Profit & Loss.'] };
    }
  });

  /* ═══════════════ BALANCE SHEET ═══════════════ */
  const bsData = d => {
    const m = D.upTo(d), A = D.coa(), fys = dt.fyOf(d), m0 = D.upTo(dt.addDays(fys, -1)), pr = D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense'), prPrior = D.sum(m0, a => a.type === 'income') - D.sum(m0, a => a.type === 'expense');
    return { m, d, pr, prPrior, prCur: pr - prPrior, fys };
  };
  add({
    id: 'bs', g: 'fin', t: 'Balance Sheet', d: 'Assets, liabilities and equity as at a date, with an optional comparison date and a balance check.', kw: 'financial position assets liabilities',
    f: ['asat', 'cmpa', 'detail'], def: { detail: true }, detailLabel: 'Show every account',
    build(P) {
      const dates = [P.asat], c = RS.cmpAsat(P.asat, P.cmp); if (c) dates.push(c);
      const ps = dates.map(d => Object.assign({ label: d, short: d }, bsData(d))), A = D.coa(), det = P.detail;
      const tassets = ps.map(p => D.sum(p.m, a => a.type === 'asset')), S = RS.stmt(ps, { base: tassets, baseName: 'total assets', first: 'Particulars (as at)' });
      const grp = (title, test, key) => { if (!ps.some(p => A.some(a => test(a) && D.nat(a, p.m[a.code])))) return; S.head(title); if (det) A.filter(test).forEach(a => S.acc(a, { })); return S.sub('Total ' + title.toLowerCase(), p => D.sum(p.m, test), { i: 0 }); };
      S.head('ASSETS');
      grp('Fixed assets (cost less accumulated depreciation)', a => a.type === 'asset' && D.isFixed(a));
      S.sp(); S.head('CURRENT ASSETS');
      grp('Cash & bank', a => D.isCash(a)); grp('Receivables, cheques & advances', a => D.isRecv(a)); grp('Inventories (materials, WIP, finished goods)', a => D.isInv(a));
      S.sub('Total current assets', p => D.sum(p.m, a => D.isCash(a) || D.isRecv(a) || D.isInv(a)), { i: 0 });
      S.tot('TOTAL ASSETS', p => D.sum(p.m, a => a.type === 'asset'));
      S.sp(); S.head('EQUITY & LIABILITIES');
      S.head('Equity'); if (det) A.filter(a => a.type === 'equity').forEach(a => S.acc(a));
      S.row('Retained profit / (loss) of earlier financial years', p => p.prPrior); S.row('Profit / (loss) for the current financial year', p => p.prCur, { always: true });
      S.sub('Total equity', p => D.sum(p.m, a => a.type === 'equity') + p.pr, { i: 0 });
      S.sp();
      grp('Loans & borrowings', a => a.type === 'liability' && D.isLoan(a)); grp('Current liabilities', a => a.type === 'liability' && !D.isLoan(a));
      S.sub('Total liabilities', p => D.sum(p.m, a => a.type === 'liability'), { i: 0 });
      const tel = S.tot('TOTAL EQUITY & LIABILITIES', p => D.sum(p.m, a => a.type === 'equity') + p.pr + D.sum(p.m, a => a.type === 'liability'));
      const out = ps.map((p, i) => tassets[i] - (D.sum(p.m, a => a.type === 'equity') + p.pr + D.sum(p.m, a => a.type === 'liability')));
      const ca = D.sum(ps[0].m, a => D.isCash(a) || D.isRecv(a) || D.isInv(a)), cl = D.sum(ps[0].m, a => a.type === 'liability' && !D.isLoan(a));
      return { cols: S.cols, rows: S.rows, sub: 'As at ' + P.asat, cmpLabel: ps[1] && ps[1].label, kpis: [['Total assets', E.m(tassets[0])], ['Working capital', E.m(ca - cl), 'current assets less current liabilities'], ['Total equity', E.m(D.sum(ps[0].m, a => a.type === 'equity') + ps[0].pr)]], checks: ps.map((p, i) => [out[i] === 0, 'Balance sheet balances as at ' + p.d, out[i] === 0 ? '' : 'Out of balance by ' + E.m(out[i])]), notes: ['Loan balances are shown in full; the portion due within 12 months is not split out.', 'Profit is split into earlier financial years and the current financial year using the financial-year start month set in Financial Reports.'] };
    }
  });

  /* ═══════════════ CASH FLOW ═══════════════ */
  const cashCodes = () => new Set(D.coa().filter(a => a.bank).map(a => a.code));
  const cfClass = (j, cash) => { let k = 'op'; j.lines.forEach(l => { if (cash.has(l.acc)) return; const a = E.acct(l.acc); if (!a) return; if (a.type === 'asset' && /^14\d\d$/.test(a.code)) k = 'inv'; else if ((a.type === 'liability' && D.isLoan(a)) || a.type === 'equity') { if (k !== 'inv') k = 'fin'; } }); return k; };
  add({
    id: 'cf', g: 'fin', t: 'Cash Flow Statement', d: 'Where cash came from and went: direct method by source, indirect method from profit, or per bank account.', kw: 'cash flow statement operating investing financing',
    f: ['range', 'mode', 'bank'], preset: 'fy', modes: [['direct', 'Direct method (receipts and payments)'], ['indirect', 'Indirect method (profit to cash)'], ['bank', 'By cash & bank account']],
    build(P) {
      const cash = cashCodes(), cs = [...cash].filter(c => !P.bank || c === P.bank), set = new Set(cs), cols = [{ k: 'l', l: 'Particulars', t: 'text', always: true, w: 360 }, { k: 'v', l: 'Amount', t: 'money', always: true }];
      const bal = d => D.entries().filter(j => j.date <= d).reduce((s, j) => s + j.lines.filter(l => set.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0), 0);
      const open = bal(dt.addDays(P.from, -1)), close = bal(P.to), rows = [], R = (l, v, k, i) => rows.push({ k: k || 'd', i: i == null ? 1 : i, c: { l, v } });
      const chk = [];
      if (P.mode === 'indirect') {
        const nc = x => !(x.src === 'opening' && !x.j.lines.some(l => cash.has(l.acc))), m = D.range(P.from, P.to), mf = D.range(P.from, P.to, nc), m0 = D.upTo(dt.addDays(P.from, -1), nc), m1 = D.upTo(P.to, nc), A = D.coa();
        const np = D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense'), dep = D.sum(m, isDep);
        const dlt = test => D.sum(m1, test) - D.sum(m0, test), recv = dlt(a => D.isRecv(a)), inv = dlt(a => D.isInv(a)), cl = dlt(a => a.type === 'liability' && !D.isLoan(a)), fx = dlt(a => D.isFixed(a)), ln = dlt(a => a.type === 'liability' && D.isLoan(a)), eq = D.sum(mf, a => a.type === 'equity');
        const opCash = np + dep - recv - inv + cl, invCash = -fx - dep, finCash = ln + eq, net = opCash + invCash + finCash;
        rows.push({ k: 'h', c: { l: 'OPERATING ACTIVITIES' } }); R('Net profit / (loss) for the period', np); R('Add back: depreciation', dep); R('(Increase) / decrease in receivables, cheques & advances', -recv); R('(Increase) / decrease in inventories', -inv); R('Increase / (decrease) in payables & accruals', cl);
        R('Net cash from operating activities', opCash, 's', 0); rows.push({ k: 'h', c: { l: 'INVESTING ACTIVITIES' } }); R('Purchase of fixed assets (net of disposals)', invCash); R('Net cash from investing activities', invCash, 's', 0);
        rows.push({ k: 'h', c: { l: 'FINANCING ACTIVITIES' } }); R('Loans received / (repaid)', ln); R('Capital introduced / (drawings)', eq); R('Net cash from financing activities', finCash, 's', 0);
        R('NET INCREASE / (DECREASE) IN CASH & BANK', net, 't', 0); R('Cash & bank at the start', open, 'd', 0); R('Cash & bank at the end', open + net, 't', 0);
        chk.push([open + net === close || P.bank, 'Closing cash agrees with the cash & bank accounts', open + net === close ? E.m(close) : (P.bank ? 'Indirect method covers all accounts' : 'Difference ' + E.m(open + net - close))]);
        return { cols, rows, sub: RS.periodLabel(P.from, P.to), checks: chk, notes: ['Indirect method: starts from profit and adjusts for non-cash items and changes in working capital. Cash & bank includes all accounts marked as bank/cash.'], kpis: [['Operating', E.m(opCash)], ['Investing', E.m(invCash)], ['Financing', E.m(finCash)], ['Net change', E.m(net)]] };
      }
      if (P.mode === 'bank') {
        const c2 = [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Account', t: 'text', always: true, w: 240 }, { k: 'o', l: 'Opening', t: 'money' }, { k: 'i', l: 'Money in', t: 'money' }, { k: 'x', l: 'Money out', t: 'money' }, { k: 'c', l: 'Closing', t: 'money', always: true }];
        const T = { o: 0, i: 0, x: 0, c: 0 }, rr = [];
        cs.sort().forEach(code => { const a = E.acct(code); let o = 0, i = 0, x = 0; D.lines().forEach(z => { if (z.acc !== code) return; if (z.date < P.from) o += z.dr - z.cr; else if (z.date <= P.to) { i += z.dr; x += z.cr; } }); const r = { code, name: a.name, o, i, x, c: o + i - x }; Object.keys(T).forEach(k => T[k] += r[k]); rr.push({ k: 'd', c: r, drill: { r: 'gl', p: { acct: code, from: P.from, to: P.to } } }); });
        rr.push({ k: 't', c: Object.assign({ code: '', name: 'TOTAL' }, T) });
        return { cols: c2, rows: rr, sub: RS.periodLabel(P.from, P.to), kpis: [['Opening', E.m(T.o)], ['Money in', E.m(T.i)], ['Money out', E.m(T.x)], ['Closing', E.m(T.c)]] };
      }
      const by = { op: {}, inv: {}, fin: {} };
      D.entries().filter(j => j.date >= P.from && j.date <= P.to).forEach(j => { const v = j.lines.filter(l => set.has(l.acc)).reduce((a, l) => a + l.dr - l.cr, 0); if (!v) return; const k = cfClass(j, cash), s = j.source || 'manual'; by[k][s] = (by[k][s] || 0) + v; });
      const sec = (title, k) => { const ks = Object.keys(by[k]).sort(); rows.push({ k: 'h', c: { l: title } }); ks.forEach(s => R(RS.srcName(s), by[k][s])); const t = ks.reduce((q, s) => q + by[k][s], 0); R('Net cash from ' + title.toLowerCase(), t, 's', 0); return t; };
      const a = sec('Operating activities', 'op'), b = sec('Investing activities', 'inv'), c = sec('Financing activities', 'fin'), net = a + b + c;
      R('NET INCREASE / (DECREASE) IN CASH & BANK', net, 't', 0); R('Cash & bank at the start', open, 'd', 0); R('Cash & bank at the end', open + net, 't', 0);
      return { cols, rows, sub: RS.periodLabel(P.from, P.to), kpis: [['Operating', E.m(a)], ['Investing', E.m(b)], ['Financing', E.m(c)], ['Closing cash & bank', E.m(close)]], checks: [[open + net === close, 'Opening + net movement = closing cash & bank', open + net === close ? E.m(close) : 'Difference ' + E.m(open + net - close)]], notes: ['Direct method: every receipt and payment through cash and bank accounts, grouped by where it came from. Entries that touch fixed assets are investing; loans and capital/drawings are financing; everything else is operating.'] };
    }
  });

  /* ═══════════════ RATIOS ═══════════════ */
  add({
    id: 'ratios', g: 'fin', t: 'Financial Ratio Analysis', d: 'Liquidity, profitability, efficiency (debtor, creditor, stock days) and leverage ratios worked out from the ledger.', kw: 'ratios liquidity current ratio debtor days margin',
    f: ['range'], preset: 'fy',
    build(P) {
      const m = D.range(P.from, P.to), c = D.upTo(P.to), days = Math.max(1, dt.diff(P.from, P.to) + 1), an = 365 / days;
      const ns = D.natC('4000', m) + D.natC('4010', m), cogs = D.natC('5400', m), gp = ns - cogs, ex = D.sum(m, a => a.type === 'expense' && a.code !== '5400'), np = D.sum(m, a => a.type === 'income') - D.sum(m, a => a.type === 'expense');
      const fin = D.sum(m, a => a.type === 'expense' && a.nature === 'fin'), dep = D.sum(m, isDep), ebit = np + fin, ebitda = ebit + dep;
      const cash = D.sum(c, D.isCash), recv = D.sum(c, D.isRecv), inv = D.sum(c, D.isInv), ca = cash + recv + inv, cl = D.sum(c, a => a.type === 'liability' && !D.isLoan(a)), loans = D.sum(c, a => a.type === 'liability' && D.isLoan(a)), eq = D.sum(c, a => a.type === 'equity') + (D.sum(c, a => a.type === 'income') - D.sum(c, a => a.type === 'expense')), ta = D.sum(c, a => a.type === 'asset'), fa = D.sum(c, D.isFixed);
      const ar = D.natC('1200', c) + D.natC('1210', c), ap = D.natC('2000', c), purch = D.purchasesIn(P.from, P.to).reduce((s, x) => s + x.amount, 0);
      const rmDays = D.natC('1300', c), wip = D.natC('1310', c), fg = D.natC('1320', c);
      const R = [], g = (n, f, v, t, why) => R.push({ k: 'd', c: { n, f, v: { v, t }, w: why } }), h = t => R.push({ k: 'h', c: { n: t } }), z = (a, b) => b ? a / b : 0;
      h('LIQUIDITY'); g('Current ratio', 'Current assets / current liabilities', z(ca, cl), 'x', 'Above 1.5 is comfortable'); g('Quick ratio', '(Cash + receivables) / current liabilities', z(cash + recv, cl), 'x', 'Above 1.0 means bills can be paid without selling stock'); g('Cash ratio', 'Cash & bank / current liabilities', z(cash, cl), 'x', 'Immediate cover'); g('Working capital', 'Current assets - current liabilities', ca - cl, 'money', 'Funds available to run the factory');
      h('PROFITABILITY'); g('Gross profit margin', 'Gross profit / net sales', z(gp * 100, ns), 'pct', 'What is left after the cost of the slippers sold'); g('Operating profit margin', '(Net profit + finance costs) / net sales', z(ebit * 100, ns), 'pct', 'Profit from operations before interest'); g('EBITDA margin', '(Operating profit + depreciation) / net sales', z(ebitda * 100, ns), 'pct', 'Cash earning power'); g('Net profit margin', 'Net profit / net sales', z(np * 100, ns), 'pct', 'Final profit on each rupee of sales'); g('Expense ratio', 'Expenses / net sales', z(ex * 100, ns), 'pct', 'Overheads and admin cost per rupee of sales'); g('Return on equity (annualised)', 'Net profit x 365/days / equity', z(np * an * 100, eq), 'pct', 'Return on the owners’ money'); g('Return on assets (annualised)', 'Net profit x 365/days / total assets', z(np * an * 100, ta), 'pct', 'Profit earned on everything owned');
      h('EFFICIENCY (days)'); g('Debtor days', 'Trade receivables / net sales x days', z(ar * days, ns), 'days', 'How long customers take to pay'); g('Creditor days', 'Trade payables / purchases x days', z(ap * days, purch), 'days', 'How long suppliers wait for payment'); g('Raw material stock days', 'Raw material stock / cost of sales x days', z(rmDays * days, cogs), 'days', 'Cover held in materials'); g('Work-in-progress days', 'Work in progress / cost of sales x days', z(wip * days, cogs), 'days', 'Time money is tied up on the floor'); g('Finished goods stock days', 'Finished goods / cost of sales x days', z(fg * days, cogs), 'days', 'Time slippers sit before they are sold'); g('Total inventory days', 'Inventories / cost of sales x days', z(inv * days, cogs), 'days', 'Overall stock holding'); g('Cash conversion cycle', 'Debtor days + inventory days - creditor days', z(ar * days, ns) + z(inv * days, cogs) - z(ap * days, purch), 'days', 'Days between paying for materials and receiving cash');
      h('LEVERAGE & TURNOVER'); g('Debt to equity', 'Loans / equity', z(loans, eq), 'x', 'Borrowings per rupee of owners’ money'); g('Total liabilities to assets', 'Total liabilities / total assets', z((cl + loans) * 100, ta), 'pct', 'Share of the business financed by others'); g('Interest cover', '(Net profit + finance costs) / finance costs', fin ? z(ebit, fin) : 0, 'x', fin ? 'Above 3 is healthy' : 'No finance costs in the period'); g('Asset turnover', 'Net sales x 365/days / total assets', z(ns * an, ta), 'x', 'Sales per rupee of assets'); g('Fixed asset turnover', 'Net sales x 365/days / fixed assets', z(ns * an, fa), 'x', 'Sales per rupee of machinery and buildings');
      return { cols: [{ k: 'n', l: 'Ratio', t: 'text', always: true, w: 240 }, { k: 'f', l: 'How it is worked out', t: 'text', w: 300 }, { k: 'v', l: 'Result', t: 'x', always: true }, { k: 'w', l: 'What it tells you', t: 'text', w: 320 }], rows: R, sub: RS.periodLabel(P.from, P.to) + ' (' + days + ' days) · balances as at ' + P.to, kpis: [['Current ratio', z(ca, cl).toFixed(2)], ['Gross margin', z(gp * 100, ns).toFixed(1) + '%'], ['Debtor days', Math.round(z(ar * days, ns))], ['Inventory days', Math.round(z(inv * days, cogs))]], notes: ['Loans are treated as long term. Days ratios use the number of days in the selected period; use a full financial year for the most meaningful result.'] };
    }
  });

  /* ═══════════════ GENERAL LEDGER ═══════════════ */
  add({
    id: 'gl', g: 'fin', t: 'General Ledger (Account Ledger)', d: 'Every entry on one account with running balance, job, source and narration. Click an entry to see the whole journal entry.', kw: 'ledger account statement',
    f: ['range', 'acct1', 'src', 'job'], preset: 'fy',
    build(P) {
      const a = E.acct(P.acct); if (!a) return null;
      let open = 0, run = 0, dr = 0, cr = 0; const rows = [];
      D.lines().forEach(x => {
        if (x.acc !== a.code) return; if (P.src && x.src !== P.src) return; if (P.job && x.job !== P.job) return;
        if (P.from && x.date < P.from) { open += x.dr - x.cr; run = open; return; } if (P.to && x.date > P.to) return;
        run += x.dr - x.cr; dr += x.dr; cr += x.cr;
        rows.push({ k: 'd', c: { date: x.date, no: x.no, src: RS.srcName(x.src), narr: x.l.narr || x.j.narr || '', ref: x.j.ref || '', job: D.jobNo(x.job), dr: x.dr, cr: x.cr, bal: run }, drill: { r: 'daybook', p: { q: x.no, preset: 'all', mode: 'lines' } } });
      });
      rows.unshift({ k: 'd', c: { date: P.from, no: '', src: '', narr: 'Balance brought forward', ref: '', job: '', dr: 0, cr: 0, bal: open }, cls: 'rsg' });
      const cols = [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'src', l: 'Source', t: 'text' }, { k: 'narr', l: 'Narration', t: 'text', w: 260 }, { k: 'ref', l: 'Reference', t: 'text' }, { k: 'job', l: 'Job', t: 'text' }, { k: 'dr', l: 'Debit', t: 'money', always: true }, { k: 'cr', l: 'Credit', t: 'money', always: true }, { k: 'bal', l: 'Balance', t: 'bal', tot: false, always: true }];
      return { cols, rows, flat: true, sub: a.code + ' · ' + a.name + ' · ' + RS.periodLabel(P.from, P.to), kpis: [['Opening', RS.fmt(open, 'bal') || '0.00'], ['Debits', E.m(dr)], ['Credits', E.m(cr)], ['Closing', RS.fmt(run, 'bal') || '0.00']], notes: ['Balance column: Dr = debit balance, Cr = credit balance.'] };
    }
  });

  /* ═══════════════ DAY BOOK / JOURNAL REGISTER ═══════════════ */
  add({
    id: 'daybook', g: 'fin', t: 'Day Book / Journal Register', d: 'Every journal entry in date order, as ledger lines or one row per entry. Filter by source, account or job.', kw: 'journal day book register voucher entries',
    f: ['range', 'gb', 'src', 'acct', 'job'], preset: 'mtd', gb: [['lines', 'Every ledger line'], ['entries', 'One row per entry']],
    build(P) {
      const rows = []; let dr = 0, cr = 0;
      const ent = D.entries().filter(j => j.date >= P.from && j.date <= P.to && (!P.src || (j.source || 'manual') === P.src) && (!P.acct || j.lines.some(l => l.acc === P.acct)) && (!P.job || j.lines.some(l => l.job === P.job)));
      if (P.gb === 'entries') {
        ent.forEach(j => { const t = j.lines.reduce((s, l) => s + (l.dr || 0), 0); dr += t; rows.push({ k: 'd', c: { date: j.date, no: j.no, src: RS.srcName(j.source || 'manual'), acc: j.lines.length + ' lines', narr: (j.narr || '') + (j.ref ? ' [' + j.ref + ']' : ''), job: '', dr: t, cr: t, rev: j.reversedBy ? 'Reversed by ' + j.reversedBy : '' }, drill: { r: 'daybook', p: { q: j.no, preset: 'all', mode: 'lines', gb: 'lines' } } }); });
      } else ent.forEach(j => j.lines.forEach(l => { if (P.acct && l.acc !== P.acct) return; dr += l.dr || 0; cr += l.cr || 0; rows.push({ k: 'd', c: { date: j.date, no: j.no, src: RS.srcName(j.source || 'manual'), acc: l.acc + ' ' + ((E.acct(l.acc) || {}).name || ''), narr: l.narr || j.narr || '', job: D.jobNo(l.job), dr: l.dr || 0, cr: l.cr || 0, rev: j.reversedBy ? 'Reversed by ' + j.reversedBy : '' } }); }));
      const cols = [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text', always: true }, { k: 'src', l: 'Source', t: 'text' }, { k: 'acc', l: 'Account', t: 'text', w: 220 }, { k: 'narr', l: 'Narration', t: 'text', w: 280 }, { k: 'job', l: 'Job', t: 'text' }, { k: 'dr', l: 'Debit', t: 'money', always: true }, { k: 'cr', l: 'Credit', t: 'money', always: true }, { k: 'rev', l: 'Status', t: 'text' }];
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Entries', String(ent.length)], ['Total debits', E.m(dr)], ['Total credits', E.m(cr)]] };
    }
  });

  /* ═══════════════ CASH & BANK ═══════════════ */
  add({
    id: 'cashbank', g: 'fin', t: 'Cash & Bank Book', d: 'Every receipt and payment through cash and bank accounts with running balance, by source or account.', kw: 'cash book bank book receipts payments',
    f: ['range', 'bank', 'src'], preset: 'mtd',
    build(P) {
      const cash = cashCodes(), set = new Set([...cash].filter(c => !P.bank || c === P.bank)); let open = 0, run = 0, i = 0, x = 0; const rows = [];
      D.lines().forEach(z => { if (!set.has(z.acc)) return; if (P.src && z.src !== P.src) return; if (z.date < P.from) { open += z.dr - z.cr; run = open; return; } if (z.date > P.to) return; run += z.dr - z.cr; i += z.dr; x += z.cr; rows.push({ k: 'd', c: { date: z.date, no: z.no, acc: z.acc + ' ' + ((E.acct(z.acc) || {}).name || ''), src: RS.srcName(z.src), narr: z.l.narr || z.j.narr || '', ref: z.j.ref || '', in: z.dr, out: z.cr, bal: run }, drill: { r: 'daybook', p: { q: z.no, preset: 'all', mode: 'lines' } } }); });
      rows.unshift({ k: 'd', c: { date: P.from, no: '', acc: '', src: '', narr: 'Balance brought forward', ref: '', in: 0, out: 0, bal: open }, cls: 'rsg' });
      return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'acc', l: 'Account', t: 'text', w: 160 }, { k: 'src', l: 'Source', t: 'text' }, { k: 'narr', l: 'Narration', t: 'text', w: 260 }, { k: 'ref', l: 'Reference', t: 'text' }, { k: 'in', l: 'Money in', t: 'money', always: true }, { k: 'out', l: 'Money out', t: 'money', always: true }, { k: 'bal', l: 'Balance', t: 'bal', tot: false, always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Opening', E.m(open)], ['Money in', E.m(i)], ['Money out', E.m(x)], ['Closing', E.m(run)]], notes: ['The running balance covers the selected accounts and source only.'] };
    }
  });
})(window.ERP);
