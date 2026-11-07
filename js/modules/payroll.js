/* PART 6 (v4) — Payroll: Clean separation of Salaries and Wages.

   ┌────────────────────────────────────────────────────────────────────┐
   │  MONTHLY SALARIES       — For salaried staff only                  │
   │  ─ payType === 'Monthly'                                            │
   │  ─ Basic + Allowances − no-pay days + OT + Bonus                    │
   │  ─ Less: EPF, ETF, Advance Recovery, Other                          │
   │                                                                     │
   │  DAILY & PIECE WAGES    — For daily & piece workers only            │
   │  ─ payType !== 'Monthly'                                            │
   │  ─ Days × Rate + Piece Wages + OT + Bonus                           │
   │  ─ Less: EPF (if member), Advance Recovery                          │
   │                                                                     │
   │  EMPLOYEE LEDGER        — Unified per-employee history              │
   │  ─ Both salary runs AND wage runs appear here                       │
   │  ─ Running advance balance across the whole statement               │
   └────────────────────────────────────────────────────────────────────┘

   Advances are recorded as wageRuns with kind='advance'. Their recovery is
   OPTIONAL per employee inside a wage or salary run. They are NOT displayed
   as a prominent banner/card on payroll pages — those show only the salary
   or wage calculation. Advances are managed in the Salary & Advance Register.

   Helper E.advBal(empId) is exported and still used by closing.js,
   reports.js and advreg.js.
*/

