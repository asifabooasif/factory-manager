/* Employees — 3 pay categories with V6 model compatibility.

     ─ Wage Worker       → wage runs only (days × rate + piece)
     ─ Daily Salaried    → daily salary records + wage runs (piece only)
     ─ Monthly Salaried  → monthly salary runs + wage runs (piece only)

   The `piece` flag is available for ALL types — signals that the person
   also performs production work, so admins aren't surprised when they
   appear in wage runs.

   Legacy migration: payType 'Daily' → 'Wage', 'Monthly' → 'MonthlySalaried'.
*/
(E => {
  const n = E.N.find(x => x.id === 'employees');
  if (n) n.soon = 0;
  const F = { q: '', type: '', act: '1' };

  const payCat = p => {
    const pt = p && p.payType;
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'MonthlySalaried';
    if (pt === 'DailySalaried') return 'DailySalaried';
    return 'Wage';
  };
  const CAT_LABEL = { Wage: 'Wage Worker', DailySalaried: 'Daily Salaried', MonthlySalaried: 'Monthly Salaried' };
  const CAT_STYLE = {
    Wage: '',
    DailySalaried: 'background:#dbeafe;color:#1e40af',
    MonthlySalaried: 'background:#f3e8ff;color:#7c3aed'
  };
  const RATE_UNIT = { Wage: '/day', DailySalaried: '/day', MonthlySalaried: '/month' };
  const RATE_LABEL = {
    Wage: 'Daily rate (Rs) *',
    DailySalaried: 'Daily salary (Rs) *',
    MonthlySalaried: 'Monthly salary (Rs) *'
  };
  const isSalaried = p => payCat(p) !== 'Wage';
  const advBal = id => (E.advBal ? E.advBal(id) : 0);
  const used = id => E.D.wageRuns.some(w => JSON.stringify(w).includes(id));

  const paidIn = p => {
    const cat = payCat(p);
    if (cat === 'Wage') return 'wages only';
    if (cat === 'DailySalaried') return 'daily salary + wage runs';
    return 'monthly salary + wage runs';
  };

  function tbl() {
    const s = F.q.toLowerCase();
    const rows = E.rows('employees')
      .filter(p =>
        (!F.type || payCat(p) === F.type) &&
        (F.act === '' || p.active === (F.act === '1')) &&
        (!s || (p.name + p.code + (p.nic || '') + (p.phone || '')).toLowerCase().includes(s))
      )
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    return `<div class="tw"><table>
      <thead><tr>
        <th>Code</th><th>Name</th><th>NIC</th><th>Phone</th>
        <th>Pay Type &amp; Where Paid</th>
        <th class="r">Rate</th><th class="r">Allowance</th>
        <th>Piece</th><th>EPF</th><th class="r">Advance</th><th></th>
      </tr></thead>
      <tbody>${rows.map(p => {
        const cat = payCat(p);
        const sal = isSalaried(p);
        const bal = sal ? advBal(p.id) : 0;
        return `<tr style="${p.active ? '' : 'opacity:.5'}">
          <td>${p.code}</td>
          <td>
            <b>${E.esc(p.name)}</b>
            ${p.piece ? ' <span title="Performs piece-rate work" style="opacity:.7">🧵</span>' : ''}
          </td>
          <td>${E.esc(p.nic)}</td>
          <td>${E.esc(p.phone)}</td>
          <td>
            <span class="tag" style="${CAT_STYLE[cat]}">${CAT_LABEL[cat]}</span>
            <div class="muted" style="font-size:11px;margin-top:3px">${paidIn(p)}</div>
          </td>
          <td class="r">${E.m(p.amount)}${RATE_UNIT[cat]}</td>
          <td class="r">${p.allow ? E.m(p.allow) : '—'}</td>
          <td>${p.piece ? 'Yes' : '—'}</td>
          <td>${p.epf ? 'Yes' : '—'}</td>
          <td class="r">${sal
            ? (bal > 0 ? `<b class="bad">${E.m(bal)}</b>` : '—')
            : '<span class="muted">N/A</span>'}</td>
          <td class="r">
            <button class="btn sm" data-a="editEmp" data-id="${p.id}">Edit</button>
            <button class="btn sm d" data-a="delEmp" data-id="${p.id}">${used(p.id) ? (p.active ? 'Deactivate' : 'Activate') : 'Delete'}</button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">No employees found</td></tr>'}</tbody>
    </table></div>`;
  }

  E.route('employees', 'Employees', () => `<div class="bar">
    <input style="max-width:320px" class="fs" placeholder="Search name, code, NIC, phone…" data-f="em.q" value="${E.esc(F.q)}">
    <select class="fs" data-f="em.type">
      <option value="">All pay types</option>
      <option value="Wage" ${F.type === 'Wage' ? 'selected' : ''}>Wage Workers</option>
      <option value="DailySalaried" ${F.type === 'DailySalaried' ? 'selected' : ''}>Daily Salaried</option>
      <option value="MonthlySalaried" ${F.type === 'MonthlySalaried' ? 'selected' : ''}>Monthly Salaried</option>
    </select>
    <select class="fs" data-f="em.act">
      <option value="1" ${F.act === '1' ? 'selected' : ''}>Active</option>
      <option value="0" ${F.act === '0' ? 'selected' : ''}>Inactive</option>
      <option value="" ${F.act === '' ? 'selected' : ''}>All</option>
    </select>
    <span class="gap"></span>
    <button class="btn p" data-a="newEmp">+ New Employee</button>
  </div><div id="tbl">${tbl()}</div>`);

  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f && f.startsWith('em.')) {
      F[f.slice(3)] = e.target.value;
      E.$('tbl').innerHTML = tbl();
    }
    if (e.target.id === 'e_type') updateFormVisibility();
  });

  const form = id => {
    const p = id ? E.D.employees.find(x => x.id === id) : null;
    const cat = payCat(p);
    const isW = cat === 'Wage';
    const isDS = cat === 'DailySalaried';
    const isMS = cat === 'MonthlySalaried';
    const isSal = !isW;

    E.modal(p ? 'Edit Employee' : 'New Employee', `
      <div class="g2">
        <div class="f">Full name *<input id="e_name" value="${E.esc(p && p.name)}"></div>
        <div class="f">NIC<input id="e_nic" value="${E.esc(p && p.nic)}"></div>
        <div class="f">Phone<input id="e_ph" value="${E.esc(p && p.phone)}"></div>
        <div class="f">Joined on<input id="e_join" type="date" value="${(p && p.join) || E.today()}"></div>
      </div>
      <div class="g2">
        <div class="f">Pay type *
          <select id="e_type">
            <option value="Wage" ${isW ? 'selected' : ''}>Wage Worker — attendance + piece</option>
            <option value="DailySalaried" ${isDS ? 'selected' : ''}>Daily Salaried — fixed daily base pay</option>
            <option value="MonthlySalaried" ${isMS ? 'selected' : ''}>Monthly Salaried — fixed monthly salary</option>
          </select>
        </div>
        <div class="f"><span id="e_rate_lbl">${RATE_LABEL[cat]}</span>
          <input id="e_amt" type="number" step="0.01" value="${p ? p.amount / 100 : ''}">
        </div>
      </div>
      <div class="f" id="e_allow_grp" style="${isMS ? '' : 'display:none'}">
        Fixed monthly allowances (Rs)
        <input id="e_allow" type="number" step="0.01" value="${p && p.allow ? p.allow / 100 : ''}">
        <small class="muted">Added to monthly base salary in Monthly Salary runs</small>
      </div>
      <div class="g2">
        <div class="f">Default charge account
          <select id="e_tgt">
            <option value="OH" ${((p && p.target === 'OH') || !p || !p.target) ? 'selected' : ''}>Factory overhead (indirect)</option>
            <option value="ADM" ${p && p.target === 'ADM' ? 'selected' : ''}>Admin salaries</option>
          </select>
          <small class="muted">Where time-based earnings go by default</small>
        </div>
        <div class="f" id="e_inst_grp" style="${isSal ? '' : 'display:none'}">
          Monthly advance recovery (Rs) — blank = recover full balance
          <input id="e_inst" type="number" step="0.01" value="${p && p.advInstall ? p.advInstall / 100 : ''}">
          <small class="muted">Applied to <b>monthly salary runs</b> only. Daily salary records use manual amount each time.</small>
        </div>
      </div>
      <label class="f" style="flex-direction:row;gap:8px;align-items:flex-start">
        <input type="checkbox" id="e_piece" style="width:auto;margin-top:3px" ${p ? (p.piece ? 'checked' : '') : ''}>
        <span>
          Also performs <b>piece-rate production work</b>
          <div class="muted" style="font-size:11px;font-weight:400;margin-top:2px">
            Any employee with piece work automatically appears in <b>Wage runs</b> — their piece earnings are paid there separately from base salary.
          </div>
        </span>
      </label>
      <label class="f" style="flex-direction:row;gap:8px">
        <input type="checkbox" id="e_epf" style="width:auto" ${p ? (p.epf ? 'checked' : '') : 'checked'}>
        EPF/ETF member
      </label>
      <p class="muted" id="e_hint" style="margin-top:14px;padding:12px;background:var(--s2);border-radius:8px;line-height:1.6">
        ${formHint(cat)}
      </p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveEmp" data-id="${id || ''}">Save</button>`, 1);
  };

  function formHint(cat) {
    if (cat === 'Wage') return `
      <b>Wage Worker</b><br>
      • Attendance days × daily rate paid in <b>Wage runs</b><br>
      • Piece work (if any) paid in the same <b>Wage run</b><br>
      • No advances — wage workers do not take advances`;
    if (cat === 'DailySalaried') return `
      <b>Daily Salaried</b><br>
      • Fixed daily base pay recorded in <b>Daily Salaries</b><br>
      • Any piece work paid separately in <b>Wage runs</b><br>
      • Advances recovered from daily salary records (manual amount each time)`;
    return `
      <b>Monthly Salaried</b><br>
      • Fixed monthly salary paid in <b>Monthly Salary runs</b><br>
      • Any piece work paid separately in <b>Wage runs</b><br>
      • Advances recovered from monthly salary runs (default = field above)`;
  }

  function updateFormVisibility() {
    const cat = E.val('e_type');
    const isMS = cat === 'MonthlySalaried';
    const isSal = cat !== 'Wage';
    if (E.$('e_rate_lbl')) E.$('e_rate_lbl').textContent = RATE_LABEL[cat] || 'Rate (Rs) *';
    if (E.$('e_allow_grp')) E.$('e_allow_grp').style.display = isMS ? '' : 'none';
    if (E.$('e_inst_grp')) E.$('e_inst_grp').style.display = isSal ? '' : 'none';
    if (E.$('e_hint')) E.$('e_hint').innerHTML = formHint(cat);
  }

  E.A.newEmp = () => form();
  E.A.editEmp = id => form(id);

  E.A.saveEmp = async id => {
    const name = E.val('e_name');
    const nic = E.val('e_nic');
    const cat = E.val('e_type');
    const rate = E.c(E.val('e_amt'));

    if (!name) return E.toast('Name required', 'error');
    if (!rate) return E.toast('Enter the ' + (cat === 'MonthlySalaried' ? 'monthly salary' : 'daily rate'), 'error');
    if (!['Wage', 'DailySalaried', 'MonthlySalaried'].includes(cat))
      return E.toast('Invalid pay type', 'error');
    if (nic && E.rows('employees').some(p => p.id !== id && p.nic === nic))
      return E.toast('This NIC is already registered', 'error');

    const p = id ? E.D.employees.find(x => x.id === id) : { active: true, code: await E.next('EMP') };
    const b = id ? JSON.parse(JSON.stringify(p)) : null;

    Object.assign(p, {
      name,
      nic,
      phone: E.val('e_ph'),
      join: E.val('e_join'),
      payType: cat,
      amount: rate,
      allow: cat === 'MonthlySalaried' && E.$('e_allow') ? E.c(E.val('e_allow')) : 0,
      piece: E.$('e_piece') ? E.$('e_piece').checked : false,
      target: E.val('e_tgt') || 'OH',
      advInstall: cat !== 'Wage' && E.$('e_inst') ? E.c(E.val('e_inst')) : 0,
      epf: E.$('e_epf') ? E.$('e_epf').checked : false
    });

    await E.save('employees', p, b);
    E.closeM();
    E.go();
    E.toast('Employee saved', 'success');
  };

  E.A.delEmp = async id => {
    const p = E.D.employees.find(x => x.id === id);
    if (used(id)) {
      const b = JSON.parse(JSON.stringify(p));
      p.active = !p.active;
      await E.save('employees', p, b);
    } else if (confirm('Delete ' + p.name + '?')) {
      await E.del('employees', id);
      await E.audit('delete', 'employees', id, p, null);
    }
    E.go();
  };
})(window.ERP);