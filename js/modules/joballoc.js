/* JOB COST ALLOCATION — for COSTING ONLY.
   Every expense, wage, salary, transport or petty-cash entry posts to the ledger exactly like a normal accounting system:
   Dr the expense account, Cr cash / bank / payable. Nothing about the job changes the accounts.
   Separately, the person can say "this cost belongs to job X (or all jobs)". That is saved as a plain costing record
   (collection costAllocations) and is read ONLY by the job cost sheet and the costing reports.
   A costing record is valid only while its ledger entry is live: when the entry is cancelled / reversed / deleted, the costing record stops counting by itself. */
(E => {
  const COL = 'costAllocations';
  const SKIP = ['5290', '5295', '5390'];
  const NOT = ['contra', 'cogs', 'loss'];
  const jeById = id => E.D.journalEntries.find(j => j.id === id);
  const J = id => E.D.jobs.find(j => j.id === id);
  const esc = s => E.esc(s == null ? '' : String(s));
  const catOf = a => (a && a.nature === 'dm') ? 'Material' : (a && a.nature === 'dl') ? 'Labour' : 'Overhead';

  /* ---------- data ---------- */
  E.allocAlive = a => { if (!a || a.cancelled) return false; if (!a.jeId) return true; const je = jeById(a.jeId); return !!je && !je.reversedBy; };
  E.allocRows = jobId => E.rows(COL).filter(a => E.allocAlive(a) && (!jobId || a.jobId === jobId));

  /* expense debits of a ledger entry = the amount that can be allocated, by expense account */
  E.allocBase = je => {
    const m = {};
    (je.lines || []).forEach(l => {
      if (!l.dr || SKIP.includes(l.acc)) return;
      const a = E.acct(l.acc); if (!a || a.type !== 'expense' || NOT.includes(a.nature)) return;
      m[l.acc] = (m[l.acc] || 0) + l.dr;
    });
    return m;
  };
  const baseTotal = je => Object.values(E.allocBase(je)).reduce((s, v) => s + v, 0);

  /* replace the costing records of one ledger entry. rows = [{jobId, head, amount}] */
  E.allocPut = async (je, rows) => {
    for (const o of E.rows(COL).filter(a => a.jeId === je.id)) await E.del(COL, o.id);
    const out = [];
    for (const r of (rows || [])) {
      if (!r.amount) continue;
      const ac = E.acct(r.head) || {};
      out.push(await E.save(COL, { factoryId: E.fid, date: je.date, jeId: je.id, jeNo: je.no, jobId: r.jobId, head: r.head, headName: ac.name || r.head, cat: catOf(ac), amount: r.amount, narr: je.narr || '', cancelled: false }));
    }
    return out;
  };
  /* shares = [{jobId, p}] with p in 1/100 of a percent, total 10000 */
  E.allocSplit = async (je, shares) => {
    if (!shares || !shares.length) return E.allocPut(je, []);
    const base = E.allocBase(je), rows = [];
    Object.keys(base).forEach(h => {
      let left = base[h];
      shares.forEach((s, i) => { const v = i === shares.length - 1 ? left : Math.round(base[h] * s.p / 10000); left -= v; rows.push({ jobId: s.jobId, head: h, amount: v }); });
    });
    return E.allocPut(je, rows);
  };

  /* the costing layer on top of a job's existing "shadow" figures (used by the job cost sheet) */
  E.withAlloc = (base, jobId) => {
    const rows = E.allocRows(jobId); if (!rows.length) return base;
    const per = Object.assign({}, base.perExpenseTotal || {}); let tot = 0;
    rows.forEach(a => { per[a.head] = (per[a.head] || 0) + a.amount; tot += a.amount; });
    return Object.assign({}, base, { totalFixedAllocated: (base.totalFixedAllocated || 0) + tot, perExpenseTotal: per, allocTotal: tot });
  };
  E.jobAllocTotal = jobId => E.allocRows(jobId).reduce((s, a) => s + a.amount, 0);

  /* ---------- picker used inside the Expense / Petty cash / Daily salary forms ---------- */
  const pickJobs = pre => {
    const cut = new Date(); cut.setDate(cut.getDate() - 30); const c = cut.toISOString().slice(0, 10);
    return E.rows('jobs').filter(j => j.status === 'In Progress' || (pre && pre[j.id]) || (j.status === 'Completed' && j.completedAt && j.completedAt >= c));
  };
  E.allocUI = (p, o) => {
    o = o || {}; const pre = o.pre || {}, hasPre = Object.keys(pre).length, js = pickJobs(pre);
    return `<div class="card" style="background:var(--acs);margin:12px 0;padding:12px">
      <b>🎯 Job costing (optional)</b>
      <div class="muted" style="font-size:12px;margin:2px 0 8px">Only for costing. The accounts are posted normally (expense account ↔ cash / bank) whatever you choose here.</div>
      <div class="f">Allocate this cost to
        <select id="${p}_am" onchange="E.A.alMode('${p}')">
          <option value="none" ${hasPre ? '' : 'selected'}>No job (do not use in job costing)</option>
          <option value="sel" ${hasPre ? 'selected' : ''}>Selected job(s) — share %</option>
          <option value="all">All jobs in progress — equal share</option>
        </select></div>
      <div id="${p}_ab" style="display:${hasPre ? '' : 'none'}">
        <div class="tw"><table><thead><tr><th>Job</th><th>Customer</th><th>Status</th><th class="r">Share %</th></tr></thead><tbody>
        ${js.map(j => `<tr><td>${esc(j.no)}</td><td>${esc((E.D.parties.find(x => x.id === j.partyId) || { name: 'Stock' }).name)}</td><td><span class="tag">${esc(j.status)}</span></td>
          <td class="r"><input class="al-${p}" data-id="${j.id}" type="number" step="0.01" value="${pre[j.id] ? (pre[j.id] / 100).toFixed(2) : ''}" style="width:80px;padding:6px;border:1px solid var(--bd);border-radius:8px" oninput="E.A.alSum('${p}')"></td></tr>`).join('') || '<tr><td colspan="4" class="bad">No jobs available</td></tr>'}
        </tbody></table></div>
        <div class="bar" style="margin-top:6px"><button type="button" class="btn sm" data-a="alEq" data-id="${p}">Split equally</button><span class="gap"></span><span id="${p}_at" class="muted"></span></div>
      </div>
      ${o.note ? `<div class="muted" style="font-size:12px;margin-top:6px">${o.note}</div>` : ''}
    </div>`;
  };
  E.A.alMode = p => { const b = E.$(p + '_ab'); if (b) b.style.display = E.val(p + '_am') === 'sel' ? '' : 'none'; E.A.alSum(p); };
  E.A.alSum = p => {
    const t = E.$(p + '_at'); if (!t) return;
    const s = [...document.querySelectorAll('.al-' + p)].reduce((a, i) => a + Math.round((parseFloat(i.value) || 0) * 100), 0);
    t.innerHTML = E.val(p + '_am') === 'sel' ? (s === 10000 ? '<span class="ok">Total 100%</span>' : '<span class="bad">Total ' + (s / 100).toFixed(2) + '% — must be 100%</span>') : '';
  };
  E.A.alEq = p => {
    const a = [...document.querySelectorAll('.al-' + p)]; if (!a.length) return;
    const base = Math.floor(10000 / a.length);
    a.forEach((i, k) => { i.value = ((k === a.length - 1 ? 10000 - base * (a.length - 1) : base) / 100).toFixed(2); });
    E.A.alSum(p);
  };
  /* read the picker: [] when no job, else [{jobId, p}] totalling 10000. Throws a clear message when the shares are wrong. */
  E.allocRead = p => {
    const m = E.val(p + '_am'); if (!m || m === 'none') return [];
    const eq = ids => { const b = Math.floor(10000 / ids.length); return ids.map((id, k) => ({ jobId: id, p: k === ids.length - 1 ? 10000 - b * (ids.length - 1) : b })); };
    if (m === 'all') { const js = E.rows('jobs').filter(j => j.status === 'In Progress'); if (!js.length) throw new Error('There is no job in progress to allocate to. Choose "No job" or create the job first.'); return eq(js.map(j => j.id)); }
    const sp = [...document.querySelectorAll('.al-' + p)].map(i => ({ jobId: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
    if (!sp.length) throw new Error('Job costing: enter a share % for at least one job, or choose "No job".');
    if (sp.reduce((s, x) => s + x.p, 0) !== 10000) throw new Error('Job costing: the shares must total 100%.');
    return sp;
  };
  /* "Rs 1,000 to JOB-0001, Rs 500 to JOB-0002" for the success message */
  E.allocText = shares => shares && shares.length ? ' · costed to ' + shares.length + ' job' + (shares.length > 1 ? 's' : '') : '';

  /* ---------- register screen: allocate / change / clear for ANY earlier entry ---------- */
  const F = { from: E.today().slice(0, 8) + '01', to: E.today(), job: '', st: '', q: '' };
  const NOSRC = ['reversal', 'opening', 'release', 'issue', 'jobcost', 'production', 'cleanup', 'adjust', 'sale', 'purchase', 'receipt', 'cheque', 'loan', 'advance', 'writeoff'];
  const SRCN = { expense: 'Expense', petty: 'Petty cash', payroll: 'Salary / wages', manual: 'Journal', voucher: 'Voucher', asset: 'Asset', payment: 'Payment' };
  const isPool = je => { const v = E.rows('expenses').find(x => x.jeId === je.id); return !!(v && v.treatment === 'pool'); };
  const eligible = () => E.rows('journalEntries').filter(j => !j.reversedBy && !NOSRC.includes(j.source) && j.date >= F.from && j.date <= F.to && baseTotal(j) > 0 && !isPool(j));
  const allocOf = je => E.rows(COL).filter(a => a.jeId === je.id && E.allocAlive(a));

  E.nav('Accounting', 'joballoc', '🎯', 'Job Cost Allocation');
  E.route('joballoc', 'Job Cost Allocation', () => `<div class="card"><p class="muted" style="margin:0">Every expense, wage, salary, transport or petty-cash entry is posted to the ledger as normal. Here you decide which <b>job(s)</b> each cost belongs to, <b>for costing only</b>. Changing or clearing an allocation never changes any account, balance or financial report. Use this screen for entries that were made before, or to correct an allocation.</p></div>
    <div class="bar">
      <input class="fs" style="max-width:220px" placeholder="🔍 search" data-f="al.q" value="${esc(F.q)}">
      <select class="fs" data-f="al.st"><option value="">All entries</option><option value="un" ${F.st === 'un' ? 'selected' : ''}>Not allocated</option><option value="al" ${F.st === 'al' ? 'selected' : ''}>Allocated</option></select>
      <select class="fs" data-f="al.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${esc(j.no)}</option>`).join('')}</select>
      <input type="date" class="fs" data-f="al.from" value="${F.from}"><input type="date" class="fs" data-f="al.to" value="${F.to}">
    </div><div id="alb">${body()}</div>`);
  function body() {
    const s = F.q.toLowerCase();
    const R = eligible().filter(j => {
      const al = allocOf(j);
      if (F.st === 'un' && al.length) return false; if (F.st === 'al' && !al.length) return false;
      if (F.job && !al.some(a => a.jobId === F.job)) return false;
      return !s || (j.no + ' ' + (j.narr || '') + ' ' + (j.ref || '')).toLowerCase().includes(s);
    }).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    const tot = R.reduce((a, j) => a + baseTotal(j), 0), done = R.reduce((a, j) => a + allocOf(j).reduce((x, y) => x + y.amount, 0), 0);
    return `<div class="kp">${E.kpi('Entries shown', R.length)}${E.kpi('Cost in these entries', E.m(tot))}${E.kpi('Allocated to jobs', E.m(done), 'costing only')}${E.kpi('Not allocated', E.m(tot - done))}</div>
    <div class="tw"><table><thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Details</th><th class="r">Cost</th><th>Costed to</th><th></th></tr></thead><tbody>
    ${R.map(j => {
      const al = allocOf(j), by = {}; al.forEach(a => by[a.jobId] = (by[a.jobId] || 0) + a.amount);
      return `<tr><td>${j.date}</td><td>${esc(j.no)}</td><td><span class="tag">${SRCN[j.source] || esc(j.source)}</span></td><td>${esc(j.narr || '')}</td><td class="r"><b>${E.m(baseTotal(j))}</b></td>
        <td>${Object.keys(by).map(id => `<div>${esc((J(id) || { no: '?' }).no)} ${E.m(by[id])}</div>`).join('') || '<span class="muted">—</span>'}</td>
        <td class="r"><button class="btn sm p" data-a="alEdit" data-id="${j.id}">${al.length ? 'Change' : 'Allocate'}</button>${al.length ? ` <button class="btn sm d" data-a="alClear" data-id="${j.id}">Clear</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">No entries in this period</td></tr>'}
    </tbody></table></div>`;
  }
  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('al.')) { F[f.slice(3)] = t.value; const b = E.$('alb'); if (b) b.innerHTML = body(); }
  });
  E.A.alEdit = id => {
    const je = jeById(id); if (!je) return E.toast('Entry not found', 'error');
    const base = baseTotal(je), pre = {};
    allocOf(je).forEach(a => { pre[a.jobId] = (pre[a.jobId] || 0) + a.amount; });
    Object.keys(pre).forEach(k => { pre[k] = base ? Math.round(pre[k] * 10000 / base) : 0; });
    E.modal('Costing allocation · ' + je.no, `<p class="muted" style="margin-top:0">${esc(je.narr || '')} · cost <b>${E.m(base)}</b> · ${je.date}</p>${E.allocUI('ea', { pre })}`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="alSave" data-id="${id}">Save allocation</button>`, 1);
    E.A.alSum('ea');
  };
  E.A.alSave = async id => {
    try {
      const je = jeById(id); if (!je) throw new Error('Entry not found');
      const sh = E.allocRead('ea'); await E.allocSplit(je, sh);
      E.closeM(); const b = E.$('alb'); if (b) b.innerHTML = body(); E.toast(sh.length ? 'Allocation saved (costing only)' : 'Allocation cleared', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.alClear = async id => {
    try { const je = jeById(id); if (!je) return; if (!confirm('Remove the job allocation of ' + je.no + '? The accounts are not affected.')) return; await E.allocPut(je, []); const b = E.$('alb'); if (b) b.innerHTML = body(); E.toast('Allocation cleared', 'success'); }
    catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);
