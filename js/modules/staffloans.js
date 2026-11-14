/* Staff Loans — interest-free loans to staff, tracked as a RUNNING BALANCE.

   Rules that make it bullet-proof:
   1. A loan is its principal plus a list of recovery ENTRIES. Pending balance = principal − sum of live entries. Nothing is edited in place.
   2. Every entry points at the document that caused it (payroll run, daily salary, repayment voucher, write-off).
   3. Undoing a document marks its entries "reversed" (kept for the audit trail, never counted). Doing it twice changes nothing.
   4. Deductions can never exceed the pending balance, and payroll checks this BEFORE any ledger entry is posted.
   5. Ledger account 1250 always equals advances + loan balances. The Loan Integrity Check screen proves it and can repair drift.
   Older schedule-based loans are read through the same balance model (see legacyEntries) and are upgraded on their first new transaction. */
(E => {
  E.nav('People & Payroll', 'staffloans', '💵', 'Staff Loans');
  E.nav('People & Payroll', 'loanaudit', '🛡️', 'Loan Integrity Check');
  const emp = id => E.D.employees.find(x => x.id === id);
  const DT = /^\d{4}-\d{2}-\d{2}$/;
  const clone = o => JSON.parse(JSON.stringify(o));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const myLoans = empId => E.rows('staffLoans').filter(l => l.empId === empId && !l.cancelled);

  /* ───────── balance model ───────── */
  /* Old schedule loans: rebuild their recoveries from the instalment rows (principal only; interest is no longer charged). */
  const legacyEntries = l => {
    const out = [];
    (l.rows || []).forEach((r, i) => {
      if (r.paid && r.paidPrincipal > 0) out.push({ id: l.id + '-P' + i, type: 'recover', source: r.manualPayNo ? 'manual' : 'payroll', date: r.paidDate || l.date, amount: r.paidPrincipal, refId: r.runId || '', refNo: r.runNo || '', jeId: r.manualPayNo ? (r.runId || '') : '', reversed: false });
      if (r.partialPrin > 0) out.push({ id: l.id + '-Q' + i, type: 'recover', source: 'payroll', date: r.paidDate || l.date, amount: r.partialPrin, refId: r.runId || '', refNo: r.runNo || '', jeId: '', reversed: false });
    });
    if (l.settled && l.settled.principal > 0) out.push({ id: l.id + '-S', type: 'recover', source: 'manual', date: l.settled.date, amount: l.settled.principal, refId: '', refNo: l.settled.payNo || '', jeId: l.settled.jeId || '', reversed: false });
    return out;
  };
  const entriesOf = l => l.v2 ? (l.entries || []) : legacyEntries(l);
  const view = (l, asOf) => {
    if (l.cancelled) return { given: 0, recovered: 0, balance: 0, all: entriesOf(l), live: [] };
    const all = entriesOf(l);
    const live = all.filter(e => !e.reversed && (!asOf || (e.date || '') <= asOf));
    const recovered = sum(live, e => e.amount);
    const given = (!asOf || l.date <= asOf) ? l.principal : 0;
    return { given, recovered, balance: given - recovered, all, live };
  };
  const statusOf = l => l.cancelled ? 'Cancelled' : view(l).balance <= 0 ? 'Completed' : 'Active';
  const upgrade = l => { if (!l.v2) { l.entries = legacyEntries(l).map(e => Object.assign({}, e)); l.v2 = true; l.legacyRows = l.rows; delete l.rows; } return l; };

  /* Public API used by payroll, registers and reports */
  E.staffLoanTotals = l => { const v = view(l); return { principalOut: v.balance, totalPaid: v.recovered, totalInterestPaid: 0, paidCount: v.live.length, nextDue: null, status: statusOf(l) }; };
  /* total pending for one employee (optionally as at a date) */
  E.loanBal = (empId, asOf) => sum(myLoans(empId), l => view(l, asOf).balance);
  /* pending balance that can be deducted on a pay date (only loans already given by then) */
  E.staffLoanAvail = (empId, date) => sum(myLoans(empId).filter(l => !date || l.date <= date), l => Math.max(0, view(l).balance));
  /* default deduction shown in payroll: the loan's own "usual deduction", never more than what is pending */
  E.staffLoanSuggest = empId => sum(myLoans(empId), l => { const b = view(l).balance; return b > 0 && l.deduct > 0 ? Math.min(l.deduct, b) : 0; });
  E.staffLoanDue = (empId) => E.staffLoanSuggest(empId);
  E.staffLoanSplit = (empId, amount) => ({ principal: amount || 0, interest: 0 });
  /* ledger lines for the Employee Ledger screen */
  E.staffLoanEvents = (empId, skipPayroll) => {
    const ev = [];
    myLoans(empId).forEach(l => {
      ev.push({ d: l.date, k: l.opening ? 'Loan (opening balance)' : 'Loan given', t: l.no + ' · ' + E.m(l.principal), amt: l.principal });
      entriesOf(l).filter(e => !e.reversed && !(skipPayroll && e.source === 'payroll')).forEach(e => ev.push({ d: e.date, k: e.source === 'writeoff' ? 'Loan written off' : 'Loan recovered', t: l.no + (e.refNo ? ' · ' + e.refNo : ''), amt: -e.amount }));
    });
    return ev;
  };

  /* Refuse any deduction that is negative, fractional, or more than the pending balance. Call BEFORE posting to the ledger. */
  E.staffLoanCheck = (empId, amount, date) => {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('Invalid loan deduction');
    if (!amount) return;
    const avail = E.staffLoanAvail(empId, date), e = emp(empId) || { name: 'Employee' };
    if (amount > avail) throw new Error(e.name + ': loan deduction ' + E.m(amount) + ' is more than the pending loan ' + E.m(avail));
  };

  /* Record a payroll deduction against the employee's oldest loans first. ref = { runId, runNo, date }.
     All-or-nothing: if any save fails the loans already saved are put back. Safe against double calls for the same document. */
  E.staffLoanApply = async (empId, amount, ref) => {
    if (!amount) return { applied: 0, alloc: [] };
    if (!ref || !ref.runId) throw new Error('Loan deduction needs a payroll reference');
    E.staffLoanCheck(empId, amount, ref.date);
    const loans = myLoans(empId).filter(l => l.date <= ref.date && view(l).balance > 0).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.no.localeCompare(b.no));
    if (loans.some(l => entriesOf(l).some(e => e.refId === ref.runId && !e.reversed))) throw new Error('Loan deduction for ' + (ref.runNo || 'this document') + ' is already recorded');
    let left = amount;
    const plan = [];
    for (const l of loans) {
      if (!left) break;
      const take = Math.min(left, view(l).balance);
      plan.push({ before: l, next: upgrade(clone(l)), take });
      left -= take;
    }
    if (left) throw new Error('Loan deduction ' + E.m(amount) + ' is more than the pending loan');
    const saved = [];
    try {
      for (const p of plan) {
        p.next.entries.push({ id: E.uid(), type: 'recover', source: 'payroll', date: ref.date, amount: p.take, refId: ref.runId, refNo: ref.runNo || '', jeId: ref.jeId || '', reversed: false, at: new Date().toISOString(), by: E.user || '' });
        await E.save('staffLoans', p.next, p.before);
        saved.push(p);
      }
    } catch (err) {
      for (const p of saved.reverse()) { try { await E.put('staffLoans', p.before); } catch (x) { console.error('loan rollback failed', x); } }
      throw err;
    }
    return { applied: amount, alloc: plan.map(p => ({ loanId: p.next.id, no: p.next.no, amount: p.take })) };
  };

  /* Undo every deduction made by one payroll document (optionally for one employee). Running it twice changes nothing. */
  E.staffLoanReverseRun = async (refId, empId) => {
    if (!refId) return 0;
    let n = 0;
    for (const l of E.rows('staffLoans').filter(x => (!empId || x.empId === empId) && entriesOf(x).some(e => e.refId === refId && e.source === 'payroll' && !e.reversed))) {
      const b = l, next = upgrade(clone(l));
      next.entries.forEach(e => { if (e.refId === refId && e.source === 'payroll' && !e.reversed) { e.reversed = true; e.reversedAt = new Date().toISOString(); e.reversedBy = E.user || ''; n++; } });
      await E.save('staffLoans', next, b);
    }
    return n;
  };

  /* ───────── list screen ───────── */
  const F = { q: '', status: 'Active' };
  const tagStyle = s => s === 'Active' ? 'background:#fef3c7;color:#92400e' : s === 'Completed' ? 'background:#d1fae5;color:#065f46' : 'background:#fee2e2;color:#b91c1c';

  E.route('staffloans', 'Staff Loans', () => {
    const all = E.rows('staffLoans').sort((a, b) => b.no.localeCompare(a.no));
    const filtered = all.filter(l => {
      if (F.status && statusOf(l) !== F.status) return false;
      if (F.q) { const e = emp(l.empId) || {}; if (!((l.no || '') + ' ' + (e.name || '') + ' ' + (e.code || '')).toLowerCase().includes(F.q.toLowerCase())) return false; }
      return true;
    });
    const active = all.filter(l => statusOf(l) === 'Active');
    const pending = sum(active, l => view(l).balance);
    const month = E.today().slice(0, 7);
    const recMonth = sum(all, l => sum(view(l).live.filter(e => (e.date || '').slice(0, 7) === month), e => e.amount));
    const legacy = all.filter(l => !l.v2 && !l.cancelled).length;
    return `<div class="kp">
      ${E.kpi('Active loans', active.length, new Set(active.map(l => l.empId)).size + ' employee(s)')}
      ${E.kpi('Total pending', E.m(pending), 'to recover from staff')}
      ${E.kpi('Recovered this month', E.m(recMonth), month)}
    </div>
    ${legacy ? `<div class="card"><b>${legacy} older loan(s)</b> use the old instalment schedule. They already show the correct pending balance. <button class="btn sm p" data-a="slUpgrade">Upgrade to the new balance ledger</button></div>` : ''}
    <div class="bar">
      <input class="fs" style="max-width:280px" placeholder="Search loan no or employee…" value="${E.esc(F.q)}" oninput="E.A.slFilter(this.value)">
      <select class="fs" onchange="E.A.slStatus(this.value)">
        ${['Active', 'Completed', 'Cancelled', ''].map(s => `<option value="${s}" ${F.status === s ? 'selected' : ''}>${s || 'All'}</option>`).join('')}
      </select>
      <span class="gap"></span>
      <button class="btn p" data-a="slNew">+ New Staff Loan</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Employee</th><th>Date</th><th class="r">Loan</th><th class="r">Recovered</th><th class="r">Pending balance</th><th class="r">Usual deduction</th><th>Status</th><th></th></tr></thead>
      <tbody>${filtered.map(l => {
        const e = emp(l.empId) || { name: l.empName || '?', code: l.empCode };
        const v = view(l), st = statusOf(l);
        return `<tr>
          <td><b>${E.esc(l.no)}</b></td>
          <td>${E.esc(e.name)}<div class="muted" style="font-size:11px">${E.esc(e.code || '')}</div></td>
          <td>${l.date}</td>
          <td class="r">${E.m(l.principal)}</td>
          <td class="r">${E.m(v.recovered)}</td>
          <td class="r"><b>${E.m(v.balance)}</b></td>
          <td class="r">${l.deduct ? E.m(l.deduct) : '<span class="muted">—</span>'}</td>
          <td><span class="tag" style="${tagStyle(st)}">${st}</span></td>
          <td class="r"><button class="btn sm" data-a="slView" data-id="${l.id}">Open</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" class="muted">No loans match this filter</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Interest-free. The pending balance sits in <b>1250 Employee Advances</b>. Every wage / salary run shows each person's pending loan and lets you type how much to deduct (never more than is pending). Repayments outside payroll are recorded from the loan screen.</p>`;
  });

  E.A.slFilter = v => { F.q = v; E.go(); };
  E.A.slStatus = v => { F.status = v; E.go(); };

  E.A.slUpgrade = () => E.once('slUpgrade', async () => {
    try {
      let n = 0;
      for (const l of E.rows('staffLoans').filter(x => !x.v2)) { const b = l; await E.save('staffLoans', upgrade(clone(l)), b); n++; }
      E.go(); E.toast(n + ' loan(s) upgraded', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  /* ───────── new loan ───────── */
  E.A.slNew = () => {
    const emps = E.rows('employees').filter(e => e.active).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!emps.length) return E.toast('Add employees first', 'error');
    const banks = E.rows('coa').filter(a => a.bank && !a.inactive);
    if (!banks.length) return E.toast('Add a bank/cash account first', 'error');
    E.modal('New Staff Loan (interest-free)', `
      <div class="f">Employee *<select id="sl_emp">${emps.map(e => { const p = E.loanBal(e.id); return `<option value="${e.id}">${E.esc(e.name)} · ${E.esc(e.code || '')}${p > 0 ? ' · pending ' + E.m(p) : ''}</option>`; }).join('')}</select></div>
      <div class="g2">
        <div class="f">Loan amount (Rs) *<input id="sl_amt" type="number" step="0.01" min="0"></div>
        <div class="f">Loan date<input id="sl_date" type="date" value="${E.today()}"></div>
      </div>
      <div class="g2">
        <div class="f">Usual deduction per payroll (Rs)<input id="sl_ded" type="number" step="0.01" min="0" placeholder="optional — pre-fills payroll, you can change it each time"></div>
        <div class="f">Paid from *<select id="sl_bank">${banks.map(a => `<option value="${a.code}">${a.code} · ${E.esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="f">Notes<input id="sl_notes"></div>
      <label style="display:block;margin-top:8px"><input type="checkbox" id="sl_open"> This is an <b>existing loan</b> given before using this system. Enter the amount still pending above; no money leaves the bank now.</label>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slSave">Create Loan</button>`);
  };

  E.A.slSave = () => E.once('slSave', async () => {
    try {
      const empId = E.val('sl_emp'), e = emp(empId);
      if (!e) throw new Error('Select employee');
      const amount = E.c(E.val('sl_amt')), date = E.val('sl_date'), bank = E.val('sl_bank'), deduct = E.c(E.val('sl_ded')), opening = E.$('sl_open').checked, notes = E.val('sl_notes');
      if (!(amount > 0)) throw new Error('Enter the loan amount');
      if (!DT.test(date)) throw new Error('Invalid date');
      if (deduct < 0) throw new Error('Usual deduction cannot be negative');
      if (deduct > amount) throw new Error('Usual deduction is more than the loan');
      if (!opening && !bank) throw new Error('Choose the account the money is paid from');
      if (myLoans(empId).some(l => l.date === date && l.principal === amount) && !confirm('This employee already has a loan of ' + E.m(amount) + ' on ' + date + '. Create another?')) return;
      if (!opening && E.bal(bank) < amount && !confirm('The account balance (' + E.m(E.bal(bank)) + ') is less than the loan. Continue?')) return;
      const no = await E.next('SL');
      const lines = [{ acc: '1250', dr: amount }, { acc: opening ? '3000' : bank, cr: amount }];
      await E.postThen({ date, ref: no, narr: (opening ? 'Opening staff loan · ' : 'Staff loan · ') + e.name + (notes ? ' · ' + notes : ''), source: opening ? 'opening' : 'loan', lines }, async je => {
        await E.save('staffLoans', { no, v2: true, empId, empName: e.name, empCode: e.code || '', principal: amount, date, bankAcc: opening ? '' : bank, opening, deduct, notes, jeId: je.id, cancelled: false, entries: [], createdBy: E.user || '' });
      });
      E.closeM(); E.go(); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  /* ───────── one loan: statement + actions ───────── */
  const srcLabel = e => e.source === 'payroll' ? 'Payroll deduction' : e.source === 'manual' ? 'Repayment (cash / bank)' : e.source === 'writeoff' ? 'Written off' : 'Recovery';
  const stmtRows = l => {
    const rows = [{ d: l.date, t: l.opening ? 'Loan (opening balance)' : 'Loan given', give: l.principal, rec: 0, ref: l.no, e: null }];
    entriesOf(l).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || '')).forEach(e => rows.push({ d: e.date, t: srcLabel(e) + (e.note ? ' · ' + e.note : ''), give: 0, rec: e.amount, ref: e.refNo || '', e }));
    let bal = 0;
    rows.forEach(r => { if (!(r.e && r.e.reversed)) bal += r.give - r.rec; r.bal = bal; });
    return rows;
  };

  E.A.slView = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    if (!l) return;
    const e = emp(l.empId) || { name: l.empName, code: l.empCode };
    const v = view(l), st = statusOf(l), live = st === 'Active';
    const rows = stmtRows(l).map(r => {
      const rev = r.e && r.e.reversed;
      const undo = r.e && !rev && (r.e.source === 'manual' || r.e.source === 'writeoff') && r.e.jeId ? `<button class="btn sm d" data-a="slUndo" data-id="${l.id}|${r.e.id}">Undo</button>` : '';
      return `<tr style="${rev ? 'opacity:.45;text-decoration:line-through' : ''}"><td>${r.d}</td><td>${E.esc(r.t)}${rev ? ' <span class="tag">reversed</span>' : ''}</td><td>${E.esc(r.ref)}</td>
        <td class="r">${r.give ? E.m(r.give) : ''}</td><td class="r">${r.rec ? E.m(r.rec) : ''}</td><td class="r"><b>${E.m(r.bal)}</b></td><td>${undo}</td></tr>`;
    }).join('');
    E.modal(l.no + ' — ' + e.name, `
      <div class="kp">
        ${E.kpi('Loan', E.m(l.principal), l.date)}
        ${E.kpi('Recovered', E.m(v.recovered), v.live.length + ' deduction(s)')}
        ${E.kpi('Pending balance', '<b>' + E.m(v.balance) + '</b>', st)}
        ${E.kpi('Usual deduction', l.deduct ? E.m(l.deduct) : '—', 'pre-fills payroll')}
      </div>
      <p class="muted" style="margin-bottom:10px"><b>${E.esc(e.name)}</b> (${E.esc(e.code || '')}) · interest-free${l.notes ? ' · ' + E.esc(l.notes) : ''}</p>
      <div class="tw"><table><thead><tr><th>Date</th><th>Details</th><th>Ref</th><th class="r">Given</th><th class="r">Recovered</th><th class="r">Balance</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    `, `<button class="btn" data-a="close">Close</button><button class="btn" data-a="slPrint" data-id="${l.id}">🖨 Print</button>
      ${live ? `<button class="btn" data-a="slDeduct" data-id="${l.id}">Usual deduction</button><button class="btn" data-a="slWriteoff" data-id="${l.id}">Write off</button><button class="btn p" data-a="slRepay" data-id="${l.id}">Record repayment</button>` : ''}
      ${!l.cancelled && !v.live.length ? `<button class="btn d" data-a="slCancel" data-id="${l.id}">Cancel loan</button>` : ''}`, 1);
  };

  E.A.slDeduct = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    E.modal('Usual deduction — ' + l.no, `<div class="f">Usual deduction per payroll (Rs)<input id="sd_a" type="number" step="0.01" min="0" value="${l.deduct ? (l.deduct / 100).toFixed(2) : ''}"></div>
      <p class="muted">This only pre-fills the payroll screens. You can type a different amount at every payroll.</p>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slDeductSave" data-id="${id}">Save</button>`);
  };
  E.A.slDeductSave = id => E.once('slDeduct' + id, async () => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id), a = E.c(E.val('sd_a'));
      if (a < 0) throw new Error('Cannot be negative');
      if (a > view(l).balance) throw new Error('More than the pending balance');
      const next = clone(l); next.deduct = a; await E.save('staffLoans', next, l);
      E.closeM(); E.go(); E.toast('Saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  /* repayment outside payroll */
  const accOpts = () => E.rows('coa').filter(a => (a.bank || a.code === '1000') && !a.inactive).map(a => `<option value="${a.code}">${a.code} · ${E.esc(a.name)}</option>`).join('');
  E.A.slRepay = id => {
    const l = E.D.staffLoans.find(x => x.id === id), v = view(l);
    E.modal('Record repayment — ' + l.no, `
      <p class="muted">Pending balance: <b>${E.m(v.balance)}</b></p>
      <div class="g2">
        <div class="f">Date<input id="rp_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount (Rs) *<input id="rp_a" type="number" step="0.01" min="0" value="${(v.balance / 100).toFixed(2)}"></div>
      </div>
      <div class="f">Received into *<select id="rp_b">${accOpts()}</select></div>
      <div class="f">Note<input id="rp_n"></div>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="slRepaySave" data-id="${id}">Post repayment</button>`);
  };
  E.A.slRepaySave = id => E.once('slRepay' + id, async () => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id), v = view(l);
      const date = E.val('rp_d'), amt = E.c(E.val('rp_a')), bank = E.val('rp_b'), note = E.val('rp_n');
      if (!DT.test(date)) throw new Error('Invalid date');
      if (date < l.date) throw new Error('Repayment date is before the loan date');
      if (!(amt > 0)) throw new Error('Enter the amount');
      if (amt > v.balance) throw new Error('More than the pending balance (' + E.m(v.balance) + ')');
      if (!bank) throw new Error('Choose account');
      const no = await E.next('SLP');
      await E.postThen({ date, ref: no, narr: 'Staff loan repayment · ' + l.no + ' · ' + l.empName, source: 'loan', lines: [{ acc: bank, dr: amt }, { acc: '1250', cr: amt }] }, async je => {
        const next = upgrade(clone(l));
        next.entries.push({ id: E.uid(), type: 'recover', source: 'manual', date, amount: amt, refId: je.id, refNo: no, jeId: je.id, note, reversed: false, at: new Date().toISOString(), by: E.user || '' });
        await E.save('staffLoans', next, l);
      });
      E.closeM(); E.go(); E.toast('Repayment posted ' + no, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  /* write off an unrecoverable balance (e.g. employee left) */
  E.A.slWriteoff = id => {
    const l = E.D.staffLoans.find(x => x.id === id), v = view(l);
    E.modal('Write off — ' + l.no, `
      <p class="muted">Pending balance: <b>${E.m(v.balance)}</b>. The amount written off becomes an expense (6180 Miscellaneous Expenses) and the balance is reduced.</p>
      <div class="g2">
        <div class="f">Date<input id="wo_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount (Rs) *<input id="wo_a" type="number" step="0.01" min="0" value="${(v.balance / 100).toFixed(2)}"></div>
      </div>
      <div class="f">Reason *<input id="wo_n"></div>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn d" data-a="slWriteoffSave" data-id="${id}">Write off</button>`);
  };
  E.A.slWriteoffSave = id => E.once('slWo' + id, async () => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id), v = view(l);
      const date = E.val('wo_d'), amt = E.c(E.val('wo_a')), note = E.val('wo_n');
      if (!DT.test(date)) throw new Error('Invalid date');
      if (!(amt > 0)) throw new Error('Enter the amount');
      if (amt > v.balance) throw new Error('More than the pending balance (' + E.m(v.balance) + ')');
      if (!note) throw new Error('Give a reason');
      if (!E.acct('6180')) await E.ensureCoa();
      if (!confirm('Write off ' + E.m(amt) + ' for ' + l.empName + '? This is posted as an expense.')) return;
      const no = await E.next('SLW');
      await E.postThen({ date, ref: no, narr: 'Staff loan written off · ' + l.no + ' · ' + note, source: 'loan', lines: [{ acc: '6180', dr: amt }, { acc: '1250', cr: amt }] }, async je => {
        const next = upgrade(clone(l));
        next.entries.push({ id: E.uid(), type: 'recover', source: 'writeoff', date, amount: amt, refId: je.id, refNo: no, jeId: je.id, note, reversed: false, at: new Date().toISOString(), by: E.user || '' });
        await E.save('staffLoans', next, l);
      });
      E.closeM(); E.go(); E.toast('Written off ' + no, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  /* undo a manual repayment / write-off: reverses its ledger entry and marks the entry reversed */
  E.A.slUndo = key => E.once('slUndo' + key, async () => {
    try {
      const [id, eid] = key.split('|');
      const l = E.D.staffLoans.find(x => x.id === id), en = entriesOf(l).find(x => x.id === eid);
      if (!en || en.reversed) throw new Error('Already undone');
      if (!confirm('Undo ' + srcLabel(en) + ' of ' + E.m(en.amount) + '?')) return;
      const je = E.D.journalEntries.find(j => j.id === en.jeId);
      if (je && !je.reversedBy) await E.reverse(en.jeId);
      const next = upgrade(clone(l));
      const t = next.entries.find(x => x.id === eid); t.reversed = true; t.reversedAt = new Date().toISOString(); t.reversedBy = E.user || '';
      await E.save('staffLoans', next, l);
      E.closeM(); E.go(); E.toast('Undone', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  E.A.slCancel = id => E.once('slCancel' + id, async () => {
    try {
      const l = E.D.staffLoans.find(x => x.id === id);
      if (view(l).live.length) throw new Error('Deductions or repayments exist. Undo them first');
      if (!confirm('Cancel ' + l.no + '? The loan entry is reversed.')) return;
      const je = E.D.journalEntries.find(j => j.id === l.jeId);
      if (je && !je.reversedBy) await E.reverse(l.jeId);
      const next = clone(l); next.cancelled = true; await E.save('staffLoans', next, l);
      E.closeM(); E.go(); E.toast('Loan cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });

  E.A.slPrint = id => {
    const l = E.D.staffLoans.find(x => x.id === id);
    const e = emp(l.empId) || { name: l.empName, code: l.empCode };
    const v = view(l), w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const rows = stmtRows(l).filter(r => !(r.e && r.e.reversed)).map(r => `<tr><td>${r.d}</td><td>${E.esc(r.t)}</td><td>${E.esc(r.ref)}</td><td class="r">${r.give ? E.m(r.give) : ''}</td><td class="r">${r.rec ? E.m(r.rec) : ''}</td><td class="r">${E.m(r.bal)}</td></tr>`).join('');
    w.document.write(`<html><head><title>${l.no}</title><style>body{font:12px Arial;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}</style></head><body><h2>${E.esc(E.factory().name)}</h2><h3>Staff Loan Statement — ${l.no}</h3><p><b>${E.esc(e.name)}</b> (${E.esc(e.code || '')}) · interest-free<br>Loan ${E.m(l.principal)} · Recovered ${E.m(v.recovered)} · <b>Pending ${E.m(v.balance)}</b></p><table><thead><tr><th>Date</th><th>Details</th><th>Ref</th><th class="r">Given</th><th class="r">Recovered</th><th class="r">Balance</th></tr></thead><tbody>${rows}</tbody></table><p>Printed ${E.today()}</p></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  /* ───────── integrity check ───────── */
  const payrollDocs = () => E.rows('wageRuns').filter(r => !r.cancelled && (r.kind === 'run' || r.kind === 'daily-salary'));
  E.staffLoanAudit = () => {
    const issues = [], docs = payrollDocs(), liveIds = new Set(docs.map(r => r.id));
    const jeOf = id => E.D.journalEntries.find(j => j.id === id);
    const legacyEmp = empId => myLoans(empId).some(l => !l.v2);
    /* A. every payroll loan deduction has exactly matching loan entries */
    const exp = [];
    docs.forEach(r => {
      if (r.kind === 'run') (r.lines || []).forEach(x => { if (x.loanRec > 0) exp.push({ refId: r.id, no: r.no, empId: x.empId, amt: x.loanRec - (x.loanInt || 0), date: r.date }); });
      else if (r.loanRec > 0) exp.push({ refId: r.id, no: r.no, empId: r.empId, amt: r.loanRec - (r.loanInt || 0), date: r.date });
    });
    exp.forEach(x => {
      if (legacyEmp(x.empId)) return;
      const got = sum(myLoans(x.empId), l => sum(entriesOf(l).filter(e => e.refId === x.refId && e.source === 'payroll' && !e.reversed), e => e.amount));
      if (got !== x.amt) issues.push({ lvl: 'bad', text: x.no + ' · ' + ((emp(x.empId) || {}).name || '?') + ': payroll deducted ' + E.m(x.amt) + ' but loan records show ' + E.m(got), fix: { t: 'resync', x } });
    });
    /* B. deductions that point at cancelled / missing payroll */
    E.rows('staffLoans').filter(l => l.v2).forEach(l => {
      l.entries.filter(e => !e.reversed && e.source === 'payroll' && !liveIds.has(e.refId)).forEach(e => issues.push({ lvl: 'bad', text: l.no + ': deduction ' + E.m(e.amount) + ' (' + (e.refNo || '?') + ') belongs to a cancelled or missing payroll', fix: { t: 'flag', loanId: l.id, entryId: e.id } }));
      /* C. manual entries vs their journal entry */
      l.entries.filter(e => (e.source === 'manual' || e.source === 'writeoff') && e.jeId).forEach(e => {
        const je = jeOf(e.jeId);
        if (!je) issues.push({ lvl: 'bad', text: l.no + ': ' + srcLabel(e) + ' ' + E.m(e.amount) + ' has no ledger entry' });
        else if (!e.reversed && je.reversedBy) issues.push({ lvl: 'bad', text: l.no + ': ' + srcLabel(e) + ' ' + E.m(e.amount) + ' was reversed in the ledger but still counts in the loan', fix: { t: 'flag', loanId: l.id, entryId: e.id } });
        else if (e.reversed && !je.reversedBy) issues.push({ lvl: 'bad', text: l.no + ': ' + srcLabel(e) + ' ' + E.m(e.amount) + ' was undone in the loan but not in the ledger', fix: { t: 'jerev', jeId: e.jeId } });
      });
    });
    /* D/E. balances and creating entries */
    E.rows('staffLoans').filter(l => !l.cancelled).forEach(l => {
      const v = view(l);
      if (v.balance < 0) issues.push({ lvl: 'bad', text: l.no + ': recovered ' + E.m(v.recovered) + ' is more than the loan ' + E.m(l.principal) });
      const je = jeOf(l.jeId);
      if (!je) issues.push({ lvl: 'bad', text: l.no + ': the ledger entry that created this loan is missing' });
      else if (je.reversedBy) issues.push({ lvl: 'bad', text: l.no + ': its ledger entry was reversed but the loan is still active' });
    });
    /* F. ledger 1250 = advances + loans */
    const adv = sum(E.rows('employees'), e => E.advBal ? E.advBal(e.id) : 0), lo = sum(E.rows('staffLoans').filter(l => !l.cancelled), l => view(l).balance), led = E.acct('1250') ? E.bal('1250') : 0;
    if (adv + lo !== led) issues.push({ lvl: 'bad', text: 'Ledger 1250 is ' + E.m(led) + ' but advances ' + E.m(adv) + ' + loans ' + E.m(lo) + ' = ' + E.m(adv + lo) + ' (difference ' + E.m(led - adv - lo) + ')' });
    /* G. negative advance balances */
    E.rows('employees').filter(e => E.advBal && E.advBal(e.id) < 0).forEach(e => issues.push({ lvl: 'bad', text: e.name + ': recovered more advance than was given (' + E.m(E.advBal(e.id)) + ')' }));
    return { issues, totals: { adv, lo, led }, legacy: E.rows('staffLoans').filter(l => !l.v2 && !l.cancelled).length };
  };

  let AU = [];
  E.route('loanaudit', 'Loan Integrity Check', () => {
    const r = E.staffLoanAudit(); AU = r.issues;
    return `<div class="kp">
      ${E.kpi('Advances pending', E.m(r.totals.adv))}
      ${E.kpi('Staff loans pending', E.m(r.totals.lo))}
      ${E.kpi('Ledger 1250', E.m(r.totals.led), r.totals.adv + r.totals.lo === r.totals.led ? 'agrees' : '<span class="bad">differs</span>')}
    </div>
    <div class="card"><h3>${r.issues.length ? r.issues.length + ' problem(s) found' : '✔ Everything agrees'}</h3>
      <p class="muted">Checks that every payroll deduction is recorded on the loan exactly once, cancelled payrolls left nothing behind, repayments match the ledger, and account 1250 equals advances plus loans.</p>
      ${r.legacy ? `<p class="muted">${r.legacy} older loan(s) are not yet upgraded; their payroll links are checked after the upgrade (Staff Loans screen).</p>` : ''}
      ${r.issues.length ? `<div class="tw"><table><tbody>${r.issues.map((x, i) => `<tr><td class="bad">✖</td><td>${E.esc(x.text)}</td><td class="r">${x.fix ? `<button class="btn sm p" data-a="laFix" data-id="${i}">Fix</button>` : '<span class="muted">check manually</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  });

  E.A.laFix = idx => E.once('laFix', async () => {
    try {
      const x = AU[+idx];
      if (!x || !x.fix) return;
      const f = x.fix;
      if (f.t === 'flag') {
        const l = E.D.staffLoans.find(y => y.id === f.loanId), next = upgrade(clone(l)), e = next.entries.find(y => y.id === f.entryId);
        e.reversed = true; e.reversedAt = new Date().toISOString(); e.reversedBy = E.user || '';
        await E.save('staffLoans', next, l);
      } else if (f.t === 'jerev') {
        await E.reverse(f.jeId);
      } else if (f.t === 'resync') {
        await E.staffLoanReverseRun(f.x.refId, f.x.empId);
        await E.staffLoanApply(f.x.empId, f.x.amt, { runId: f.x.refId, runNo: f.x.no, date: f.x.date });
      }
      E.go(); E.toast('Fixed', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  });
})(window.ERP);
