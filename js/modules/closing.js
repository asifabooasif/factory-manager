/* Month-end close checklist — every control total in one place */
(E => {
  const ri = E.N.findIndex(n => n.id === 'health');
  E.N.splice(ri < 0 ? E.N.length : ri + 1, 0, { g: 'Reports', id: 'closing', ico: '🔒', label: 'Month-end Close' });
  const OK = 1, WARN = 2;

  function checks() {
    const t = E.totals(), sm = E.stockMap(), C = [];
    let rm = 0, fg = 0;
    for (const k in sm) {
      const i = E.D.items.find(x => x.id === k.split('|')[0]);
      if (i) i.cat === 'Finished Good' ? fg += sm[k].value : rm += sm[k].value;
    }
    const add = (n, ok, d, go) => C.push({ n, ok: ok ? OK : WARN, d, go });

    /* 1. trial balance */
    const dr = Object.values(t).reduce((s, x) => s + x.dr, 0);
    const cr = Object.values(t).reduce((s, x) => s + x.cr, 0);
    add('Trial balance is balanced', dr === cr, 'Debits ' + E.m(dr) + ' · Credits ' + E.m(cr), 'tb');

    /* 2. materials stock */
    add('Materials & accessories stock agrees with the ledger (1300)', rm === E.bal('1300', t), 'Stock records ' + E.m(rm) + ' · Ledger ' + E.m(E.bal('1300', t)), 'matledger');

    /* 3. finished goods stock */
    add('Finished goods stock agrees with the ledger (1320)', fg === E.bal('1320', t), 'Stock records ' + E.m(fg) + ' · Ledger ' + E.m(E.bal('1320', t)), 'stock');

    /* 4. WIP — FIXED: real comparison against open jobs */
    const act = E.rows('jobs').filter(j => j.status === 'In Progress');
    const wipLedger = E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.acc === '1310')).reduce((s, l) => s + l.dr - l.cr, 0);
    let wipOpenJobs = 0;
    act.forEach(j => {
      E.rows('journalEntries').flatMap(jj => jj.lines).filter(l => l.job === j.id && l.acc === '1310').forEach(l => {
        wipOpenJobs += l.dr - l.cr;
      });
    });
    const wipDiff = wipLedger - wipOpenJobs;
    add('Work-in-progress (1310) is explained by open jobs', Math.abs(wipDiff) <= 1,
      'Ledger ' + E.m(wipLedger) + ' · Open jobs ' + E.m(wipOpenJobs) + (wipDiff ? ' · Differs by ' + E.m(wipDiff) : ''), 'jobs');

    /* 5. piece wages accrual */
    const piece = E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0);
    add('Piece wages earned (2210) agree with unpaid production entries', piece === E.bal('2210', t), 'Production log ' + E.m(piece) + ' · Ledger ' + E.m(E.bal('2210', t)), 'wages');

    /* 6. all runs paid — includes daily-salary */
    const unp = E.rows('wageRuns').filter(r => !r.cancelled && (r.kind === 'run' || r.kind === 'daily-salary') && !r.paid).length;
    add('All wage & salary runs are paid', !unp, unp ? unp + ' run(s) unpaid — wages payable ' + E.m(E.bal('2200', t)) : 'Wages payable ' + E.m(E.bal('2200', t)), 'wages');

    /* 7. staff advances — FIXED: includes staff loans */
    const advAdvances = E.rows('employees').reduce((s, e) => s + (E.advBal ? E.advBal(e.id) : 0), 0);
    const advLoans = E.rows('staffLoans')
      .filter(l => !l.cancelled && !l.settled)
      .reduce((s, l) => s + (E.staffLoanTotals ? E.staffLoanTotals(l).principalOut : 0), 0);
    const advTotal = advAdvances + advLoans;
    add('Staff advance + loan balances agree with the ledger (1250)', advTotal === E.bal('1250', t),
      'Advances ' + E.m(advAdvances) + ' + Loans ' + E.m(advLoans) + ' = ' + E.m(advTotal) + ' · Ledger ' + E.m(E.bal('1250', t)), 'advreg');
    const la = E.staffLoanAudit ? E.staffLoanAudit() : { issues: [] };
    add('Staff loan records match payroll and the ledger', !la.issues.length, la.issues.length ? la.issues.length + ' problem(s) found' : 'OK', 'loanaudit');

    /* 8. overhead pool — ignores 5390 */
    const un = E.unabsorbed ? E.unabsorbed() : 0;
    add('Factory overhead pool is absorbed into jobs', un <= 0, 'Not yet absorbed: ' + E.m(un), 'expenses');

    /* 9. accrued expenses */
    add('Accrued expenses are paid', E.bal('2300', t) === 0, 'Accrued expenses unpaid ' + E.m(E.bal('2300', t)), 'expenses');

    /* 10. supplier bills */
    const pay = E.rows('purchases').filter(p => !p.cancelled).reduce((s, p) => s + p.total - p.paid, 0);
    add('Supplier bills agree with payables (2000)', pay === E.bal('2000', t), 'Bills ' + E.m(pay) + ' · Ledger ' + E.m(E.bal('2000', t)), 'purchases');

    /* 11. no negative stock */
    const neg = E.skuList().filter(s => E.stock(s.itemId, s.variantId).qty < 0).length;
    add('No negative stock', !neg, neg + ' item(s) below zero', 'stock');

    /* 12. purchase prices present */
    const nop = E.skuList(i => i.cat !== 'Finished Good').filter(s => !((E.D.items.find(i => i.id === s.itemId) || {}).buyPrice)).length;
    add('Every material has a purchase price', !nop, nop + ' material(s) without a purchase price', 'items');

    /* 13. customer invoices vs receivables control account (was only in the Health Check) */
    const recv = E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + i.total - i.paid, 0);
    add('Customer invoices agree with receivables (1200)', recv === E.bal('1200', t), 'Invoices ' + E.m(recv) + ' · Ledger ' + E.m(E.bal('1200', t)), 'sales');

    /* 14. cheque control accounts */
    const pend = E.rows('cheques').filter(c => c.status === 'Pending'), T = E.today();
    const pin = pend.filter(c => c.dir === 'in').reduce((s, c) => s + c.amount, 0), pout = pend.filter(c => c.dir === 'out').reduce((s, c) => s + c.amount, 0);
    add('Cheques in hand agree with the ledger (1110)', pin === E.bal('1110', t), 'Cheque list ' + E.m(pin) + ' · Ledger ' + E.m(E.bal('1110', t)), 'chqdesk');
    add('Cheques issued agree with the ledger (2150)', pout === (E.acct('2150') ? E.bal('2150', t) : 0), 'Cheque list ' + E.m(pout) + ' · Ledger ' + E.m(E.acct('2150') ? E.bal('2150', t) : 0), 'chqdesk');
    if (E.chqAdvTotal) {
      const ai = E.chqAdvTotal('in'), ao = E.chqAdvTotal('out'), li = E.acct('2400') ? E.bal('2400', t) : 0, lo = E.acct('1260') ? E.bal('1260', t) : 0;
      add('Advance cheques agree with the ledger (2400 / 1260)', ai === li && ao === lo, 'Customer advances ' + E.m(ai) + ' vs ' + E.m(li) + ' · Supplier advances ' + E.m(ao) + ' vs ' + E.m(lo), 'chqdesk');
    }
    const od = pend.filter(c => c.date < T);
    add('No cheque is past its date and still uncleared', !od.length, od.length ? od.length + ' cheque(s) overdue — deposit, clear or postpone them' : 'All cheques are within date', 'chqdesk');

    /* 15. bank reconciliation: ledger lines older than 31 days not yet ticked off */
    const cut = new Date(Date.parse(T + 'T00:00:00Z') - 31 * 864e5).toISOString().slice(0, 10), ticked = new Set(E.rows('recon').map(r => r.acc + '|' + r.jeId + '|' + r.idx));
    let unrec = 0;
    const banks = E.rows('coa').filter(a => a.bank && a.code !== '1000').map(a => a.code);
    E.rows('journalEntries').forEach(j => { if (j.date > cut) return; j.lines.forEach((l, i) => { if (banks.includes(l.acc) && !ticked.has(l.acc + '|' + j.id + '|' + i)) unrec++; }); });
    add('Bank entries older than 31 days are reconciled', !unrec, unrec ? unrec + ' bank line(s) not yet ticked on the reconciliation' : 'All older bank lines reconciled', 'banking');

    return C;
  }

  E.route('closing', 'Month-end Close', () => {
    const C = checks(), bad = C.filter(c => c.ok === WARN).length, lk = E.setting('lockedUntil') || '';
    return `<div class="kp">${E.kpi('Checks passed', (C.length - bad) + ' / ' + C.length, bad ? '<span class="bad">' + bad + ' need attention</span>' : '<span class="ok">Ready to close</span>')}${E.kpi('Period locked until', lk || 'not locked', 'Entries on or before this date cannot be changed')}</div>
    <div class="card"><h3>Close checklist</h3><div class="tw"><table><tbody>${C.map(c => `<tr><td style="width:34px;font-size:18px">${c.ok === OK ? '✅' : '⚠️'}</td><td><b>${E.esc(c.n)}</b><div class="muted">${E.esc(c.d)}</div></td><td class="r"><button class="btn sm" data-nav="${c.go}">Open</button></td></tr>`).join('')}</tbody></table></div></div>
    ${E.role === 'owner' ? `<div class="card"><h3>Lock the period</h3><p class="muted" style="margin-bottom:10px">Once locked, nothing on or before the date can be posted, changed or cancelled. Do this after every check above is green and reports are printed.</p><div class="g2"><div class="f">Lock all entries up to (inclusive)<input id="lk_d" type="date" value="${lk || new Date(Date.parse(E.today().slice(0, 8) + '01T00:00:00Z') - 864e5).toISOString().slice(0, 10)}"></div></div><button class="btn p" data-a="lkSave">Lock period</button> <button class="btn" data-a="lkClear">Unlock</button></div>` : ''}`;
  });

  E.A.lkSave = async () => {
    const d = E.val('lk_d');
    if (!d) return E.toast('Choose a date', 'error');
    if (d > E.today()) return E.toast('Choose a date that is not in the future', 'error');
    const bad = checks().filter(c => c.ok === WARN).length;
    if (!confirm((bad ? bad + ' check(s) above still need attention. ' : '') + 'Lock all entries up to ' + d + '?')) return;
    await E.setSetting({ lockedUntil: d });
    await E.audit('lock', 'settings', 'lockedUntil', null, { lockedUntil: d });
    E.go();
    E.toast('Period locked until ' + d, 'success');
  };
  E.A.lkClear = async () => {
    if (!confirm('Unlock all periods?')) return;
    await E.setSetting({ lockedUntil: '' });
    await E.audit('unlock', 'settings', 'lockedUntil', null, { lockedUntil: '' });
    E.go();
    E.toast('Period unlocked', 'success');
  };
})(window.ERP);