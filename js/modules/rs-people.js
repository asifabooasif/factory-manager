/* REPORT SUITE — PEOPLE & PAYROLL, EXPENSES, ASSETS & FUNDING, CONTROL & AUDIT */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const runs = (P, kinds) => E.rows('wageRuns').filter(r => r.kind === 'run' && !r.cancelled && r.date >= P.from && r.date <= P.to && (!kinds || kinds.includes(r.type)));
  const RTYPE = r => ({ weekly: 'Weekly wages', monthly: 'Monthly salary', piece: 'Piece-rate wages', daily: 'Daily wages' })[r.type] || r.type || 'Payroll';

  /* ═══════════════ PAYROLL REGISTER ═══════════════ */
  add({
    id: 'payreg', g: 'ppl', t: 'Payroll Register', d: 'Every payroll run with gross pay, EPF, ETF, advance and loan recoveries and net pay - or every employee line of every run.', kw: 'payroll register wages salary pay runs',
    f: ['range', 'mode', 'emp'], preset: 'fy', modes: [['runs', 'One row per payroll run'], ['lines', 'One row per employee per run']],
    build(P) {
      const R = runs(P); let rows;
      if (P.mode === 'lines') { rows = []; R.forEach(r => (r.lines || []).forEach(l => { if (P.emp && l.empId !== P.emp) return; rows.push({ k: 'd', c: { run: r.no, date: r.date, period: r.from + ' to ' + r.to, name: l.name || D.emp(l.empId).name, basic: l.basic || 0, piece: l.piece || 0, ot: l.ot || 0, bonus: l.bonus || 0, gross: l.gross, epf: l.epfEmp || 0, adv: l.advRec || 0, loan: l.loanRec || 0, od: l.otherDed || 0, net: l.net, epfco: l.epfCo || 0, etf: l.etf || 0 } }); })); }
      else rows = R.sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ k: 'd', c: { run: r.no, date: r.date, period: r.from + ' to ' + r.to, name: RTYPE(r) + ' · ' + (r.lines || []).length + ' staff', basic: (r.lines || []).reduce((s, l) => s + (l.basic || 0), 0), piece: (r.lines || []).reduce((s, l) => s + (l.piece || 0), 0), ot: (r.lines || []).reduce((s, l) => s + (l.ot || 0), 0), bonus: (r.lines || []).reduce((s, l) => s + (l.bonus || 0), 0), gross: r.gross, epf: r.epfEmp || 0, adv: r.advRec || 0, loan: r.loanRec || 0, od: r.otherDed || 0, net: r.net, epfco: r.epfCo || 0, etf: r.etf || 0, paid: r.paid ? 'Paid' : 'Unpaid' } }));
      return { cols: [{ k: 'run', l: 'Run', t: 'text', always: true }, { k: 'date', l: 'Date', t: 'text' }, { k: 'period', l: 'Pay period', t: 'text' }, { k: 'name', l: P.mode === 'lines' ? 'Employee' : 'Type', t: 'text', w: 200 }, { k: 'basic', l: 'Basic / daily', t: 'money' }, { k: 'piece', l: 'Piece-rate', t: 'money' }, { k: 'ot', l: 'Overtime', t: 'money' }, { k: 'bonus', l: 'Bonus', t: 'money' }, { k: 'gross', l: 'Gross pay', t: 'money', always: true }, { k: 'epf', l: 'EPF (employee 8%)', t: 'money' }, { k: 'adv', l: 'Advance recovered', t: 'money' }, { k: 'loan', l: 'Loan recovered', t: 'money' }, { k: 'od', l: 'Other deductions', t: 'money' }, { k: 'net', l: 'Net pay', t: 'money', always: true }, { k: 'epfco', l: 'EPF (employer)', t: 'money' }, { k: 'etf', l: 'ETF (employer)', t: 'money' }, ...(P.mode === 'lines' ? [] : [{ k: 'paid', l: 'Status', t: 'text' }])], rows, flat: true, sub: RS.periodLabel(P.from, P.to), land: true };
    }
  });

  /* ═══════════════ EMPLOYEE EARNINGS ═══════════════ */
  add({
    id: 'empearn', g: 'ppl', t: 'Employee Earnings Summary', d: 'What each employee earned in the period: basic, piece-rate, overtime, bonus, gross, deductions and net.', kw: 'employee earnings worker wise salary summary',
    f: ['range', 'emp'], preset: 'fy',
    build(P) {
      const R = {}; runs(P).forEach(r => (r.lines || []).forEach(l => { if (P.emp && l.empId !== P.emp) return; const e = D.emp(l.empId), x = R[l.empId] || (R[l.empId] = { code: e.code || '', name: l.name || e.name || '?', n: 0, basic: 0, piece: 0, ot: 0, bonus: 0, gross: 0, ded: 0, net: 0, epfco: 0 }); x.n++; x.basic += l.basic || 0; x.piece += l.piece || 0; x.ot += l.ot || 0; x.bonus += l.bonus || 0; x.gross += l.gross; x.ded += (l.epfEmp || 0) + (l.advRec || 0) + (l.loanRec || 0) + (l.otherDed || 0); x.net += l.net; x.epfco += (l.epfCo || 0) + (l.etf || 0); }));
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Employee', t: 'text', always: true, w: 200 }, { k: 'n', l: 'Pay runs', t: 'int' }, { k: 'basic', l: 'Basic / daily', t: 'money' }, { k: 'piece', l: 'Piece-rate', t: 'money' }, { k: 'ot', l: 'Overtime', t: 'money' }, { k: 'bonus', l: 'Bonus', t: 'money' }, { k: 'gross', l: 'Gross pay', t: 'money', always: true }, { k: 'ded', l: 'Deductions', t: 'money' }, { k: 'net', l: 'Net pay', t: 'money', always: true }, { k: 'epfco', l: 'Employer EPF + ETF', t: 'money' }], rows: Object.values(R).sort((a, b) => b.gross - a.gross).map(r => ({ k: 'd', c: r })), flat: true, sub: RS.periodLabel(P.from, P.to), land: true };
    }
  });

  /* ═══════════════ EPF / ETF ═══════════════ */
  add({
    id: 'statutory', g: 'ppl', t: 'EPF & ETF Statement', d: 'Employee EPF, employer EPF and ETF for each employee and month, with the amount still owed to the authorities (ledger 2100).', kw: 'epf etf statutory contributions remittance',
    f: ['range', 'gb'], preset: 'fy', gb: [['emp', 'By employee'], ['month', 'By month']],
    build(P) {
      const R = {}; runs(P).forEach(r => (r.lines || []).forEach(l => { const e = D.emp(l.empId), k = P.gb === 'emp' ? l.empId : r.date.slice(0, 7), x = R[k] || (R[k] = { name: P.gb === 'emp' ? ((e.code ? e.code + ' · ' : '') + (l.name || e.name || '?')) : dt.monLabel(k), sort: k, gross: 0, ee: 0, ec: 0, etf: 0 }); x.gross += l.gross; x.ee += l.epfEmp || 0; x.ec += l.epfCo || 0; x.etf += l.etf || 0; }));
      const rows = Object.values(R).sort((a, b) => P.gb === 'month' ? a.sort.localeCompare(b.sort) : a.name.localeCompare(b.name)).map(r => ({ k: 'd', c: Object.assign(r, { epf: r.ee + r.ec }) })), owed = E.acct('2100') ? E.bal('2100') : 0;
      return { cols: [{ k: 'name', l: P.gb === 'emp' ? 'Employee' : 'Month', t: 'text', always: true, w: 220 }, { k: 'gross', l: 'Gross pay', t: 'money' }, { k: 'ee', l: 'EPF employee', t: 'money' }, { k: 'ec', l: 'EPF employer', t: 'money' }, { k: 'epf', l: 'Total EPF', t: 'money', always: true }, { k: 'etf', l: 'ETF employer', t: 'money', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['EPF + ETF for the period', E.m(rows.reduce((s, r) => s + r.c.epf + r.c.etf, 0))], ['Owed to authorities now (ledger 2100)', E.m(owed)]], notes: ['The amount owed is the balance of EPF/ETF Payable in the ledger after remittances recorded.'] };
    }
  });

  /* ═══════════════ ATTENDANCE ═══════════════ */
  add({
    id: 'attendance', g: 'ppl', t: 'Attendance Summary', d: 'Days present, half days, absent, leave and overtime hours for every employee in the period.', kw: 'attendance present absent leave overtime',
    f: ['range', 'emp'], preset: 'mtd',
    build(P) {
      const A = E.rows('attendance').filter(a => a.date >= P.from && a.date <= P.to && (!P.emp || a.empId === P.emp)), R = {};
      A.forEach(a => { const e = D.emp(a.empId), r = R[a.empId] || (R[a.empId] = { code: e.code || '', name: e.name || '?', p: 0, h: 0, a: 0, l: 0, ot: 0 }); if (a.status === 'Present') r.p++; else if (a.status === 'Half day') r.h++; else if (a.status === 'Absent') r.a++; else if (a.status === 'Leave') r.l++; r.ot += a.ot || 0; });
      const rows = Object.values(R).sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name)).map(r => ({ k: 'd', c: Object.assign(r, { days: r.p + r.h / 2, marked: r.p + r.h + r.a + r.l }) }));
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Employee', t: 'text', always: true, w: 200 }, { k: 'p', l: 'Present', t: 'int' }, { k: 'h', l: 'Half days', t: 'int' }, { k: 'a', l: 'Absent', t: 'int' }, { k: 'l', l: 'Leave', t: 'int' }, { k: 'days', l: 'Days worked', t: 'qty', always: true }, { k: 'ot', l: 'Overtime hours', t: 'qty' }, { k: 'marked', l: 'Days marked', t: 'int' }], rows, flat: true, sub: RS.periodLabel(P.from, P.to) };
    }
  });

  /* ═══════════════ ADVANCES & STAFF LOANS ═══════════════ */
  add({
    id: 'advloan', g: 'ppl', t: 'Employee Advances & Staff Loans', d: 'Balance of salary advances and staff loans for every employee, proved against Employee Advances (ledger 1250).', kw: 'advance staff loan employee balance',
    f: ['zero'],
    build(P) {
      const rows = []; let ta = 0, tl = 0; E.rows('employees').sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(e => { const a = E.advBal ? E.advBal(e.id) : 0, l = E.loanBal ? E.loanBal(e.id) : 0; if (!P.zero && !a && !l) return; ta += a; tl += l; rows.push({ k: 'd', c: { code: e.code || '', name: e.name, st: e.active ? 'Active' : 'Left', adv: a, loan: l, tot: a + l } }); });
      const gl = E.acct('1250') ? E.bal('1250') : 0;
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Employee', t: 'text', always: true, w: 220 }, { k: 'st', l: 'Status', t: 'text' }, { k: 'adv', l: 'Advances owed', t: 'money' }, { k: 'loan', l: 'Staff loan owed', t: 'money' }, { k: 'tot', l: 'Total owed by employee', t: 'money', always: true }], rows, flat: true, kpis: [['Advances', E.m(ta)], ['Staff loans', E.m(tl)]], checks: [[ta + tl === gl, 'Advances + staff loans = ledger 1250', ta + tl === gl ? E.m(gl) : 'Records ' + E.m(ta + tl) + ' vs ledger ' + E.m(gl)]] };
    }
  });

  /* ═══════════════ LABOUR COST ═══════════════ */
  add({
    id: 'labourcost', g: 'ppl', t: 'Labour Cost per Pack (Monthly)', d: 'Labour charged to jobs each month, payroll gross, packs completed and labour cost per pack.', kw: 'labour cost per pack productivity wages month',
    f: ['range'], preset: 'l12',
    build(P) {
      const W = {}; D.lines().forEach(x => { if (x.acc === '1310' && x.cat === 'Labour' && x.date >= P.from && x.date <= P.to) W[x.date.slice(0, 7)] = (W[x.date.slice(0, 7)] || 0) + x.dr - x.cr; });
      const rows = dt.monthsBetween(P.from, P.to).map(mo => { const f = mo + '-01', t = dt.monthEnd(f), pk = D.moves().filter(m => m.type === 'release' && m.date >= f && m.date <= t).reduce((s, m) => s + m.qty, 0), gross = runs({ from: f, to: t }).reduce((s, r) => s + r.gross, 0), lab = W[mo] || 0; return { k: 'd', c: { name: dt.monLabel(mo), lab, gross, pk, cpk: pk ? Math.round(lab / pk) : '' } }; });
      return { cols: [{ k: 'name', l: 'Month', t: 'text', always: true }, { k: 'lab', l: 'Labour charged to jobs', t: 'money', always: true }, { k: 'gross', l: 'Payroll gross (runs)', t: 'money' }, { k: 'pk', l: 'Packs completed', t: 'qty' }, { k: 'cpk', l: 'Labour per pack completed', t: 'money', tot: false, always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to) };
    }
  });

  /* ═══════════════ EXPENSE ANALYSIS ═══════════════ */
  const NATN = { dm: 'Direct material', dl: 'Direct labour', oh: 'Factory overhead', contra: 'Overhead absorbed (contra)', loss: 'Factory losses', adm: 'Administrative', sel: 'Selling & distribution', fin: 'Finance costs', oth: 'Other', '': 'Unclassified' }, BEHN = { fixed: 'Fixed', variable: 'Variable', semi: 'Semi-variable', '': 'Unclassified' };
  add({
    id: 'expense', g: 'exp', t: 'Expense Analysis', d: 'All expenses by account, nature (factory / admin / selling / finance), behaviour (fixed / variable) or month, as % of sales, with comparison period.', kw: 'expenses analysis overheads by nature head monthly',
    f: ['range', 'cmp', 'gb', { k: 'nat', l: 'Nature', o: Object.entries(NATN).map(([k, v]) => [k || '-', v]), all: 'All natures' }], preset: 'fy', gb: [['acct', 'By account'], ['nature', 'By nature'], ['beh', 'By behaviour'], ['month', 'Account × month']],
    build(P) {
      const nat = P.extra.nat, ok = a => a.type === 'expense' && a.code !== '5400' && (!nat || (a.nature || '-') === nat), m = D.range(P.from, P.to), c = RS.cmpRange(P.from, P.to, P.cmp), m2 = c ? D.range(c[0], c[1]) : null, ns = D.natC('4000', m) + D.natC('4010', m), A = D.coa().filter(ok);
      if (P.gb === 'month') { const mo = dt.monthsBetween(P.from, P.to), bm = D.byMonth(P.from, P.to), rows = A.filter(a => mo.some(k => D.nat(a, (bm[k] || {})[a.code]))).map(a => { const r = { name: a.code + ' · ' + a.name, tot: 0 }; mo.forEach(k => { const v = D.nat(a, (bm[k] || {})[a.code]); r['m' + k] = v; r.tot += v; }); return { k: 'd', c: r, drill: { r: 'gl', p: { acct: a.code, from: P.from, to: P.to } } }; }).sort((a, b) => b.c.tot - a.c.tot); return { cols: [{ k: 'name', l: 'Account', t: 'text', always: true, w: 240 }, ...mo.map(k => ({ k: 'm' + k, l: dt.monLabel(k), t: 'money' })), { k: 'tot', l: 'Total', t: 'money', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), land: true }; }
      const key = a => P.gb === 'nature' ? (a.nature || '') : P.gb === 'beh' ? (a.beh || '') : a.code, lab = (a, k) => P.gb === 'nature' ? NATN[k] : P.gb === 'beh' ? BEHN[k] : a.name, G = {};
      A.forEach(a => { const k = key(a), r = G[k] || (G[k] = { code: P.gb === 'acct' ? a.code : '', name: lab(a, k), nature: P.gb === 'acct' ? NATN[a.nature || ''] : '', beh: P.gb === 'acct' ? BEHN[a.beh || ''] : '', amt: 0, prev: 0 }); r.amt += D.nat(a, m[a.code]); if (m2) r.prev += D.nat(a, m2[a.code]); });
      const tot = Object.values(G).reduce((s, r) => s + r.amt, 0), rows = Object.values(G).filter(r => r.amt || r.prev).sort((a, b) => b.amt - a.amt).map(r => ({ k: 'd', c: Object.assign(r, { share: tot ? r.amt * 100 / tot : 0, ps: ns ? r.amt * 100 / ns : '', chg: r.prev ? (r.amt - r.prev) * 100 / Math.abs(r.prev) : '' }), drill: P.gb === 'acct' ? { r: 'gl', p: { acct: r.code, from: P.from, to: P.to } } : undefined }));
      const cols = [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: { acct: 'Account', nature: 'Nature', beh: 'Behaviour' }[P.gb], t: 'text', always: true, w: 240 }, ...(P.gb === 'acct' ? [{ k: 'nature', l: 'Nature', t: 'text' }, { k: 'beh', l: 'Behaviour', t: 'text' }] : []), { k: 'amt', l: 'Amount', t: 'money', always: true }, { k: 'share', l: '% of expenses', t: 'pct', tot: false }, { k: 'ps', l: '% of net sales', t: 'pct', tot: false }];
      if (m2) cols.push({ k: 'prev', l: 'Compared period', t: 'money' }, { k: 'chg', l: 'Change %', t: 'pct', tot: false });
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to) + (c ? ' compared with ' + RS.periodLabel(c[0], c[1]) : ''), kpis: [['Total expenses (excl. cost of goods sold)', E.m(tot)], ['% of net sales', ns ? (tot * 100 / ns).toFixed(1) + '%' : '-']], notes: ['Cost of goods sold is excluded; see the Profit & Loss. Overhead absorbed into jobs appears as a negative contra amount under factory overhead.'] };
    }
  });

  /* ═══════════════ BUDGET VS ACTUAL ═══════════════ */
  add({
    id: 'budgetvar', g: 'exp', t: 'Budget vs Actual', d: 'Monthly budgets against actual figures for the accounts you budgeted, with variance and a over / under flag.', kw: 'budget variance actual forecast',
    f: ['range'], preset: 'fy',
    build(P) {
      const mo = dt.monthsBetween(P.from, P.to), B = E.rows('budgets').filter(b => mo.includes(b.month)), bm = D.byMonth(P.from, P.to), R = {}; B.forEach(b => { const a = E.acct(b.acc); if (!a) return; const r = R[b.acc] || (R[b.acc] = { code: a.code, name: a.name, bud: 0, act: 0, type: a.type }); r.bud += b.amount; });
      Object.keys(R).forEach(c => { const a = E.acct(c); mo.forEach(k => R[c].act += D.nat(a, (bm[k] || {})[c])); });
      const rows = Object.values(R).sort((a, b) => a.code.localeCompare(b.code)).map(r => { const v = r.type === 'expense' ? r.act - r.bud : r.bud - r.act; return { k: 'd', c: Object.assign(r, { v, vp: r.bud ? v * 100 / r.bud : '', st: r.type === 'expense' ? (v > 0 ? 'OVER BUDGET' : 'Within budget') : (v > 0 ? 'BELOW TARGET' : 'On / above target') }), drill: { r: 'gl', p: { acct: r.code, from: P.from, to: P.to } } }; });
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Account', t: 'text', always: true, w: 240 }, { k: 'bud', l: 'Budget', t: 'money' }, { k: 'act', l: 'Actual', t: 'money' }, { k: 'v', l: 'Adverse variance', t: 'money', always: true }, { k: 'vp', l: 'Variance %', t: 'pct', tot: false }, { k: 'st', l: 'Result', t: 'text', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['For expense accounts a positive variance means you spent more than budgeted; for income accounts it means you earned less than targeted.'] };
    }
  });

  /* ═══════════════ FIXED ASSETS ═══════════════ */
  add({
    id: 'assets', g: 'exp', t: 'Fixed Asset Register & Depreciation', d: 'Every asset with cost, accumulated depreciation and net book value, by category, proved against ledger 1400 / 1410.', kw: 'fixed assets register depreciation machinery nbv',
    f: ['gb', { k: 'st', l: 'Status', o: [['Active', 'Active'], ['Disposed', 'Disposed']], all: 'All' }], gb: [['list', 'Every asset'], ['cat', 'By category']],
    build(P) {
      const L = E.rows('assets').filter(a => !P.extra.st || (a.status || 'Active') === P.extra.st);
      const cost = L.reduce((s, a) => s + a.cost, 0), acc = L.reduce((s, a) => s + (a.accum || 0), 0), gl = D.natC('1400', D.upTo('')), gA = -D.natC('1410', D.upTo(''));
      const mk = a => ({ no: a.no, name: a.name, cat: a.cat || '', date: a.date, cost: a.cost, res: a.residual || 0, life: a.life || '', acc: a.accum || 0, nbv: a.cost - (a.accum || 0), dep: a.life ? Math.round((a.cost - (a.residual || 0)) / a.life) : 0, upto: a.depTo || '', st: a.status || 'Active' });
      let rows; if (P.gb === 'cat') { const g = {}; L.forEach(a => { const r = g[a.cat || '(none)'] || (g[a.cat || '(none)'] = { no: '', name: a.cat || '(none)', cat: '', date: '', cost: 0, res: 0, life: '', acc: 0, nbv: 0, dep: 0, upto: '', st: '', n: 0 }), x = mk(a); r.cost += x.cost; r.acc += x.acc; r.nbv += x.nbv; r.dep += x.dep; r.n++; r.no = r.n + ' asset(s)'; }); rows = Object.values(g).map(c => ({ k: 'd', c })); } else rows = L.sort((a, b) => a.no.localeCompare(b.no)).map(a => ({ k: 'd', c: mk(a) }));
      return { cols: [{ k: 'no', l: P.gb === 'cat' ? 'Assets' : 'Asset no', t: 'text', always: true }, { k: 'name', l: P.gb === 'cat' ? 'Category' : 'Asset', t: 'text', always: true, w: 200 }, { k: 'cat', l: 'Category', t: 'text' }, { k: 'date', l: 'Purchased', t: 'text' }, { k: 'cost', l: 'Cost', t: 'money' }, { k: 'res', l: 'Residual value', t: 'money' }, { k: 'life', l: 'Life (years)', t: 'int', tot: false }, { k: 'dep', l: 'Annual depreciation', t: 'money' }, { k: 'acc', l: 'Accumulated depreciation', t: 'money' }, { k: 'nbv', l: 'Net book value', t: 'money', always: true }, { k: 'upto', l: 'Depreciated up to', t: 'text' }, { k: 'st', l: 'Status', t: 'text' }], rows, flat: true, kpis: [['Cost', E.m(cost)], ['Accumulated depreciation', E.m(acc)], ['Net book value', E.m(cost - acc)]], checks: P.extra.st ? [] : [[cost === gl, 'Asset cost = ledger 1400', cost === gl ? E.m(gl) : 'Register ' + E.m(cost) + ' vs ledger ' + E.m(gl)], [acc === gA, 'Accumulated depreciation = ledger 1410', acc === gA ? E.m(gA) : 'Register ' + E.m(acc) + ' vs ledger ' + E.m(gA)]], land: true };
    }
  });

  /* ═══════════════ LOANS ═══════════════ */
  add({
    id: 'loansched', g: 'exp', t: 'Loan Register & Repayment Schedule', d: 'Every loan with principal outstanding, next instalment, overdue instalments and interest paid; or the full instalment schedule.', kw: 'loans borrowings bank lease emi schedule interest outstanding',
    f: ['mode'], modes: [['summary', 'Loan summary'], ['schedule', 'Every instalment']],
    build(P) {
      const L = E.rows('loans').filter(l => !l.cancelled), t = E.today();
      if (P.mode === 'schedule') { const rows = []; L.forEach(l => (l.rows || []).forEach(r => rows.push({ k: 'd', c: { loan: l.no, lender: l.lender, n: r.n, due: r.due, principal: r.principal, interest: r.interest, emi: r.emi, st: r.paid ? 'Paid ' + (r.paidDate || '') : r.due < t ? 'OVERDUE' : 'Due' } }))); rows.sort((a, b) => a.c.due.localeCompare(b.c.due)); return { cols: [{ k: 'due', l: 'Due date', t: 'text', always: true }, { k: 'loan', l: 'Loan', t: 'text' }, { k: 'lender', l: 'Lender', t: 'text', w: 180 }, { k: 'n', l: 'Instalment', t: 'int', tot: false }, { k: 'principal', l: 'Principal', t: 'money' }, { k: 'interest', l: 'Interest', t: 'money' }, { k: 'emi', l: 'Instalment', t: 'money', always: true }, { k: 'st', l: 'Status', t: 'text', always: true }], rows, flat: true }; }
      const rows = L.map(l => { const un = (l.rows || []).filter(r => !r.paid), od = un.filter(r => r.due < t), nx = un[0]; return { k: 'd', c: { no: l.no, lender: l.lender, type: l.type || '', date: l.date, principal: l.principal, rate: l.rate, out: un.reduce((s, r) => s + r.principal, 0), next: nx ? nx.due : '', nextAmt: nx ? nx.emi : '', odn: od.length || '', oda: od.reduce((s, r) => s + r.emi, 0), intpaid: (l.rows || []).filter(r => r.paid).reduce((s, r) => s + (r.paidInterest || r.interest || 0), 0) } }; });
      const out = rows.reduce((s, r) => s + r.c.out, 0), gl = D.coa().filter(D.isLoan).reduce((s, a) => s + D.natC(a.code, D.upTo('')), 0);
      return { cols: [{ k: 'no', l: 'Loan', t: 'text', always: true }, { k: 'lender', l: 'Lender', t: 'text', w: 180 }, { k: 'type', l: 'Type', t: 'text' }, { k: 'date', l: 'Started', t: 'text' }, { k: 'principal', l: 'Original principal', t: 'money' }, { k: 'rate', l: 'Rate %', t: 'x', tot: false }, { k: 'out', l: 'Principal outstanding', t: 'money', always: true }, { k: 'next', l: 'Next due', t: 'text' }, { k: 'nextAmt', l: 'Next instalment', t: 'money', tot: false }, { k: 'odn', l: 'Overdue instalments', t: 'int' }, { k: 'oda', l: 'Overdue amount', t: 'money' }, { k: 'intpaid', l: 'Interest paid to date', t: 'money' }], rows, flat: true, kpis: [['Principal outstanding', E.m(out)], ['Overdue', E.m(rows.reduce((s, r) => s + r.c.oda, 0))]], checks: [[out === gl, 'Schedules agree with loan accounts in the ledger', out === gl ? E.m(gl) : 'Schedules ' + E.m(out) + ' vs ledger ' + E.m(gl)]], land: true };
    }
  });

  /* ═══════════════ RECONCILIATION ═══════════════ */
  add({
    id: 'recon', g: 'ctl', t: 'Master Reconciliation (Books vs Records)', d: 'Every sub-ledger proved against its control account: receivables, payables, stock, WIP, cheques, wages, advances - plus entry balance and negative stock.', kw: 'reconciliation control accounts health check tie out audit proof',
    build() {
      const C = E.healthChecks ? E.healthChecks() : [], bad = C.filter(c => !c[0]);
      const rows = C.map(c => ({ k: 'd', c: { st: c[0] ? 'OK' : 'CHECK', n: c[1], d: c[2] }, cls: c[0] ? '' : 'bad' }));
      const lock = E.setting('lockedUntil');
      return { cols: [{ k: 'st', l: 'Result', t: 'text', always: true }, { k: 'n', l: 'Check', t: 'text', always: true, w: 420 }, { k: 'd', l: 'Detail', t: 'text', w: 360 }], rows, kpis: [['Checks run', String(C.length)], ['Passed', String(C.length - bad.length)], ['Need attention', bad.length ? '<span class="bad">' + bad.length + '</span>' : '<span class="ok">0</span>']], notes: [lock ? 'Books are locked up to ' + lock + '. Entries dated on or before that day cannot be changed.' : 'No period lock is set. Lock closed months in Settings to protect finished figures.'] };
    }
  });

  /* ═══════════════ ABNORMAL BALANCES ═══════════════ */
  add({
    id: 'abnormal', g: 'ctl', t: 'Abnormal Balances & Exceptions', d: 'Accounts, parties, stock and jobs whose balance is the wrong way round or doesn’t make sense - overdrawn banks, credit-balance customers, negative stock, finished jobs holding WIP.', kw: 'exceptions abnormal negative balance errors review',
    build() {
      const rows = [], X = (type, what, detail, amt) => rows.push({ k: 'd', c: { type, what, detail, amt: amt || 0 } }), cl = D.upTo('');
      D.coa().forEach(a => { const v = D.nat(a, cl[a.code]); if (!v) return; if (D.isCash(a) && v < 0) X('Overdrawn cash / bank', a.code + ' · ' + a.name, 'Balance is below zero', v); else if (a.type === 'asset' && !D.isFixed(a) && v < 0 && !D.isCash(a)) X('Asset with credit balance', a.code + ' · ' + a.name, 'Normally a debit balance', v); else if ((a.type === 'liability' || a.type === 'income') && v < 0) X(a.type === 'income' ? 'Income with debit balance' : 'Liability with debit balance', a.code + ' · ' + a.name, 'Normally a credit balance', v); });
      E.rows('parties').forEach(p => { const L = D.partyLedger(p.id, '', ''); if (p.type === 'Customer' && L.close < 0) X('Customer in credit', p.name, 'We owe the customer (advance / overpayment / credit note)', L.close); if (p.type === 'Supplier' && L.close > 0) X('Supplier in debit', p.name, 'Supplier owes us (advance / overpaid)', L.close); });
      Object.values(D.stockAt('')).forEach(s => { const x = D.item(s.itemId); if (s.qty < 0) X('Negative stock', (x ? x.name : '?') + ' ' + D.code(s.itemId, s.variantId), 'Quantity ' + s.qty, s.value); else if (s.qty > 0 && s.value <= 0) X('Stock with no value', (x ? x.name : '?') + ' ' + D.code(s.itemId, s.variantId), 'Quantity ' + s.qty + ' has zero or negative value', s.value); else if (s.qty === 0 && s.value !== 0) X('Value left on zero stock', (x ? x.name : '?') + ' ' + D.code(s.itemId, s.variantId), 'No quantity but value remains', s.value); });
      const jc = D.jobCost('', ''); E.rows('jobs').forEach(j => { const b = (jc[j.id] || {}).bal || 0; if (j.status === 'Completed' && b !== 0) X('Completed job holds WIP', j.no, 'Costing should leave zero WIP', b); if (j.status === 'Cancelled' && b !== 0) X('Cancelled job holds WIP', j.no, 'Cost should be written off', b); if (j.due && j.due < E.today() && j.status === 'In Progress') X('Job past due date', j.no, 'Due ' + j.due, 0); });
      E.rows('journalEntries').forEach(j => { const d = j.lines.reduce((s, l) => s + l.dr - l.cr, 0); if (d) X('Unbalanced journal entry', j.no, j.date + ' ' + (j.narr || ''), d); });
      E.rows('deliveries').forEach(d => { if (d.status === 'Delivered' && E.today() > dt.addDays(d.date, 30)) X('Delivered over 30 days, not invoiced', d.no, D.pname(d.partyId), d.total); });
      return { cols: [{ k: 'type', l: 'Exception', t: 'text', always: true, w: 240 }, { k: 'what', l: 'Account / item', t: 'text', w: 260 }, { k: 'detail', l: 'Detail', t: 'text', w: 320 }, { k: 'amt', l: 'Amount', t: 'money' }], rows, flat: true, kpis: [['Exceptions', String(rows.length)]], notes: [rows.length ? 'Review each line - some are normal (for example a customer who paid in advance) but all deserve a look.' : 'Nothing unusual found.'] };
    }
  });

  /* ═══════════════ AUDIT TRAIL ═══════════════ */
  add({
    id: 'audit', g: 'ctl', t: 'Audit Trail', d: 'Who changed what and when: every create, edit and cancellation recorded by the system, filterable by user, record type and action.', kw: 'audit trail log changes user activity history',
    f: ['range', { k: 'user', l: 'User', text: true }, { k: 'col', l: 'Record type', o: () => [...new Set(E.rows('auditLog').map(a => a.col))].filter(Boolean).sort().map(c => [c, c]), all: 'All records' }], preset: 'mtd',
    build(P) {
      const L = E.rows('auditLog').filter(a => { const d = (a.at || '').slice(0, 10); return d >= P.from && d <= P.to && (!P.extra.col || a.col === P.extra.col) && (!P.extra.user || (a.user || '').toLowerCase().includes(String(P.extra.user).toLowerCase())); }).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 3000);
      let sn = s => { try { const o = JSON.parse(s); return o.no || o.name || o.ref || ''; } catch (e) { return ''; } };
      return { cols: [{ k: 'at', l: 'When', t: 'text', always: true }, { k: 'user', l: 'User', t: 'text' }, { k: 'action', l: 'Action', t: 'text' }, { k: 'col', l: 'Record type', t: 'text' }, { k: 'ref', l: 'Record', t: 'text', w: 180 }, { k: 'chg', l: 'Change', t: 'text', w: 120 }], rows: L.map(a => ({ k: 'd', c: { at: (a.at || '').replace('T', ' ').slice(0, 19), user: a.user || '', action: a.action || '', col: a.col || '', ref: sn(a.after) || sn(a.before) || a.rid || '', chg: a.before && a.after ? 'Edited' : a.after ? 'Created' : a.before ? 'Removed' : '' } })), flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Events', String(L.length)]], notes: ['Shows the latest 3,000 events for the selection.'] };
    }
  });
})(window.ERP);
