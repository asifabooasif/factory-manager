/* PART 4 (v7) — INTELLIGENT PAIRS TRACKING.
   - Job Creation asks for Pairs.
   - Release Goods checks production logs for the final operation to calculate Max Releasable.
   - Handles partial packs (e.g. 3 pairs of a 6-pair pack) accurately.
*/
(E => {
  const n = E.N.find(x => x.id === 'jobs'); if (n) n.soon = 0;
  const F = { q: '', st: 'In Progress' }; E.jobId = '';
  const pty = id => E.D.parties.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const itemOf = l => E.D.items.find(x => x.id === l.itemId) || {};
  const lines = id => E.rows('journalEntries').flatMap(j => j.lines.filter(l => l.job === id).map(l => Object.assign({ date: j.date, no: j.no, narr: j.narr }, l)));
  const wip = id => lines(id).filter(l => l.acc === '1310').reduce((s, l) => s + l.dr - l.cr, 0);
  const pairsPerPack = l => { const i = itemOf(l); return i.pack || E.setting('packSize') || 1; };
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const CATS = ['Material', 'Labour', 'Overhead', 'Consumable'];

  /* ADVANCED HELPER: Find the max releasable pairs based on production logs */
  function getMaxPairs(l) {
    const pp = pairsPerPack(l);
    const rPairs = l.released * pp;
    
    // Find the final operation (highest order)
    const allOps = E.rows('operations').filter(o => o.active !== false).sort((a, b) => (b.order || 0) - (a.order || 0));
    const finalOp = allOps.length ? allOps[0] : null;

    let producedPairs = 0;
    if (finalOp) {
      producedPairs = E.rows('prodLogs').filter(x => x.lineId === l.id && x.opId === finalOp.id && x.status !== 'cancelled')
        .reduce((s, x) => s + (x.convertedQty || x.qty), 0);
    } else {
      producedPairs = l.target * pp; // Fallback if no operations defined
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

  function tbl() {
    const s = F.q.toLowerCase();
    const r = E.rows('jobs').filter(j => (!F.st || j.status === F.st) && (!s || (j.no + (pty(j.partyId) || {}).name + j.notes).toLowerCase().includes(s))).sort((a, b) => b.no.localeCompare(a.no));
    return `<div class="tw"><table>
      <thead><tr><th>Job</th><th>Date</th><th>Customer</th><th>Due</th><th>Priority</th><th class="r">Target (Pairs)</th><th class="r">Released (Pairs)</th><th class="r">WIP</th><th>Status</th><th></th></tr></thead>
      <tbody>${r.map(j => { const L = jl(j.id); return `<tr>
        <td><b>${j.no}</b></td><td>${j.date}</td>
        <td>${E.esc((pty(j.partyId) || {}).name || 'Stock production')}</td>
        <td>${j.due || '—'}</td><td><span class="tag">${j.priority}</span></td>
        <td class="r">${L.reduce((s, l) => s + l.target * pairsPerPack(l), 0)}</td>
        <td class="r">${L.reduce((s, l) => s + l.released * pairsPerPack(l), 0)}</td>
        <td class="r">${E.m(wip(j.id))}</td>
        <td><span class="tag">${j.status}</span></td>
        <td class="r">${j.status === 'In Progress' ? `<button class="btn sm" data-a="editJob" data-id="${j.id}">Edit</button> ` : ''}<button class="btn sm p" data-a="openJob" data-id="${j.id}">Open</button></td>
      </tr>`; }).join('') || '<tr><td colspan="10" class="muted">No jobs</td></tr>'}</tbody>
    </table></div>`;
  }

  E.route('jobs', 'Jobs & Costing', () => `<div class="kp">
    ${E.kpi('In progress', active().length)}
    ${E.kpi('Total WIP', E.m(active().reduce((s, j) => s + wip(j.id), 0)), 'Ledger 1310: ' + E.m(E.bal('1310')))}
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
    const open = j.status === 'In Progress';
    const shadow = shadowFor(j);
    const postedCost = R.reduce((s, r) => s + r.total, 0);
    const shadowTotal = (shadow.totalFixedAllocated || 0) + (shadow.accruedWages ? shadow.accruedWages.total : 0);
    const completeCost = postedCost + shadowTotal;
    const totalPacks = R.reduce((s, r) => s + r.packs, 0);
    const totalPairs = R.reduce((s, r) => s + r.pairs, 0);
    const costPerPairComplete = totalPairs ? Math.round(completeCost / totalPairs) : 0;
    const costPerPackComplete = totalPacks ? Math.round(completeCost / totalPacks) : 0;
    const frozen = !!j.shadowSnapshot;

    return `<div class="bar">
      <button class="btn" data-nav="jobs">← Jobs</button>
      <b style="font-size:16px">${j.no} · ${E.esc((pty(j.partyId) || {}).name || 'Stock production')}</b>
      <span class="tag">${j.status}</span>
      <span class="muted">Due ${j.due || '—'} · ${j.priority}</span>
      <span class="gap"></span>
      ${open ? `
        <button class="btn" data-a="editJob" data-id="${j.id}">✏️ Edit Job</button>
        <button class="btn" data-a="issueM" data-id="${j.id}">Materials</button>
        <button class="btn" data-a="addCost" data-id="${j.id}">Labor</button>
        <button class="btn p" data-a="relM" data-id="${j.id}">Release Goods</button>
        <button class="btn" data-a="complete" data-id="${j.id}">Complete Job</button>
      ` : ''}
    </div>

    <div class="kp">
      ${E.kpi('Posted cost', E.m(postedCost), 'in ledger')}
      ${E.kpi('Shadow', E.m(shadowTotal), frozen ? 'frozen' : 'live')}
      ${E.kpi('COMPLETE', '<b>' + E.m(completeCost) + '</b>', 'for pricing')}
      ${E.kpi('Per pair (complete)', E.m(costPerPairComplete), 'management cost')}
    </div>

    ${frozen ? `<div class="card" style="background:#d1fae5;border-left:4px solid #059669;padding:12px;margin-bottom:14px">
      <b style="color:#065f46">🔒 Cost sheet frozen at ${j.shadowSnapshot.frozenAt}</b>
    </div>` : ''}

    <div class="card">
      <h3>Per-article cost</h3>
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
    </div>
  </div>`;
  });

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
        m[k].pairs += pairs; 
        m[k].packs += packs;
      });
      const ks = Object.values(m);
      if (!ks.length) throw new Error('Add at least one line');
      const no = await E.next('JOB');
      const j = await E.save('jobs', { no, date: E.val('j_d'), due: E.val('j_u'), partyId: E.val('j_p'), priority: E.val('j_pr'), notes: E.val('j_n'), status: 'In Progress' });
      for (const { s, packs } of ks) await E.save('jobLines', { jobId: j.id, itemId: s.itemId, variantId: s.variantId, code: s.code, name: s.name, target: packs, released: 0, fgValue: 0 });
      E.closeM(); E.openJob(j.id); E.toast(no + ' created', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* INTELLIGENT RELEASE */
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