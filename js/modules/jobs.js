console.log("🏆 ENTERPRISE JOBS MODULE LOADED 🏆");

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

  function calculateVariance(j, sheetData) {
    let matVarianceVal = 0;
    const L = jl(j.id);
    const issues = E.rows('issues').filter(i => i.jobId === j.id);
    
    L.forEach(l => {
      const item = itemOf(l);
      if (!item || !item.bom) return;
      item.bom.forEach(b => {
        const k = b.itemId + '|' + (b.variantId || '');
        const reqQty = b.qty * l.target * pairsPerPack(l);
        const issuedQty = issues.filter(i => i.itemId === b.itemId && (i.variantId||'') === (b.variantId||'')).reduce((s, i) => s + i.qty, 0);
        const diffQty = issuedQty - reqQty;
        
        // Average cost of material
        const st = E.stock(b.itemId, b.variantId);
        const avgCost = st.qty > 0 ? (st.value / st.qty) : (itemOf({itemId: b.itemId}).buyPrice || 0);
        matVarianceVal += (diffQty * avgCost);
      });
    });
    return matVarianceVal;
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
    
    let estRevenue = 0;
    jl(j.id).forEach(l => {
      const item = itemOf(l);
      const pricePerPair = item.price || 0;
      const relPairs = l.released * pairsPerPack(l);
      estRevenue += relPairs * pricePerPair;
    });
    const profit = estRevenue - complete;
    const matVar = calculateVariance(j, R);
    const qcs = E.rows('qc').filter(q => q.jobId === j.id);
    const rejectedPairs = qcs.reduce((s, q) => s + q.rejected, 0);

    w.document.write(`<html><head><title>${j.no}</title><style>
      @page{size:A4 landscape;margin:12mm}body{font:12px Arial;color:#111}
      .header{background:#2a1758;color:#fff;padding:12px;margin:-12px -12px 12px -12px;display:flex;justify-content:space-between}
      .internal{background:#fef3c7;color:#92400e;padding:6px 12px;font-size:11px;font-weight:700;text-align:center;margin:-12px -12px 12px -12px;border-bottom:2px solid #d97706}
      table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}.r{text-align:right}
      .posted{background:#f0fdf4}.shadow{background:#eff6ff}.complete{background:#faf5ff;font-weight:bold;font-size:14px}
      .profit{background:#ecfdf5;border:2px solid #059669;padding:10px;margin-top:10px}
      .warning{color:#b91c1c;font-weight:bold}
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
      <div style="display:flex;gap:20px;margin-top:10px">
        ${estRevenue ? `<div class="profit" style="flex:1"><b>PROJECTED PROFITABILITY:</b><br>Revenue ${E.m(estRevenue)} - Complete Cost ${E.m(complete)} = <b>${E.m(profit)}</b> (${((profit/estRevenue)*100).toFixed(1)}% Margin)</div>` : ''}
        <div class="profit" style="flex:1;background:${matVar > 0 ? '#fef2f2' : '#f0fdf4'};border-color:${matVar > 0 ? '#ef4444' : '#059669'}">
          <b>MATERIAL VARIANCE:</b><br>Actual vs BOM: <b class="${matVar > 0 ? 'warning' : ''}">${E.m(matVar)}</b><br>
          <span style="font-size:11px">${matVar > 0 ? 'Over-issued (Wastage/Theft)' : 'Under-issued (Efficiency)'}</span>
        </div>
        ${rejectedPairs > 0 ? `<div class="profit" style="flex:1;background:#fef2f2;border-color:#ef4444"><b>QUALITY:</b><br><span class="warning">${rejectedPairs} Pairs Rejected</span></div>` : ''}
      </div>
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
    const isFrozen = !!j.shadowSnapshot;
    const matVar = calculateVariance(j, R);
    
    let estRevenue = 0;
    L.forEach(l => { const item = itemOf(l); estRevenue += (l.released * pairsPerPack(l)) * (item.price || 0); });
    const profit = estRevenue - completeCost;

    // Health Check
    const isOverdue = j.due && j.due < E.today() && open;
    const wipAge = Math.floor((new Date() - new Date(j.date)) / 864e5);

    const tabs = [
      ['cost', '💰 Costing'],
      ['mat', '📦 Material Variance'],
      ['prod', '🧵 Labour'],
      ['qc', '✅ Quality'],
      ['timeline', '⏱️ Timeline'],
      ['ledger', '🧾 Ledger']
    ];

    const tabContent = F.tab === 'cost' ? tabCost(j, R, postedCost, shadowTotal, completeCost, profit, estRevenue, wipAge) :
                       F.tab === 'mat' ? tabMat(j, matVar) :
                       F.tab === 'prod' ? tabProd(j) :
                       F.tab === 'qc' ? tabQc(j) :
                       F.tab === 'timeline' ? tabTimeline(j, ls) : tabLedger(j, L, ls);

    return `<div class="bar">
      <button class="btn" data-nav="jobs">← Jobs</button>
      <b style="font-size:16px">${j.no} · ${E.esc((pty(j.partyId) || {}).name || 'Stock')}</b>
      <span class="tag">${j.status}</span>
      ${isOverdue ? '<span class="badge" style="background:#ef4444;color:#fff">OVERDUE</span>' : ''}
      <span class="gap"></span>
      <button class="btn" data-a="jobPrint" data-id="${j.id}">🖨 Mgmt Sheet</button>
      <button class="btn" data-a="jobPrintCustomer" data-id="${j.id}">🖨 Customer</button>
      ${open ? `
        <button class="btn" data-a="editJob" data-id="${j.id}">✏️ Edit</button>
        <button class="btn" data-a="issueM" data-id="${j.id}">Materials</button>
        <button class="btn p" data-a="relM" data-id="${j.id}">Release Goods</button>
        <button class="btn" data-a="complete" data-id="${j.id}">Complete Job</button>
      ` : ''}
    </div>

    <div class="kp">
      ${E.kpi('Posted Cost', E.m(postedCost), 'In ledger')}
      ${E.kpi('COMPLETE COST', '<b>' + E.m(completeCost) + '</b>', 'For pricing')}
      ${E.kpi('Cost Per Pair', E.m(totalPairs ? Math.round(completeCost / totalPairs) : 0), 'Management cost')}
      ${E.kpi('WIP Age', wipAge + ' days', 'Since ' + j.date)}
      ${E.kpi('Material Variance', `<span class="${matVar > 0 ? 'bad' : 'ok'}">${E.m(matVar)}</span>`, matVar > 0 ? 'Over-issued' : 'Efficient')}
      ${E.kpi('Projected Profit', `<span class="${profit >= 0 ? 'ok' : 'bad'}">${E.m(profit)}</span>`, estRevenue ? ((profit/estRevenue)*100).toFixed(1)+'% margin' : '—')}
    </div>

    <div class="bar">
      ${tabs.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="jtTab" data-id="${k}">${l}</button>`).join('')}
    </div>

    <div id="jtBody">${tabContent}</div>
  </div>`;

  E.A.jtTab = t => { F.tab = t; E.go(); };

  function tabCost(j, R, postedCost, shadowTotal, completeCost, profit, estRevenue, wipAge) {
    const frozen = !!j.shadowSnapshot;
    const shadow = shadowFor(j);
    return `
    ${frozen ? `<div class="card" style="background:#d1fae5;border-left:4px solid #059669;padding:12px;margin-bottom:14px">
      <b style="color:#065f46">🔒 Cost sheet frozen at ${j.shadowSnapshot.frozenAt}</b>
    </div>` : ''}

    <div class="g2">
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
            <tr style="background:var(--s2)"><td><b>Shadow subtotal</b></td><td class="r">—</td><td class="r"><b>${E.m(shadowTotal)}</b></td><td class="r"><b>${E.m(shadowTotal)}</b></td></tr>
            <tr style="background:#faf5ff"><td><b style="font-size:14px">COMPLETE COST</b></td><td class="r">${E.m(postedCost)}</td><td class="r">${E.m(shadowTotal)}</td><td class="r"><b style="font-size:14px">${E.m(completeCost)}</b></td></tr>
          </tbody>
        </table></div>
      </div>

      <div class="card">
        <h3>Profitability Waterfall</h3>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--s2);border-radius:8px"><span>Projected Revenue (Selling Price)</span><b>${E.m(estRevenue)}</b></div>
          <div style="display:flex;justify-content:space-between;padding:10px;background:#fee2e2;color:#b91c1c;border-radius:8px"><span>(-) Complete Cost</span><b>${E.m(completeCost)}</b></div>
          <div style="display:flex;justify-content:space-between;padding:15px;background:${profit >= 0 ? '#d1fae5' : '#fee2e2'};color:${profit >= 0 ? '#065f46' : '#b91c1c'};border-radius:8px;font-size:18px;font-weight:bold">
            <span>= Projected Profit</span><span>${E.m(profit)}</span>
          </div>
          <div style="text-align:right;font-size:12px;color:var(--t3)">Margin: <b>${estRevenue ? ((profit/estRevenue)*100).toFixed(1) : 0}%</b></div>
        </div>
      </div>
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

  function tabMat(j, matVar) {
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
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Material Consumption & Variance</h3>
        <div style="background:${matVar > 0 ? '#fee2e2' : '#d1fae5'};padding:8px 16px;border-radius:8px">
          Total Variance: <b class="${matVar > 0 ? 'bad' : 'ok'}">${E.m(matVar)}</b>
        </div>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Material</th><th class="r">BOM Required</th><th class="r">Actual Issued</th><th class="r">Qty Variance</th><th class="r">Value Issued</th></tr></thead>
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
    </div>`;
  }

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

  function tabQc(j) {
    const qcs = E.rows('qc').filter(q => q.jobId === j.id);
    if (!qcs.length) return '<div class="card muted">No quality inspections recorded for this job yet. Log them in the Quality Control module.</div>';
    
    const insp = qcs.reduce((s, q) => s + q.inspected, 0);
    const rej = qcs.reduce((s, q) => s + q.rejected, 0);
    
    return `<div class="card">
      <h3>Quality Control & Rejections</h3>
      <div class="kp">
        ${E.kpi('Pairs Inspected', insp)}
        ${E.kpi('Pairs Rejected', `<span class="${rej > 0 ? 'bad' : 'ok'}">${rej}</span>`)}
        ${E.kpi('Reject Rate', insp ? ((rej/insp)*100).toFixed(1)+'%' : '0%')}
      </div>
      <div class="tw"><table>
        <thead><tr><th>Date</th><th>Article</th><th>Stage</th><th class="r">Inspected</th><th class="r">Rejected</th><th>Defect</th></tr></thead>
        <tbody>${qcs.sort((a,b)=>b.date.localeCompare(a.date)).map(q => `<tr>
          <td>${q.date}</td><td>${E.esc(q.code)}</td><td>${E.esc(q.stage)}</td>
          <td class="r">${q.inspected}</td><td class="r ${q.rejected > 0 ? 'bad' : ''}">${q.rejected}</td>
          <td>${E.esc(q.defect || '')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  function tabTimeline(j, ls) {
    const ev = [];
    
    // 1. Job Created
    ev.push({ date: j.date, time: j.createdAt || j.date, title: 'Job Created', desc: `Target: ${jl(j.id).reduce((s,l)=>s+(l.target*pairsPerPack(l)),0)} pairs`, icon: '📝', color: 'var(--ac)' });
    
    // 2. Materials
    E.rows('issues').filter(i => i.jobId === j.id).forEach(i => {
      ev.push({ date: i.date, time: i.createdAt, title: 'Material Issued', desc: `${E.esc(i.code)}: ${i.qty} units`, icon: '📦', color: '#d97706' });
    });

    // 3. Production
    E.rows('prodLogs').filter(l => l.jobId === j.id && l.status !== 'cancelled').forEach(l => {
      const emp = E.D.employees.find(e => e.id === l.empId) || {};
      ev.push({ date: l.date, time: l.createdAt, title: 'Production Logged', desc: `${emp.name || '?'} · ${l.opName} · ${l.convertedQty || l.qty} pairs`, icon: '🧵', color: '#0891b2' });
    });

    // 4. QC
    E.rows('qc').filter(q => q.jobId === j.id).forEach(q => {
      ev.push({ date: q.date, time: q.createdAt, title: 'Quality Inspection', desc: `${q.stage} · ${q.inspected} inspected, ${q.rejected} rejected`, icon: '✅', color: '#059669' });
    });

    // 5. Releases
    E.rows('stockMoves').filter(m => m.job === j.id && m.type === 'release').forEach(m => {
      ev.push({ date: m.date, time: m.createdAt, title: 'Goods Released', desc: `${m.qty} packs moved to Finished Goods`, icon: '📤', color: '#7c3aed' });
    });

    // 6. Completion
    if (j.completedAt) {
      ev.push({ date: j.completedAt, time: j.completedAt, title: 'Job Completed', desc: 'Costs frozen to Finished Goods', icon: '🏁', color: '#059669' });
    }

    // Sort by date/time descending
    ev.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

    return `<div class="card">
      <h3>Job Timeline & Audit Trail</h3>
      <div style="padding:20px 0;display:flex;flex-direction:column;gap:0">
        ${ev.map((e, i) => `
          <div style="display:flex;gap:16px;position:relative;padding-bottom:24px">
            <!-- Vertical Line -->
            <div style="position:absolute;left:20px;top:32px;bottom:0;width:2px;background:var(--bd);${i === ev.length-1 ? 'display:none' : ''}"></div>
            
            <!-- Icon -->
            <div style="width:42px;height:42px;border-radius:50%;background:${e.color}20;color:${e.color};display:flex;align-items:center;justify-content:center;font-size:20px;z-index:1">${e.icon}</div>
            
            <!-- Content -->
            <div style="flex:1;background:var(--s);border:1px solid var(--bd);padding:12px 16px;border-radius:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <b style="color:${e.color}">${e.title}</b>
                <span class="muted" style="font-size:11px">${e.date} ${e.time && e.time.includes('T') ? e.time.split('T')[1].slice(0,5) : ''}</span>
              </div>
              <div style="font-size:13px">${E.esc(e.desc)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

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

  /* INTELLIGENT RELEASE (unchanged from working version) */
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
                  <button class="btn sm" onclick="ERP.A.relMax('${l.id}', ${maxToRelease})">Max</button>
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

  /* (newJob, saveJob, complete, issueM remain exactly the same as the working version you provided) */
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

  E.A.issueM = id => E.modal('Issue / return materials', `
    <div class="g2"><div class="f">Action<select id="x_k"><option value="issue">Issue</option><option value="return">Return</option></select></div><div class="f">Date<input id="x_d" type="date" value="${E.today()}"></div></div>
    <div class="f">Material *<input id="x_i" list="sk"></div>
    <datalist id="sk">${E.skuOpts(i => i.cat !== 'Finished Good')}</datalist>
    <div class="g2"><div class="f">Qty *<input id="x_q" type="number" step="0.001"></div></div>
  `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveIssue" data-id="${id}">Post</button>`);

  E.A.saveIssue = async id => {
    try {
      const s = E.skuFind(E.val('x_i'), i => i.cat !== 'Finished Good');
      if (!s) throw new Error('Select material');
      const q = parseFloat(E.val('x_q'));
      if (!(q > 0)) throw new Error('Enter qty');
      const d = E.val('x_d'), k = E.val('x_k');
      const no = await E.next('ISS');
      const mv = E.rows('issues').filter(x => x.jobId === id && x.itemId === s.itemId && x.variantId === s.variantId);
      const nq = mv.reduce((a, x) => a + x.qty, 0), nvl = mv.reduce((a, x) => a + x.value, 0);
      let val;
      if (k === 'issue') {
        val = E.outValue(s.itemId, s.variantId, q);
        await E.post({ date: d, ref: no, narr: 'Issue ' + s.code, source: 'issue', lines: [{ acc: '1310', dr: val, job: id, cat: 'Material' }, { acc: '1300', cr: val }] });
        await E.stockOut({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, type: 'issue', ref: no, job: id });
        await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: q, value: val });
      } else {
        if (q > nq + 1e-9) throw new Error('Only ' + nq + ' issued');
        val = q >= nq - 1e-9 ? nvl : Math.round(nvl * q / nq);
        await E.post({ date: d, ref: no, narr: 'Return ' + s.code, source: 'issue', lines: [{ acc: '1300', dr: val }, { acc: '1310', cr: val, job: id, cat: 'Material' }] });
        await E.stockIn({ date: d, itemId: s.itemId, variantId: s.variantId, qty: q, value: val, type: 'return', ref: no, job: id });
        await E.save('issues', { no, date: d, jobId: id, itemId: s.itemId, variantId: s.variantId, code: s.code, qty: -q, value: -val });
      }
      E.closeM(); E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);