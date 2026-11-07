/* Salary & Advance Register — per worker for a chosen month:
   advances taken, recovered, balance, and every payment type paid out
   (wages / daily salaries / monthly salaries shown separately).

   Reads all three pay record kinds:
     ─ wageRuns kind='run' with type='Monthly'   → Monthly Salary
     ─ wageRuns kind='run' (other types)         → Wages
     ─ wageRuns kind='daily-salary'              → Daily Salary
     ─ wageRuns kind='advance'                   → Advance (given)

   Advance columns are hidden (N/A) for wage workers — they never get advances.
*/
(E => {
  let M = E.today().slice(0, 7);
  E.nav('People & Payroll', 'advreg', '📒', 'Salary & Advance Register');

  /* ── pay category helper (mirrors employees.js) ── */
  const payCat = p => {
    const pt = p && p.payType;
    if (pt === 'MonthlySalaried' || pt === 'Monthly') return 'MonthlySalaried';
    if (pt === 'DailySalaried') return 'DailySalaried';
    return 'Wage';
  };
  const CAT_LABEL = {
    Wage: 'Wage',
    DailySalaried: 'Daily Salary',
    MonthlySalaried: 'Monthly Salary'
  };
  const CAT_STYLE = {
    Wage: '',
    DailySalaried: 'background:#dbeafe;color:#1e40af',
    MonthlySalaried: 'background:#f3e8ff;color:#7c3aed'
  };

  /* ── all pay runs (both multi-line wages/monthly and single daily records) ── */
  const allRuns = () => E.rows('wageRuns').filter(r =>
    (r.kind === 'run' || r.kind === 'daily-salary') && !r.cancelled
  );
  const advs = () => E.rows('wageRuns').filter(r => r.kind === 'advance' && !r.cancelled);

  /* ── extract one employee's pay data from a run — handles both shapes ── */
  const payOf = (r, empId) => {
    if (r.kind === 'daily-salary') {
      return r.empId === empId ? {
        net: r.net || 0,
        advRec: r.advRec || 0,
        gross: r.gross || 0,
        kind: 'daily-salary'
      } : null;
    }
    if (r.kind === 'run') {
      const line = (r.lines || []).find(l => l.empId === empId);
      return line ? {
        net: line.net || 0,
        advRec: line.advRec || 0,
        gross: line.gross || 0,
        kind: r.type === 'Monthly' ? 'monthly-salary' : 'wage'
      } : null;
    }
    return null;
  };

  /* ── build the full per-employee dataset for the selected month ── */
  function data() {
    const f = M + '-01';
    const t = M + '-31';

    return E.rows('employees')
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      .map(e => {
        const A = advs().filter(r => r.empId === e.id);
        const R = allRuns()
          .map(r => ({ r, p: payOf(r, e.id) }))
          .filter(x => x.p);

        /* advances given before the month */
        const g0 = A.filter(r => r.date < f).reduce((s, r) => s + r.amount, 0);
        /* advances recovered in runs before the month */
        const c0 = R.filter(x => x.r.date < f).reduce((s, x) => s + x.p.advRec, 0);

        /* advances given during the month */
        const gm = A.filter(r => r.date >= f && r.date <= t);
        /* runs during the month */
        const cm = R.filter(x => x.r.date >= f && x.r.date <= t);

        const g = gm.reduce((s, r) => s + r.amount, 0);
        const c = cm.reduce((s, x) => s + x.p.advRec, 0);

        const netWage    = cm.filter(x => x.p.kind === 'wage').reduce((s, x) => s + x.p.net, 0);
        const netDaily   = cm.filter(x => x.p.kind === 'daily-salary').reduce((s, x) => s + x.p.net, 0);
        const netMonthly = cm.filter(x => x.p.kind === 'monthly-salary').reduce((s, x) => s + x.p.net, 0);
        const net        = netWage + netDaily + netMonthly;

        return {
          e,
          cat: payCat(e),
          open: g0 - c0,
          gm, g, c,
          close: g0 - c0 + g - c,
          net, netWage, netDaily, netMonthly
        };
      })
      .filter(x => x.open || x.g || x.c || x.net || x.close);
  }

  /* ── render the body ── */
  const body = () => {
    const D = data();
    const S = k => D.reduce((s, x) => s + x[k], 0);

    return `<div class="kp">
      ${E.kpi('Advances given', E.m(S('g')), M)}
      ${E.kpi('Recovered from salaries', E.m(S('c')), 'this month')}
      ${E.kpi('Advance balance', E.m(S('close')), 'still owed by salaried staff')}
      ${E.kpi('Wages (net)', E.m(S('netWage')), 'piece & daily workers')}
      ${E.kpi('Daily Salaries (net)', E.m(S('netDaily')), 'daily-salaried staff')}
      ${E.kpi('Monthly Salaries (net)', E.m(S('netMonthly')), 'monthly-salaried staff')}
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Employee</th>
        <th>Category</th>
        <th class="r">Opening Advance</th>
        <th>Advances Taken This Month</th>
        <th class="r">Total Taken</th>
        <th class="r">Recovered</th>
        <th class="r">Closing Balance</th>
        <th class="r">Wages (net)</th>
        <th class="r">Daily Salary (net)</th>
        <th class="r">Monthly Salary (net)</th>
      </tr></thead>
      <tbody>${D.map(x => {
        const hasAdv = x.cat !== 'Wage';
        return `<tr>
          <td>
            <b>${E.esc(x.e.name)}</b><br>
            <span class="muted">${E.esc(x.e.code || '')}</span>
          </td>
          <td><span class="tag" style="${CAT_STYLE[x.cat]}">${CAT_LABEL[x.cat]}</span></td>
          <td class="r">${hasAdv ? E.m(x.open) : '<span class="muted">N/A</span>'}</td>
          <td>${hasAdv
            ? (x.gm.map(r => r.date.slice(5) + ' · ' + E.m(r.amount)).join('<br>') || '—') +
              `<div class="muted" style="font-size:11px">${x.gm.length ? x.gm.length + ' advance(s)' : ''}</div>`
            : '<span class="muted">—</span>'}</td>
          <td class="r">${hasAdv ? E.m(x.g) : '—'}</td>
          <td class="r">${hasAdv ? E.m(x.c) : '—'}</td>
          <td class="r">${hasAdv
            ? `<b class="${x.close > 0 ? 'bad' : ''}">${E.m(x.close)}</b>`
            : '—'}</td>
          <td class="r">${x.netWage    ? E.m(x.netWage)    : '—'}</td>
          <td class="r">${x.netDaily   ? E.m(x.netDaily)   : '—'}</td>
          <td class="r"><b>${x.netMonthly ? E.m(x.netMonthly) : '—'}</b></td>
        </tr>`;
      }).join('') || '<tr><td colspan="10" class="muted">No advances or payments in this month</td></tr>'}</tbody>
    </table></div>
    <p class="muted" style="margin-top:10px">
      Wages are paid from attendance and piece work. Daily Salaries are fixed daily-rate
      payments recorded in <a href="#/daily-salaries" style="color:var(--ac)">Daily Salaries</a>.
      Monthly Salaries are run from
      <a href="#/monthly-salaries" style="color:var(--ac)">Monthly Salaries</a>.
      Advances can only be given to salaried staff and are recovered from their salaries.
    </p>`;
  };

  /* ── route ── */
  E.route('advreg', 'Salary & Advance Register', () =>
    `<div class="bar">
      <input type="month" class="fs" style="max-width:180px" data-f="ar.m" value="${M}">
      <span class="gap"></span>
      <button class="btn" data-a="advM">+ Give advance</button>
      <button class="btn" onclick="window.print()">🖨 Print</button>
    </div>
    <div id="arb">${body()}</div>`);

  /* ── live update when month changes ── */
  E.hooks.push(e => {
    if (e.target.dataset && e.target.dataset.f === 'ar.m' && e.target.value) {
      M = e.target.value;
      E.$('arb').innerHTML = body();
    }
  });
})(window.ERP);