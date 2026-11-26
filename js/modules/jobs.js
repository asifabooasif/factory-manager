(E => {
  // Unlock the menu immediately
  const navItem = E.N.find(x => x.id === 'jobs');
  if (navItem) navItem.soon = 0;

  const F = { q: '', st: 'In Progress', tab: 'cost' }; E.jobId = '';
  const pty = id => E.D.parties.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const itemOf = l => E.D.items.find(x => x.id === l.itemId) || {};
  const lines = id => E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === id).map(l => Object.assign({ date: j.date, no: j.no, narr: j.narr }, l)));
  const wip = id => lines(id).filter(l => l.acc === '1310').reduce((s, l) => s + l.dr - l.cr, 0);
  E.jobWip = wip;
  /* Full-cost finished goods: wages and overheads tagged to a job (costing records) are absorbed into finished goods
     through contra account 5291 as the pairs are released, so stock is valued at the exact full cost. */
  const ABS = '5291';
  const absorbed = id => lines(id).filter(l => l.acc === ABS).reduce((s, l) => s + (l.cr || 0) - (l.dr || 0), 0);
  /* STOCK BASIS. 'materials' (default): WIP and finished goods hold materials only; wages and overheads stay normal expenses in their own ledgers and the job allocation is a costing record only (cost per pair).
     'full': wages and overheads are absorbed into finished goods through 5291. A job that has ALREADY absorbed amounts always finishes on the full basis so its books stay consistent. */
  const fullFor = id => E.setting('stockBasis') === 'full' || absorbed(id) > 0;
  E.jobStockFull = fullFor;
  const stockOf = (id, r) => fullFor(id) ? r.full : r.total;
  /* standard BOM-misc amounts (kind 'bommisc') have no ledger expense behind them, so they are never absorbed */
  /* only PRODUCTION costs (direct material / direct labour / factory overhead, or a month-end overhead share) become product cost (IAS 2);
     administration, selling and finance costs stay period expenses even if someone tagged them to a job */
  const isProd = a => { if (!a || a.kind === 'bommisc') return false; if (a.kind === 'absorb') return true; const ac = E.acct(a.head); return !!ac && E.natureTreat(ac.nature) !== 'period'; };
  E.allocProd = isProd;
  const poolOf = id => E.allocRows ? E.allocRows(id).filter(isProd).reduce((s, a) => s + a.amount, 0) : 0;
  E.jobAbsorbed = absorbed;
  E.jobPool = poolOf;
  /* true when taking `removed` out of a COMPLETED job's costs would leave more absorbed into stock than the job's costs */
  E.jobOverAbsorbed = (id, removed) => { const j = E.D.jobs.find(x => x.id === id); return !!j && j.status === 'Completed' && poolOf(id) - (removed || 0) < absorbed(id) - 1; };
  const pairsPerPack = l => { const i = itemOf(l); return i.pack || E.setting('packSize') || 1; };
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const CATS = ['Material', 'Labour', 'Overhead', 'Consumable'];

  function getMaxPairs(l) {
    /* releasable = pairs completed through EVERY routing stage minus pairs already released (see Daily Production flow) */
    return E.jobFlow ? E.jobFlow(l).ready : 0;
  }

  function sheet(j) {
    const L = jl(j.id);
    const rel = L.some(l => l.released > 0);
    const q = l => rel ? l.released : l.target;
    const tot = L.reduce((s, l) => s + q(l), 0) || 1;
    const R = L.map(l => ({ l, Material: 0, Labour: 0, Overhead: 0, Consumable: 0, Loss: 0 }));
    const sh = { Material: 0, Labour: 0, Overhead: 0, Consumable: 0, Loss: 0 };
    lines(j.id).filter(x => x.acc === '1310' && (CATS.includes(x.cat) || x.cat === 'Wastage')).forEach(x => {
      const c = x.cat === 'Wastage' ? 'Loss' : x.cat;
      const a = c === 'Loss' ? x.cr : x.dr - x.cr;
      const r = R.find(r => r.l.id === x.art);
      if (r) r[c] += a; else sh[c] += a;
    });
    let last = 0; R.forEach((r, i) => { if (q(r.l) > 0) last = i; });
    ['Material', 'Labour', 'Overhead', 'Consumable', 'Loss'].forEach(c => {
      let left = sh[c];
      R.forEach((r, i) => { const a = i === last ? left : Math.round(sh[c] * q(r.l) / tot); r[c] += a; left -= a; });
    });
    R.forEach(r => {
      r.total = r.Material + r.Labour + r.Overhead + r.Consumable - r.Loss;
      r.qty = q(r.l);
      r.packs = r.l.released;
      r.pairs = r.l.released * pairsPerPack(r.l);
      r.unitPack = r.packs ? Math.round(r.total / r.packs) : 0;
      r.unitPair = r.pairs ? Math.round(r.total / r.pairs) : 0;
    });
    /* wages / overheads tagged to the job (costing records): by article, shared ones split by pairs */
    const AB = {}; (E.allocRows ? E.allocRows(j.id) : []).filter(isProd).forEach(a => { AB[a.art || ''] = (AB[a.art || ''] || 0) + a.amount; }); const shared = AB[''] || 0, tp = R.reduce((a, r) => a + r.pairs, 0);
    let lastP = -1; R.forEach((r, i) => { if (r.pairs > 0) lastP = i; });
    let shLeft = tp ? shared : 0;
    R.forEach((r, i) => {
      const sp = !tp ? 0 : (i === lastP ? shLeft : Math.round(shared * r.pairs / tp)); shLeft -= sp;
      r.Alloc = (AB[r.l.id] || 0) + sp;
      r.full = r.total + r.Alloc;
      r.fullPack = r.packs ? Math.round(r.full / r.packs) : 0;
      r.fullPair = r.pairs ? Math.round(r.full / r.pairs) : 0;
    });
    return { R, rel, sh };
  }

  function shadowFor(job) {
    let base;
    if (job.shadowSnapshot) base = job.shadowSnapshot;
    else {
      const daily = job.shadowDaily || {};
      const totalFixed = Object.values(daily).reduce((s, v) => s + v, 0);
      base = { totalFixedAllocated: totalFixed, accruedWages: { dailySalaries: 0, weeklyTimeWages: 0, total: 0 }, perExpenseTotal: {}, isLive: true };
    }
    /* + costing-only job allocations from expenses, petty cash, daily salaries and wage runs (see joballoc.js) */
    return E.withAlloc ? E.withAlloc(base, job.id) : base;
  }

  E.A.jobPrint = id => {
    const j = J(id);
    if (!j) return;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const { R } = sheet(j);
    const shadow = shadowFor(j);
    const posted = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const complete = posted + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    
    let estRevenue = 0;
    jl(j.id).forEach(l => {
      const item = itemOf(l);
      const pricePerPair = item.price || 0;
      const relPairs = l.released * pairsPerPack(l);
      estRevenue += relPairs * pricePerPair;
    });
    const profit = estRevenue - complete;

    w.document.write(`<html><head><title>${j.no}</title><style>
      @page{size:A4 landscape;margin:12mm}body{font:12px Arial;color:#111}
      .header{background:#2a1758;color:#fff;padding:12px;margin:-12px -12px 12px -12px;display:flex;justify-content:space-between}
      .internal{background:#fef3c7;color:#92400e;padding:6px 12px;font-size:11px;font-weight:700;text-align:center;margin:-12px -12px 12px -12px;border-bottom:2px solid #d97706}
      table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}
      .posted{background:#f0fdf4}.shadow{background:#eff6ff}.complete{background:#faf5ff;font-weight:bold;font-size:14px}
      .profit{background:#ecfdf5;border:2px solid #059669;padding:10px;margin-top:10px}
    </style></head><body>
      <div class="internal">🔒 INTERNAL — MANAGEMENT ONLY · Not for customer distribution</div>
      <div class="header">
        <div><b style="font-size:16px">${E.esc(E.factory().name)}</b><br>Management Job Cost Sheet</div>
        <div style="text-align:right"><b>${j.no}</b><br>${E.esc((pty(j.partyId) || {}).name || 'Stock production')}<br>Completed: ${j.completedAt || 'In progress'}</div>
      </div>
      <table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Materials</th><th class="r">Labour</th><th class="r">Consumable</th><th class="r">Overhead</th><th class="r">Posted Cost</th></tr></thead>
        <tbody>${R.map(r => `<tr><td><b>${E.esc(r.l.code)}</b> ${E.esc(r.l.name)}</td><td class="r">${r.packs}</td><td class="r">${r.pairs}</td><td class="r">${E.m(r.Material)}</td><td class="r">${E.m(r.Labour)}</td><td class="r">${E.m(r.Consumable)}</td><td class="r">${E.m(r.Overhead)}</td><td class="r">${E.m(r.total)}</td></tr>`).join('')}</tbody>
      </table>
      <table class="posted"><tbody>
        <tr><td><b>POSTED COST (in ledger)</b></td><td class="r"><b>${E.m(posted)}</b></td></tr>
      </tbody></table>
      ${shadowTotal > 0 ? `<table class="shadow"><tbody>
        <tr><td colspan="2"><b>SHADOW ALLOCATION (Management - not in ledger)</b></td></tr>
        ${Object.entries(shadow.perExpenseTotal || {}).map(([code, amt]) => { const a = E.acct(code); return `<tr><td>${code} — ${E.esc(a ? a.name : code)}</td><td class="r">${E.m(amt)}</td></tr>`; }).join('')}
        ${shadow.accruedWages && shadow.accruedWages.total ? `<tr><td>Accrued unpaid wages</td><td class="r">${E.m(shadow.accruedWages.total)}</td></tr>` : ''}
        <tr><td><b>Shadow total</b></td><td class="r"><b>${E.m(shadowTotal)}</b></td></tr>
      </tbody></table>` : ''}
      <table class="complete"><tbody>
        <tr><td><b>COMPLETE COST</b></td><td class="r"><b>${E.m(complete)}</b></td></tr>
        <tr><td>Cost per PAIR (${totalPairs} pairs)</td><td class="r"><b>${E.m(totalPairs ? Math.round(complete / totalPairs) : 0)}</b></td></tr>
        <tr><td>Cost per PACK (${totalPacks} packs)</td><td class="r"><b>${E.m(totalPacks ? Math.round(complete / totalPacks) : 0)}</b></td></tr>
      </tbody></table>
      ${estRevenue ? `<div class="profit"><b>PROJECTED PROFITABILITY:</b> Revenue ${E.m(estRevenue)} - Complete Cost ${E.m(complete)} = <b>${E.m(profit)}</b> (${((profit/estRevenue)*100).toFixed(1)}% Margin)</div>` : ''}
      <p style="margin-top:20px;font-size:10px;color:#666">${j.shadowSnapshot ? 'Frozen at: ' + j.shadowSnapshot.frozenAt : 'Live computation (not frozen)'} · Printed: ${E.today()}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  E.A.jobPrintCustomer = id => {
    const j = J(id);
    if (!j) return;
    const w = window.open('', '_blank');
    if (!w) return E.toast('Allow pop-ups', 'error');
    const { R } = sheet(j);
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    w.document.write(`<html><head><title>${j.no}</title><style>
      @page{size:A4;margin:14mm}body{font:12px Arial;color:#111}
      .header{background:#2a1758;color:#fff;padding:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}
    </style></head><body>
      <div class="header"><b style="font-size:16px">${E.esc(E.factory().name)}</b> — Production Summary</div>
      <p><b>Job:</b> ${j.no}<br><b>Customer:</b> ${E.esc((pty(j.partyId) || {}).name || 'Stock')}</p>
      <table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th></tr></thead>
        <tbody>${R.map(r => `<tr><td>${E.esc(r.l.code)} ${E.esc(r.l.name)}</td><td class="r">${r.packs}</td><td class="r">${r.pairs}</td></tr>`).join('')}</tbody>
      </table>
      <p><b>Total delivered: ${totalPacks} packs (${totalPairs} pairs)</b></p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  function tbl() {
    const s = F.q.toLowerCase();
    const r = E.rows('jobs').filter(j => (!F.st || j.status === F.st) && (!s || (j.no + (pty(j.partyId) || {}).name + j.notes).toLowerCase().includes(s))).sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr><th>Job</th><th>Date</th><th>Customer</th><th>Due</th><th>Priority</th><th class="r">Target</th><th class="r">Produced</th><th class="r">WIP</th><th>Status</th><th></th></tr></thead>
      <tbody>${r.map(j => { const L = jl(j.id); return `<tr>
        <td><b>${j.no}</b></td><td>${j.date}</td>
        <td>${E.esc((pty(j.partyId) || {}).name || 'Stock production')}</td>
        <td>${j.due || '—'}</td><td><span class="tag">${j.priority}</span></td>
        <td class="r">${L.reduce((s, l) => s + l.target, 0)} packs<div class="muted">${L.reduce((s, l) => s + l.target * pairsPerPack(l), 0)} pairs</div></td>
        <td class="r">${L.reduce((s, l) => s + l.released, 0)}</td>
        <td class="r">${E.m(wip(j.id))}</td>
        <td><span class="tag">${j.status}</span></td>
        <td class="r">${j.status === 'In Progress' ? `<button class="btn sm" data-a="editJob" data-id="${j.id}">Edit</button> ` : ''}<button class="btn sm p" data-a="openJob" data-id="${j.id}">Open</button></td>
      </tr>`; }).join('') || '<tr><td colspan="10" class="muted">No jobs</td></tr>'}</tbody>
    </table></div>`;
  }

  E.route('jobs', 'Jobs & Costing', () => `<div class="kp">
    ${E.kpi('In progress', active().length)}
    ${E.kpi('Materials in WIP', E.m(active().reduce((s, j) => s + wip(j.id), 0)), 'Ledger 1310: ' + E.m(E.bal('1310')))}
  </div>
  <div class="bar">
    <input class="fs" style="max-width:300px" placeholder="Search…" data-f="jb.q" value="${E.esc(F.q)}">
    <select class="fs" data-f="jb.st"><option value="">All</option>${['In Progress', 'Completed'].map(c => `<option ${F.st === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <span class="gap"></span>
    <button class="btn p" data-a="newJob">+ New Job</button>
  </div><div id="tbl">${tbl()}</div>`);

  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (f && f.startsWith('jb.')) { F[f.slice(3)] = e.target.value; E.$('tbl').innerHTML = tbl(); } });
  E.A.openJob = id => { E.jobId = id; location.hash = '#/jobview'; };

  E.route('jobview', 'Job', () => {
    const j = J(E.jobId);
    if (!j) return '<div class="card">Select a job.</div>';
    E.$('pt').textContent = j.no;
    
    const L = jl(j.id), { R, rel } = sheet(j);
    const ls = lines(j.id);
    
    const open = j.status === 'In Progress';
    const shadow = shadowFor(j);
    const postedCost = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const completeCost = postedCost + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    const costPerPairComplete = totalPairs ? Math.round(completeCost / totalPairs) : 0;
    const isFrozen = !!j.shadowSnapshot;
    
    let estRevenue = 0;
    L.forEach(l => { const item = itemOf(l); estRevenue += (l.released * pairsPerPack(l)) * (item.price || 0); });
    const profit = estRevenue - completeCost;

    const tabs = [
      ['cost', '💰 Costing & Shadow'],
      ['mat', '📦 Material Consumption'],
      ['prod', '🧵 Labour & Operations'],
      ['alloc', '🎯 Allocated costs'],
      ['ledger', '🧾 Ledger Transactions']
    ];

    const tabContent = F.tab === 'cost' ? tabCost(j, R, postedCost, shadowTotal, completeCost) :
                       F.tab === 'mat' ? tabMat(j) :
                       F.tab === 'prod' ? tabProd(j) : F.tab === 'alloc' ? tabAlloc(j, L) : tabLedger(j, L, ls);

    return `<div class="bar">
      <button class="btn" data-nav="jobs">← Jobs</button>
      <b style="font-size:16px">${j.no} · ${E.esc((pty(j.partyId) || {}).name || 'Stock')}</b>
      <span class="tag">${j.status}</span>
      <span class="gap"></span>
      <button class="btn" data-a="jobPrint" data-id="${j.id}">🖨 Management Sheet</button>
      <button class="btn" data-a="jobPrintCustomer" data-id="${j.id}">🖨 Customer Sheet</button>
      ${open ? `
        <button class="btn" data-a="editJob" data-id="${j.id}">✏️ Edit</button>
        <button class="btn" data-a="issueM" data-id="${j.id}">Materials</button>
        <button class="btn p" data-a="relM" data-id="${j.id}">Release Goods</button>
        <button class="btn" data-a="complete" data-id="${j.id}">Complete Job</button>
      ` : ''}
    </div>

    <div class="kp">
      ${E.kpi('Posted Cost', E.m(postedCost), 'In ledger')}
      ${E.kpi('Shadow Cost', E.m(shadowTotal), isFrozen ? 'frozen' : 'live')}
      ${E.kpi('COMPLETE COST', '<b>' + E.m(completeCost) + '</b>', 'For pricing')}
      ${E.kpi('Cost Per Pair', E.m(costPerPairComplete), 'Management cost')}
      ${E.kpi('Projected Revenue', E.m(estRevenue), 'Based on selling price')}
      ${E.kpi('Projected Profit', `<span class="${profit >= 0 ? 'ok' : 'bad'}">${E.m(profit)}</span>`, estRevenue ? ((profit/estRevenue)*100).toFixed(1)+'% margin' : '—')}
    </div>

    <div class="bar">
      ${tabs.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="jtTab" data-id="${k}">${l}</button>`).join('')}
    </div>

    <div id="jtBody">${tabContent}</div>`;
  });

  E.A.jtTab = t => { F.tab = t; E.go(); };

  function tabCost(j, R, postedCost, shadowTotal, completeCost) {
    const frozen = !!j.shadowSnapshot;
    const shadow = shadowFor(j);
    return `
    ${frozen ? `<div class="card" style="background:#d1fae5;border-left:4px solid #059669;padding:12px;margin-bottom:14px">
      <b style="color:#065f46">🔒 Cost sheet frozen at ${j.shadowSnapshot.frozenAt}</b>
    </div>` : ''}

    <div class="card">
      <h3>Cost breakdown</h3>
      <div class="tw"><table>
        <thead><tr><th>Category</th><th class="r">Posted (Ledger)</th><th class="r">Shadow (Mgmt)</th><th class="r">Complete Cost</th></tr></thead>
        <tbody>
          <tr><td>Materials</td><td class="r">${E.m(R.reduce((s, r) => s + r.Material, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Material, 0))}</td></tr>
          <tr><td>Labor (piece work)</td><td class="r">${E.m(R.reduce((s, r) => s + r.Labour, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Labour, 0))}</td></tr>
          <tr><td>Direct expenses</td><td class="r">${E.m(R.reduce((s, r) => s + r.Overhead, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Overhead, 0))}</td></tr>
          <tr><td>Consumables</td><td class="r">${E.m(R.reduce((s, r) => s + r.Consumable, 0))}</td><td class="r">—</td><td class="r">${E.m(R.reduce((s, r) => s + r.Consumable, 0))}</td></tr>
          <tr style="background:var(--s2)"><td><b>Posted subtotal</b></td><td class="r"><b>${E.m(postedCost)}</b></td><td class="r">—</td><td class="r"><b>${E.m(postedCost)}</b></td></tr>
          ${Object.entries(shadow.perExpenseTotal || {}).map(([code, amt]) => { const a = E.acct(code); return `<tr><td style="padding-left:20px">${code} — ${E.esc(a ? a.name : code)}</td><td class="r">—</td><td class="r">${E.m(amt)}</td><td class="r">${E.m(amt)}</td></tr>`; }).join('')}
          ${shadow.accruedWages && shadow.accruedWages.total ? `<tr><td style="padding-left:20px">Accrued unpaid wages</td><td class="r">—</td><td class="r">${E.m(shadow.accruedWages.total)}</td><td class="r">${E.m(shadow.accruedWages.total)}</td></tr>` : ''}
          <tr style="background:var(--s2)"><td><b>Shadow subtotal</b></td><td class="r">—</td><td class="r"><b>${E.m(shadowTotal)}</b></td><td class="r"><b>${E.m(shadowTotal)}</b></td></tr>
          <tr style="background:#faf5ff"><td><b style="font-size:14px">COMPLETE COST</b></td><td class="r">${E.m(postedCost)}</td><td class="r">${E.m(shadowTotal)}</td><td class="r"><b style="font-size:14px">${E.m(completeCost)}</b></td></tr>
        </tbody>
      </table></div>
      <p class="muted" style="margin-top:10px">Posted = material cost held in job WIP (ledger). Shadow = every cost allocated to this job for costing only: piece-rate wages, daily salaries, wage runs, expenses, transport, petty cash, shared overhead (see the Allocated costs tab). All of these are already in the ledger as normal expenses, so they are never added to WIP twice. Complete = for pricing decisions. Jobs finished before this change may still hold labour in WIP.</p>
    </div>

    <div class="card">
      <h3>Per-article cost breakdown</h3>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Posted cost</th><th class="r">Allocated (costing)</th><th class="r">Total cost</th><th class="r">Per pair</th><th class="r">Per pack</th></tr></thead>
        <tbody>${(() => { const A = E.allocByArt ? E.allocByArt(j.id) : {}, sharedAl = A[''] || 0, tp = R.reduce((s, r) => s + r.pairs, 0) || 0;
          return R.map(r => { const al = (A[r.l.id] || 0) + (tp ? Math.round(sharedAl * r.pairs / tp) : 0), tot = r.total + al; return `<tr>
          <td><b>${E.esc(r.l.code)}</b> ${E.esc(r.l.name)}</td>
          <td class="r">${r.packs}</td><td class="r">${r.pairs}</td>
          <td class="r">${E.m(r.total)}</td><td class="r">${E.m(al)}</td>
          <td class="r"><b>${E.m(tot)}</b></td>
          <td class="r"><b>${E.m(r.pairs ? Math.round(tot / r.pairs) : 0)}</b></td>
          <td class="r">${E.m(r.packs ? Math.round(tot / r.packs) : 0)}</td>
        </tr>`; }).join(''); })()}</tbody>
      </table></div>
    </div>`;
  }

  function tabMat(j) {
    const L = jl(j.id);
    const issues = E.rows('issues').filter(i => i.jobId === j.id);
    const req = {};
    
    L.forEach(l => {
      const item = itemOf(l);
      if (!item || !item.bom) return;
      item.bom.forEach(b => {
        const k = b.itemId + '|' + (b.variantId || '');
        req[k] = (req[k] || 0) + (b.qty * l.target * pairsPerPack(l));
      });
    });

    const keys = [...new Set([...Object.keys(req), ...issues.map(i => i.itemId + '|' + (i.variantId || ''))])];
    
    const rows = keys.map(k => {
      const [itemId, variantId] = k.split('|');
      const sku = E.skuList().find(s => s.itemId === itemId && s.variantId === variantId);
      const need = req[k] || 0;
      const issued = issues.filter(i => i.itemId === itemId && (i.variantId||'') === variantId).reduce((s, i) => s + i.qty, 0);
      const val = issues.filter(i => i.itemId === itemId && (i.variantId||'') === variantId).reduce((s, i) => s + i.value, 0);
      return { sku: sku ? sku.code : 'Unknown', need, issued, val };
    }).filter(r => r.need || r.issued);

    if (!rows.length) return '<div class="card muted">No BOM defined and no materials issued yet.</div>';

    return `<div class="card">
      <h3>Material Consumption (BOM Required vs Actual Issued)</h3>
      <div class="tw"><table>
        <thead><tr><th>Material</th><th class="r">BOM Required (Total)</th><th class="r">Actual Issued</th><th class="r">Variance (Issued - Req)</th><th class="r">Value Issued</th></tr></thead>
        <tbody>${rows.map(r => {
          const diff = r.issued - r.need;
          return `<tr>
            <td><b>${E.esc(r.sku)}</b></td>
            <td class="r">${r.need.toFixed(3)}</td>
            <td class="r"><b>${r.issued.toFixed(3)}</b></td>
            <td class="r ${diff > 0 ? 'bad' : diff < 0 ? 'ok' : ''}">${diff > 0 ? '+' : ''}${diff.toFixed(3)}</td>
            <td class="r">${E.m(r.val)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="muted" style="margin-top:10px">BOM Required is based on target pairs. Positive variance means you issued more than the standard recipe.</p>
    </div>`;
  }

  function tabProd(j) {
    const logs = E.rows('prodLogs').filter(l => l.jobId === j.id && l.status !== 'cancelled');
    if (!logs.length) return (E.jobFlowHtml ? E.jobFlowHtml(j.id) : '') + '<div class="card muted">No production logged for this job yet.</div>';
    
    const workers = {};
    logs.forEach(l => {
      const w = workers[l.empId] = workers[l.empId] || { name: (E.D.employees.find(e=>e.id===l.empId)||{}).name || '?', pairs: 0, amount: 0, ops: {} };
      const p = l.convertedQty || l.qty;
      w.pairs += p;
      w.amount += l.amount;
      w.ops[l.opName] = (w.ops[l.opName] || 0) + p;
    });

    return `${E.jobFlowHtml ? E.jobFlowHtml(j.id) : ''}<div class="card">
      <h3>Worker & Operation Breakdown</h3>
      <div class="tw"><table>
        <thead><tr><th>Worker</th><th>Operation Breakdown</th><th class="r">Total Pairs</th><th class="r">Total Wages</th></tr></thead>
        <tbody>${Object.values(workers).sort((a,b)=>b.amount-a.amount).map(w => `
          <tr>
            <td><b>${E.esc(w.name)}</b></td>
            <td>${Object.entries(w.ops).map(([op, p]) => `<span class="tag">${E.esc(op)}: ${p} prs</span>`).join(' ')}</td>
            <td class="r"><b>${w.pairs}</b></td>
            <td class="r"><b>${E.m(w.amount)}</b></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    </div>`;
  }


  function tabAlloc(j, L) {
    const al = (E.allocRows ? E.allocRows(j.id) : []).slice().sort((x, y) => y.date.localeCompare(x.date) || String(y.jeNo).localeCompare(String(x.jeNo)));
    if (!al.length) return '<div class="card muted">Nothing has been allocated to this job yet. Choose this job in the Job costing box when you enter an expense, salary, wage or petty cash, or use Accounting › Job Cost Allocation for earlier entries.</div>';
    const tot = al.reduce((s, x) => s + x.amount, 0), cat = E.allocByCat(j.id), by = {};
    al.forEach(x => { const k = x.head; (by[k] = by[k] || { name: x.headName || x.head, n: 0, v: 0 }); by[k].n++; by[k].v += x.amount; });
    const KIND = { piece: 'Piece-rate wages', 'piece-oncost': 'Employer EPF/ETF (piece)', bommisc: 'Standard BOM misc', absorb: 'Shared overhead' };
    return `<div class="kp">${E.kpi('Allocated to this job', '<b>' + E.m(tot) + '</b>', al.length + ' record' + (al.length > 1 ? 's' : ''))}${E.kpi('Labour', E.m(cat.Labour || 0))}${E.kpi('Overhead & expenses', E.m(cat.Overhead || 0))}${E.kpi('Material (expense route)', E.m(cat.Material || 0))}</div>
    <div class="card"><h3>By expense account</h3><div class="tw"><table><thead><tr><th>Account</th><th class="r">Records</th><th class="r">Amount</th><th class="r">%</th></tr></thead><tbody>
    ${Object.keys(by).sort().map(k => `<tr><td>${E.esc(k)} — ${E.esc(by[k].name)}</td><td class="r">${by[k].n}</td><td class="r">${E.m(by[k].v)}</td><td class="r">${tot ? (by[k].v * 100 / tot).toFixed(1) : '0.0'}%</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card"><h3>Every allocation (costing only — the ledger is not affected)</h3><div class="tw"><table><thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Account</th><th>Article</th><th>Narration</th><th class="r">Amount</th></tr></thead><tbody>
    ${al.map(x => `<tr><td>${x.date}</td><td>${E.esc(x.jeNo || '')}</td><td>${E.esc(KIND[x.kind] || 'Expense / wages')}</td><td>${E.esc(x.head)} — ${E.esc(x.headName || '')}</td><td>${E.esc(x.art ? ((L.find(l => l.id === x.art) || {}).code || '?') : 'Whole job')}</td><td>${E.esc(x.narr || '')}</td><td class="r">${E.m(x.amount)}</td></tr>`).join('')}
    <tr style="background:var(--s2)"><td colspan="6" class="r"><b>Total allocated</b></td><td class="r"><b>${E.m(tot)}</b></td></tr></tbody></table></div></div>`;
  }

  function tabLedger(j, L, ls) {
    const txns = ls.filter(x => x.acc === '1310').sort((a, b) => b.date.localeCompare(a.date));
    const al = (E.allocRows ? E.allocRows(j.id) : []).slice().sort((x, y) => y.date.localeCompare(x.date));
    const alCard = al.length ? `<div class="card"><h3>Costing allocations (not in WIP — already in the ledger as normal expenses)</h3>
      <div class="tw"><table><thead><tr><th>Date</th><th>Entry</th><th>Expense head</th><th>Narration</th><th class="r">Amount</th></tr></thead>
      <tbody>${al.map(x => `<tr><td>${x.date}</td><td>${E.esc(x.jeNo || '')}</td><td>${E.esc(x.head)} — ${E.esc(x.headName || '')}</td><td>${E.esc(x.narr || '')}</td><td class="r">${E.m(x.amount)}</td></tr>`).join('')}
      <tr style="background:var(--s2)"><td colspan="4" class="r"><b>Total allocated</b></td><td class="r"><b>${E.m(al.reduce((t, x) => t + x.amount, 0))}</b></td></tr></tbody></table></div></div>` : '';
    if (!txns.length && !al.length) return '<div class="card muted">No ledger transactions posted to this job yet.</div>';
    if (!txns.length) return alCard;
    return `<div class="card">
      <h3>Job Ledger Transactions (WIP 1310)</h3>
      <div class="tw"><table>
        <thead><tr><th>Date</th><th>Entry</th><th>Type</th><th>Narration</th><th>Article</th><th class="r">Amount</th></tr></thead>
        <tbody>${txns.map(x => `<tr>
          <td>${x.date}</td><td>${x.no}</td><td><span class="tag">${x.cat}</span></td>
          <td>${E.esc(x.narr)}</td>
          <td>${E.esc((L.find(l => l.id === x.art) || {}).code || 'Shared')}</td>
          <td class="r ${x.cr > 0 ? 'ok' : ''}">${E.m(x.cat === 'Wastage' ? -x.cr : x.dr - x.cr)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` + alCard;
  }

  const artSel = id => `<div class="f">Article<select id="x_a"><option value="">Shared</option>${jl(id).map(l => `<option value="${l.id}">${E.esc(l.code)}</option>`).join('')}</select></div>`;

  E.A.issueM = id => E.modal('Issue / return materials', `
    <div class="g2"><div class="f">Action<select id="x_k"><option value="issue">Issue</option><option value="return">Return</option></select></div><div class="f">Date<input id="x_d" type="date" value="${E.today()}"></div></div>
    <div class="f">Material *<input id="x_i" list="sk"></div>
    <datalist id="sk">${E.skuOpts(i => i.cat !== 'Finished Good')}</datalist>
    <div class="g2"><div class="f">Qty *<input id="x_q" type="number" step="0.001"></div>${artSel(id)}</div>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveIssue" data-id="${id}">Post</button>`);

  E.A.saveIssue = async id => {
    try {
      const s = E.skuFind(E.val('x_i'), i => i.cat !== 'Finished Good');
      if (!s) throw new Error('Select material');
      const q = parseFloat(E.val('x_q'));
      if (!(q > 0)) throw new Error('Enter qty');
      const d = E.val('x_d'), art = E.val('x_a'), k = E.val('x_k');
      const no = await E.next('ISS'), j = J(id);
      const mv = E.rows('issues').filter(x => x.jobId === id && x.itemId === s.itemId && x.variantId === s.variantId);
      const nq = mv.reduce((a, x) => a + x.qty, 0), nvl = mv.reduce((a, x) => a + x.value, 0);
      let val;
      if (k === 'issue') {
        val = E.outValue(s.itemId, s.variantId, q);
        /* ledger entry + stock movement + issue record are ONE unit */
        await E.postThen({ date: d, ref: no, narr: 'Issue ' + s.code, source: 'issue', lines: [{ acc: '1310', dr: val, job: id, cat: 'Material', art }, { acc: '1300', cr: val }] }, async () => {
          const u = E.undoStack();
          try {
            const mv = await E.put('stockMoves', { date: d, itemId: s.itemId, variantId: s.variantId || '', qty: -q, value: -val, type: 'issue', ref: no, job: id, factoryId: E.fid }); u.push(() => E.del('stockMoves', mv.id));
            const is = await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: q, value: val, art }); u.push(() => E.del('issues', is.id));
          } catch (err) { await u.rollback(); throw err; }
        });
      } else {
        if (q > nq + 1e-9) throw new Error('Only ' + nq + ' issued');
        val = q >= nq - 1e-9 ? nvl : Math.round(nvl * q / nq);
        await E.postThen({ date: d, ref: no, narr: 'Return ' + s.code, source: 'issue', lines: [{ acc: '1300', dr: val }, { acc: '1310', cr: val, job: id, cat: 'Material', art }] }, async () => {
          const u = E.undoStack();
          try {
            const mv = await E.stockIn({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, value: val, type: 'return', ref: no, job: id }); u.push(() => E.del('stockMoves', mv.id));
            const is = await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: -q, value: -val, art }); u.push(() => E.del('issues', is.id));
          } catch (err) { await u.rollback(); throw err; }
        });
      }
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.addCost = id => {
    const js = active();
    if (!js.length) return E.toast('No jobs in progress', 'error');
    E.modal('Add labor / expense', `
      <div class="g2">
        <div class="f">Type<select id="c_t"><option>Labour</option><option>Overhead</option></select></div>
        <div class="f">Date<input id="c_d" type="date" value="${E.today()}"></div>
        <div class="f">Amount<input id="c_a" type="number" step="0.01"></div>
        <div class="f">From/owed<select id="c_s"><option value="">—</option>${E.opts(a => a.bank || ['1010', '2300'].includes(a.code))}</select></div>
      </div>
      <div class="f">Details<input id="c_n"></div>
      <b>Allocate (% must = 100)</b>
      <div class="tw"><table><thead><tr><th>Job</th><th>Customer</th><th class="r">%</th></tr></thead><tbody>${js.map(j => `<tr><td>${j.no}</td><td>${E.esc((pty(j.partyId) || {}).name || 'Stock')}</td><td><input class="sp" data-id="${j.id}" type="number" step="0.01" value="${j.id === id ? 100 : ''}" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
      <button class="btn sm" data-a="eqSplit">Split equally</button>
      ${id ? artSel(id) : ''}
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveCost">Post</button>`, 1);
  };
  E.A.eqSplit = () => { const a = [...document.querySelectorAll('.sp')]; a.forEach((i, k) => i.value = k === a.length - 1 ? (100 - Math.floor(10000 / a.length) / 100 * (a.length - 1)).toFixed(2) : (Math.floor(10000 / a.length) / 100).toFixed(2)); };
  E.A.saveCost = async () => {
    try {
      const amt = E.c(E.val('c_a')), s = E.val('c_s'), t = E.val('c_t'), d = E.val('c_d');
      if (amt <= 0) throw new Error('Enter amount');
      if (!s) throw new Error('Select account');
      const sp = [...document.querySelectorAll('.sp')].map(i => ({ id: i.dataset.id, p: Math.round((parseFloat(i.value) || 0) * 100) })).filter(x => x.p > 0);
      if (sp.reduce((a, x) => a + x.p, 0) !== 10000) throw new Error('Must total 100%');
      let left = amt;
      const art = sp.length === 1 && E.$('x_a') ? E.val('x_a') : '';
      const ls = sp.map((x, i) => { const a = i === sp.length - 1 ? left : Math.round(amt * x.p / 10000); left -= a; return { acc: '1310', dr: a, job: x.id, cat: t, art }; });
      const no = await E.next('EXP');
      await E.post({ date: d, ref: no, narr: (E.val('c_n') || t) + ' · ' + sp.map(x => J(x.id).no).join(','), source: 'jobcost', lines: ls.concat([{ acc: s, cr: amt }]) });
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };


  E.A.relM = id => {
    const L = jl(id);
    const W = wip(id);
    const allOps = E.rows('operations').filter(o => o.active !== false).sort((a, b) => (b.order || 0) - (a.order || 0));
    const finalOp = allOps.length ? allOps[0] : null;
    const maxPairsTotal = L.reduce((s, l) => s + getMaxPairs(l), 0);
    
    if (maxPairsTotal <= 0) {
      const why = L.map(l => { const f = E.jobFlow(l); return l.code + ': ' + (f.stages.length ? (f.limiting ? f.completed + ' of ' + f.target + ' pairs completed, waiting on ' + f.limiting.name : 'nothing completed') : 'no production logged') + (f.legacy ? ' (set the article routing in Daily Production > Operations & rates)' : ''); }).join(' | ');
      return E.toast('No goods are fully completed yet. ' + why, 'error');
    }

    E.modal('Release Finished Goods (in Pairs)', `
      <div class="g2">
        <div class="f">Date<input id="r_d" type="date" value="${E.today()}"></div>
        <div class="f">Total WIP Value to Release: <b style="color:var(--ac)">${E.m(W)}</b></div>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th class="r">Target (Pairs)</th><th class="r">Completed (all stages)</th><th class="r">Already Released</th><th class="r">Max Releasable</th><th class="r">Release Now (Pairs) <button class="btn sm" onclick="E.A.relFillAll()">Fill all</button></th></tr></thead>
        <tbody>
          ${L.map(l => {
            const pp = pairsPerPack(l);
            const tPairs = l.target * pp;
            const rPairs = l.released * pp;
            const fl = E.jobFlow(l), produced = fl.completed;
            const maxToRelease = Math.max(0, produced - rPairs);
            
            return `<tr>
              <td><b>${E.esc(l.code)}</b></td>
              <td class="r">${tPairs}</td>
              <td class="r muted">${produced}${fl.limiting && fl.completed < fl.target ? `<div style="font-size:11px">waiting on ${E.esc(fl.limiting.name)}</div>` : ''}</td>
              <td class="r muted">${rPairs}</td>
              <td class="r"><b style="color:${maxToRelease>0?'var(--g)':'var(--r2)'}">${maxToRelease}</b></td>
              <td>
                <div style="display:flex;gap:4px">
                  <input class="rq" data-id="${l.id}" data-max="${maxToRelease}" type="number" min="0" max="${maxToRelease}" step="0.5" style="width:90px;padding:6px;border:1px solid var(--bd);border-radius:8px">
                  <button class="btn sm" onclick="E.A.relMax('${l.id}', ${maxToRelease})">Max</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
      <p class="muted" style="margin-top:10px">Note: The system blocks releasing more than what has been logged in Daily Production for the final operation (${finalOp ? E.esc(finalOp.name) : 'N/A'}).</p>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveRel" data-id="${id}">Release</button>`, 1);
  };

  E.A.relFillAll = () => document.querySelectorAll('.rq').forEach(i => { i.value = i.dataset.max; });
  E.A.relMax = (id, max) => {
    const inp = document.querySelector(`.rq[data-id="${id}"]`);
    if (inp) inp.value = max;
  };

  E.A.saveRel = async id => {
    try {
      const L = jl(id);
      const rq = [...document.querySelectorAll('.rq')].map(i => ({ 
        l: L.find(x => x.id === i.dataset.id), 
        pairs: parseFloat(i.value) || 0, 
        max: parseFloat(i.dataset.max) || 0 
      })).filter(x => x.pairs > 0);
      
      if (!rq.length) throw new Error('Enter pairs to release');
      for (const x of rq) {
        const nowMax = getMaxPairs(x.l);
        if (x.pairs > x.max + 0.001 || x.pairs > nowMax + 0.001) throw new Error('Cannot release more than completed for ' + x.l.code + ' (Max now: ' + nowMax + ' pairs)');
      }
      
      const totalPairsToRelease = rq.reduce((s, x) => s + x.pairs, 0);
      const W = wip(id);
      if (W <= 0) throw new Error('No WIP to release');
      
      /* value moved to finished goods = share of WIP for the pairs released out of ALL pairs still to be released (final costing trues it up) */
      const remPairs = Math.max(totalPairsToRelease, L.reduce((s, l) => s + Math.max(0, (l.target - (l.released || 0)) * pairsPerPack(l)), 0));
      const batchValue = Math.min(W, Math.round(W * (totalPairsToRelease / remPairs)));
      let leftValue = batchValue;
      
      const vals = rq.map((x, i) => {
        const v = i === rq.length - 1 ? leftValue : Math.round(batchValue * (x.pairs / totalPairsToRelease));
        leftValue -= v;
        return v;
      });

      /* wages and overheads tagged to the job and not yet absorbed: same share of them moves into finished goods */
      const remAbs = fullFor(id) ? poolOf(id) - absorbed(id) : 0;
      const absPart = remAbs > 0 ? Math.round(remAbs * (totalPairsToRelease / remPairs)) : 0;
      let leftAbs = absPart;
      const absVals = rq.map((x, i) => {
        const v = i === rq.length - 1 ? leftAbs : Math.round(absPart * (x.pairs / totalPairsToRelease));
        leftAbs -= v;
        return v;
      });
      
      const d = E.val('r_d'), no = await E.next('REL');
      
      await E.postThen({ 
        date: d, ref: no, narr: 'Release ' + totalPairsToRelease + ' pairs', source: 'release',
        lines: rq.map((x, i) => ({ acc: '1320', dr: vals[i] + absVals[i], job: id, cat: 'Release', art: x.l.id })).concat([{ acc: '1310', cr: batchValue, job: id, cat: 'Release' }]).concat(absPart > 0 ? [{ acc: ABS, cr: absPart, job: id, cat: 'Absorbed' }] : [])
      }, async () => {
        for (let i = 0; i < rq.length; i++) {
          const { l, pairs } = rq[i];
          const pp = pairsPerPack(l);
          const packsToAdd = pairs / pp;
          await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: packsToAdd, value: vals[i] + absVals[i], type: 'release', ref: no, job: id });
          const b = JSON.parse(JSON.stringify(l));
          l.released += packsToAdd;
          l.fgValue += vals[i] + absVals[i];
          await E.save('jobLines', l, b);
        }
      });
      
      E.closeM(); E.go(); 
      E.toast(no + ': ' + totalPairsToRelease + ' pairs released', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  const jr = () => `<div class="jl jx" style="grid-template-columns:3fr 1fr 30px"><input list="fg" placeholder="Article"><input type="number" placeholder="Target Pairs"><button class="btn sm d" data-a="rmJx">✕</button></div>`;
  E.A.rmJx = (_, e) => e.target.closest('.jx').remove();
  E.A.addJx = () => E.$('jxr').insertAdjacentHTML('beforeend', jr());

  E.A.newJob = () => {
    const cs = E.rows('parties').filter(p => p.active && p.type !== 'Supplier');
    const fg = i => i.cat === 'Finished Good';
    if (!E.skuList(fg).length) return E.toast('Create Finished Goods first', 'error');
    E.modal('New Job', `
      <div class="g2">
        <div class="f">Customer<select id="j_p"><option value="">— stock —</option>${cs.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
        <div class="f">Priority<select id="j_pr"><option>Normal</option><option>High</option><option>Urgent</option></select></div>
        <div class="f">Job date<input id="j_d" type="date" value="${E.today()}"></div>
        <div class="f">Due date<input id="j_u" type="date"></div>
      </div>
      <div class="f">Notes<input id="j_n"></div>
      <div class="card" style="margin:8px 0;padding:10px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="j_bom" checked style="width:auto"> <b>Issue all materials by BOM now</b></label><div class="muted" style="margin-top:4px">Deducts every BOM material for the full target from stock at average cost and charges it to this job's WIP (one journal entry). Untick to issue later (Material Ledger &gt; Issue by BOM) or in parts.</div><div class="f" style="margin-top:6px">Issue date<input id="j_bd" type="date" value="${E.today()}"></div></div>
      <datalist id="fg">${E.skuOpts(fg)}</datalist>
      <b>Articles (Target in Pairs)</b>
      <div id="jxr">${jr() + jr()}</div>
      <button class="btn sm" data-a="addJx">+ Add line</button>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveJob">Create</button>`, 1);
  };

  E.A.saveJob = async () => {
    try {
      const m = {};
      [...document.querySelectorAll('.jx')].forEach(r => {
        const t = r.children[0].value.trim(), pairs = parseInt(r.children[1].value) || 0;
        if (!t && !pairs) return;
        const s = E.skuFind(t, i => i.cat === 'Finished Good');
        if (!s) throw new Error('Invalid: ' + t);
        if (pairs <= 0) throw new Error('Enter pairs for ' + s.code);
        const item = E.D.items.find(x => x.id === s.itemId);
        const pp = item.pack || 1;
        const packs = pairs / pp;
        const k = s.itemId + '|' + s.variantId;
        m[k] = m[k] || { s, pairs: 0, packs: 0 }; 
        m[k].pairs += pairs; m[k].packs += packs;
      });
      const ks = Object.values(m);
      if (!ks.length) throw new Error('Add at least one line');
      const wantBom = !!(E.$('j_bom') && E.$('j_bom').checked), bd = E.val('j_bd') || E.val('j_d');
      const head = { date: E.val('j_d'), due: E.val('j_u'), partyId: E.val('j_p'), priority: E.val('j_pr'), notes: E.val('j_n') };
      /* Create the job (and optionally issue materials). Nothing is saved until the person confirms the articles and their BOMs. */
      const create = async (issue, adjByKey) => {
        const no = await E.next('JOB');
        const j = await E.save('jobs', Object.assign({ no, status: 'In Progress' }, head));
        const created = [];
        for (const { s, packs } of ks) created.push(await E.save('jobLines', { jobId: j.id, itemId: s.itemId, variantId: s.variantId, code: s.code, name: s.name, target: packs, released: 0, fgValue: 0 }));
        let note = no + ' created';
        if (issue) {
          const pk = {}, adj = {}; created.forEach(l => { pk[l.id] = l.target; const a = adjByKey && adjByKey[l.itemId + '|' + l.variantId]; if (a) adj[l.id] = a; });
          const noBom = created.filter(l => !((E.D.items.find(x => x.id === l.itemId) || {}).bom || []).length).map(l => l.code);
          try {
            const r = await E.issueByBom({ jobId: j.id, date: bd, packs: pk, adj });
            note += ' · materials issued by BOM ' + E.m(r.total) + (noBom.length ? ' (no BOM for: ' + noBom.join(', ') + ')' : '');
          } catch (e2) { note += ' · MATERIALS NOT ISSUED: ' + e2.message + ' — use Material Ledger > Issue by BOM'; }
        }
        E.closeM(); E.A.openJob(j.id); E.toast(note, 'success');
      };
      E.confirmBom({
        inline: true, issue: wantBom, date: bd, title: 'Confirm job · articles and their BOMs',
        groups: ks.map(x => ({ key: x.s.itemId + '|' + x.s.variantId, itemId: x.s.itemId, code: x.s.code, packs: x.packs, pairs: x.pairs })),
        okLabel: wantBom ? 'Confirm: create job & issue materials' : 'Confirm: create job',
        altLabel: wantBom ? 'Create job WITHOUT issuing materials' : '',
        onConfirm: adjByKey => create(wantBom, adjByKey), onAlt: () => create(false)
      });
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.complete = async id => {
    try {
      const j = J(id), L = jl(id);
      if (!L.some(l => l.released > 0)) throw new Error('Release goods first');
      let frozen = null;
      if (E.dailyAllocation && E.dailyAllocation.freezeJobShadow) { try { frozen = await E.dailyAllocation.freezeJobShadow(id); } catch (e) { console.warn('Freeze failed:', e); } }
      /* Material issued for pairs that were never made must not silently inflate the cost of the pairs that were made.
         Excess = net material issued to the job (issues less returns) minus what the BOM needs for the packs RELEASED,
         limited to what the BOM needs for the packs STARTED but not released. Material already returned to stock is not counted again. */
      const unusedBy = {}; let unusedTot = 0; const unusedTxt = [];
      {
        const need = {}, unusedNeed = {};
        L.forEach(l => {
          const it = E.D.items.find(x => x.id === l.itemId), pk = (it && it.pack) || 1, st = l.started || 0, un = Math.max(0, st - (l.released || 0));
          ((it && it.bom) || []).forEach(bm => {
            const k = bm.itemId + '|' + (bm.variantId || '');
            need[k] = (need[k] || 0) + bm.qty * (l.released || 0) * pk;
            if (un > 1e-9) { const u = bm.qty * un * pk; (unusedNeed[k] = unusedNeed[k] || { tot: 0, by: {} }); unusedNeed[k].tot += u; unusedNeed[k].by[l.id] = (unusedNeed[k].by[l.id] || 0) + u; }
          });
        });
        Object.keys(unusedNeed).forEach(k => {
          const [iid, vid] = k.split('|'), mv = E.rows('issues').filter(x => x.jobId === id && x.itemId === iid && (x.variantId || '') === vid);
          const q = mv.reduce((a1, x) => a1 + x.qty, 0), v = mv.reduce((a1, x) => a1 + x.value, 0);
          if (!(q > 1e-9)) return;
          const exQty = Math.min(Math.max(0, q - (need[k] || 0)), unusedNeed[k].tot), val = Math.round(v * exQty / q);
          if (!(val > 0)) return;
          let left = val; const ids = Object.keys(unusedNeed[k].by);
          ids.forEach((lid, ix) => { const part = ix === ids.length - 1 ? left : Math.round(val * unusedNeed[k].by[lid] / unusedNeed[k].tot); left -= part; unusedBy[lid] = (unusedBy[lid] || 0) + part; });
          unusedTot += val;
        });
        Object.keys(unusedBy).forEach(lid => { const l = L.find(x => x.id === lid); unusedTxt.push(l.code); });
      }
      /* Settings > Wastage rule: ask (default) / always factory loss / always add to product cost */
      const wRule = E.setting('wastage') || 'ask';
      const writeOff = unusedTot > 0 && wRule !== 'cost';
      /* 1) CHECK AND CONFIRM EVERYTHING FIRST - nothing is posted until the owner has agreed and every check has passed */
      {
        const pre = sheet(j).R, remAbs0 = fullFor(id) ? poolOf(id) - absorbed(id) : 0;
        const sum0 = pre.reduce((x, r) => x + (stockOf(id, r) - (r.l.fgValue || 0)), 0);
        if (Math.abs(sum0 - remAbs0 - wip(id)) > 1) throw new Error('Cost sheet vs WIP differ by ' + E.m(sum0 - remAbs0 - wip(id)) + '. Nothing was posted.');
        if (writeOff && wRule !== 'loss' && !confirm('Material worth ' + E.m(unusedTot) + ' was issued for pairs that were never made (' + unusedTxt.join(', ') + ').\n\nOK = write it off to Factory Loss (5300) so it does not inflate the cost of the pairs made.\nCancel = stop; first return any unused material that is still in stock (Job > Issue / return) and complete again.')) return;
        const projected = wip(id) - (writeOff ? unusedTot : 0);
        if (!confirm('Complete ' + j.no + '? Remaining WIP ' + E.m(projected) + (remAbs0 ? ' + wages/overheads ' + E.m(remAbs0) : '') + (fullFor(id) ? ' → finished goods at full cost.' : ' → finished goods at material cost. Wages and overheads stay as normal expenses (job allocation is for costing only).'))) return;
      }
      /* 2) POST AS ONE UNIT: every step registers how to undo itself; if any later step fails, all earlier steps are taken back */
      const undo = [];
      const rollback = async () => { while (undo.length) { const f = undo.pop(); try { await f(); } catch (x) { console.error('completion rollback failed', x); } } };
      try {
        if (writeOff) {
          const nu = await E.next('LOSS');
          const w = await E.post({ date: E.today(), ref: nu, narr: 'Unused job material written off · ' + j.no, source: 'release', lines: Object.keys(unusedBy).map(lid => ({ acc: '1310', cr: unusedBy[lid], job: id, cat: 'Material', art: lid })).concat([{ acc: '5300', dr: unusedTot }]) });
          undo.push(() => E.reverse(w.id));
        }
        const { R } = sheet(j);
        const remAbs = fullFor(id) ? poolOf(id) - absorbed(id) : 0;
        const d = R.map(r => stockOf(id, r) - (r.l.fgValue || 0));
        const sum = d.reduce((x, y) => x + y, 0);
        if (Math.abs(sum - remAbs - wip(id)) > 1) throw new Error('Cost sheet vs WIP differ by ' + E.m(sum - remAbs - wip(id)));
        const no = await E.next('CMP'), ls = [], dS = [], usedV = {};
        for (let i = 0; i < R.length; i++) {
          const r = R[i];
          if (d[i] > 0) { ls.push({ acc: '1320', dr: d[i], job: id, cat: 'Costing', art: r.l.id }); dS[i] = d[i]; }
          else if (d[i] < 0) {
            /* a true-down can only come out of stock that is still there; pairs already sold carried the excess into cost of sales, so that part is released as a job-closing variance (5390) */
            const key = r.l.itemId + '|' + (r.l.variantId || ''), st = E.stock(r.l.itemId, r.l.variantId), take = Math.min(-d[i], Math.max(0, (st.value || 0) - (usedV[key] || 0))), ex = -d[i] - take; usedV[key] = (usedV[key] || 0) + take;
            if (take) ls.push({ acc: '1320', cr: take, job: id, cat: 'Costing', art: r.l.id });
            if (ex) { if (!E.acct('5390')) await E.ensureCoa(); ls.push({ acc: '5390', cr: ex, job: id, cat: 'Costing', art: r.l.id }); }
            dS[i] = -take;
          } else dS[i] = 0;
        }
        const matPart = sum - remAbs;
        if (matPart > 0) ls.push({ acc: '1310', cr: matPart, job: id, cat: 'Costing' });
        if (matPart < 0) ls.push({ acc: '1310', dr: -matPart, job: id, cat: 'Costing' });
        if (remAbs > 0) ls.push({ acc: ABS, cr: remAbs, job: id, cat: 'Absorbed' });
        if (remAbs < 0) ls.push({ acc: ABS, dr: -remAbs, job: id, cat: 'Absorbed' });
        if (ls.length > 1) { const fin = await E.post({ date: E.today(), ref: no, narr: 'Final costing', source: 'release', lines: ls }); undo.push(() => E.reverse(fin.id)); }
        for (let i = 0; i < R.length; i++) {
          const r = R[i], l = r.l, b = JSON.parse(JSON.stringify(l));
          if (dS[i]) { const mv = await E.stockIn({ date: E.today(), itemId: l.itemId, variantId: l.variantId, qty: 0, value: dS[i], type: 'costing', ref: no, job: id }); undo.push(() => E.del('stockMoves', mv.id)); }
          Object.assign(l, { alloc: r.full, unitCost: r.fullPack, unitCostPerPair: r.fullPair, fgValue: stockOf(id, r) });
          try { await E.save('jobLines', l, b); } catch (err) { Object.assign(l, b); throw err; }
          undo.push(async () => { const cur = JSON.parse(JSON.stringify(l)); Object.assign(l, b); await E.save('jobLines', l, cur); });
        }
        const bj = JSON.parse(JSON.stringify(j));
        j.status = 'Completed';
        j.completedAt = E.today();
        if (frozen) j.shadowSnapshot = frozen;
        try { await E.save('jobs', j, bj); } catch (err) { Object.assign(j, bj); delete j.shadowSnapshot; if (!bj.shadowSnapshot) delete j.shadowSnapshot; throw err; }
      } catch (err) { await rollback(); err.message = (err.message || 'Failed') + ' (completion was undone; nothing was changed)'; throw err; }
      E.go(); E.toast(j.no + ' completed · frozen', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);