(E => {
  /* ---------- nav: replace old payroll with clean salary/wage/ledger ---------- */
  const oldP = E.N.findIndex(n => n.id === 'payroll');
  if (oldP >= 0) E.N.splice(oldP, 1);
  const oldE = E.N.findIndex(n => n.id === 'empledger');
  if (oldE >= 0) E.N.splice(oldE, 1);

  E.nav('People & Payroll', 'wages', '💰', 'Daily & Piece Wages');
  E.nav('People & Payroll', 'salary', '💼', 'Monthly Salaries');
  E.nav('People & Payroll', 'empledger', '📒', 'Employee Ledger');

  /* ---------- shared helpers ---------- */
  const emp = id => E.D.employees.find(x => x.id === id);
  const runs = () => E.rows('wageRuns').filter(r => r.kind === 'run');
  const act = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const isSalaried = e => e.payType === 'Monthly';

  /* ---------- advance helpers (exported — used by closing.js, reports.js, advreg.js) ---------- */
  const advGiven = id => E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).reduce((s, r) => s + r.amount, 0);
  const advRec = id => runs().filter(r => !r.cancelled).reduce((s, r) => s + r.lines.filter(l => l.empId === id).reduce((a, l) => a + l.advRec, 0), 0);
  const advBal = id => advGiven(id) - advRec(id);
  E.advBal = advBal;

  const att = (id, from, to) => {
    const A = E.rows('attendance').filter(a => a.empId === id && a.date >= from && a.date <= to);
    return {
      days: A.filter(a => a.status === 'Present').length + A.filter(a => a.status === 'Half day').length / 2,
      absent: A.filter(a => a.status === 'Absent').length,
      leave: A.filter(a => a.status === 'Leave').length,
      ot: A.reduce((s, a) => s + (a.ot || 0), 0),
      marked: A.length
    };
  };

  const openLogs = (id, to) => E.rows('prodLogs').filter(l => l.empId === id && l.status === 'accrued' && (!to || l.date <= to));

  function logsOf(l) {
    return (l.logIds || []).map(id => E.D.prodLogs.find(x => x.id === id)).filter(Boolean);
  }

  /* ---------- SALARY calc (Monthly staff only) ---------- */
  function calcSalary(e, i) {
    const nopayDed = Math.round((e.amount || 0) / 30 * (i.nopay || 0));
    const basic    = Math.max(0, (e.amount || 0) + (e.allow || 0) - nopayDed);
    const hourly   = (e.amount || 0) / 240;
    const ot       = Math.round((i.ot || 0) * hourly * 1.5);
    const bonus    = E.c(i.bonus || 0);
    const gross    = basic + ot + bonus;
    const on       = E.setting('epfOn') && e.epf;
    const ee       = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
    const ec       = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
    const et       = on ? Math.round(gross * E.setting('etf') / 100) : 0;
    const od       = E.c(i.other || 0);
    const adv      = i.adv || 0;
    return {
      basic, piece: 0, ot, bonus, gross,
      epfEmp: ee, epfCo: ec, etf: et,
      advRec: adv, otherDed: od,
      net: gross - ee - adv - od,
      days: 0, nopay: i.nopay || 0, otHrs: i.ot || 0
    };
  }

  /* ---------- WAGE calc (Daily/Piece workers only) ---------- */
  function calcWage(e, i, piece) {
    const basic  = Math.round((i.days || 0) * (e.amount || 0));
    const hourly = (e.amount || 0) / 8;
    const ot     = Math.round((i.ot || 0) * hourly * 1.5);
    const bonus  = E.c(i.bonus || 0);
    const gross  = basic + (piece || 0) + ot + bonus;
    const on     = E.setting('epfOn') && e.epf;
    const ee     = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
    const ec     = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
    const et     = on ? Math.round(gross * E.setting('etf') / 100) : 0;
    const od     = E.c(i.other || 0);
    const adv    = i.adv || 0;
    return {
      basic, piece: piece || 0, ot, bonus, gross,
      epfEmp: ee, epfCo: ec, etf: et,
      advRec: adv, otherDed: od,
      net: gross - ee - adv - od,
      days: i.days || 0, nopay: 0, otHrs: i.ot || 0
    };
  }

  /* ======================================================================
     MONTHLY SALARIES PAGE
     ====================================================================== */
  const salaryPage = () => {
    const R         = runs().filter(r => r.type === 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    const empCount  = E.rows('employees').filter(e => e.active && isSalaried(e)).length;
    const unpaid    = R.filter(r => !r.cancelled && !r.paid).length;

    return `<div class="kp">
      ${E.kpi('Salaried Staff', empCount, 'active monthly staff')}
      ${E.kpi('Runs this year', R.filter(r => r.date.slice(0, 4) === E.today().slice(0, 4) && !r.cancelled).length)}
      ${E.kpi('Unpaid runs', unpaid, unpaid ? 'Awaiting payment' : 'All paid')}
      ${E.kpi('EPF/ETF payable', E.m(E.bal('2100')), 'Ledger 2100')}
    </div>
    <div class="card">
      <div class="bar">
        <span class="muted">Monthly Salaries — fixed-staff payroll only.</span>
        <span class="gap"></span>
        <button class="btn" data-a="remitM">Remit EPF/ETF</button>
        <button class="btn p" data-a="newSalaryRun">+ New Salary Run</button>
      </div>
      <div class="tw"><table>
        <thead><tr>
          <th>Run</th><th>Period</th><th class="r">Staff</th>
          <th class="r">Basic+Allow</th><th class="r">OT+Bonus</th>
          <th class="r">Deductions</th><th class="r">Net Pay</th>
          <th>Status</th><th></th>
        </tr></thead>
        <tbody>${R.map(r => {
          const basic = r.lines.reduce((s, l) => s + (l.basic || 0), 0);
          const extra = r.lines.reduce((s, l) => s + (l.ot || 0) + (l.bonus || 0), 0);
          const ded   = r.lines.reduce((s, l) => s + (l.epfEmp || 0) + (l.advRec || 0) + (l.otherDed || 0), 0);
          return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
            <td><b>${r.no}</b></td>
            <td>${r.from} → ${r.to}</td>
            <td class="r">${r.lines.length}</td>
            <td class="r">${E.m(basic)}</td>
            <td class="r">${E.m(extra)}</td>
            <td class="r">${E.m(ded)}</td>
            <td class="r"><b>${E.m(r.net)}</b></td>
            <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
            <td class="r">
              <button class="btn sm" data-a="slips" data-id="${r.id}">Payslips</button>
              <button class="btn sm" data-a="salSheet" data-id="${r.id}">Sheet</button>
              ${!r.cancelled && !r.paid ? `
                <button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button>
                <button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>
              ` : ''}
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="9" class="muted">No salary runs yet</td></tr>'}</tbody>
      </table></div>
    </div>
    <p class="muted">
      Salaried staff are paid monthly. Use
      <a href="#/advreg" style="color:var(--ac)">Salary &amp; Advance Register</a>
      to record advances — recovered optionally when you create a salary run.
    </p>`;
  };

  /* ======================================================================
     DAILY & PIECE WAGES PAGE
     ====================================================================== */
  const WF = { tab: 'register', from: E.today().slice(0, 8) + '01', to: E.today() };

  const wagePage = () => {
    const tabs = [
      ['register', '📋 Wage Register'],
      ['daily',    '📅 Daily Salaries'],
      ['piece',    '🧵 Piece Work']
    ];
    return `<div class="kp">
      ${E.kpi('Wage Workers', E.rows('employees').filter(e => e.active && !isSalaried(e)).length, 'daily & piece')}
      ${E.kpi('Piece wages unpaid', E.m(E.bal('2210')), 'Ledger 2210')}
      ${E.kpi('Wages payable', E.m(E.bal('2200')), 'Net pay not yet paid')}
      ${E.kpi('EPF/ETF payable', E.m(E.bal('2100')), 'Ledger 2100')}
    </div>
    <div class="bar">
      ${tabs.map(([k, l]) => `<button class="btn ${WF.tab === k ? 'p' : ''}" data-a="wfTab" data-id="${k}">${l}</button>`).join('')}
      <span class="gap"></span>
      <button class="btn" data-a="remitM">Remit EPF/ETF</button>
      <button class="btn p" data-a="newWageRun">+ New Wage Run</button>
    </div>
    <div id="wfBody">
      ${WF.tab === 'register' ? wageRegister() : WF.tab === 'daily' ? dailySalaries() : pieceWork()}
    </div>`;
  };

  const wageRegister = () => {
    const R = runs().filter(r => r.type !== 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr>
        <th>Run</th><th>Type</th><th>Period</th>
        <th class="r">Workers</th><th class="r">Piece</th>
        <th class="r">Days</th><th class="r">Gross</th><th class="r">Net</th>
        <th>Status</th><th></th>
      </tr></thead>
      <tbody>${R.map(r => {
        const piece = r.lines.reduce((s, l) => s + (l.piece || 0), 0);
        const days  = r.lines.reduce((s, l) => s + (l.days || 0), 0);
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td><b>${r.no}</b></td>
          <td><span class="tag">${r.type}</span></td>
          <td>${r.from} → ${r.to}</td>
          <td class="r">${r.lines.length}</td>
          <td class="r">${E.m(piece)}</td>
          <td class="r">${Math.round(days * 10) / 10}</td>
          <td class="r">${E.m(r.gross)}</td>
          <td class="r"><b>${E.m(r.net)}</b></td>
          <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
          <td class="r">
            <button class="btn sm" data-a="slips" data-id="${r.id}">Payslips</button>
            ${!r.cancelled && !r.paid ? `
              <button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button>
              <button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>
            ` : ''}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No wage runs yet</td></tr>'}</tbody>
    </table></div>`;
  };

  /* --- Daily Salaries tab: pure wage calc from attendance. NO advances. --- */
  const dailySalaries = () => {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees')
      .filter(e => e.active && !isSalaried(e))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    const rows = workers.map(e => {
      const a       = att(e.id, from, to);
      const base    = Math.round(a.days * (e.amount || 0));
      const hourly  = (e.amount || 0) / 8;
      const ot      = Math.round(a.ot * hourly * 1.5);
      return { e, a, base, ot, total: base + ot };
    }).filter(x => x.a.marked > 0);

    const grand = rows.reduce((s, x) => s + x.total, 0);

    return `<div class="card">
      <h3>Daily Wage Calculation</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
        <span class="gap"></span>
        <span class="muted">Calculated from Attendance — no advances, no deductions shown here.</span>
      </div>
      <div class="tw"><table>
        <thead><tr>
          <th>Worker</th><th>Type</th><th class="r">Days</th>
          <th class="r">Rate / Day</th><th class="r">Base Wage</th>
          <th class="r">OT Hrs</th><th class="r">OT Pay</th>
          <th class="r"><b>Total Wage</b></th>
        </tr></thead>
        <tbody>
          ${rows.map(x => `<tr>
            <td><b>${E.esc(x.e.name)}</b><br><span class="muted">${x.e.code}</span></td>
            <td><span class="tag">${x.e.payType}</span></td>
            <td class="r">${x.a.days}</td>
            <td class="r">${E.m(x.e.amount)}</td>
            <td class="r">${E.m(x.base)}</td>
            <td class="r">${x.a.ot}</td>
            <td class="r">${E.m(x.ot)}</td>
            <td class="r"><b>${E.m(x.total)}</b></td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">No attendance recorded for this period</td></tr>'}
          ${rows.length ? `<tr style="background:var(--s2)">
            <td colspan="7" class="r"><b>Total Daily Wages</b></td>
            <td class="r"><b>${E.m(grand)}</b></td>
          </tr>` : ''}
        </tbody>
      </table></div>
      <p class="muted">
        These are the wages each worker has earned from their days worked.
        To pay them, use <b>+ New Wage Run</b> — advances are recovered only
        when you include them, per employee, in the run.
      </p>
    </div>`;
  };

  const pieceWork = () => {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees')
      .filter(e => e.active && !isSalaried(e))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    const rows = workers.map(e => {
      const logs    = openLogs(e.id, to).filter(l => l.date >= from);
      const amount  = logs.reduce((s, l) => s + l.amount, 0);
      const packs   = logs.reduce((s, l) => s + l.qty, 0);
      const ops     = {};
      logs.forEach(l => { ops[l.opName] = (ops[l.opName] || 0) + l.amount; });
      return { e, amount, packs, ops, count: logs.length };
    }).filter(x => x.count > 0);

    const grand = rows.reduce((s, x) => s + x.amount, 0);

    return `<div class="card">
      <h3>Unpaid Piece Work</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
      </div>
      <div class="tw"><table>
        <thead><tr>
          <th>Worker</th><th class="r">Entries</th><th class="r">Packs</th>
          <th>Operations</th><th class="r"><b>Amount</b></th>
        </tr></thead>
        <tbody>
          ${rows.map(x => `<tr>
            <td><b>${E.esc(x.e.name)}</b><br><span class="muted">${x.e.code}</span></td>
            <td class="r">${x.count}</td>
            <td class="r">${x.packs}</td>
            <td>${Object.entries(x.ops).map(([n, a]) => `${E.esc(n)}: ${E.m(a)}`).join('<br>')}</td>
            <td class="r"><b>${E.m(x.amount)}</b></td>
          </tr>`).join('') || '<tr><td colspan="5" class="muted">No unpaid piece work in this period</td></tr>'}
          ${rows.length ? `<tr style="background:var(--s2)">
            <td colspan="4" class="r"><b>Total Unpaid Piece Wages</b></td>
            <td class="r"><b>${E.m(grand)}</b></td>
          </tr>` : ''}
        </tbody>
      </table></div>
      <p class="muted">
        This is what remains unpaid (ledger 2210). Include it by creating a wage run.
      </p>
    </div>`;
  };

  /* ---------- routes ---------- */
  E.route('salary', 'Monthly Salaries', salaryPage);
  E.route('wages',  'Daily & Piece Wages', wagePage);
  E.route('payroll', 'Daily & Piece Wages', wagePage); /* legacy alias */

  E.A.wfTab = t => { WF.tab = t; E.go(); };

  E.hooks.push(e => {
    const wf = e.target.dataset && e.target.dataset.wf;
    if (wf && WF[wf] !== undefined) {
      WF[wf] = e.target.value;
      if (E.$('wfBody')) E.$('wfBody').innerHTML = WF.tab === 'daily' ? dailySalaries() : pieceWork();
    }
  });

  /* ======================================================================
     RUN CREATION
     ====================================================================== */
  const W = { date: E.today() };
  const inp = (k, w, v) =>
    `<input class="pw" data-k="${k}" type="number" step="0.01" value="${v || ''}" style="width:${w || 64}px;padding:6px;border:1px solid var(--bd);border-radius:8px">`;

  E.A.newSalaryRun = () => {
    if (!E.rows('employees').some(x => x.active && isSalaried(x)))
      return E.toast('Add monthly salaried employees first', 'error');
    E.modal('New Monthly Salary Run', `
      <div class="g2">
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <input type="hidden" id="w_t" value="Monthly">
      <div class="bar">
        <button class="btn p" data-a="loadSalaryRun">⟳ Load salaried staff</button>
        <span class="muted">Loads all active Monthly employees. Advances are optional per employee.</span>
      </div>
      <div id="wrb"><p class="muted">Choose the period and press Load.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRun">Post salary run</button>`, 1);
  };

  E.A.newWageRun = () => {
    if (!E.rows('employees').some(x => x.active && !isSalaried(x)))
      return E.toast('Add daily or piece-rate workers first', 'error');
    E.modal('New Wage Run', `
      <div class="g2">
        <div class="f">Run type<select id="w_t"><option>Weekly</option><option>Fortnightly</option><option>Daily</option></select></div>
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <div class="bar">
        <button class="btn p" data-a="loadWageRun">⟳ Load production & attendance</button>
        <span class="muted">Loads all unpaid piece work + attendance days for daily workers.</span>
      </div>
      <div id="wrb"><p class="muted">Choose the period and press Load.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRun">Post wage run</button>`, 1);
  };

  E.A.loadSalaryRun = () => loadRun('Monthly');
  E.A.loadWageRun   = () => loadRun(E.val('w_t') || 'Weekly');

  function loadRun(type) {
    const f  = E.val('w_f');
    const to = E.val('w_e');
    if (!f || !to || f > to) return E.toast('Check the period dates', 'error');

    const monthly = type === 'Monthly';
    const js      = act();

    const toSel = d => `<select data-k="to" style="padding:6px;border:1px solid var(--bd);border-radius:8px;max-width:150px">
      <option value="OH" ${d === 'OH' ? 'selected' : ''}>Factory overhead</option>
      <option value="ADM" ${d === 'ADM' ? 'selected' : ''}>Admin salaries</option>
      ${js.length ? '<option value="SPLIT">Split across jobs</option>' : ''}
      ${js.map(j => `<option value="${j.id}">${j.no} (100%)</option>`).join('')}
    </select>`;

    const rows = [];
    E.rows('employees')
      .filter(e => e.active)
      .filter(e => monthly ? isSalaried(e) : !isSalaried(e))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      .forEach(e => {
        const L  = openLogs(e.id, to).filter(l => l.date >= f);
        const pc = monthly ? 0 : L.reduce((s, l) => s + l.amount, 0);
        const a  = att(e.id, f, to);
        const bal = advBal(e.id);

        const incl = monthly ? true : (pc > 0 || (e.payType === 'Daily' && a.days > 0));
        if (!incl) return;

        const ops = {};
        L.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { q: 0, a: 0, r: l.rate }); o.q += l.qty; o.a += l.amount; });

        const adv0 = bal > 0
          ? (e.payType === 'Monthly' && e.advInstall ? Math.min(bal, e.advInstall) : bal)
          : 0;

        rows.push(`<tr data-id="${e.id}" data-piece="${pc}" data-bal="${bal}">
          <td><b>${E.esc(e.name)}</b><br><span class="muted">${e.code} · ${e.payType} ${E.m(e.amount)}${e.payType === 'Daily' ? '/day' : '/mo'}</span></td>
          ${monthly
            ? `<td>${inp('nopay', 56, a.absent || '')}</td>`
            : `<td>${inp('days', 56, a.days || '')}</td>`}
          <td class="r">${pc ? `<b>${E.m(pc)}</b><div class="muted" style="font-size:11px;text-align:left">${Object.entries(ops).map(([n, o]) => E.esc(n) + ' ' + o.q + '×' + E.m(o.r)).join('<br>')}</div>` : '—'}</td>
          <td>${inp('ot', 52, a.ot || '')}</td>
          <td>${inp('bonus', 70)}</td>
          <td>${inp('other', 70)}</td>
          <td class="r">${bal ? E.m(bal) : '—'}</td>
          <td>${bal ? inp('adv', 80, adv0 ? (adv0 / 100).toFixed(2) : '') : '<input type="hidden" data-k="adv" value="0">—'}</td>
          <td class="r ab"></td>
          <td>${toSel(e.target || 'OH')}</td>
          <td class="r gv"></td>
          <td class="r nv"></td>
        </tr>`);
      });

    if (!rows.length) {
      E.$('wrb').innerHTML = '<p class="bad">Nobody has earnings for this period.</p>';
      return;
    }

    const head = monthly
      ? '<th>Employee</th><th>No-pay days</th>'
      : '<th>Employee</th><th>Days</th>';

    E.$('wrb').innerHTML = `<div class="tw"><table>
      <thead><tr>
        ${head}
        <th class="r">Piece wages</th><th>OT hrs</th><th>Bonus</th><th>Other ded.</th>
        <th class="r">Advance balance</th><th>Recover now</th><th class="r">After</th>
        <th>Charge to</th><th class="r">Gross</th><th class="r">Net</th>
      </tr></thead>
      <tbody id="wr">${rows.join('')}</tbody>
    </table></div>
    <div class="tot"><span id="w_g"></span></div>
    ${js.length ? `<div class="card"><b>Job split (rows set to “Split across jobs”)</b>${js.map(j => `<div style="display:flex;gap:10px;margin-top:6px"><span style="width:200px">${j.no} ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}</span><input class="wsp" data-id="${j.id}" type="number" step="0.01" placeholder="%" style="width:90px;padding:6px;border:1px solid var(--bd);border-radius:8px"></div>`).join('')}</div>` : ''}
    <p class="muted">${monthly
      ? 'Basic + allowances less no-pay days. OT at 1.5× hourly. Advance recovery optional.'
      : 'Days × rate + piece wages + OT. Advance recovery optional.'} EPF ${E.setting('epfEmp')}% · ETF ${E.setting('etf')}%.</p>`;
    recalc();
  }

  const rowIn = tr => {
    const g = k => { const x = tr.querySelector('[data-k=' + k + ']'); return x ? parseFloat(x.value) || 0 : 0; };
    return {
      days:  g('days'),  nopay: g('nopay'),
      ot:    g('ot'),    bonus: g('bonus'),
      other: g('other'),
      adv:   E.c(tr.querySelector('[data-k=adv]').value),
      to:    tr.querySelector('[data-k=to]').value
    };
  };

  function recalc() {
    let G = 0, N = 0, P = 0;
    document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
      const e   = emp(tr.dataset.id);
      const pc  = +tr.dataset.piece;
      const i   = rowIn(tr);
      const c   = isSalaried(e) ? calcSalary(e, i) : calcWage(e, i, pc);
      const bb  = +tr.dataset.bal;
      tr.querySelector('.gv').textContent = c.gross ? E.m(c.gross) : '';
      tr.querySelector('.nv').textContent = c.gross ? E.m(c.net) : '';
      tr.querySelector('.ab').textContent = bb ? E.m(bb - c.advRec) : '';
      tr.querySelector('.nv').style.color = c.net < 0 ? '#dc2626' : '';
      G += c.gross; N += c.net; P += pc;
    });
    if (E.$('w_g')) E.$('w_g').textContent =
      `Piece wages ${E.m(P)} · Gross ${E.m(G)} · Net pay ${E.m(N)}`;
  }

  E.hooks.push(e => {
    if (e.target.closest && (e.target.closest('#wr') || e.target.id === 'w_t')) recalc();
  });

  /* ---------- save run ---------- */
  E.A.saveRun = async () => {
    try {
      if (!document.querySelectorAll('#wr tr[data-id]').length) throw new Error('Load the run first');
      const w_t_el = document.getElementById('w_t');
      const type   = w_t_el ? w_t_el.value : 'Weekly';
      const monthly = type === 'Monthly';
      const to     = E.val('w_e');
      const L      = [];
      let   split  = [];

      document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
        const e   = emp(tr.dataset.id);
        const i   = rowIn(tr);
        const logs = openLogs(e.id, to).filter(l => l.date >= E.val('w_f'));
        const pc   = monthly ? 0 : logs.reduce((s, l) => s + l.amount, 0);
        const c    = isSalaried(e) ? calcSalary(e, i) : calcWage(e, i, pc);
        const bal  = advBal(e.id);
        if (!c.gross && !i.adv) return;
        if (c.net < 0) throw new Error(e.name + ': deductions exceed pay');
        if (i.adv > bal) throw new Error(e.name + ': recovery exceeds advance balance (' + E.m(bal) + ')');
        const ops = {};
        logs.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { opName: l.opName, qty: 0, amount: 0, rate: l.rate }); o.qty += l.qty; o.amount += l.amount; });
        L.push(Object.assign({
          empId: e.id, name: e.name, payType: e.payType,
          days: i.days || 0, nopay: i.nopay || 0, otHrs: i.ot || 0,
          target: i.to, pieceDetail: Object.values(ops),
          logIds: logs.map(l => l.id),
          advBefore: bal, advAfter: bal - i.adv
        }, c));
      });

      if (!L.length) throw new Error('Nothing to pay');
      if (L.some(l => l.target === 'SPLIT')) {
        split = [...document.querySelectorAll('.wsp')]
          .map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) }))
          .filter(x => x.p > 0);
        if (split.reduce((a, x) => a + x.p, 0) !== 10000)
          throw new Error('Job split must total exactly 100%');
      }

      const dr  = {};
      const add = (acc, job, v, cat) => {
        if (!v) return;
        const k = acc + '|' + job;
        dr[k] = dr[k] || { acc, job, dr: 0, cat };
        dr[k].dr += v;
      };

      L.forEach(l => {
        const oncost   = l.epfCo + l.etf;
        const timeBase = l.basic + l.ot + l.bonus;
        const tot      = l.gross || 1;
        const onP      = Math.round(oncost * l.piece / tot);
        const onT      = oncost - onP;
        const time     = timeBase + onT;

        if (l.piece) {
          add('2210', '', l.piece);
          const byJob = {};
          logsOf(l).forEach(g => { byJob[g.jobId] = (byJob[g.jobId] || 0) + g.amount; });
          let left = onP;
          const ks = Object.keys(byJob);
          ks.forEach((jid, i) => {
            const a = i === ks.length - 1 ? left : Math.round(onP * byJob[jid] / l.piece);
            left -= a;
            add('1310', jid, a, 'Labour');
          });
        }

        if (l.target === 'OH')  add('5270', '', time);
        else if (l.target === 'ADM') add('6050', '', time);
        else if (l.target === 'SPLIT') {
          let left = time;
          split.forEach((s, i) => {
            const a = i === split.length - 1 ? left : Math.round(time * s.p / 10000);
            left -= a;
            add('1310', s.id, a, 'Labour');
          });
        } else add('1310', l.target, time, 'Labour');
      });

      const S   = k => L.reduce((a, l) => a + l[k], 0);
      const G   = S('gross'), ee = S('epfEmp'), ec = S('epfCo'), et = S('etf');
      const ar  = S('advRec'), od = S('otherDed'), net = S('net');
      const no  = await E.next(monthly ? 'SAL' : 'WG');
      const d   = E.val('w_d');

      const lines = Object.values(dr).filter(x => x.dr).map(x => x.acc === '1310'
        ? { acc: '1310', dr: x.dr, job: x.job, cat: 'Labour', head: '5110' }
        : { acc: x.acc, dr: x.dr }
      ).concat([{ acc: '2200', cr: net }]);
      if (ee + ec + et) lines.push({ acc: '2100', cr: ee + ec + et });
      if (ar) lines.push({ acc: '1250', cr: ar });
      if (od) lines.push({ acc: '2230', cr: od });

      const je = await E.post({
        date: d, ref: no,
        narr: `${type} ${monthly ? 'salaries' : 'wages'} ${E.val('w_f')} to ${to}`,
        source: 'payroll', lines
      });
      const run = await E.save('wageRuns', {
        no, kind: 'run', type, date: d, from: E.val('w_f'), to,
        lines: L, split,
        gross: G, epfEmp: ee, epfCo: ec, etf: et,
        advRec: ar, otherDed: od, net,
        jeId: je.id, paid: false, cancelled: false
      });

      for (const l of L) for (const id of l.logIds) {
        const g = E.D.prodLogs.find(x => x.id === id);
        if (!g) continue;
        const b = JSON.parse(JSON.stringify(g));
        g.status = 'paid'; g.runId = run.id; g.runNo = no;
        await E.save('prodLogs', g, b);
      }

      E.closeM(); E.go();
      E.toast(no + ' posted. Pay it with the Pay button.', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- cancel run ---------- */
  E.A.canRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      if (r.paid) throw new Error('Already paid');
      if (!confirm('Cancel ' + r.no + '? Production entries return to “earned, unpaid”.')) return;
      await E.reverse(r.jeId);
      for (const l of r.lines) for (const lid of (l.logIds || [])) {
        const g = E.D.prodLogs.find(x => x.id === lid);
        if (g && g.status === 'paid') {
          const b = JSON.parse(JSON.stringify(g));
          g.status = 'accrued'; g.runId = ''; g.runNo = '';
          await E.save('prodLogs', g, b);
        }
      }
      const b = JSON.parse(JSON.stringify(r));
      r.cancelled = true;
      await E.save('wageRuns', r, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- pay a run ---------- */
  const srcForm = (t, amt, btn, id, note) => E.modal(t, `
    <div class="g2">
      <div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div>
      <div class="f">Amount (Rs) *<input id="z_a" type="number" step="0.01" value="${amt ? amt / 100 : ''}"></div>
    </div>
    <div class="f">Paid from (bank / cash account) *<select id="z_s"><option value="">— select —</option>${E.opts(a => a.bank)}</select></div>
    <p class="muted">${note}</p>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="${btn}" data-id="${id || ''}">Post</button>`);

  const chk = () => {
    const a = E.c(E.val('z_a'));
    const s = E.val('z_s');
    if (a <= 0) throw new Error('Enter an amount');
    if (!s)     throw new Error('Select the account the money is paid from');
    if (E.bal(s) < a && !confirm('Account balance (' + E.m(E.bal(s)) + ') is lower than this payment. Continue?')) return null;
    return { a, s, d: E.val('z_d') };
  };

  E.A.payRun = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    srcForm('Pay ' + (r.type === 'Monthly' ? 'salary' : 'wages') + ' · ' + r.no, r.net, 'savePayRun', id, 'Posts Dr Wages Payable / Cr selected account for the full net pay.');
  };

  E.A.savePayRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      const c = chk();
      if (!c) return;
      if (c.a !== r.net) throw new Error('Pay the full net amount ' + E.m(r.net));
      const no = await E.next('WP');
      const je = await E.post({ date: c.d, ref: no, narr: 'Pay ' + r.no, source: 'payroll', lines: [{ acc: '2200', dr: c.a }, { acc: c.s, cr: c.a }] });
      const b = JSON.parse(JSON.stringify(r));
      r.paid = true; r.payJe = je.no;
      await E.save('wageRuns', r, b);
      E.closeM(); E.go(); E.toast('Paid', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- EPF remittance ---------- */
  E.A.remitM = () => srcForm('Remit EPF/ETF', E.bal('2100'), 'saveRemit', '', 'Posts Dr EPF/ETF Payable / Cr selected account. Balance due: ' + E.m(E.bal('2100')));
  E.A.saveRemit = async () => {
    try {
      const c = chk();
      if (!c) return;
      if (c.a > E.bal('2100')) throw new Error('Amount exceeds EPF/ETF payable');
      const no = await E.next('EPF');
      await E.post({ date: c.d, ref: no, narr: 'EPF/ETF remittance', source: 'payroll', lines: [{ acc: '2100', dr: c.a }, { acc: c.s, cr: c.a }] });
      await E.save('wageRuns', { no, kind: 'remit', date: c.d, amount: c.a });
      E.closeM(); E.go(); E.toast('Remitted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- give advance ---------- */
  E.A.advM = id => {
    const es = E.rows('employees').filter(x => x.active);
    if (!es.length) return E.toast('Add employees first', 'error');
    E.modal('Give advance', `
      <div class="f">Employee *<select id="v_e">${es.map(e => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${E.esc(e.name)} · ${e.payType}${advBal(e.id) > 0 ? ' (owes ' + E.m(advBal(e.id)) + ')' : ''}</option>`).join('')}</select></div>
      <div class="g2">
        <div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount (Rs) *<input id="z_a" type="number" step="0.01"></div>
      </div>
      <div class="f">Paid from (bank / cash account) *<select id="z_s"><option value="">— select —</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
      <div class="f">Reason / note<input id="z_n" placeholder="e.g. Advance against April salary"></div>
      <p class="muted">Posts Dr Employee Advances / Cr selected account. The balance is shown in the next wage/salary run and recovered there.</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveAdv">Post</button>`);
  };

  E.A.saveAdv = async () => {
    try {
      const c = chk();
      if (!c) return;
      const e  = emp(E.val('v_e'));
      const no = await E.next('ADV');
      await E.post({
        date: c.d, ref: no,
        narr: 'Advance · ' + e.name + (E.val('z_n') ? ' · ' + E.val('z_n') : ''),
        source: 'payroll',
        lines: [{ acc: '1250', dr: c.a }, { acc: c.s, cr: c.a }]
      });
      await E.save('wageRuns', { no, kind: 'advance', empId: e.id, date: c.d, amount: c.a, note: E.val('z_n'), cancelled: false });
      E.closeM(); E.go(); E.toast('Advance posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- payslips ---------- */
  E.A.slips = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const f = E.factory();
    const h = `<html><head><title>${r.no}</title><style>
      @page{size:A4;margin:14mm}body{font:13px Arial}
      .s{border:1px solid #444;padding:12px;margin-bottom:16px;page-break-inside:avoid}
      table{width:100%;border-collapse:collapse}
      td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
      .r{text-align:right}th.r{text-align:right}
    </style></head><body>${r.lines.map(l => `<div class="s">
      <b>${E.esc(f.name)}</b> — PAY SLIP<br>
      ${r.type} · ${r.from} to ${r.to} · Paid ${r.date}<br>
      <b>${E.esc(l.name)}</b> (${l.payType})
      <table>
        <tr><td>${l.payType === 'Daily'
          ? 'Daily wages (' + l.days + ' days)'
          : 'Basic salary + allowances' + (l.nopay ? ' (less ' + l.nopay + ' no-pay days)' : '')}</td>
            <td class="r">${E.m(l.basic)}</td></tr>
        ${l.pieceDetail && l.pieceDetail.length ? `<tr><td colspan="2"><b>Piece-rate work</b>
          <table><tr><th>Operation</th><th class="r">Packs</th><th class="r">Rate</th><th class="r">Amount</th></tr>${l.pieceDetail.map(o => `<tr><td>${E.esc(o.opName)}</td><td class="r">${o.qty}</td><td class="r">${E.m(o.rate)}</td><td class="r">${E.m(o.amount)}</td></tr>`).join('')}</table>
        </td></tr>` : ''}
        <tr><td>Overtime${l.otHrs ? ' (' + l.otHrs + ' h)' : ''}</td><td class="r">${E.m(l.ot)}</td></tr>
        ${l.bonus ? `<tr><td>Bonus</td><td class="r">${E.m(l.bonus)}</td></tr>` : ''}
        <tr><td><b>Gross</b></td><td class="r"><b>${E.m(l.gross)}</b></td></tr>
        <tr><td>EPF (employee)</td><td class="r">-${E.m(l.epfEmp)}</td></tr>
        <tr><td>Advance recovery</td><td class="r">-${E.m(l.advRec)}</td></tr>
        ${l.otherDed ? `<tr><td>Other deductions</td><td class="r">-${E.m(l.otherDed)}</td></tr>` : ''}
        <tr><td><b>Net pay</b></td><td class="r"><b>${E.m(l.net)}</b></td></tr>
        ${l.advBefore ? `<tr><td>Advance balance before / after</td><td class="r">${E.m(l.advBefore)} → <b>${E.m(l.advAfter)}</b></td></tr>` : ''}
      </table>
      <br>Signature: ____________________
    </div>`).join('')}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups to print', 'error');
    w.document.write(h);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  /* ---------- salary sheet ---------- */
  E.A.salSheet = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups to print', 'error');
    const S = k => r.lines.reduce((a, l) => a + (l[k] || 0), 0);
    const c = (v, b) => '<td class="r">' + (b ? '<b>' : '') + E.m(v || 0) + (b ? '</b>' : '') + '</td>';
    w.document.write(`<html><head><title>${r.no}</title><style>
      @page{size:A4 landscape;margin:10mm}body{font:11px Arial}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px}
      th{background:#eee}.r{text-align:right}
    </style></head><body>
      <h3>${E.esc(E.factory().name)} — ${r.type === 'Monthly' ? 'SALARY SHEET' : 'WAGE SHEET'}</h3>
      <p><b>${r.no}</b> · Period ${r.from} to ${r.to} · Pay date ${r.date}</p>
      <table>
        <tr>
          <th>#</th><th>Employee</th>
          ${r.type === 'Monthly' ? '<th>No-pay days</th>' : '<th>Days</th>'}
          <th>Basic</th><th>Piece</th><th>OT</th><th>Bonus</th><th>Gross</th>
          <th>EPF</th><th>Advance</th><th>Other</th><th>Net</th>
          <th>Advance Balance</th><th>Signature</th>
        </tr>
        ${r.lines.map((l, i) => `<tr>
          <td>${i + 1}</td><td>${E.esc(l.name)}</td>
          <td>${r.type === 'Monthly' ? (l.nopay || 0) : (l.days || 0)}</td>
          ${c(l.basic)}${c(l.piece)}${c(l.ot)}${c(l.bonus)}${c(l.gross)}
          ${c(l.epfEmp)}${c(l.advRec)}${c(l.otherDed)}${c(l.net, 1)}${c(l.advAfter)}<td></td>
        </tr>`).join('')}
        <tr><td colspan="3"><b>TOTAL</b></td>
          ${c(S('basic'), 1)}${c(S('piece'), 1)}${c(S('ot'), 1)}${c(S('bonus'), 1)}${c(S('gross'), 1)}
          ${c(S('epfEmp'), 1)}${c(S('advRec'), 1)}${c(S('otherDed'), 1)}${c(S('net'), 1)}${c(S('advAfter'), 1)}<td></td>
        </tr>
      </table>
      <p>Employer EPF ${E.m(r.epfCo || 0)} · ETF ${E.m(r.etf || 0)} · Total cost to company ${E.m((r.gross || 0) + (r.epfCo || 0) + (r.etf || 0))}</p>
      <p style="margin-top:50px">Prepared by ____________ &nbsp; Checked by ____________ &nbsp; Approved by ____________</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  /* ======================================================================
     EMPLOYEE LEDGER — unified per-employee history
     ====================================================================== */
  const L = { emp: '', from: E.today().slice(0, 4) + '-01-01', to: E.today() };

  function ledgerEvents(id) {
    const ev = [];

    E.rows('prodLogs').filter(l => l.empId === id && l.status !== 'cancelled').forEach(l => {
      ev.push({ d: l.date, k: 'Production',
        t: l.opName + ' · ' + l.code + ' · ' + l.qty + ' packs × ' + E.m(l.rate),
        earn: l.amount, adv: 0, pay: 0, ref: l.no });
    });

    runs().filter(r => !r.cancelled).forEach(r => {
      const x = r.lines.find(l => l.empId === id);
      if (!x) return;
      const kind = r.type === 'Monthly' ? 'Salary run' : 'Wage run';
      ev.push({ d: r.date, k: kind,
        t: r.no + ' · ' + r.from + ' → ' + r.to + ' · gross ' + E.m(x.gross) +
           (x.piece ? ' (incl. piece ' + E.m(x.piece) + ')' : '') +
           (x.ot ? ' · OT ' + E.m(x.ot) : '') +
           (x.bonus ? ' · bonus ' + E.m(x.bonus) : '') +
           (x.nopay ? ' · no-pay days ' + x.nopay : '') +
           (x.epfEmp ? ' · EPF ' + E.m(x.epfEmp) : '') +
           (x.otherDed ? ' · other ded. ' + E.m(x.otherDed) : ''),
        earn: x.payType === 'Daily' || x.payType === 'Monthly' ? x.gross - (x.piece || 0) : 0,
        adv: -x.advRec, pay: 0, ref: r.no, net: x.net });
      if (r.paid) {
        ev.push({ d: r.date,
          k: r.type === 'Monthly' ? 'Salary paid' : 'Wages paid',
          t: 'Net pay ' + r.no, earn: 0, adv: 0, pay: x.net, ref: r.payJe || r.no });
      }
    });

    E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).forEach(r => {
      ev.push({ d: r.date, k: 'Advance', t: r.note || 'Advance given',
        earn: 0, adv: r.amount, pay: 0, ref: r.no });
    });

    return ev.sort((a, b) => a.d.localeCompare(b.d));
  }

  E.route('empledger', 'Employee Ledger', () => {
    const es = E.rows('employees').sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!L.emp && es.length) L.emp = es[0].id;
    const e = emp(L.emp);
    if (!e) return '<div class="card muted">Add employees first.</div>';

    const ev    = ledgerEvents(e.id);
    const ins   = ev.filter(x => x.d >= L.from && x.d <= L.to);
    const before = ev.filter(x => x.d < L.from).reduce((s, x) => s + x.adv, 0);
    let   ab     = before;

    const paid  = ev.reduce((s, x) => s + x.pay, 0);
    const paidS = ev.filter(x => x.k === 'Salary paid').reduce((s, x) => s + x.pay, 0);
    const pend  = runs().filter(r => !r.cancelled && !r.paid)
      .reduce((s, r) => s + ((r.lines.find(l => l.empId === e.id) || {}).net || 0), 0);
    const unpaidP = openLogs(e.id).reduce((s, l) => s + l.amount, 0);

    return `<div class="bar">
      <select class="fs" data-f="el.emp" style="min-width:240px">${es.map(x => `<option value="${x.id}" ${x.id === L.emp ? 'selected' : ''}>${E.esc(x.code + ' — ' + x.name)}</option>`).join('')}</select>
      <span class="muted">From</span><input type="date" class="fs" data-f="el.from" value="${L.from}">
      <span class="muted">to</span><input type="date" class="fs" data-f="el.to" value="${L.to}">
      <span class="gap"></span>
      <button class="btn" data-a="elPrint">🖨 Statement</button>
      <button class="btn" data-a="advM" data-id="${e.id}">Give advance</button>
    </div>
    <div class="kp">
      ${E.kpi(e.payType === 'Daily' ? 'Daily rate' : 'Monthly salary', E.m(e.amount), e.allow ? '+ allowances ' + E.m(e.allow) : '')}
      ${E.kpi('Advance balance', E.m(advBal(e.id)), 'Given ' + E.m(advGiven(e.id)) + ' · recovered ' + E.m(advRec(e.id)))}
      ${E.kpi('Piece wages unpaid', E.m(unpaidP), 'Not yet in a wage run')}
      ${E.kpi('Wages paid', E.m(paid - paidS), 'Piece & daily wage runs')}
      ${E.kpi('Salary paid', E.m(paidS), 'Monthly salary runs')}
      ${E.kpi('Posted, not yet paid', E.m(pend), 'Net pay waiting')}
    </div>
    <div class="tw" id="elt"><table>
      <thead><tr>
        <th>Date</th><th>Type</th><th>Details</th>
        <th class="r">Earned</th><th class="r">Advance given</th>
        <th class="r">Advance recovered</th><th class="r">Paid out</th>
        <th class="r">Advance balance</th>
      </tr></thead>
      <tbody>
        <tr><td colspan="7" class="muted">Advance balance brought forward</td><td class="r"><b>${E.m(before)}</b></td></tr>
        ${ins.map(x => {
          ab += x.adv;
          return `<tr>
            <td>${x.d}</td>
            <td><span class="tag">${x.k}</span></td>
            <td>${E.esc(x.t)}</td>
            <td class="r">${x.earn ? E.m(x.earn) : ''}</td>
            <td class="r">${x.adv > 0 ? E.m(x.adv) : ''}</td>
            <td class="r">${x.adv < 0 ? E.m(-x.adv) : ''}</td>
            <td class="r">${x.pay ? E.m(x.pay) : ''}</td>
            <td class="r"><b>${E.m(ab)}</b></td>
          </tr>`;
        }).join('') || '<tr><td colspan="8" class="muted">No activity in this period</td></tr>'}
      </tbody>
    </table></div>`;
  });

  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f && f.startsWith('el.')) { L[f.slice(3)] = e.target.value; E.go(); }
  });

  E.A.elPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups to print', 'error');
    const e = emp(L.emp);
    w.document.write(`<html><head><title>Statement</title><style>
      body{font:13px Arial;margin:16px}
      table{width:100%;border-collapse:collapse}
      td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      .r{text-align:right}
    </style></head><body>
      <h3>${E.esc(E.factory().name)} — Employee statement</h3>
      <p><b>${E.esc(e.name)}</b> (${E.esc(e.code)}) · ${L.from} to ${L.to}</p>
      ${E.$('elt').innerHTML}
    </body></html>`);
    w.document.close();
    w.print();
  };

})(window.ERP);