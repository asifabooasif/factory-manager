/* PART 6 (v6) — Payroll: Wages = production for ALL employees; Salaries = separate fixed modules.

   KEY PRINCIPLE:
   ┌───────────────────────────────────────────────────────────────────────┐
   │  WAGES  = production-based earnings for ANYONE who produced           │
   │  ── Wage Worker       : days × rate + piece + OT + bonus             │
   │  ── Monthly Salaried  : piece + bonus only (base salary is separate)│
   │  ── Daily Salaried    : piece + bonus only (base salary is separate)│
   │  ── NO advances, NO salary mixing — two separate income streams      │
   │                                                                       │
   │  DAILY SALARIES  = fixed daily base pay for Daily-Salaried only       │
   │  MONTHLY SALARIES = fixed monthly base pay for Monthly-Salaried only  │
   │  ADVANCES = salaried workers only, recovered ONLY in salary modules   │
   └───────────────────────────────────────────────────────────────────────┘

   Same employee can appear in multiple modules in the same month:
     Nimal (Monthly Salaried) → May salary run + May wage run (piece work)
     Kamal (Daily Salaried)   → May daily salary records + May wage run
     Sunil (Wage Worker)      → May wage run (attendance days + piece)
*/

(E => {
  /* ── remove legacy routes ── */
  ['payroll', 'salary', 'empledger'].forEach(id => {
    let i = E.N.findIndex(n => n.id === id);
    while (i >= 0) { E.N.splice(i, 1); i = E.N.findIndex(n => n.id === id); }
    if (E.R[id]) delete E.R[id];
  });

  E.nav('People & Payroll', 'wages', '💰', 'Wages');
  E.nav('People & Payroll', 'daily-salaries', '📅', 'Daily Salaries');
  E.nav('People & Payroll', 'monthly-salaries', '💼', 'Monthly Salaries');
  E.nav('People & Payroll', 'empledger', '📒', 'Employee Ledger');

  /* ── classification ── */
  const payCat = e => {
    const pt = (e && e.payType) || 'Wage';
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'MonthlySalaried';
    if (pt === 'DailySalaried') return 'DailySalaried';
    return 'Wage';
  };
  const isWage = e => payCat(e) === 'Wage';
  const isDailySal = e => payCat(e) === 'DailySalaried';
  const isMonthlySal = e => payCat(e) === 'MonthlySalaried';
  const isSalaried = e => !isWage(e);
  const CAT_LABEL = { Wage: 'Wage', DailySalaried: 'Daily Salary', MonthlySalaried: 'Monthly Salary' };
  const CAT_STYLE = {
    Wage: '',
    DailySalaried: 'background:#dbeafe;color:#1e40af',
    MonthlySalaried: 'background:#f3e8ff;color:#7c3aed'
  };
  const payBadge = e => `<span class="tag" style="${CAT_STYLE[payCat(e)]}">${CAT_LABEL[payCat(e)]}</span>`;

  const emp = id => E.D.employees.find(x => x.id === id);
  const act = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const runs = () => E.rows('wageRuns').filter(r => r.kind === 'run' || r.kind === 'daily-salary');

  /* ── advances ── */
  const advGiven = id => E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).reduce((s, r) => s + r.amount, 0);
  const advRec = id => runs().filter(r => !r.cancelled).reduce((s, r) => {
    if (r.kind === 'run') return s + (r.lines || []).filter(l => l.empId === id).reduce((a, l) => a + (l.advRec || 0), 0);
    if (r.kind === 'daily-salary' && r.empId === id) return s + (r.advRec || 0);
    return s;
  }, 0);
  const advBal = id => advGiven(id) - advRec(id);
  E.advBal = advBal;

  const att = (id, from, to) => {
    const A = E.rows('attendance').filter(a => a.empId === id && a.date >= from && a.date <= to);
    return {
      days: A.filter(a => a.status === 'Present').length + A.filter(a => a.status === 'Half day').length / 2,
      absent: A.filter(a => a.status === 'Absent').length,
      ot: A.reduce((s, a) => s + (a.ot || 0), 0),
      marked: A.length
    };
  };

  const openLogs = (id, to) => E.rows('prodLogs').filter(l => l.empId === id && l.status === 'accrued' && (!to || l.date <= to));
  const logsOf = l => (l.logIds || []).map(id => E.D.prodLogs.find(x => x.id === id)).filter(Boolean);

  /* ═══════════════════════════════════════════════════════════════
     WAGES MODULE — for ANY employee with production activity
     ═══════════════════════════════════════════════════════════════ */
  const WF = { tab: 'register', from: E.today().slice(0, 8) + '01', to: E.today() };

  E.route('wages', 'Wages', () => {
    const tab = WF.tab;
    return `<div class="kp">
      ${E.kpi('Wage Workers', E.rows('employees').filter(e => e.active && isWage(e)).length, 'paid by attendance + piece')}
      ${E.kpi('Salaried with piece', E.rows('employees').filter(e => e.active && isSalaried(e) && E.rows('prodLogs').some(l => l.empId === e.id && l.status === 'accrued')).length, 'also earning piece wages')}
      ${E.kpi('Piece wages unpaid', E.m(E.bal('2210')), 'Ledger 2210')}
      ${E.kpi('Wages payable', E.m(E.bal('2200')), 'Net pay not yet paid')}
    </div>
    <div class="card">
      <p class="muted" style="margin-bottom:12px">
        <b>Wage runs pay production-based earnings to any employee who produced work in the period.</b>
        Wage workers receive days × rate + piece + OT. Salaried workers receive only piece + bonus —
        their base salary is paid separately in Daily or Monthly Salaries.
      </p>
    </div>
    <div class="bar">
      <button class="btn ${tab === 'register' ? 'p' : ''}" data-a="wfTab" data-id="register">📋 Wage Register</button>
      <button class="btn ${tab === 'daily' ? 'p' : ''}" data-a="wfTab" data-id="daily">📅 Wage Worker Attendance</button>
      <button class="btn ${tab === 'piece' ? 'p' : ''}" data-a="wfTab" data-id="piece">🧵 Piece Work (all)</button>
      <span class="gap"></span>
      <button class="btn" data-a="remitM">Remit EPF/ETF</button>
      <button class="btn p" data-a="newWageRun">+ New Wage Run</button>
    </div>
    <div id="wfBody">${tab === 'register' ? wageReg() : tab === 'daily' ? wageDaily() : wagePiece()}</div>`;
  });

  E.A.wfTab = t => { WF.tab = t; E.go(); };
  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.wf;
    if (f && WF[f] !== undefined) {
      WF[f] = e.target.value;
      if (E.$('wfBody')) E.$('wfBody').innerHTML = WF.tab === 'daily' ? wageDaily() : wagePiece();
    }
  });

  function wageReg() {
    const R = E.rows('wageRuns').filter(r => r.kind === 'run' && r.type !== 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr><th>Run</th><th>Type</th><th>Period</th>
        <th class="r">Workers</th><th class="r">Piece</th><th class="r">Days</th>
        <th class="r">Gross</th><th class="r">Net</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map(r => {
        const piece = r.lines.reduce((s, l) => s + (l.piece || 0), 0);
        const days = r.lines.reduce((s, l) => s + (l.days || 0), 0);
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td><b>${r.no}</b></td><td><span class="tag">${r.type}</span></td>
          <td>${r.from} → ${r.to}</td>
          <td class="r">${r.lines.length}</td>
          <td class="r">${E.m(piece)}</td>
          <td class="r">${Math.round(days * 10) / 10}</td>
          <td class="r">${E.m(r.gross)}</td>
          <td class="r"><b>${E.m(r.net)}</b></td>
          <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
          <td class="r">
            <button class="btn sm" data-a="slips" data-id="${r.id}">Slips</button>
            ${!r.cancelled && !r.paid ? `<button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button>
              <button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>` : ''}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No wage runs yet</td></tr>'}</tbody>
    </table></div>`;
  }

  function wageDaily() {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees').filter(e => e.active && isWage(e))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const rows = workers.map(e => {
      const a = att(e.id, from, to);
      const base = Math.round(a.days * (e.amount || 0));
      const hourly = (e.amount || 0) / 8;
      const ot = Math.round(a.ot * hourly * 1.5);
      return { e, a, base, ot, total: base + ot };
    }).filter(x => x.a.marked > 0);
    const grand = rows.reduce((s, x) => s + x.total, 0);
    return `<div class="card">
      <h3>Wage-Worker Attendance Wages</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
      </div>
      <p class="muted">Only wage workers get a day-based base rate. Salaried staff receive their base elsewhere.</p>
      <div class="tw"><table>
        <thead><tr><th>Worker</th><th class="r">Days</th><th class="r">Rate</th>
          <th class="r">Base</th><th class="r">OT Hrs</th><th class="r">OT Pay</th>
          <th class="r">Total</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td><b>${E.esc(x.e.name)}</b> ${payBadge(x.e)}<br><span class="muted">${x.e.code}</span></td>
          <td class="r">${x.a.days}</td><td class="r">${E.m(x.e.amount)}</td>
          <td class="r">${E.m(x.base)}</td><td class="r">${x.a.ot}</td>
          <td class="r">${E.m(x.ot)}</td><td class="r"><b>${E.m(x.total)}</b></td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">No attendance for this period</td></tr>'}
        ${rows.length ? `<tr style="background:var(--s2)"><td colspan="6" class="r"><b>Total</b></td>
          <td class="r"><b>${E.m(grand)}</b></td></tr>` : ''}</tbody>
      </table></div>
    </div>`;
  }

  function wagePiece() {
    const from = WF.from, to = WF.to;
    const workers = E.rows('employees').filter(e => e.active)
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const rows = workers.map(e => {
      const logs = openLogs(e.id, to).filter(l => l.date >= from);
      const amount = logs.reduce((s, l) => s + l.amount, 0);
      const packs = logs.reduce((s, l) => s + l.qty, 0);
      return { e, amount, packs, count: logs.length };
    }).filter(x => x.count > 0);
    const grand = rows.reduce((s, x) => s + x.amount, 0);
    return `<div class="card">
      <h3>Unpaid Piece Work — All Employees</h3>
      <div class="bar">
        <div class="f" style="margin:0">From <input class="fs" type="date" data-wf="from" value="${from}"></div>
        <div class="f" style="margin:0">To <input class="fs" type="date" data-wf="to" value="${to}"></div>
      </div>
      <p class="muted">Includes salaried staff who also perform production work.</p>
      <div class="tw"><table>
        <thead><tr><th>Worker</th><th>Type</th><th class="r">Entries</th><th class="r">Packs</th>
          <th class="r">Amount</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td><b>${E.esc(x.e.name)}</b><br><span class="muted">${x.e.code}</span></td>
          <td>${payBadge(x.e)}</td>
          <td class="r">${x.count}</td><td class="r">${x.packs}</td>
          <td class="r"><b>${E.m(x.amount)}</b></td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">No unpaid piece work</td></tr>'}
        ${rows.length ? `<tr style="background:var(--s2)"><td colspan="4" class="r"><b>Total</b></td>
          <td class="r"><b>${E.m(grand)}</b></td></tr>` : ''}</tbody>
      </table></div>
    </div>`;
  }

  /* ── WAGE RUN CREATION ── */
  const W = { date: E.today() };
  const inp = (k, w, v) => `<input class="pw" data-k="${k}" type="number" step="0.01" value="${v || ''}" style="width:${w || 64}px;padding:6px;border:1px solid var(--bd);border-radius:8px">`;

  E.A.newWageRun = () => {
    if (!E.rows('employees').some(x => x.active)) return E.toast('Add employees first', 'error');
    E.modal('New Wage Run', `
      <div class="g2">
        <div class="f">Run type<select id="w_t"><option>Weekly</option><option>Fortnightly</option><option>Daily</option></select></div>
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <div class="bar">
        <button class="btn p" data-a="loadWageSelect">📋 Select employees with production</button>
        <span class="muted">Wage workers + salaried staff who did piece work</span>
      </div>
      <div id="wrb"><p class="muted">Choose the period, then select employees.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveWageRun">Post wage run</button>`, 1);
  };

  E.A.loadWageSelect = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    if (!f || !to || f > to) return E.toast('Check the period dates', 'error');
    const allEmps = E.rows('employees').filter(x => x.active)
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    const rows = allEmps.map(e => {
      const logs = openLogs(e.id, to).filter(l => l.date >= f);
      const pc = logs.reduce((s, l) => s + l.amount, 0);
      const a = att(e.id, f, to);
      const isW = isWage(e);
      const hasActivity = pc > 0 || (isW && a.days > 0);
      const checked = hasActivity ? 'checked' : '';
      const explanation = isW
        ? (a.days > 0 && pc > 0 ? 'days × rate + piece'
          : a.days > 0 ? 'days × rate only'
            : pc > 0 ? 'piece only'
              : 'no activity')
        : (pc > 0 ? 'piece only (salary separate)' : 'no piece work — not needed');
      return `<tr data-id="${e.id}" class="emp-row" data-default="${hasActivity ? '1' : '0'}">
        <td><input type="checkbox" class="emp-cb" ${checked}></td>
        <td><b>${E.esc(e.name)}</b> ${payBadge(e)}<br><span class="muted">${e.code}</span></td>
        <td class="r">${isW ? a.days : '—'}</td>
        <td class="r">${pc ? E.m(pc) : '—'}</td>
        <td class="r">${isW ? E.m(e.amount) : '—'}</td>
        <td class="muted" style="font-size:11px">${explanation}</td>
      </tr>`;
    }).join('');

    E.$('wrb').innerHTML = `<div class="card">
      <p style="margin-bottom:12px"><b>Select which employees to include in this wage run.</b><br>
      <span class="muted" style="font-size:12px">
        ✓ Wage workers with attendance or piece work<br>
        ✓ Salaried staff with piece work (salary handled separately)
      </span></p>
      <div class="bar" style="margin-bottom:8px">
        <button class="btn sm" data-a="selectAllEmps" data-id="1">Select All</button>
        <button class="btn sm" data-a="selectAllEmps" data-id="0">Clear All</button>
        <button class="btn sm" data-a="selectDefaultEmps">Select with Activity</button>
      </div>
      <div class="tw"><table>
        <thead><tr><th></th><th>Employee</th><th class="r">Days</th>
          <th class="r">Piece</th><th class="r">Rate</th><th>Will pay</th></tr></thead>
        <tbody id="empList">${rows}</tbody>
      </table></div>
      <button class="btn p" data-a="buildWageRun" style="margin-top:12px">➡️ Continue — Build Calculations</button>
    </div>`;
  };

  E.A.selectAllEmps = v => document.querySelectorAll('.emp-cb').forEach(cb => cb.checked = v === '1');
  E.A.selectDefaultEmps = () => document.querySelectorAll('.emp-row').forEach(tr => {
    tr.querySelector('.emp-cb').checked = tr.dataset.default === '1';
  });

  E.A.buildWageRun = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    const ids = [...document.querySelectorAll('.emp-row')]
      .filter(tr => tr.querySelector('.emp-cb').checked)
      .map(tr => tr.dataset.id);
    if (!ids.length) return E.toast('Select at least one employee', 'error');

    const js = act();
    const toSel = d => `<select data-k="to" style="padding:6px;border:1px solid var(--bd);border-radius:8px;max-width:150px">
      <option value="OH" ${d === 'OH' ? 'selected' : ''}>Factory overhead</option>
      <option value="ADM" ${d === 'ADM' ? 'selected' : ''}>Admin</option>
      ${js.length ? '<option value="SPLIT">Split across jobs</option>' : ''}
      ${js.map(j => `<option value="${j.id}">${j.no} (100%)</option>`).join('')}
    </select>`;

    const rows = ids.map(id => {
      const e = emp(id);
      const cat = payCat(e);
      const isW = cat === 'Wage';
      const logs = openLogs(e.id, to).filter(l => l.date >= f);
      const pc = logs.reduce((s, l) => s + l.amount, 0);
      const a = att(e.id, f, to);
      const ops = {};
      logs.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { q: 0, a: 0, r: l.rate }); o.q += l.qty; o.a += l.amount; });

      /* piece breakdown cell (shared) */
      const pieceCell = pc
        ? `<b>${E.m(pc)}</b><div class="muted" style="font-size:11px;text-align:left">${Object.entries(ops).map(([n, o]) => E.esc(n) + ' ' + o.q + '×' + E.m(o.r)).join('<br>')}</div>`
        : '—';

      if (isW) {
        /* full wage row */
        return `<tr data-id="${e.id}" data-piece="${pc}" data-kind="wage">
          <td><b>${E.esc(e.name)}</b> ${payBadge(e)}<br><span class="muted">${e.code} · ${E.m(e.amount)}/day</span></td>
          <td>${inp('days', 56, a.days || '')}</td>
          <td class="r">${pieceCell}</td>
          <td>${inp('ot', 52, a.ot || '')}</td>
          <td>${inp('bonus', 70)}</td>
          <td>${inp('other', 70)}</td>
          <td>${toSel(e.target || 'OH')}</td>
          <td class="r gv"></td>
          <td class="r nv"></td>
        </tr>`;
      } else {
        /* salaried row — only piece + bonus (base handled elsewhere) */
        return `<tr data-id="${e.id}" data-piece="${pc}" data-kind="salaried">
          <td><b>${E.esc(e.name)}</b> ${payBadge(e)}<br><span class="muted">${e.code} · salary paid separately</span></td>
          <td class="muted" style="text-align:center">—</td>
          <td class="r">${pieceCell}</td>
          <td class="muted" style="text-align:center">—</td>
          <td>${inp('bonus', 70)}</td>
          <td>${inp('other', 70)}</td>
          <td>${toSel(e.target || 'OH')}</td>
          <td class="r gv"></td>
          <td class="r nv"></td>
        </tr>`;
      }
    }).join('');

    E.$('wrb').innerHTML = `<div class="tw"><table>
      <thead><tr>
        <th>Employee</th><th>Days</th><th class="r">Piece wages</th>
        <th>OT hrs</th><th>Bonus</th><th>Other ded.</th>
        <th>Charge to</th><th class="r">Gross</th><th class="r">Net</th>
      </tr></thead>
      <tbody id="wr">${rows}</tbody>
    </table></div>
    <div class="tot"><span id="w_g"></span></div>
    ${js.length ? `<div class="card"><b>Job split (% of time-wages)</b>${js.map(j => `<div style="display:flex;gap:10px;margin-top:6px"><span style="width:200px">${j.no} ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}</span><input class="wsp" data-id="${j.id}" type="number" step="0.01" placeholder="%" style="width:90px;padding:6px;border:1px solid var(--bd);border-radius:8px"></div>`).join('')}</div>` : ''}
    <p class="muted">
      <b>Wage workers:</b> days × rate + piece + OT + bonus − EPF − other.<br>
      <b>Salaried staff:</b> piece + bonus only (base salary paid in their own module).<br>
      <b>Advances:</b> never deducted in wage runs.
    </p>`;
    recalcWage();
  };

  function recalcWage() {
    let G = 0, N = 0, P = 0;
    document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
      const e = emp(tr.dataset.id);
      const pc = +tr.dataset.piece;
      const kind = tr.dataset.kind;
      const i = rowIn(tr);

      let basic = 0, ot = 0, bonus = E.c(i.bonus || 0), gross = 0;
      if (kind === 'wage') {
        basic = Math.round((i.days || 0) * (e.amount || 0));
        const hourly = (e.amount || 0) / 8;
        ot = Math.round((i.ot || 0) * hourly * 1.5);
        gross = basic + pc + ot + bonus;
      } else {
        gross = pc + bonus;
      }
      const on = E.setting('epfOn') && e.epf;
      const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
      const od = E.c(i.other || 0);
      const net = gross - ee - od;

      tr.querySelector('.gv').textContent = gross ? E.m(gross) : '';
      tr.querySelector('.nv').textContent = gross ? E.m(net) : '';
      tr.querySelector('.nv').style.color = net < 0 ? '#dc2626' : '';
      G += gross; N += net; P += pc;
    });
    if (E.$('w_g')) E.$('w_g').textContent = `Piece ${E.m(P)} · Gross ${E.m(G)} · Net ${E.m(N)}`;
  }

  const rowIn = tr => {
    const g = k => { const x = tr.querySelector('[data-k=' + k + ']'); return x ? parseFloat(x.value) || 0 : 0; };
    return { days: g('days'), ot: g('ot'), bonus: g('bonus'), other: g('other'), to: tr.querySelector('[data-k=to]').value };
  };

  E.hooks.push(e => {
    if (!(e.target.closest && e.target.closest('#wr'))) return;
    recalcWage();
  });

  E.A.saveWageRun = async () => {
    try {
      if (!document.querySelectorAll('#wr tr[data-id]').length) throw new Error('Build calculations first');
      const w_t = document.getElementById('w_t');
      const type = w_t ? w_t.value : 'Weekly';
      const to = E.val('w_e');
      const L = [];
      let split = [];

      document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
        const e = emp(tr.dataset.id);
        const i = rowIn(tr);
        const kind = tr.dataset.kind;
        const logs = openLogs(e.id, to).filter(l => l.date >= E.val('w_f'));
        const pc = logs.reduce((s, l) => s + l.amount, 0);
        const on = E.setting('epfOn') && e.epf;

        let basic = 0, ot = 0;
        if (kind === 'wage') {
          basic = Math.round((i.days || 0) * (e.amount || 0));
          const hourly = (e.amount || 0) / 8;
          ot = Math.round((i.ot || 0) * hourly * 1.5);
        }
        const bonus = E.c(i.bonus || 0);
        const gross = basic + pc + ot + bonus;
        if (!gross) return;

        const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
        const ec = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
        const et = on ? Math.round(gross * E.setting('etf') / 100) : 0;
        const od = E.c(i.other || 0);
        const net = gross - ee - od;

        if (net < 0) throw new Error(e.name + ': deductions exceed pay');

        const ops = {};
        logs.forEach(l => { const o = ops[l.opName] || (ops[l.opName] = { opName: l.opName, qty: 0, amount: 0, rate: l.rate }); o.qty += l.qty; o.amount += l.amount; });

        L.push({
          empId: e.id, name: e.name, payType: e.payType, payCat: kind,
          basic, piece: pc, ot, bonus, gross,
          epfEmp: ee, epfCo: ec, etf: et, advRec: 0, otherDed: od, net,
          days: i.days || 0, nopay: 0, otHrs: i.ot || 0,
          target: i.to, pieceDetail: Object.values(ops), logIds: logs.map(l => l.id),
          advBefore: advBal(e.id), advAfter: advBal(e.id)
        });
      });

      if (!L.length) throw new Error('Nothing to pay');
      if (L.some(l => l.target === 'SPLIT')) {
        split = [...document.querySelectorAll('.wsp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
        if (split.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Job split must total 100%');
      }

      const dr = {};
      const add = (acc, job, v, cat) => {
        if (!v) return;
        const k = acc + '|' + job;
        dr[k] = dr[k] || { acc, job, dr: 0, cat };
        dr[k].dr += v;
      };

      L.forEach(l => {
        const oncost = l.epfCo + l.etf;
        const timeBase = l.basic + l.ot + l.bonus;
        const tot = l.gross || 1;
        const onP = Math.round(oncost * l.piece / tot);
        const onT = oncost - onP;
        const time = timeBase + onT;

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
        if (!time) return;
        if (l.target === 'OH') add('5270', '', time);
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

      const S = k => L.reduce((a, l) => a + l[k], 0);
      const G = S('gross'), ee = S('epfEmp'), ec = S('epfCo'), et = S('etf');
      const od = S('otherDed'), net = S('net');
      const no = await E.next('WG');
      const d = E.val('w_d');

      const lines = Object.values(dr).filter(x => x.dr).map(x =>
        x.acc === '1310'
          ? { acc: '1310', dr: x.dr, job: x.job, cat: 'Labour', head: '5110' }
          : { acc: x.acc, dr: x.dr }
      ).concat([{ acc: '2200', cr: net }]);
      if (ee + ec + et) lines.push({ acc: '2100', cr: ee + ec + et });
      if (od) lines.push({ acc: '2230', cr: od });

      const je = await E.post({
        date: d, ref: no,
        narr: `${type} wages ${E.val('w_f')} to ${to}`,
        source: 'payroll', lines
      });
      const run = await E.save('wageRuns', {
        no, kind: 'run', type, date: d, from: E.val('w_f'), to,
        lines: L, split,
        gross: G, epfEmp: ee, epfCo: ec, etf: et,
        advRec: 0, otherDed: od, net,
        jeId: je.id, paid: false, cancelled: false
      });

      for (const l of L) for (const id of l.logIds) {
        const g = E.D.prodLogs.find(x => x.id === id);
        if (!g) continue;
        const b = JSON.parse(JSON.stringify(g));
        g.status = 'paid'; g.runId = run.id; g.runNo = no;
        await E.save('prodLogs', g, b);
      }
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ═══════════════════════════════════════════════════════════════
     DAILY SALARIES MODULE
     ═══════════════════════════════════════════════════════════════ */
  E.route('daily-salaries', 'Daily Salaries', () => {
    const R = E.rows('wageRuns').filter(r => r.kind === 'daily-salary').sort((a, b) => b.no.localeCompare(a.no));
    const emps = E.rows('employees').filter(e => e.active && isDailySal(e));
    const month = E.today().slice(0, 7);
    return `<div class="kp">
      ${E.kpi('Daily-Salaried Staff', emps.length, 'active')}
      ${E.kpi('Records this month', R.filter(r => r.date.slice(0, 7) === month && !r.cancelled).length)}
      ${E.kpi('Paid this month', E.m(R.filter(r => r.date.slice(0, 7) === month && !r.cancelled).reduce((s, r) => s + r.net, 0)))}
      ${E.kpi('Advance balance', E.m(emps.reduce((s, e) => s + advBal(e.id), 0)), 'across all daily-salaried')}
    </div>
    <div class="bar">
      <span class="gap"></span>
      <button class="btn p" data-a="newDailySalary">+ Record Daily Salary</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Date</th><th>Employee</th><th>Period</th>
        <th class="r">Days</th><th class="r">Rate</th><th class="r">Gross</th>
        <th class="r">Advance</th><th class="r">Net</th><th></th></tr></thead>
      <tbody>${R.map(r => {
        const e = emp(r.empId) || { name: 'Unknown' };
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td><b>${r.no}</b></td><td>${r.date}</td>
          <td>${E.esc(e.name)}<br><span class="muted">${e.code || ''}</span></td>
          <td>${r.from} → ${r.to}</td>
          <td class="r">${r.days}</td><td class="r">${E.m(r.rate)}</td>
          <td class="r">${E.m(r.gross)}</td>
          <td class="r">${r.advRec ? E.m(r.advRec) : '—'}</td>
          <td class="r"><b>${E.m(r.net)}</b></td>
          <td class="r">
            <button class="btn sm" data-a="dailyPrint" data-id="${r.id}">Receipt</button>
            ${!r.cancelled ? `<button class="btn sm d" data-a="dailyCancel" data-id="${r.id}">Cancel</button>` : ''}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No daily salary records yet</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Daily-salaried workers are paid a fixed daily amount, separate from wage runs.</p>`;
  });

  E.A.newDailySalary = () => {
    const emps = E.rows('employees').filter(e => e.active && isDailySal(e));
    if (!emps.length) return E.toast('No Daily-Salaried employees. Set payType in Employees.', 'error');
    E.modal('Record Daily Salary', `
      <div class="f">Employee *<select id="ds_e">${emps.map(e => `<option value="${e.id}">${E.esc(e.name)} · ${E.m(e.amount)}/day${advBal(e.id) > 0 ? ' · owes ' + E.m(advBal(e.id)) : ''}</option>`).join('')}</select></div>
      <div class="g2">
        <div class="f">From date<input id="ds_f" type="date" value="${E.today()}"></div>
        <div class="f">To date<input id="ds_t" type="date" value="${E.today()}"></div>
        <div class="f">Days worked *<input id="ds_d" type="number" step="0.5" value="1"></div>
        <div class="f">Pay date<input id="ds_pd" type="date" value="${E.today()}"></div>
        <div class="f">Daily rate (Rs)<input id="ds_r" type="number" step="0.01" value="0" readonly></div>
        <div class="f">Advance recovery (Rs)<input id="ds_adv" type="number" step="0.01" value="0"></div>
      </div>
      <div class="f">Paid from *<select id="ds_s"><option value="">— select —</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
      <div class="f">Notes<input id="ds_n" placeholder="Optional"></div>
      <div class="tot"><span>Gross</span><span id="ds_g">Rs 0.00</span></div>
      <div class="tot"><span>Net to pay</span><span id="ds_n2">Rs 0.00</span></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveDailySalary">Post</button>`);

    const update = () => {
      const e = emp(E.val('ds_e'));
      const rate = e ? e.amount : 0;
      E.$('ds_r').value = (rate / 100).toFixed(2);
      const days = parseFloat(E.val('ds_d')) || 0;
      const gross = Math.round(days * rate);
      const adv = E.c(E.val('ds_adv'));
      E.$('ds_g').textContent = E.m(gross);
      E.$('ds_n2').textContent = E.m(gross - adv);
    };
    E.hooks.push(e => { if (['ds_e', 'ds_d', 'ds_adv'].includes(e.target.id)) update(); });
    setTimeout(update, 10);
  };

  E.A.saveDailySalary = async () => {
    try {
      const e = emp(E.val('ds_e'));
      if (!e) throw new Error('Select employee');
      const days = parseFloat(E.val('ds_d')) || 0;
      if (days <= 0) throw new Error('Enter days worked');
      const rate = e.amount || 0;
      const gross = Math.round(days * rate);
      const adv = E.c(E.val('ds_adv'));
      const bal = advBal(e.id);
      if (adv > bal) throw new Error(`Advance recovery (${E.m(adv)}) exceeds balance (${E.m(bal)})`);
      const src = E.val('ds_s');
      if (!src) throw new Error('Choose paid-from account');
      const net = gross - adv;
      if (net < 0) throw new Error('Net is negative');
      if (E.bal(src) < net && !confirm(`Balance ${E.m(E.bal(src))} < ${E.m(net)}. Continue?`)) return;
      const no = await E.next('DS');
      const lines = [{ acc: '1310', dr: gross, cat: 'Salary', head: '5120' }, { acc: src, cr: net }];
      if (adv) lines.push({ acc: '1250', cr: adv });
      const je = await E.post({ date: E.val('ds_pd'), ref: no, narr: `Daily salary · ${e.name} · ${days} day(s)`, source: 'payroll', lines });
      await E.save('wageRuns', {
        no, kind: 'daily-salary', empId: e.id, date: E.val('ds_pd'),
        from: E.val('ds_f'), to: E.val('ds_t'), days, rate, gross, advRec: adv, net,
        bank: src, notes: E.val('ds_n'), jeId: je.id, paid: true, cancelled: false
      });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (err) { E.toast(err.message, 'error'); }
  };

  E.A.dailyCancel = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      if (!confirm('Cancel ' + r.no + '?')) return;
      await E.reverse(r.jeId);
      const b = JSON.parse(JSON.stringify(r));
      r.cancelled = true;
      await E.save('wageRuns', r, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.dailyPrint = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const e = emp(r.empId);
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    w.document.write(`<html><head><title>${r.no}</title><style>
      body{font:13px Arial;padding:30px;max-width:600px}
      h2{margin-bottom:5px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ddd}
      .total{font-size:18px;font-weight:bold;margin-top:15px;padding-top:10px;border-top:2px solid #333}
    </style></head><body>
      <h2>${E.esc(E.factory().name)}</h2>
      <p>Daily Salary Receipt #${r.no} · ${r.date}</p>
      <div class="row"><span>Employee</span><span><b>${E.esc(e.name)}</b> (${E.esc(e.code)})</span></div>
      <div class="row"><span>Period</span><span>${r.from} → ${r.to}</span></div>
      <div class="row"><span>Days worked</span><span>${r.days}</span></div>
      <div class="row"><span>Daily rate</span><span>${E.m(r.rate)}</span></div>
      <div class="row"><span>Gross</span><span>${E.m(r.gross)}</span></div>
      ${r.advRec ? `<div class="row"><span>Advance recovery</span><span>-${E.m(r.advRec)}</span></div>` : ''}
      <div class="row total"><span>Net Paid</span><span>${E.m(r.net)}</span></div>
      ${r.notes ? `<p style="margin-top:15px;color:#666;">${E.esc(r.notes)}</p>` : ''}
      <p style="margin-top:40px">Signature: ____________________</p>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  /* ═══════════════════════════════════════════════════════════════
     MONTHLY SALARIES MODULE
     ═══════════════════════════════════════════════════════════════ */
  E.route('monthly-salaries', 'Monthly Salaries', () => {
    const R = E.rows('wageRuns').filter(r => r.kind === 'run' && r.type === 'Monthly').sort((a, b) => b.no.localeCompare(a.no));
    const emps = E.rows('employees').filter(e => e.active && isMonthlySal(e));
    return `<div class="kp">
      ${E.kpi('Monthly-Salaried Staff', emps.length, 'active')}
      ${E.kpi('Runs this year', R.filter(r => r.date.slice(0, 4) === E.today().slice(0, 4) && !r.cancelled).length)}
      ${E.kpi('Unpaid runs', R.filter(r => !r.cancelled && !r.paid).length)}
      ${E.kpi('EPF/ETF payable', E.m(E.bal('2100')), 'Ledger 2100')}
    </div>
    <div class="bar">
      <span class="gap"></span>
      <button class="btn" data-a="remitM">Remit EPF/ETF</button>
      <button class="btn p" data-a="newMonthlyRun">+ New Monthly Salary Run</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Run</th><th>Period</th><th class="r">Staff</th>
        <th class="r">Basic+Allow</th><th class="r">OT+Bonus</th>
        <th class="r">Deductions</th><th class="r">Net</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map(r => {
        const basic = r.lines.reduce((s, l) => s + (l.basic || 0), 0);
        const extra = r.lines.reduce((s, l) => s + (l.ot || 0) + (l.bonus || 0), 0);
        const ded = r.lines.reduce((s, l) => s + (l.epfEmp || 0) + (l.advRec || 0) + (l.otherDed || 0), 0);
        return `<tr style="${r.cancelled ? 'opacity:.5' : ''}">
          <td><b>${r.no}</b></td><td>${r.from} → ${r.to}</td>
          <td class="r">${r.lines.length}</td>
          <td class="r">${E.m(basic)}</td><td class="r">${E.m(extra)}</td>
          <td class="r">${E.m(ded)}</td><td class="r"><b>${E.m(r.net)}</b></td>
          <td><span class="tag">${r.cancelled ? 'Cancelled' : r.paid ? 'Paid' : 'Unpaid'}</span></td>
          <td class="r">
            <button class="btn sm" data-a="slips" data-id="${r.id}">Slips</button>
            <button class="btn sm" data-a="salSheet" data-id="${r.id}">Sheet</button>
            ${!r.cancelled && !r.paid ? `<button class="btn sm p" data-a="payRun" data-id="${r.id}">Pay</button>
              <button class="btn sm d" data-a="canRun" data-id="${r.id}">Cancel</button>` : ''}
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" class="muted">No monthly salary runs yet</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Monthly-salaried staff receive their fixed salary here. If they also did piece work, that appears in the Wages module separately.</p>`;
  });

  E.A.newMonthlyRun = () => {
    if (!E.rows('employees').some(x => x.active && isMonthlySal(x))) return E.toast('Add Monthly-Salaried staff first', 'error');
    E.modal('New Monthly Salary Run', `
      <div class="g2">
        <div class="f">Pay date<input id="w_d" type="date" value="${W.date}"></div>
        <div class="f">Period from<input id="w_f" type="date" value="${E.today().slice(0, 8)}01"></div>
        <div class="f">Period to<input id="w_e" type="date" value="${E.today()}"></div>
      </div>
      <input type="hidden" id="w_t" value="Monthly">
      <div class="bar">
        <button class="btn p" data-a="loadMonthlyRun">⟳ Load salaried staff</button>
        <span class="muted">All active Monthly-Salaried staff</span>
      </div>
      <div id="wrb"><p class="muted">Choose the period and press Load.</p></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveMonthlyRun">Post salary run</button>`, 1);
  };

  E.A.loadMonthlyRun = () => {
    const f = E.val('w_f'), to = E.val('w_e');
    if (!f || !to || f > to) return E.toast('Check the period dates', 'error');
    const emps = E.rows('employees').filter(x => x.active && isMonthlySal(x))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!emps.length) return E.toast('No monthly-salaried employees', 'error');
    const js = act();
    const toSel = d => `<select data-k="to" style="padding:6px;border:1px solid var(--bd);border-radius:8px;max-width:150px">
      <option value="OH" ${d === 'OH' ? 'selected' : ''}>Factory overhead</option>
      <option value="ADM" ${d === 'ADM' ? 'selected' : ''}>Admin salaries</option>
      ${js.length ? '<option value="SPLIT">Split across jobs</option>' : ''}
      ${js.map(j => `<option value="${j.id}">${j.no} (100%)</option>`).join('')}
    </select>`;
    const rows = emps.map(e => {
      const a = att(e.id, f, to);
      const bal = advBal(e.id);
      const adv0 = e.advInstall ? Math.min(bal, e.advInstall) : bal;
      return `<tr data-id="${e.id}" data-bal="${bal}">
        <td><b>${E.esc(e.name)}</b><br><span class="muted">${e.code} · ${E.m(e.amount)}/mo</span></td>
        <td>${inp('days', 56, a.absent || '')}</td>
        <td>${inp('ot', 52, a.ot || '')}</td>
        <td>${inp('bonus', 70)}</td>
        <td class="r">${bal ? E.m(bal) : '—'}</td>
        <td>${bal ? inp('other', 80, adv0 ? (adv0 / 100).toFixed(2) : '') : '<input type="hidden" data-k="other" value="0">—'}</td>
        <td>${toSel(e.target || 'ADM')}</td>
        <td class="r gv"></td>
        <td class="r nv"></td>
      </tr>`;
    }).join('');
    E.$('wrb').innerHTML = `<div class="tw"><table>
      <thead><tr>
        <th>Employee</th><th>No-pay days</th><th>OT hrs</th><th>Bonus</th>
        <th class="r">Advance balance</th><th>Recover now</th>
        <th>Charge to</th><th class="r">Gross</th><th class="r">Net</th>
      </tr></thead>
      <tbody id="wr">${rows}</tbody>
    </table></div>
    <div class="tot"><span id="w_g"></span></div>
    <p class="muted">Basic + allowances − no-pay + OT + bonus − EPF − advance recovery.</p>`;
    recalcMonthly();
  };

  function recalcMonthly() {
    let G = 0, N = 0;
    document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
      const e = emp(tr.dataset.id);
      const i = rowIn(tr);
      const nopayDed = Math.round((e.amount || 0) / 30 * (i.days || 0));
      const basic = Math.max(0, (e.amount || 0) + (e.allow || 0) - nopayDed);
      const hourly = (e.amount || 0) / 240;
      const ot = Math.round((i.ot || 0) * hourly * 1.5);
      const bonus = E.c(i.bonus || 0);
      const gross = basic + ot + bonus;
      const on = E.setting('epfOn') && e.epf;
      const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
      const adv = E.c(i.other || 0);
      const net = gross - ee - adv;
      tr.querySelector('.gv').textContent = gross ? E.m(gross) : '';
      tr.querySelector('.nv').textContent = gross ? E.m(net) : '';
      tr.querySelector('.nv').style.color = net < 0 ? '#dc2626' : '';
      G += gross; N += net;
    });
    if (E.$('w_g')) E.$('w_g').textContent = `Gross ${E.m(G)} · Net ${E.m(N)}`;
  }

  E.hooks.push(e => {
    if (!(e.target.closest && e.target.closest('#wr'))) return;
    const w_t = document.getElementById('w_t');
    if (w_t && w_t.value === 'Monthly') recalcMonthly(); else recalcWage();
  });

  E.A.saveMonthlyRun = async () => {
    try {
      if (!document.querySelectorAll('#wr tr[data-id]').length) throw new Error('Load staff first');
      const to = E.val('w_e');
      const L = [];
      let split = [];

      document.querySelectorAll('#wr tr[data-id]').forEach(tr => {
        const e = emp(tr.dataset.id);
        const i = rowIn(tr);
        const on = E.setting('epfOn') && e.epf;
        const nopay = parseInt(i.days) || 0;
        const nopayDed = Math.round((e.amount || 0) / 30 * nopay);
        const basic = Math.max(0, (e.amount || 0) + (e.allow || 0) - nopayDed);
        const hourly = (e.amount || 0) / 240;
        const ot = Math.round((i.ot || 0) * hourly * 1.5);
        const bonus = E.c(i.bonus || 0);
        const gross = basic + ot + bonus;
        const ee = on ? Math.round(gross * E.setting('epfEmp') / 100) : 0;
        const ec = on ? Math.round(gross * E.setting('epfCo') / 100) : 0;
        const et = on ? Math.round(gross * E.setting('etf') / 100) : 0;
        const adv = E.c(i.other || 0);
        const net = gross - ee - adv;
        const bal = advBal(e.id);
        if (adv > bal) throw new Error(e.name + ': recovery exceeds balance ' + E.m(bal));
        if (net < 0) throw new Error(e.name + ': net is negative');
        L.push({
          empId: e.id, name: e.name, payType: e.payType,
          basic, piece: 0, ot, bonus, gross,
          epfEmp: ee, epfCo: ec, etf: et, advRec: adv, otherDed: 0, net,
          days: 0, nopay: nopay || 0, otHrs: i.ot || 0,
          target: i.to, pieceDetail: [], logIds: [],
          advBefore: bal, advAfter: bal - adv
        });
      });

      if (!L.length) throw new Error('Nothing to pay');
      if (L.some(l => l.target === 'SPLIT')) {
        split = [...document.querySelectorAll('.wsp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
        if (split.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Job split must total 100%');
      }

      const dr = {};
      const add = (acc, job, v, cat) => {
        if (!v) return;
        const k = acc + '|' + job;
        dr[k] = dr[k] || { acc, job, dr: 0, cat };
        dr[k].dr += v;
      };

      L.forEach(l => {
        const oncost = l.epfCo + l.etf;
        const time = l.basic + l.ot + l.bonus + oncost;
        if (l.target === 'OH') add('5270', '', time);
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

      const S = k => L.reduce((a, l) => a + l[k], 0);
      const G = S('gross'), ee = S('epfEmp'), ec = S('epfCo'), et = S('etf');
      const ar = S('advRec'), net = S('net');
      const no = await E.next('SAL');
      const d = E.val('w_d');

      const lines = Object.values(dr).filter(x => x.dr).map(x =>
        x.acc === '1310'
          ? { acc: '1310', dr: x.dr, job: x.job, cat: 'Labour', head: '5130' }
          : { acc: x.acc, dr: x.dr }
      ).concat([{ acc: '2200', cr: net }]);
      if (ee + ec + et) lines.push({ acc: '2100', cr: ee + ec + et });
      if (ar) lines.push({ acc: '1250', cr: ar });

      const je = await E.post({
        date: d, ref: no,
        narr: `Monthly salaries ${E.val('w_f')} to ${to}`,
        source: 'payroll', lines
      });
      await E.save('wageRuns', {
        no, kind: 'run', type: 'Monthly', date: d, from: E.val('w_f'), to,
        lines: L, split,
        gross: G, epfEmp: ee, epfCo: ec, etf: et,
        advRec: ar, otherDed: 0, net,
        jeId: je.id, paid: false, cancelled: false
      });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ═══════════════════════════════════════════════════════════════
     SHARED ACTIONS
     ═══════════════════════════════════════════════════════════════ */
  E.A.canRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      if (r.paid) throw new Error('Already paid');
      if (!confirm('Cancel ' + r.no + '?')) return;
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

  const srcForm = (t, amt, btn, id, note) => E.modal(t, `
    <div class="g2">
      <div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div>
      <div class="f">Amount (Rs) *<input id="z_a" type="number" step="0.01" value="${amt ? amt / 100 : ''}"></div>
    </div>
    <div class="f">Paid from *<select id="z_s"><option value="">— select —</option>${E.opts(a => a.bank)}</select></div>
    <p class="muted">${note}</p>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="${btn}" data-id="${id || ''}">Post</button>`);

  const chk = () => {
    const a = E.c(E.val('z_a')), s = E.val('z_s');
    if (a <= 0) throw new Error('Enter an amount');
    if (!s) throw new Error('Select account');
    if (E.bal(s) < a && !confirm(`Balance ${E.m(E.bal(s))} < ${E.m(a)}. Continue?`)) return null;
    return { a, s, d: E.val('z_d') };
  };

  E.A.payRun = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    srcForm('Pay ' + r.no, r.net, 'savePayRun', id, 'Posts Dr 2200 / Cr selected account');
  };

  E.A.savePayRun = async id => {
    try {
      const r = E.D.wageRuns.find(x => x.id === id);
      const c = chk(); if (!c) return;
      if (c.a !== r.net) throw new Error('Pay full net ' + E.m(r.net));
      const no = await E.next('WP');
      const je = await E.post({ date: c.d, ref: no, narr: 'Pay ' + r.no, source: 'payroll', lines: [{ acc: '2200', dr: c.a }, { acc: c.s, cr: c.a }] });
      const b = JSON.parse(JSON.stringify(r));
      r.paid = true; r.payJe = je.no;
      await E.save('wageRuns', r, b);
      E.closeM(); E.go(); E.toast('Paid', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.remitM = () => srcForm('Remit EPF/ETF', E.bal('2100'), 'saveRemit', '', 'Balance: ' + E.m(E.bal('2100')));
  E.A.saveRemit = async () => {
    try {
      const c = chk(); if (!c) return;
      if (c.a > E.bal('2100')) throw new Error('Amount exceeds payable');
      const no = await E.next('EPF');
      await E.post({ date: c.d, ref: no, narr: 'EPF/ETF remittance', source: 'payroll', lines: [{ acc: '2100', dr: c.a }, { acc: c.s, cr: c.a }] });
      await E.save('wageRuns', { no, kind: 'remit', date: c.d, amount: c.a });
      E.closeM(); E.go(); E.toast('Remitted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.advM = id => {
    const es = E.rows('employees').filter(x => x.active && isSalaried(x));
    if (!es.length) return E.toast('No salaried employees for advances', 'error');
    E.modal('Give Advance (Salaried only)', `
      <div class="f">Employee *<select id="v_e">${es.map(e => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${E.esc(e.name)} · ${payCat(e)}${advBal(e.id) > 0 ? ' · owes ' + E.m(advBal(e.id)) : ''}</option>`).join('')}</select></div>
      <div class="g2">
        <div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount (Rs) *<input id="z_a" type="number" step="0.01"></div>
      </div>
      <div class="f">Paid from *<select id="z_s"><option value="">— select —</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
      <div class="f">Note<input id="z_n" placeholder="Reason"></div>
      <p class="muted">Posts Dr 1250 / Cr bank. Recovered only in salary modules, never in wages.</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveAdv">Post</button>`);
  };

  E.A.saveAdv = async () => {
    try {
      const c = chk(); if (!c) return;
      const e = emp(E.val('v_e'));
      const no = await E.next('ADV');
      await E.post({
        date: c.d, ref: no,
        narr: 'Advance · ' + e.name + (E.val('z_n') ? ' · ' + E.val('z_n') : ''),
        source: 'payroll',
        lines: [{ acc: '1250', dr: c.a }, { acc: c.s, cr: c.a }]
      });
      await E.save('wageRuns', { no, kind: 'advance', empId: e.id, date: c.d, amount: c.a, note: E.val('z_n'), cancelled: false });
      E.closeM(); E.go(); E.toast('Advance posted', 'success');
    } catch (err) { E.toast(err.message, 'error'); }
  };

  E.A.slips = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const f = E.factory();
    const h = `<html><head><title>${r.no}</title><style>
      @page{size:A4;margin:14mm}body{font:13px Arial}
      .s{border:1px solid #444;padding:12px;margin-bottom:16px;page-break-inside:avoid}
      table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
      .r{text-align:right}
    </style></head><body>${r.lines.map(l => `<div class="s">
      <b>${E.esc(f.name)}</b> — PAY SLIP<br>
      ${r.type} · ${r.from} to ${r.to} · ${r.date}<br>
      <b>${E.esc(l.name)}</b> (${l.payType})
      <table>
        <tr><td>${r.type === 'Monthly'
          ? 'Basic + allowances' + (l.nopay ? ' (less ' + l.nopay + ' no-pay days)' : '')
          : (l.basic ? 'Daily wages (' + l.days + ' days)' : 'Piece-rate work')}</td>
          <td class="r">${E.m(l.basic || l.piece)}</td></tr>
        ${l.pieceDetail && l.pieceDetail.length && l.basic ? `<tr><td colspan="2"><b>Piece-rate</b><table><tr><th>Op</th><th class="r">Packs</th><th class="r">Rate</th><th class="r">Amount</th></tr>${l.pieceDetail.map(o => `<tr><td>${E.esc(o.opName)}</td><td class="r">${o.qty}</td><td class="r">${E.m(o.rate)}</td><td class="r">${E.m(o.amount)}</td></tr>`).join('')}</table></td></tr>` : ''}
        ${l.ot ? `<tr><td>OT${l.otHrs ? ' (' + l.otHrs + ' h)' : ''}</td><td class="r">${E.m(l.ot)}</td></tr>` : ''}
        ${l.bonus ? `<tr><td>Bonus</td><td class="r">${E.m(l.bonus)}</td></tr>` : ''}
        <tr><td><b>Gross</b></td><td class="r"><b>${E.m(l.gross)}</b></td></tr>
        ${l.epfEmp ? `<tr><td>EPF (employee)</td><td class="r">-${E.m(l.epfEmp)}</td></tr>` : ''}
        ${l.advRec ? `<tr><td>Advance recovery</td><td class="r">-${E.m(l.advRec)}</td></tr>` : ''}
        ${l.otherDed ? `<tr><td>Other deductions</td><td class="r">-${E.m(l.otherDed)}</td></tr>` : ''}
        <tr><td><b>Net</b></td><td class="r"><b>${E.m(l.net)}</b></td></tr>
      </table><br>Signature: ____________________
    </div>`).join('')}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    w.document.write(h); w.document.close(); setTimeout(() => w.print(), 300);
  };

  E.A.salSheet = id => {
    const r = E.D.wageRuns.find(x => x.id === id);
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const S = k => r.lines.reduce((a, l) => a + (l[k] || 0), 0);
    const c = (v, b) => '<td class="r">' + (b ? '<b>' : '') + E.m(v || 0) + (b ? '</b>' : '') + '</td>';
    w.document.write(`<html><head><title>${r.no}</title><style>
      @page{size:A4 landscape;margin:10mm}body{font:11px Arial}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px}
      th{background:#eee}.r{text-align:right}
    </style></head><body>
      <h3>${E.esc(E.factory().name)} — SALARY SHEET</h3>
      <p><b>${r.no}</b> · Period ${r.from} to ${r.to} · Pay date ${r.date}</p>
      <table>
        <tr><th>#</th><th>Employee</th><th>No-pay days</th><th>Basic</th><th>OT</th><th>Bonus</th>
          <th>Gross</th><th>EPF</th><th>Advance</th><th>Net</th><th>Advance Bal</th><th>Signature</th></tr>
        ${r.lines.map((l, i) => `<tr>
          <td>${i + 1}</td><td>${E.esc(l.name)}</td>
          <td>${l.nopay || 0}</td>
          ${c(l.basic)}${c(l.ot)}${c(l.bonus)}${c(l.gross)}
          ${c(l.epfEmp)}${c(l.advRec)}${c(l.net, 1)}${c(l.advAfter)}<td></td>
        </tr>`).join('')}
        <tr><td colspan="3"><b>TOTAL</b></td>
          ${c(S('basic'), 1)}${c(S('ot'), 1)}${c(S('bonus'), 1)}${c(S('gross'), 1)}
          ${c(S('epfEmp'), 1)}${c(S('advRec'), 1)}${c(S('net'), 1)}${c(S('advAfter'), 1)}<td></td>
        </tr>
      </table>
      <p>Employer EPF ${E.m(r.epfCo || 0)} · ETF ${E.m(r.etf || 0)} · Total cost ${E.m((r.gross || 0) + (r.epfCo || 0) + (r.etf || 0))}</p>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  /* ═══════════════════════════════════════════════════════════════
     EMPLOYEE LEDGER
     ═══════════════════════════════════════════════════════════════ */
  const LG = { emp: '', from: E.today().slice(0, 4) + '-01-01', to: E.today() };

  function ledgerEvents(id) {
    const ev = [];
    E.rows('prodLogs').filter(l => l.empId === id && l.status !== 'cancelled').forEach(l => {
      ev.push({ d: l.date, k: 'Production', t: `${l.opName} · ${l.code} · ${l.qty}pcs × ${E.m(l.rate)}`, earn: l.amount, adv: 0, pay: 0 });
    });
    runs().filter(r => !r.cancelled).forEach(r => {
      if (r.kind === 'run') {
        const x = (r.lines || []).find(l => l.empId === id);
        if (!x) return;
        const kind = r.type === 'Monthly' ? 'Monthly salary run' : 'Wage run';
        ev.push({
          d: r.date, k: kind,
          t: `${r.no} · ${r.from}→${r.to} · gross ${E.m(x.gross)}` +
            (x.piece ? ' (piece ' + E.m(x.piece) + ')' : '') +
            (x.ot ? ' · OT ' + E.m(x.ot) : '') +
            (x.bonus ? ' · bonus ' + E.m(x.bonus) : '') +
            (x.advRec ? ' · advance ' + E.m(x.advRec) : ''),
          earn: x.gross - (x.piece || 0), adv: -(x.advRec || 0), pay: 0
        });
        if (r.paid) ev.push({ d: r.date, k: 'Paid', t: 'Net ' + r.no, earn: 0, adv: 0, pay: x.net });
      } else if (r.kind === 'daily-salary' && r.empId === id) {
        ev.push({ d: r.date, k: 'Daily salary', t: `${r.no} · ${r.days} day(s) × ${E.m(r.rate)}`, earn: r.gross, adv: -(r.advRec || 0), pay: 0 });
        ev.push({ d: r.date, k: 'Paid', t: 'Net ' + r.no, earn: 0, adv: 0, pay: r.net });
      }
    });
    E.rows('wageRuns').filter(r => r.kind === 'advance' && r.empId === id && !r.cancelled).forEach(r => {
      ev.push({ d: r.date, k: 'Advance', t: r.note || 'Advance', earn: 0, adv: r.amount, pay: 0 });
    });
    return ev.sort((a, b) => a.d.localeCompare(b.d));
  }

  E.route('empledger', 'Employee Ledger', () => {
    const es = E.rows('employees').sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    if (!LG.emp && es.length) LG.emp = es[0].id;
    const e = emp(LG.emp);
    if (!e) return '<div class="card muted">Add employees first.</div>';
    const ev = ledgerEvents(e.id);
    const ins = ev.filter(x => x.d >= LG.from && x.d <= LG.to);
    const before = ev.filter(x => x.d < LG.from).reduce((s, x) => s + x.adv, 0);
    let ab = before;
    const paid = ev.reduce((s, x) => s + x.pay, 0);
    const isSal = isSalaried(e);
    return `<div class="bar">
      <select class="fs" data-f="lg.emp" style="min-width:240px">${es.map(x => `<option value="${x.id}" ${x.id === LG.emp ? 'selected' : ''}>${E.esc(x.code + ' — ' + x.name)} (${CAT_LABEL[payCat(x)]})</option>`).join('')}</select>
      <span class="muted">From</span><input type="date" class="fs" data-f="lg.from" value="${LG.from}">
      <span class="muted">to</span><input type="date" class="fs" data-f="lg.to" value="${LG.to}">
      <span class="gap"></span>
      <button class="btn" data-a="lgPrint">🖨 Statement</button>
      ${isSal ? `<button class="btn" data-a="advM" data-id="${e.id}">Give advance</button>` : ''}
    </div>
    <div class="kp">
      ${E.kpi('Category', CAT_LABEL[payCat(e)], e.amount ? E.m(e.amount) + (isWage(e) ? '/day' : payCat(e) === 'DailySalaried' ? '/day' : '/mo') : '')}
      ${isSal
        ? E.kpi('Advance balance', E.m(advBal(e.id)), 'Given ' + E.m(advGiven(e.id)) + ' · recovered ' + E.m(advRec(e.id)))
        : E.kpi('Advances', 'N/A', 'Wage workers cannot take advances')}
      ${E.kpi('Total paid', E.m(paid), 'in period')}
    </div>
    <div class="tw" id="elt"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Details</th>
        <th class="r">Earned</th><th class="r">Advance given</th>
        <th class="r">Advance recovered</th><th class="r">Paid out</th>
        <th class="r">Advance balance</th></tr></thead>
      <tbody>
        <tr><td colspan="7" class="muted">Brought forward</td><td class="r"><b>${E.m(before)}</b></td></tr>
        ${ins.map(x => { ab += x.adv; return `<tr>
          <td>${x.d}</td><td><span class="tag">${x.k}</span></td><td>${E.esc(x.t)}</td>
          <td class="r">${x.earn ? E.m(x.earn) : ''}</td>
          <td class="r">${x.adv > 0 ? E.m(x.adv) : ''}</td>
          <td class="r">${x.adv < 0 ? E.m(-x.adv) : ''}</td>
          <td class="r">${x.pay ? E.m(x.pay) : ''}</td>
          <td class="r"><b>${E.m(ab)}</b></td>
        </tr>`; }).join('') || '<tr><td colspan="8" class="muted">No activity</td></tr>'}
      </tbody>
    </table></div>`;
  });

  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f && f.startsWith('lg.')) { LG[f.slice(3)] = e.target.value; E.go(); }
  });

  E.A.lgPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const e = emp(LG.emp);
    w.document.write(`<html><head><title>Statement</title><style>
      body{font:13px Arial;margin:16px}
      table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
      .r{text-align:right}
    </style></head><body>
      <h3>${E.esc(E.factory().name)} — Employee Statement</h3>
      <p><b>${E.esc(e.name)}</b> (${E.esc(e.code)}) · ${LG.from} → ${LG.to}</p>
      ${E.$('elt').innerHTML}
    </body></html>`);
    w.document.close(); w.print();
  };

})(window.ERP);