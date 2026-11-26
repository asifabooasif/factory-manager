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
      out.push(await E.save(COL, { factoryId: E.fid, date: je.date, jeId: je.id, jeNo: je.no, jobId: r.jobId, head: r.head, headName: ac.name || r.head, cat: r.cat || catOf(ac), art: r.art || '', logNo: r.logNo || '', kind: r.kind || '', amount: r.amount, narr: je.narr || '', cancelled: false }));
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

  /* costing records that have NO ledger entry of their own (month-end overhead absorption, standard BOM-misc amounts).
     rec = {date, jobId, head, amount, art?, kind, refId, refNo, narr}. They stop counting when the owner record is cancelled (allocVoid). */
  E.allocRaw = async rec => {
    const ac = E.acct(rec.head) || {};
    return E.save(COL, { factoryId: E.fid, date: rec.date, jeId: '', jeNo: rec.refNo || '', jobId: rec.jobId, head: rec.head, headName: rec.headName || ac.name || rec.head, cat: rec.cat || catOf(ac), art: rec.art || '', kind: rec.kind || '', refId: rec.refId || '', amount: rec.amount, narr: rec.narr || '', cancelled: false });
  };
  E.allocVoid = async match => {
    for (const a of E.rows(COL).filter(x => !x.cancelled && match(x))) { const b = JSON.parse(JSON.stringify(a)); a.cancelled = true; await E.save(COL, a, b); }
  };
  /* total allocated to one job split by article: {artId: amount, '': job-level / shared} */
  E.allocByArt = jobId => { const m = {}; E.allocRows(jobId).forEach(a => { m[a.art || ''] = (m[a.art || ''] || 0) + a.amount; }); return m; };
  /* allocated to one job by cost type and by head */
  E.allocByCat = jobId => { const m = { Material: 0, Labour: 0, Overhead: 0 }; E.allocRows(jobId).forEach(a => { m[a.cat] = (m[a.cat] || 0) + a.amount; }); return m; };
  /* duplicate guard used by the entry forms: returns a readable line when a live entry looks the same, else '' */
  E.dupExpense = (head, amount, date, payee) => {
    const v = E.rows('expenses').find(x => !x.cancelled && x.kind === 'voucher' && x.head === head && x.amount === amount && x.date === date && (x.payee || '').trim().toLowerCase() === (payee || '').trim().toLowerCase() && E.jeOf(x) && !E.isReversed(x.jeId));
    return v ? v.no + ' · ' + v.headName + ' · ' + E.m(v.amount) + ' · ' + v.date + (v.payee ? ' · ' + v.payee : '') : '';
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

  /* ---------- reconciliation: ledger expense = allocated to jobs + not allocated, per head, plus a total per job ---------- */
  const RF = { from: E.today().slice(0, 8) + '01', to: E.today() };
  const RNOSRC = NOSRC.filter(x => x !== 'production');
  E.nav('Accounting', 'allocrecon', '🧮', 'Job Cost Reconciliation');
  E.route('allocrecon', 'Job Cost Reconciliation', () => `<div class="card"><p class="muted" style="margin:0">For the period you choose: every cost the ledger booked as an expense, how much of it is tagged to jobs (costing only) and how much has no job. The ledger figure is never changed by the job tags. A difference in the last column is an <b>error to look at</b>.</p></div>
    <div class="bar"><input type="date" class="fs" data-f="rc.from" value="${RF.from}"><input type="date" class="fs" data-f="rc.to" value="${RF.to}"></div><div id="rcb">${reconBody()}</div>`);
  function reconBody() {
    const H = {}, pool = { amt: 0 };
    let over = 0;
    E.rows('journalEntries').filter(j => !j.reversedBy && !RNOSRC.includes(j.source) && j.date >= RF.from && j.date <= RF.to).forEach(j => {
      const base = E.allocBase(j), pl = isPool(j);
      const al = {}; allocOf(j).forEach(a => { al[a.head] = (al[a.head] || 0) + a.amount; });
      Object.keys(base).forEach(h => {
        if (pl) { pool.amt += base[h]; return; }
        const r = H[h] || (H[h] = { led: 0, al: 0, bad: 0 });
        r.led += base[h]; r.al += Math.min(al[h] || 0, base[h]);
        if ((al[h] || 0) > base[h]) { r.bad += (al[h] || 0) - base[h]; over += (al[h] || 0) - base[h]; }
      });
    });
    const heads = Object.keys(H).sort();
    const tl = heads.reduce((a, h) => a + H[h].led, 0), ta = heads.reduce((a, h) => a + H[h].al, 0);
    const jobs = E.rows('jobs'), JR = jobs.map(j => { const c = { Material: 0, Labour: 0, Overhead: 0 }; E.allocRows(j.id).filter(a => a.date >= RF.from && a.date <= RF.to).forEach(a => { c[a.cat] = (c[a.cat] || 0) + a.amount; }); return { j, c, t: c.Material + c.Labour + c.Overhead }; }).filter(r => r.t);
    const absorbed = E.rows(COL).filter(a => a.kind === 'absorb' && E.allocAlive(a) && a.date >= RF.from && a.date <= RF.to).reduce((s, a) => s + a.amount, 0);
    const std = E.rows(COL).filter(a => a.kind === 'bommisc' && E.allocAlive(a) && a.date >= RF.from && a.date <= RF.to).reduce((s, a) => s + a.amount, 0);
    return `<div class="kp">${E.kpi('Expenses in the ledger', E.m(tl))}${E.kpi('Tagged to jobs', E.m(ta), 'costing only')}${E.kpi('No job', E.m(tl - ta))}${E.kpi('Errors', over ? '<span class="bad">' + E.m(over) + '</span>' : '<span class="ok">None</span>')}</div>
    <div class="tw"><table><thead><tr><th>Expense account</th><th class="r">Ledger</th><th class="r">Tagged to jobs</th><th class="r">No job</th><th>Check</th></tr></thead><tbody>
    ${heads.map(h => { const a = E.acct(h) || { name: h }, r = H[h]; return `<tr><td>${h} · ${esc(a.name)}</td><td class="r">${E.m(r.led)}</td><td class="r">${E.m(r.al)}</td><td class="r">${E.m(r.led - r.al)}</td><td>${r.bad ? '<span class="bad">Allocated ' + E.m(r.bad) + ' more than the ledger</span>' : '<span class="ok">✓</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">No expense entries in this period</td></tr>'}
    </tbody><tfoot><tr><th>Total</th><th class="r">${E.m(tl)}</th><th class="r">${E.m(ta)}</th><th class="r">${E.m(tl - ta)}</th><th></th></tr></tfoot></table></div>
    <div class="card"><b>Other costing amounts in this period (no ledger entry of their own)</b>
      <div class="muted" style="font-size:12px;margin-top:4px">Overhead pool expenses booked: ${E.m(pool.amt)} · Absorbed into jobs this period (costing): ${E.m(absorbed)} · Standard BOM-misc amounts: ${E.m(std)} · Pool still not absorbed (all time): ${E.m(E.unabsorbed ? E.unabsorbed() : 0)}</div></div>
    <h3>Allocated to each job in this period</h3>
    <div class="tw"><table><thead><tr><th>Job</th><th class="r">Material</th><th class="r">Labour</th><th class="r">Overhead</th><th class="r">Total allocated</th></tr></thead><tbody>
    ${JR.map(r => `<tr><td>${esc(r.j.no)}</td><td class="r">${E.m(r.c.Material)}</td><td class="r">${E.m(r.c.Labour)}</td><td class="r">${E.m(r.c.Overhead)}</td><td class="r"><b>${E.m(r.t)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing allocated in this period</td></tr>'}
    </tbody></table></div>`;
  }
  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('rc.')) { RF[f.slice(3)] = t.value; const b = E.$('rcb'); if (b) b.innerHTML = reconBody(); }
  });
})(window.ERP);
