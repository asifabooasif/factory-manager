/* PART 15 (v5) — Expenses with closed-job redirect to 5390.
   Fixes: 5390/5290/5295 excluded from overhead pool & cost analysis.
*/
(E => {
  const pi = E.N.findIndex(n => n.id === 'petty');
  E.N.splice(pi + 1, 0, { g: 'Accounting', id: 'expenses', ico: '🧾', label: 'Expenses & Costs' });
  const F = { tab: 'reg', q: '', nat: '', tr: '', from: E.today().slice(0, 8) + '01', to: E.today() };
  const J = id => E.D.jobs.find(x => x.id === id);
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const EXCLUDE_POOL = ['5290', '5295', '5390'];
  const heads = () => E.rows('coa').filter(a => a.type === 'expense' && a.nature
    && !['contra', 'cogs', 'loss'].includes(a.nature)
    && !EXCLUDE_POOL.includes(a.code) && !a.inactive)
    .sort((a, b) => a.code.localeCompare(b.code));
  const hl = a => a.code + ' — ' + a.name;
  const findHead = t => { t = (t || '').trim().toLowerCase(); return heads().find(a => hl(a).toLowerCase() === t || a.code === t); };
  const TR = { job: 'Charged to job(s) (old)', pool: 'Factory overhead pool', period: 'Normal expense' };
  const TR_DESC = { job: '→ Direct to job WIP', pool: '→ Absorbed month-end', period: '→ Ledger / P&L' };
  const CAT = { dm: 'Material', dl: 'Labour', oh: 'Overhead' };
  const natTag = n => `<span class="tag" style="${n === 'dm' || n === 'dl' ? 'background:#dcfce7;color:#166534' : n === 'oh' ? 'background:#fef3c7;color:#b45309' : 'background:var(--s2);color:var(--t3)'}">${E.esc(E.NATURE[n] || n)}</span>`;

  /* who this expense is costed to: legacy vouchers (charged straight to WIP) or the new costing-only allocations */
  function chargedCell(v) {
    if (v.jobs && v.jobs.length) return v.jobs.map(j => { const jb = J(j.jobId); return jb ? `<div>${E.esc(jb.no)}${jb.status === 'Completed' ? ' <span class="bad">→5390</span>' : ''} ${E.m(j.amount)}</div>` : ''; }).join('');
    if (v.treatment === 'pool') return '<span class="muted">→ absorbed</span>';
    const by = {}; E.rows('costAllocations').filter(a => a.jeId === v.jeId && E.allocAlive(a)).forEach(a => { by[a.jobId] = (by[a.jobId] || 0) + a.amount; });
    const ks = Object.keys(by);
    return ks.length ? ks.map(id => `<div>${E.esc((J(id) || { no: '?' }).no)} ${E.m(by[id])}</div>`).join('') : '<span class="muted">no job</span>';
  }
  const vouchers = () => E.rows('expenses').filter(x => x.kind === 'voucher');

  E.route('expenses', 'Expenses & Costs', () => {
    const poolBal = unabsorbed();
    return `<div class="kp">
      ${E.kpi('Expenses this month', E.m(vouchers().filter(v => !v.cancelled && v.date.slice(0, 7) === E.today().slice(0, 7)).reduce((s, v) => s + v.amount, 0)))}
      ${E.kpi('Accrued unpaid', E.m(E.bal('2300')), '2300')}
      ${E.kpi('Overhead pool', E.m(poolBal), poolBal > 0 ? '<span class="bad">Absorb</span>' : '<span class="ok">Absorbed</span>')}
      ${E.kpi('WIP', E.m(E.bal('1310')), 'in jobs')}
    </div>
    <div class="bar">
      ${[['reg', '🧾 Register'], ['pool', '🏭 Overhead pool'], ['ana', '📊 Cost analysis']].map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="exTab" data-id="${k}">${l}</button>`).join('')}
      <span class="gap"></span>
      ${F.tab === 'reg' ? '<button class="btn p" data-a="exNew">+ New expense</button>' : ''}
    </div>
    <div id="exb">${F.tab === 'reg' ? regTab() : F.tab === 'pool' ? poolTab() : anaTab()}</div>`;
  });
  E.A.exTab = t => { F.tab = t; E.go(); };
  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('ex.')) { F[f.slice(3)] = t.value; E.$('exb').innerHTML = F.tab === 'reg' ? regTab() : F.tab === 'pool' ? poolTab() : anaTab(); return; }
    if (t.id === 'ex_h') headPick();
    if (t.id === 'ex_t') E.A.exTrPick();
    if (t.id === 'ex_pm') E.A.exPayPick();
    if (t.id === 'ex_a') E.A.exLivePreview();
  });

  function regTab() {
    const s = F.q.toLowerCase();
    const R = vouchers().filter(v => (!F.nat || v.nature === F.nat) && (!F.tr || v.treatment === F.tr) && v.date >= F.from && v.date <= F.to && (!s || (v.no + v.headName + v.payee + (v.ref || '') + (v.narr || '')).toLowerCase().includes(s))).sort((a, b) => b.no.localeCompare(a.no));
    const T = R.filter(v => !v.cancelled).reduce((a, v) => a + v.amount, 0);
    return `<div class="bar">
      <input class="fs" style="max-width:240px" placeholder="🔍" data-f="ex.q" value="${E.esc(F.q)}">
      <select class="fs" data-f="ex.nat"><option value="">All natures</option>${Object.entries(E.NATURE).filter(([k]) => !['contra', 'cogs', 'loss'].includes(k)).map(([k, v]) => `<option value="${k}" ${F.nat === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="fs" data-f="ex.tr"><option value="">All treatments</option>${Object.entries(TR).map(([k, v]) => `<option value="${k}" ${F.tr === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input type="date" class="fs" data-f="ex.from" value="${F.from}">
      <input type="date" class="fs" data-f="ex.to" value="${F.to}">
    </div>
    <div class="tw"><table>
      <thead><tr><th>Date</th><th>No</th><th>Head</th><th>Nature</th><th>Treatment</th><th>Costed to jobs</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${R.map(v => `<tr style="${v.cancelled ? 'opacity:.45' : ''}">
        <td>${v.date}</td><td>${v.no}</td>
        <td><b>${E.esc(v.headName)}</b>${v.payee ? '<div class="muted" style="font-size:11px">' + E.esc(v.payee) + '</div>' : ''}</td>
        <td>${natTag(v.nature)}</td>
        <td><span class="tag">${TR[v.treatment]}</span></td>
        <td>${chargedCell(v)}</td>
        <td class="r"><b>${E.m(v.amount)}</b></td>
        <td><span class="tag">${v.cancelled ? 'Cancelled' : v.pay === 'ACCR' ? (v.paid ? 'Paid' : 'Accrued') : 'Paid'}</span></td>
        <td class="r">${!v.cancelled && v.pay === 'ACCR' && !v.paid ? `<button class="btn sm p" data-a="exPay" data-id="${v.id}">Pay</button> ` : ''}${!v.cancelled && v.treatment !== 'pool' && !(v.jobs && v.jobs.length) ? `<button class="btn sm" data-a="alEdit" data-id="${v.jeId}">🎯 Job</button> ` : ''}${!v.cancelled && !(v.pay === 'ACCR' && v.paid) ? `<button class="btn sm d" data-a="exCancel" data-id="${v.id}">Cancel</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted">No expenses</td></tr>'}
      <tr style="background:var(--s2)"><td colspan="6" class="r"><b>Total</b></td><td class="r"><b>${E.m(T)}</b></td><td colspan="2"></td></tr>
      </tbody>
    </table></div>`;
  }

  E.A.exNew = () => {
    if (!heads().length) return E.toast('No expense heads', 'error');
    E.modal('New expense', `
      <div class="g2">
        <div class="f">Date<input id="ex_d" type="date" value="${E.today()}"></div>
        <div class="f">Head *<input id="ex_h" list="exh" placeholder="Click to choose"></div>
      </div>
      <datalist id="exh">${heads().map(a => `<option value="${E.esc(hl(a))}" data-g="${E.esc(E.NATURE[a.nature])}" data-a="${a.code}" data-b="${a.beh || ''}" data-k="${E.esc(a.name)}">`).join('')}</datalist>
      <div id="ex_cls" class="card" style="background:var(--acs);display:none;margin:10px 0"></div>
      <div class="g2">
        <div class="f">Amount (Rs) *<input id="ex_a" type="number" step="0.01" oninput="E.A.exLivePreview()"></div>
        <div class="f">Accounting treatment<select id="ex_t" onchange="E.A.exTrPick()"></select></div>
      </div>
      <div id="ex_jobs" style="display:none">${E.allocUI('ex')}</div>
      <div id="ex_pooln" class="muted" style="display:none;font-size:12px;margin:6px 0">Overhead pool costs reach the jobs when you run "Absorb" at month-end, so no job is chosen here.</div>
      <div id="ex_live" style="margin-top:10px"></div>
      <div class="g2">
        <div class="f">Payment *<select id="ex_pm" onchange="E.A.exPayPick()">
          <option value="">— select —</option>
          ${E.opts(a => a.bank || a.code === '1010')}
          <option value="ACCR">On credit (accrue)</option>
        </select></div>
        <div class="f">Payee<input id="ex_p" list="exp"></div>
        <datalist id="exp">${E.rows('parties').map(p => `<option value="${E.esc(p.name)}">`).join('')}</datalist>
        <div class="f">Reference<input id="ex_r"></div>
      </div>
      <div class="f">Details<input id="ex_n"></div>
      <p class="muted" id="ex_note" style="font-size:12px"></p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="exSave">Post</button>`, 1);
    headPick();
  };

  function headPick() {
    const a = findHead(E.val('ex_h')), c = E.$('ex_cls'), t = E.$('ex_t');
    if (!c) return;
    if (!a) { c.style.display = 'none'; t.innerHTML = '<option value="">— choose head —</option>'; E.$('ex_jobs').style.display = 'none'; E.$('ex_pooln').style.display = 'none'; return; }
    const d = E.natureTreat(a.nature) === 'pool' ? 'pool' : 'period';
    const opts = a.nature === 'oh' ? ['pool', 'period'] : ['period'];
    t.innerHTML = opts.map(k => `<option value="${k}" ${k === d ? 'selected' : ''}>${TR[k]} ${TR_DESC[k]}</option>`).join('');
    c.style.display = '';
    c.innerHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <div><small class="muted">Head</small><div><b>${E.esc(a.name)}</b></div></div>
      <div><small class="muted">Nature</small><div>${natTag(a.nature)}</div></div>
      <div><small class="muted">Behaviour</small><div>${a.beh || '—'}</div></div>
    </div>`;
    E.A.exTrPick(); E.A.exPayPick(); E.A.exLivePreview();
  }

  E.A.exTrPick = () => {
    const t = E.val('ex_t'), g = E.$('ex_jobs'), n = E.$('ex_pooln'), has = !!findHead(E.val('ex_h'));
    if (g) g.style.display = has && t !== 'pool' ? '' : 'none';
    if (n) n.style.display = has && t === 'pool' ? '' : 'none';
    E.A.exLivePreview();
  };

  E.A.exPayPick = () => {
    const n = E.$('ex_note'), p = E.val('ex_pm'), a = findHead(E.val('ex_h'));
    if (!n) return;
    const nm = a ? a.code + ' ' + a.name : 'the expense head';
    n.textContent = p === 'ACCR' ? 'Posts Dr ' + nm + ' / Cr 2300 Accrued expenses' : p ? 'Posts Dr ' + nm + ' / Cr ' + p + ' · balance ' + E.m(E.bal(p)) : '';
  };

  E.A.exLivePreview = () => {
    const box = E.$('ex_live');
    if (!box) return;
    const a = findHead(E.val('ex_h'));
    const amt = E.c(E.val('ex_a'));
    const tr = E.val('ex_t');
    if (!a || !amt) { box.innerHTML = ''; return; }
    box.innerHTML = tr === 'pool'
      ? `<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);padding:12px;border-radius:10px;border-left:4px solid #d97706"><b>⏳ Overhead pool</b><br><span style="font-size:13px">${E.m(amt)} is debited to ${E.esc(a.name)} and absorbed into jobs at month-end. New pool: <b>${E.m(unabsorbed() + amt)}</b></span></div>`
      : `<div style="background:linear-gradient(135deg,#e0e7ff,#c7d2fe);padding:12px;border-radius:10px;border-left:4px solid #4f46e5"><b>📒 Normal expense</b><br><span style="font-size:13px">Dr ${E.esc(a.name)} ${E.m(amt)} → profit &amp; loss. The job choice above is for costing only.</span></div>`;
  };

  E.A.exSave = async () => {
    try {
      const a = findHead(E.val('ex_h')), amt = E.c(E.val('ex_a')), tr = E.val('ex_t'), pm = E.val('ex_pm'), d = E.val('ex_d');
      if (!a) throw new Error('Choose head');
      if (amt <= 0) throw new Error('Enter amount');
      if (!pm) throw new Error('Choose payment');
      if (!d) throw new Error('Choose date');
      const sh = tr === 'pool' ? [] : E.allocRead('ex');
      if (pm !== 'ACCR' && E.bal(pm) < amt && !confirm('Balance < expense. Continue?')) return;
      const no = await E.next('EXP');
      const cr = pm === 'ACCR' ? '2300' : pm;
      const payee = E.val('ex_p');
      const narr = [a.name, E.val('ex_n'), payee && 'to ' + payee].filter(Boolean).join(' · ');
      /* NORMAL ACCOUNTING: Dr expense account / Cr cash, bank or accrued expenses. Nothing here touches job WIP. */
      const lines = [{ acc: a.code, dr: amt }, { acc: cr, cr: amt }];
      await E.postThen({ date: d, ref: no, narr, source: 'expense', lines }, async je => {
        await E.save('expenses', {
          kind: 'voucher', no, date: d, head: a.code, headName: a.name, nature: a.nature, treatment: tr, amount: amt,
          pay: pm, payee, ref: E.val('ex_r'), narr: E.val('ex_n'), jobs: [],
          jeId: je.id, jeNo: je.no, cancelled: false, paid: false
        });
        /* costing record only (no ledger lines) */
        if (sh.length) await E.allocSplit(je, sh);
      });
      E.closeM(); E.go();
      E.toast(no + ' posted' + E.allocText(sh), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.exCancel = async id => {
    try {
      const v = E.D.expenses.find(x => x.id === id);
      if (v.paid) throw new Error('This expense is already paid; cancel the payment first');
      if (!confirm('Cancel ' + v.no + '?')) return;
      if (v.jobs && v.jobs.some(j => (J(j.jobId) || {}).status === 'Completed')) throw new Error('Job completed; use journal adjustment');
      await E.reverse(v.jeId);
      const b = JSON.parse(JSON.stringify(v));
      v.cancelled = true;
      await E.save('expenses', v, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.exPay = id => {
    const v = E.D.expenses.find(x => x.id === id);
    E.modal('Pay accrued · ' + v.no, `
      <div class="g2">
        <div class="f">Date<input id="z_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount<input value="${(v.amount / 100).toFixed(2)}" disabled></div>
      </div>
      <div class="f">Paid from *<select id="z_s"><option value="">—</option>${E.opts(a => a.bank || a.code === '1010')}</select></div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="exPaySave" data-id="${id}">Pay</button>`);
  };
  E.A.exPaySave = async id => {
    try {
      const v = E.D.expenses.find(x => x.id === id), s = E.val('z_s');
      if (!s) throw new Error('Select account');
      await E.post({ date: E.val('z_d'), ref: v.no, narr: 'Pay accrued ' + v.headName, source: 'expense', lines: [{ acc: '2300', dr: v.amount }, { acc: s, cr: v.amount }] });
      const b = JSON.parse(JSON.stringify(v));
      v.paid = true;
      await E.save('expenses', v, b);
      E.closeM(); E.go(); E.toast('Paid', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ─── Exclude 5290/5295/5390 from the overhead pool. 5260 (factory machinery depreciation) is a PERIOD expense by owner's decision: it is never absorbed into product cost ─── */
  const poolAccts = () => E.rows('coa').filter(a =>
    a.type === 'expense' && a.nature === 'oh' &&
    !['5290', '5295', '5390', '5260'].includes(a.code) && !a.inactive
  );
  E.unabsorbed = () => unabsorbed();
  function unabsorbed() {
    const t = E.totals();
    return poolAccts().reduce((s, a) => s + E.bal(a.code, t), 0) + E.bal('5290', t);
  }
  const wip = id => E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === id && l.acc === '1310'));
  function weights(basis, js) {
    return js.map(j => {
      let w = 1;
      if (basis === 'packs') w = E.rows('jobLines').filter(l => l.jobId === j.id).reduce((s, l) => s + l.released, 0);
      else if (basis === 'labour') w = wip(j.id).filter(l => l.cat === 'Labour').reduce((s, l) => s + l.dr - l.cr, 0);
      else if (basis === 'material') w = wip(j.id).filter(l => l.cat === 'Material').reduce((s, l) => s + l.dr - l.cr, 0);
      return Math.max(0, w);
    });
  }

  function poolTab() {
    const t = E.totals(), P = poolAccts(), un = unabsorbed();
    const runs = E.rows('costRuns').sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="kp">
      ${E.kpi('Pool', E.m(P.reduce((s, a) => s + E.bal(a.code, t), 0)))}
      ${E.kpi('Absorbed', E.m(-E.bal('5290', t)))}
      ${E.kpi('Unabsorbed', E.m(un), un > 0 ? '<span class="bad">Absorb</span>' : '<span class="ok">Clear</span>')}
    </div>
    <div class="card">
      <h3>Indirect heads</h3>
      <div class="tw"><table><thead><tr><th>Head</th><th>Behaviour</th><th class="r">Balance</th></tr></thead>
        <tbody>${P.filter(a => E.bal(a.code, t) !== 0).map(a => `<tr><td>${a.code} — ${E.esc(a.name)}</td><td>${a.beh || ''}</td><td class="r">${E.m(E.bal(a.code, t))}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3>Absorb into jobs</h3>
      ${active().length ? `<div class="g2">
        <div class="f">Amount<input id="ab_a" type="number" step="0.01" value="${un > 0 ? (un / 100).toFixed(2) : ''}"></div>
        <div class="f">Basis<select id="ab_b">
          <option value="packs">Packs released</option>
          <option value="labour">Direct labour</option>
          <option value="material">Direct material</option>
          <option value="equal">Equal</option>
        </select></div>
        <div class="f">Date<input id="ab_d" type="date" value="${E.today()}"></div>
      </div>
      <button class="btn" data-a="abPrev">Preview</button>
      <button class="btn p" data-a="abSave">Post</button>
      <div id="ab_pv"></div>` : '<p class="bad">No jobs in progress</p>'}
    </div>
    <div class="card"><h3>History</h3><div class="tw"><table>
      <thead><tr><th>No</th><th>Date</th><th>Basis</th><th>Jobs</th><th class="r">Amount</th><th></th></tr></thead>
      <tbody>${runs.map(r => `<tr style="${r.cancelled ? 'opacity:.45' : ''}"><td>${r.no}</td><td>${r.date}</td><td>${r.basis}</td><td>${r.jobs.map(j => E.esc((J(j.jobId) || {}).no) + ' ' + E.m(j.amount)).join(' · ')}</td><td class="r">${E.m(r.amount)}</td><td class="r">${r.cancelled ? '—' : `<button class="btn sm d" data-a="abCancel" data-id="${r.id}">Reverse</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">None</td></tr>'}</tbody>
    </table></div></div>`;
  }

  function split() {
    const amt = E.c(E.val('ab_a')), js = active(), w = weights(E.val('ab_b'), js);
    let tw = w.reduce((a, b) => a + b, 0);
    if (!tw) { js.forEach((_, i) => w[i] = 1); tw = js.length; }
    let left = amt;
    const ks = js.map((j, i) => ({ j, w: w[i] })).filter(x => x.w > 0);
    return { amt, rows: ks.map((x, i) => { const v = i === ks.length - 1 ? left : Math.round(amt * x.w / tw); left -= v; return { jobId: x.j.id, amount: v, w: x.w }; }) };
  }
  E.A.abPrev = () => {
    const s = split();
    E.$('ab_pv').innerHTML = `<div class="tw" style="margin-top:10px"><table><tbody>${s.rows.map(r => `<tr><td>${E.esc(J(r.jobId).no)}</td><td class="r">${E.m(r.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  E.A.abSave = async () => {
    try {
      const s = split();
      if (s.amt <= 0) throw new Error('Enter amount');
      const d = E.val('ab_d'), no = await E.next('ABS');
      const je = await E.post({ date: d, ref: no, narr: 'Absorb (' + E.val('ab_b') + ')', source: 'expense',
        lines: s.rows.map(r => ({ acc: '1310', dr: r.amount, job: r.jobId, cat: 'Overhead', head: '5290' })).concat([{ acc: '5290', cr: s.amt }]) });
      await E.save('costRuns', { no, kind: 'absorb', date: d, basis: E.val('ab_b'), amount: s.amt, jobs: s.rows.map(r => ({ jobId: r.jobId, amount: r.amount })), jeId: je.id, cancelled: false });
      E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.abCancel = async id => {
    try {
      const r = E.D.costRuns.find(x => x.id === id);
      if (!confirm('Reverse ' + r.no + '?')) return;
      await E.reverse(r.jeId);
      const b = JSON.parse(JSON.stringify(r));
      r.cancelled = true;
      await E.save('costRuns', r, b);
      E.go();
    } catch (e) { E.toast(e.message, 'error'); }
  };

  function anaTab() {
    const H = {};
    E.rows('journalEntries').filter(j => j.date >= F.from && j.date <= F.to).forEach(j => j.lines.forEach(l => {
      let h = '';
      if (l.acc === '1310') {
        if (l.head) h = l.head;
        else if (l.cat === 'Material') h = '5000';
        else if (l.cat === 'Labour') h = '5110';
        else if (l.cat === 'Overhead') h = '5200';
        else return;
      } else {
        const a = E.acct(l.acc);
        if (!a || a.type !== 'expense' || !a.nature || ['loss', 'cogs', 'contra'].includes(a.nature) || a.code === '5390') return;
        h = l.acc;
      }
      const v = l.dr - l.cr;
      if (l.acc === '1310' && l.head === '5290') return;
      H[h] = (H[h] || 0) + v;
    }));
    const G = {};
    Object.keys(H).forEach(h => { const a = E.acct(h) || { name: h, nature: 'oth' }; (G[a.nature] = G[a.nature] || []).push({ h, a, v: H[h] }); });
    const nat = k => (G[k] || []).reduce((s, x) => s + x.v, 0);
    const order = ['dm', 'dl', 'oh', 'contra', 'adm', 'sel', 'fin', 'oth'];
    const direct = nat('dm') + nat('dl'), ind = nat('oh') + nat('contra'), per = nat('adm') + nat('sel') + nat('fin') + nat('oth');
    return `<div class="bar">
      <span class="muted">Period</span>
      <input type="date" class="fs" data-f="ex.from" value="${F.from}">
      <input type="date" class="fs" data-f="ex.to" value="${F.to}">
    </div>
    <div class="kp">
      ${E.kpi('Direct', E.m(direct), 'dm + dl')}
      ${E.kpi('Indirect', E.m(ind), 'oh')}
      ${E.kpi('Period', E.m(per), 'admin + selling + fin')}
      ${E.kpi('Total', E.m(direct + ind + per))}
    </div>
    <div class="tw"><table>
      <thead><tr><th>Nature / head</th><th class="r">Amount</th></tr></thead>
      <tbody>${order.filter(k => G[k]).map(k => `<tr style="background:var(--s2)"><td><b>${E.esc(E.NATURE[k])}</b></td><td class="r"><b>${E.m(nat(k))}</b></td></tr>` + G[k].sort((a, b) => a.h.localeCompare(b.h)).map(x => `<tr><td style="padding-left:28px">${x.h} — ${E.esc(x.a.name)}</td><td class="r">${E.m(x.v)}</td></tr>`).join('')).join('') || '<tr><td colspan="2" class="muted">No costs</td></tr>'}</tbody>
    </table></div>`;
  }
})(window.ERP);