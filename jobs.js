/* PART 4 (v9) — ULTIMATE JOBS MODULE with 360 Analytics.
   - 4 Tab Job View: Costing, Materials (BOM vs Actual), Production (Wages), Ledger.
   - Projected Profitability (Revenue - Complete Cost).
   - Highly detailed Print Sheets.
   - Intelligent Pairs Release.
*/
(E => {
  const n = E.N.find(x => x.id === 'jobs'); if (n) n.soon = 0;
  const F = { q: '', st: 'In Progress', tab: 'cost' }; E.jobId = '';
  const pty = id => E.D.parties.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const itemOf = l => E.D.items.find(x => x.id === l.itemId) || {};
  const lines = id => E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === id).map(l => Object.assign({ date: j.date, no: j.no, narr: j.narr }, l)));
  const wip = id => lines(id).filter(l => l.acc === '1310').reduce((s, l) => s + l.dr - l.cr, 0);
  const pairsPerPack = l => { const i = itemOf(l); return i.pack || E.setting('packSize') || 1; };
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const CATS = ['Material', 'Labour', 'Overhead', 'Consumable'];

  /* HELPER: Find the max releasable pairs based on production logs */
  function getMaxPairs(l) {
    const pp = pairsPerPack(l);
    const rPairs = l.released * pp;
    const allOps = E.rows('operations').filter(o => o.active !== false).sort((a, b) => (b.order || 0) - (a.order || 0));
    const finalOp = allOps.length ? allOps[0] : null;
    let producedPairs = 0;
    if (finalOp) {
      producedPairs = E.rows('prodLogs').filter(x => x.lineId === l.id && x.opId === finalOp.id && x.status !== 'cancelled').reduce((s, x) => s + (x.convertedQty || x.qty), 0);
    } else {
      producedPairs = l.target * pp;
    }
    return Math.max(0, producedPairs - rPairs);
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
    return { R, rel, sh };
  }

  function shadowFor(job) {
    if (job.shadowSnapshot) return job.shadowSnapshot;
    const daily = job.shadowDaily || {};
    const totalFixed = Object.values(daily).reduce((s, v) => s + v, 0);
    return { totalFixedAllocated: totalFixed, accruedWages: { dailySalaries: 0, weeklyTimeWages: 0, total: 0 }, perExpenseTotal: {}, isLive: true };
  }

  /* ═══════════════════════════════════════════════════════════
     ULTIMATE PRINT SHEETS
     ═══════════════════════════════════════════════════════════ */
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
    
    // Calculate Revenue / Profit
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

  /* ═══════════════════════════════════════════════════════════
     JOB VIEW ROUTE WITH TABS
     ═══════════════════════════════════════════════════════════ */
  E.route('jobview', 'Job', () => {
    const j = J(E.jobId);
    if (!j) return '<div class="card">Select a job.</div>';
    E.$('pt').textContent = j.no;
    
    const L = jl(j.id), { R, rel } = sheet(j);
    const open = j.status === 'In Progress';
    const shadow = shadowFor(j);
    const postedCost = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const completeCost = postedCost + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    const costPerPairComplete = totalPairs ? Math.round(completeCost / totalPairs) : 0;
    
    // Projected Revenue
    let estRevenue = 0;
    L.forEach(l => { const item = itemOf(l); estRevenue += (l.released * pairsPerPack(l)) * (item.price || 0); });
    const profit = estRevenue - completeCost;

    const tabs = [
      ['cost', '💰 Costing & Shadow'],
      ['mat', '📦 Material Consumption'],
      ['prod', '🧵 Labour & Operations'],
      ['ledger', '🧾 Ledger Transactions']
    ];

    const tabContent = F.tab === 'cost' ? tabCost(j, R, postedCost, shadowTotal, completeCost) :
                       F.tab === 'mat' ? tabMat(j) :
                       F.tab === 'prod' ? tabProd(j) : tabLedger(j, L, ls);

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
      ${E.kpi('Shadow Cost', E.m(shadowTotal), frozen ? 'frozen' : 'live')}
      ${E.kpi('COMPLETE COST', '<b>' + E.m(completeCost) + '</b>', 'For pricing')}
      ${E.kpi('Cost Per Pair', E.m(costPerPairComplete), 'Management cost')}
      ${E.kpi('Projected Revenue', E.m(estRevenue), 'Based on selling price')}
      ${E.kpi('Projected Profit', `<span class="${profit >= 0 ? 'ok' : 'bad'}">${E.m(profit)}</span>`, estRevenue ? ((profit/estRevenue)*100).toFixed(1)+'% margin' : '—')}
    </div>

    <div class="bar">
      ${tabs.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="jtTab" data-id="${k}">${l}</button>`).join('')}
    </div>

    <div id="jtBody">${tabContent}</div>
  </div>`;

  E.A.jtTab = t => { F.tab = t; E.go(); };

  /* ═══════════════════════════════════════════════════════════
     TAB 1: COSTING & SHADOW
     ═══════════════════════════════════════════════════════════ */
  function tabCost(j, R, postedCost, shadowTotal, completeCost) {
    const frozen = !!j.shadowSnapshot;
    const shadow = shadowFor(j);
    return `
    ${frozen ? `<div class="card" style="background:#d1fae5;border-left:4px solid #059669;padding:12px;margin-bottom:14px">
      <b style="color:#065f46">🔒 Cost sheet frozen at ${j.shadowSnapshot.frozenAt}</b>
      <div class="muted" style="font-size:12px;margin-top:4px">These numbers are permanent. Used for pricing. Not affected by later rent/electricity changes.</div>
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
      <p class="muted" style="margin-top:10px">Posted = in ledger (real). Shadow = daily allocation (management). Complete = for pricing decisions.</p>
    </div>

    <div class="card">
      <h3>Per-article cost breakdown</h3>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Total cost</th><th class="r">Per pair</th><th class="r">Per pack</th></tr></thead>
        <tbody>${R.map(r => `<tr>
          <td><b>${E.esc(r.l.code)}</b> ${E.esc(r.l.name)}</td>
          <td class="r">${r.packs}</td><td class="r">${r.pairs}</td>
          <td class="r">${E.m(r.total)}</td>
          <td class="r"><b>${E.m(r.unitPair)}</b></td>
          <td class="r">${E.m(r.unitPack)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     TAB 2: MATERIALS (BOM vs ACTUAL)
     ═══════════════════════════════════════════════════════════ */
  function tabMat(j) {
    const L = jl(j.id);
    const issues = E.rows('issues').filter(i => i.jobId === j.id);
    const req = {};
    
    // Calculate BOM Required
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

  /* ═══════════════════════════════════════════════════════════
     TAB 3: LABOUR & OPERATIONS
     ═══════════════════════════════════════════════════════════ */
  function tabProd(j) {
    const logs = E.rows('prodLogs').filter(l => l.jobId === j.id && l.status !== 'cancelled');
    if (!logs.length) return '<div class="card muted">No production logged for this job yet.</div>';
    
    const workers = {};
    logs.forEach(l => {
      const w = workers[l.empId] = workers[l.empId] || { name: (E.D.employees.find(e=>e.id===l.empId)||{}).name || '?', pairs: 0, amount: 0, ops: {} };
      const p = l.convertedQty || l.qty;
      w.pairs += p;
      w.amount += l.amount;
      w.ops[l.opName] = (w.ops[l.opName] || 0) + p;
    });

    return `<div class="card">
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

  /* ═══════════════════════════════════════════════════════════
     TAB 4: LEDGER TRANSACTIONS
     ═══════════════════════════════════════════════════════════ */
  function tabLedger(j, L, ls) {
    const txns = ls.filter(x => x.acc === '1310').sort((a, b) => b.date.localeCompare(a.date));
    if (!txns.length) return '<div class="card muted">No ledger transactions posted to this job yet.</div>';
    
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
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
     INTELLIGENT RELEASE (100% IN PAIRS)
     ═══════════════════════════════════════════════════════════ */
  E.A.relM = id => {
    const L = jl(id);
    const W = wip(id);
    const allOps = E.rows('operations').filter(o => o.active !== false).sort((a, b) => (b.order || 0) - (a.order || 0));
    const finalOp = allOps.length ? allOps[0] : null;
    const maxPairsTotal = L.reduce((s, l) => s + getMaxPairs(l), 0);
    
    if (maxPairsTotal <= 0) return E.toast('No goods are fully produced yet (check final operation logs in Daily Production).', 'error');

    E.modal('Release Finished Goods (in Pairs)', `
      <div class="g2">
        <div class="f">Date<input id="r_d" type="date" value="${E.today()}"></div>
        <div class="f">Total WIP Value to Release: <b style="color:var(--ac)">${E.m(W)}</b></div>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th class="r">Target (Pairs)</th><th class="r">Produced at ${finalOp ? E.esc(finalOp.name) : 'Final Op'}</th><th class="r">Already Released</th><th class="r">Max Releasable</th><th class="r">Release Now (Pairs)</th></tr></thead>
        <tbody>
          ${L.map(l => {
            const pp = pairsPerPack(l);
            const tPairs = l.target * pp;
            const rPairs = l.released * pp;
            const produced = finalOp ? E.rows('prodLogs').filter(x => x.lineId === l.id && x.opId === finalOp.id && x.status !== 'cancelled').reduce((s, x) => s + (x.convertedQty || x.qty), 0) : tPairs;
            const maxToRelease = Math.max(0, produced - rPairs);
            
            return `<tr>
              <td><b>${E.esc(l.code)}</b></td>
              <td class="r">${tPairs}</td>
              <td class="r muted">${produced}</td>
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
        if (x.pairs > x.max) throw new Error('Cannot release more than produced for ' + x.l.code + ' (Max: ' + x.max + ' pairs)');
      }
      
      const totalPairsToRelease = rq.reduce((s, x) => s + x.pairs, 0);
      const W = wip(id);
      if (W <= 0) throw new Error('No WIP to release');
      
      const totalMaxPairs = L.reduce((s, l) => s + getMaxPairs(l), 0);
      const batchValue = Math.round(W * (totalPairsToRelease / totalMaxPairs));
      let leftValue = batchValue;
      
      const vals = rq.map((x, i) => {
        const v = i === rq.length - 1 ? leftValue : Math.round(batchValue * (x.pairs / totalPairsToRelease));
        leftValue -= v;
        return v;
      });
      
      const no = await E.next('REL'), d = E.val('r_d');
      
      await E.post({ 
        date: d, ref: no, narr: 'Release ' + totalPairsToRelease + ' pairs', source: 'release',
        lines: rq.map((x, i) => ({ acc: '1320', dr: vals[i], job: id, cat: 'Release', art: x.l.id })).concat([{ acc: '1310', cr: batchValue, job: id, cat: 'Release' }]) 
      });
      
      for (let i = 0; i < rq.length; i++) {
        const { l, pairs } = rq[i];
        const pp = pairsPerPack(l);
        const packsToAdd = pairs / pp;
        await E.stockIn({ date: d, itemId: l.itemId, variantId: l.variantId, qty: packsToAdd, value: vals[i], type: 'release', ref: no, job: id });
        const b = JSON.parse(JSON.stringify(l));
        l.released += packsToAdd;
        l.fgValue += vals[i];
        await E.save('jobLines', l, b);
      }
      
      E.closeM(); E.go(); 
      E.toast(no + ': ' + totalPairsToRelease + ' pairs released', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* The rest (newJob, complete, issueM) remains the same */
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
      const no = await E.next('JOB');
      const j = await E.save('jobs', { no, date: E.val('j_d'), due: E.val('j_u'), partyId: E.val('j_p'), priority: E.val('j_pr'), notes: E.val('j_n'), status: 'In Progress' });
      for (const { s, packs } of ks) await E.save('jobLines', { jobId: j.id, itemId: s.itemId, variantId: s.variantId, code: s.code, name: s.name, target: packs, released: 0, fgValue: 0 });
      E.closeM(); E.openJob(j.id); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.complete = async id => {
    try {
      const j = J(id), L = jl(id);
      if (!L.some(l => l.released > 0)) throw new Error('Release goods first');
      let frozen = null;
      if (E.dailyAllocation && E.dailyAllocation.freezeJobShadow) { try { frozen = await E.dailyAllocation.freezeJobShadow(id); } catch (e) { console.warn('Freeze failed:', e); } }
      const { R } = sheet(j);
      const d = R.map(r => r.total - (r.l.fgValue || 0));
      const sum = d.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - wip(id)) > 1) throw new Error('Cost sheet vs WIP differ by ' + E.m(sum - wip(id)));
      if (!confirm('Complete ' + j.no + '? Remaining WIP ' + E.m(sum) + ' → FG.')) return;
      const no = await E.next('CMP'), ls = [];
      R.forEach((r, i) => {
        if (d[i] > 0) ls.push({ acc: '1320', dr: d[i], job: id, cat: 'Costing', art: r.l.id });
        if (d[i] < 0) ls.push({ acc: '1320', cr: -d[i], job: id, cat: 'Costing', art: r.l.id });
      });
      if (sum > 0) ls.push({ acc: '1310', cr: sum, job: id, cat: 'Costing' });
      if (sum < 0) ls.push({ acc: '1310', dr: -sum, job: id, cat: 'Costing' });
      if (ls.length > 1) await E.post({ date: E.today(), ref: no, narr: 'Final costing', source: 'release', lines: ls });
      for (let i = 0; i < R.length; i++) {
        const r = R[i], l = r.l, b = JSON.parse(JSON.stringify(l));
        if (d[i]) await E.stockIn({ date: E.today(), itemId: l.itemId, variantId: l.variantId, qty: 0, value: d[i], type: 'costing', ref: no, job: id });
        Object.assign(l, { alloc: r.total, unitCost: r.unitPack, unitCostPerPair: r.unitPair, fgValue: r.total });
        await E.save('jobLines', l, b);
      }
      const bj = JSON.parse(JSON.stringify(j));
      j.status = 'Completed';
      j.completedAt = E.today();
      if (frozen) j.shadowSnapshot = frozen;
      await E.save('jobs', j, bj);
      E.go(); E.toast(j.no + ' completed · frozen', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);