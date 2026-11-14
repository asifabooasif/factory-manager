/* PART 14 (v11) — Production strictly in Pairs with Size tracking. */
(E => {
  const ni = E.N.findIndex(n => n.id === 'jobs');
  E.N.splice(ni + 1, 0, { g: 'Factory', id: 'production', ico: '🧵', label: 'Daily Production' });
  { const pn = E.N.find(n => n.id === 'production'); E.N.splice(E.N.indexOf(pn) + 1, 0, { g: pn.g, id: 'tracker', ico: '📡', label: 'Production Tracker' }); }
  const F = { tab: 'log', date: E.today(), from: E.today().slice(0, 8) + '01', to: E.today(), job: '', emp: '' };
  const emp = id => E.D.employees.find(x => x.id === id);
  const op = id => E.D.operations.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const it = id => E.D.items.find(x => x.id === id);
  const logs = () => E.rows('prodLogs');
  const live = () => logs().filter(l => l.status !== 'cancelled');
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const ops = () => E.rows('operations').filter(o => o.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const elabel = e => e.code + ' — ' + e.name;

  /* ============ PRODUCTION FLOW ENGINE ============
     Every article has a ROUTING = the operations one pair must go through (set in Operations & rates > Article routing).
     Different workers may do different operations, or one worker may do them all - both are tracked the same way.
     COMPLETED pairs of an article line = the smallest number of pairs logged at any routing stage (the bottleneck).
     RELEASABLE pairs = completed - already released. */
  const R2 = x => Math.round(x * 100) / 100;
  const pairsOf = (x, pp) => R2(x.pairs != null ? x.pairs : (x.convertedQty || (x.qty || 0) * pp));
  E.flowMode = () => E.setting('prodGate') || 'block';
  E.itemRouting = item => ((item && item.routing) || []).map(r => ({ op: op(r.opId), wait: r.wait !== false })).filter(r => r.op && r.op.active !== false).sort((a, b) => (a.op.order || 0) - (b.op.order || 0));
  E.jobFlow = l => {
    const item = it(l.itemId) || {}, pp = item.pack || E.setting('packSize') || 1;
    const L = live().filter(x => x.lineId === l.id);
    const sum = id => R2(L.filter(x => x.opId === id).reduce((s, x) => s + pairsOf(x, pp), 0));
    let rt = E.itemRouting(item).map((r, i) => ({ op: r.op, wait: r.wait && i > 0 })), legacy = false;
    if (!rt.length) {            /* no routing set yet: use the operations that have been logged for this line */
      legacy = true;
      rt = [...new Set(L.map(x => x.opId))].map(op).filter(Boolean).sort((a, b) => (a.order || 0) - (b.order || 0)).map((o, i) => ({ op: o, wait: i > 0 }));
    }
    const stages = rt.map(r => ({ opId: r.op.id, name: r.op.name, wait: r.wait, logged: sum(r.op.id) }));
    const completed = stages.length ? Math.min(...stages.map(s => s.logged)) : 0;
    const target = R2(l.target * pp), released = R2((l.released || 0) * pp);
    return { stages, completed, released, ready: Math.max(0, R2(completed - released)), target, pp, legacy, limiting: stages.find(s => s.logged === completed) || null };
  };
  E.jobFlowHtml = (jobId, bare) => {
    const lines = jl(jobId);
    if (!lines.length) return '';
    const rows = lines.map(l => {
      const f = E.jobFlow(l);
      const chips = f.stages.length ? f.stages.map(s => {
        const pct = f.target ? Math.min(100, Math.round(s.logged / f.target * 100)) : 0;
        return `<div style="min-width:130px;flex:1"><div class="muted" style="font-size:11px">${E.esc(s.name)}${s.wait ? ' ⟵ needs earlier' : ''}</div><div style="background:#eee;border-radius:4px;height:14px"><div style="background:${pct >= 100 ? '#059669' : pct > 0 ? '#d97706' : '#e5e7eb'};height:100%;width:${pct}%;border-radius:4px"></div></div><div style="font-size:11px">${s.logged} / ${f.target} pairs</div></div>`;
      }).join('') : '<span class="muted">Nothing logged yet</span>';
      return `<tr><td><b>${E.esc(l.code)}</b>${f.legacy ? '<div class="muted" style="font-size:11px">⚠ no routing set — using operations logged so far</div>' : ''}</td><td><div style="display:flex;gap:10px;flex-wrap:wrap">${chips}</div></td><td class="r"><b>${f.completed}</b></td><td class="r">${f.released}</td><td class="r"><b style="color:${f.ready > 0 ? 'var(--g)' : 'inherit'}">${f.ready}</b></td><td>${f.limiting && f.completed < f.target ? E.esc(f.limiting.name) : (f.completed >= f.target && f.target ? '<span class="tag">All stages done</span>' : '—')}</td></tr>`;
    }).join('');
    const tbl = `<div class="tw"><table><thead><tr><th>Article</th><th>Stage progress (pairs logged)</th><th class="r">Completed (all stages)</th><th class="r">Released</th><th class="r">Ready to release</th><th>Waiting on</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return bare ? tbl : `<div class="card"><h3>Production flow · completed goods</h3>${tbl}</div>`;
  };
  const allTotal = (l, pairs, date) => { let rate = 0, amount = 0; E.itemRouting(it(l.itemId)).forEach(r => { const info = E.opRateInfo(r.op.id, l.itemId, date); const f = info.rateUnit === 'pair' ? 1 : info.piecesPerPair; rate += info.rate * f; amount += Math.round(pairs * f * info.rate); }); return { rate, amount }; };

  E.opRateInfo = (opId, itemId, date) => {
    const i = it(itemId);
    const cards = E.rows('rateCards').filter(c => c.opId === opId && (!date || (c.from || '') <= date));
    const best = (sc, ref) => cards.filter(c => c.scope === sc && c.ref === ref).sort((a, b) => (b.from || '').localeCompare(a.from || ''))[0];
    const a = i && best('article', i.id);
    const c = i && best('category', i.sub || '');
    const o = op(opId);
    const rCard = a || c;
    return { rate: (a && a.rate) || (c && c.rate) || (o && o.rate) || 0, rateUnit: (rCard && rCard.rateUnit) || (o && o.rateUnit) || 'pair', piecesPerPair: (rCard && rCard.piecesPerPair) || (o && o.piecesPerPair) || 1 };
  };

  E.empOpts = () => E.rows('employees').filter(e => e.active).sort((a, b) => a.code.localeCompare(b.code)).map(e => `<option value="${E.esc(elabel(e))}" data-k="${E.esc(e.name + ' ' + e.code + ' ' + (e.nic || ''))}">`).join('');
  const empFind = t => { t = (t || '').trim().toLowerCase(); return E.rows('employees').find(e => elabel(e).toLowerCase() === t || e.code.toLowerCase() === t); };

  E.route('production', 'Daily Production', () => {
    const TABS = [['track', '📡 Live tracker'], ['log', '📝 Daily log'], ['batch', '📦 Material Batches'], ['sum', '📊 Summary'], ['prog', '🧭 Job progress'], ['ops', '⚙️ Operations & rates'], ['cons', '🧪 Consumables']];
    return `<div class="kp">
      ${E.kpi('Pairs today', live().filter(l => l.date === E.today()).reduce((s, l) => s + (l.convertedQty || l.qty), 0), 'pairs made today')}
      ${E.kpi('Wages today', E.m(live().filter(l => l.date === E.today()).reduce((s, l) => s + l.amount, 0)), 'piece work')}
      ${E.kpi('Accrued', E.m(E.bal('2210')), 'unpaid')}
    </div>
    <div class="bar">${TABS.map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="prTab" data-id="${k}">${l}</button>`).join('')}</div>
    <div id="prb">${body()}</div>`;
  });

  /* ============ LIVE PRODUCTION TRACKER ============
     One board for every job in progress: stage-by-stage pairs, completed (all stages), queue between stages,
     who did what, size-wise counts, pace / ETA, release-ready pairs and delivered pairs. Refreshes itself. */
  const DAYMS = 86400000;
  const addD = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * DAYMS).toISOString().slice(0, 10);
  const dBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / DAYMS);
  const enm = id => (emp(id) || {}).name || '?';
  const badge = (t, c) => `<span style="background:${c};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;margin-left:6px;white-space:nowrap">${t}</span>`;

  function lineStats(l) {
    const f = E.jobFlow(l), item = it(l.itemId) || {}, pp = f.pp, today = E.today();
    const L = live().filter(x => x.lineId === l.id && f.stages.some(s => s.opId === x.opId));
    const dates = [...new Set(L.map(x => x.date))].sort();
    const cum = {}; f.stages.forEach(s => { cum[s.opId] = 0; });
    const series = {};
    dates.forEach(d => { L.filter(x => x.date === d).forEach(x => { cum[x.opId] += pairsOf(x, pp); }); series[d] = R2(Math.min(...f.stages.map(s => cum[s.opId]))); });
    const compOn = d => { let v = 0; for (const k of dates) { if (k <= d) v = series[k]; else break; } return v; };
    const doneToday = R2(f.completed - compOn(addD(today, -1)));
    const span = dates.length ? Math.max(1, Math.min(7, dBetween(dates[0], today) + 1)) : 0;
    const avg = span ? R2(Math.max(0, f.completed - compOn(addD(today, -7))) / span) : 0;
    const remaining = R2(Math.max(0, f.target - f.completed));
    const eta = remaining > 0 && avg > 0 ? addD(today, Math.ceil(remaining / avg)) : null;
    const workers = {}; f.stages.forEach(s => { workers[s.opId] = {}; });
    L.forEach(x => { const w = workers[x.opId]; w[x.empId] = R2((w[x.empId] || 0) + pairsOf(x, pp)); });
    const queue = f.stages.map((s, i) => (s.wait && i > 0) ? R2(Math.max(0, Math.min(...f.stages.slice(0, i).map(p => p.logged)) - s.logged)) : 0);
    const sizes = item.sizeRun ? [...new Set(String(item.sizeRun).split(',').map(x => x.trim()).filter(Boolean))] : [];
    let sizeTbl = '';
    if (sizes.length && L.some(x => x.size)) {
      const cols = sizes.concat(['']);
      const cell = (sid, sz) => R2(L.filter(x => x.opId === sid && (x.size || '') === sz).reduce((s, x) => s + pairsOf(x, pp), 0));
      sizeTbl = `<div class="tw"><table><thead><tr><th>Stage</th>${cols.map(c => `<th class="r">${c ? 'Size ' + E.esc(c) : 'No size'}</th>`).join('')}</tr></thead><tbody>${f.stages.map(s => `<tr><td>${E.esc(s.name)}</td>${cols.map(c => `<td class="r">${cell(s.opId, c) || '·'}</td>`).join('')}</tr>`).join('')}<tr><td><b>Completed (size-wise)</b></td>${cols.map(c => `<td class="r"><b>${R2(Math.min(...f.stages.map(s => cell(s.opId, c)))) || '·'}</b></td>`).join('')}</tr></tbody></table></div>`;
    }
    const delivered = R2(E.rows('deliveries').filter(d => d.jobId === l.jobId && d.status !== 'Cancelled' && !d.cancelled).flatMap(d => d.lines || []).filter(x => x.itemId === l.itemId && (x.variantId || '') === (l.variantId || '')).reduce((s, x) => s + (x.pairs != null ? x.pairs : (x.qty || 0) * pp), 0));
    return { f, doneToday, avg, eta, workers, queue, delivered, remaining, sizeTbl };
  }

  function lineBlock(l, s) {
    const f = s.f, bottleneck = f.completed < f.target && f.stages.length > 1 ? f.limiting : null;
    const stages = f.stages.length ? f.stages.map((st, i) => {
      const pct = f.target ? Math.min(100, Math.round(st.logged / f.target * 100)) : 0, isB = bottleneck && bottleneck.opId === st.opId;
      const ws = Object.entries(s.workers[st.opId] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, p]) => `${E.esc(enm(id))} ${p}`).join(' · ');
      return `<div style="min-width:150px;flex:1;border:1px solid ${isB ? '#dc2626' : 'var(--bd,#e5e7eb)'};border-radius:10px;padding:8px">
        <div style="font-size:12px"><b>${E.esc(st.name)}</b>${isB ? badge('bottleneck', '#dc2626') : ''}${s.queue[i] > 0 ? badge('queue ' + s.queue[i], '#d97706') : ''}</div>
        <div style="background:#eee;border-radius:4px;height:12px;margin:6px 0"><div style="background:${pct >= 100 ? '#059669' : pct > 0 ? '#d97706' : '#e5e7eb'};height:100%;width:${pct}%;border-radius:4px"></div></div>
        <div style="font-size:12px"><b>${st.logged}</b> / ${f.target} pairs ${st.wait ? '<span class="muted">· needs earlier</span>' : ''}</div>
        <div class="muted" style="font-size:11px">${ws || 'no one yet'}</div></div>`;
    }).join('<div style="align-self:center;color:#9ca3af">›</div>') : '<span class="muted">Nothing logged yet. Log the first operation in Daily log.</span>';
    return `<div style="border-top:1px solid var(--bd,#e5e7eb);padding:12px 0">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <div><b>${E.esc(l.code)}</b> ${f.legacy ? badge('no routing set', '#6b7280') : ''}</div>
        <div style="font-size:12px">Completed <b>${f.completed}</b>/${f.target} · Released <b>${f.released}</b> · Ready <b style="color:${f.ready > 0 ? '#059669' : 'inherit'}">${f.ready}</b> · Delivered <b>${s.delivered}</b> · Today <b>+${s.doneToday}</b> · Pace <b>${s.avg}</b>/day${s.eta ? ' · ETA <b>' + s.eta + '</b>' : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${stages}</div>
      ${s.sizeTbl ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Size-wise counts</summary>${s.sizeTbl}</details>` : ''}</div>`;
  }

  function trackerHtml() {
    const today = E.today(), jobs = active().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const D = jobs.map(j => {
      const lines = jl(j.id).map(l => ({ l, s: lineStats(l) }));
      const sum = fn => R2(lines.reduce((a, x) => a + fn(x.s), 0));
      const t = { target: sum(s => s.f.target), completed: sum(s => s.f.completed), released: sum(s => s.f.released), ready: sum(s => s.f.ready), delivered: sum(s => s.delivered), doneToday: sum(s => s.doneToday), avg: sum(s => s.avg) };
      t.remaining = R2(Math.max(0, t.target - t.completed));
      t.eta = t.remaining > 0 && t.avg > 0 ? addD(today, Math.ceil(t.remaining / t.avg)) : null;
      const left = j.due ? dBetween(today, j.due) : null;
      let status = ['On track', '#059669'];
      if (t.remaining === 0 && t.target > 0) status = ['All completed', '#2563eb'];
      else if (left !== null && left < 0) status = ['Overdue ' + (-left) + 'd', '#dc2626'];
      else if (left !== null && t.eta && t.eta > j.due) status = ['Behind: ETA ' + t.eta, '#d97706'];
      else if (!t.eta && t.target > 0 && t.completed < t.target) status = ['No output in last 7 days', '#6b7280'];
      const issued = E.rows('stockMoves').some(m => m.job === j.id && m.type === 'issue');
      const logged = live().some(x => x.jobId === j.id);
      const steps = [['Job created', true], ['Materials issued', issued], ['Production started', logged], ['Goods completed', t.completed > 0], ['Fully completed', t.target > 0 && t.completed >= t.target], ['Released to stock', t.released > 0], ['Delivered', t.delivered > 0]];
      return { j, lines, t, left, status, steps, wip: E.jobWip ? E.jobWip(j.id) : 0 };
    });
    const all = k => R2(D.reduce((a, x) => a + x.t[k], 0));
    const todayLogs = live().filter(x => x.date === today);
    const alerts = [];
    D.forEach(x => {
      if (x.t.ready > 0) alerts.push(`<b>${E.esc(x.j.no)}</b>: ${x.t.ready} pairs are completed and ready to release.`);
      if (x.status[0].startsWith('Overdue') || x.status[0].startsWith('Behind')) alerts.push(`<b>${E.esc(x.j.no)}</b>: ${E.esc(x.status[0])} (due ${E.esc(x.j.due || '-')}).`);
      x.lines.forEach(({ l, s }) => {
        if (s.f.legacy) alerts.push(`<b>${E.esc(l.code)}</b> (${E.esc(x.j.no)}) has no routing, so completion is only an estimate. Set it in Operations & rates.`);
        s.f.stages.forEach((st, i) => { if (s.queue[i] >= Math.max(6, s.f.target * 0.2)) alerts.push(`<b>${E.esc(l.code)}</b>: ${s.queue[i]} pairs are waiting for <b>${E.esc(st.name)}</b>.`); });
      });
    });
    const byW = {};
    todayLogs.forEach(x => { const w = byW[x.empId] = byW[x.empId] || { pairs: 0, amount: 0, ops: {} }; const p = pairsOf(x, x.pairsPerPack || 1); w.pairs = R2(w.pairs + p); w.amount += x.amount || 0; w.ops[x.opName] = R2((w.ops[x.opName] || 0) + p); });
    const feed = live().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.no || '').localeCompare(a.no || '')).slice(0, 12);
    const now = new Date().toTimeString().slice(0, 8);
    return `<div class="kp">
      ${E.kpi('Jobs in progress', D.length, 'live')}
      ${E.kpi('Completed (all stages)', all('completed') + ' / ' + all('target'), 'pairs')}
      ${E.kpi('Ready to release', all('ready'), 'pairs')}
      ${E.kpi('Released to stock', all('released'), 'pairs')}
      ${E.kpi('Completed today', all('doneToday'), 'pairs')}
      ${E.kpi('Wages today', E.m(todayLogs.reduce((s, x) => s + (x.amount || 0), 0)), Object.keys(byW).length + ' workers')}
    </div>
    <div class="bar"><span class="muted" style="font-size:12px">Updated ${now} · refreshes every 20 seconds</span><span class="gap"></span><button class="btn sm" data-a="trRefresh">↻ Refresh</button><button class="btn p" data-a="trLog">+ Log production</button></div>
    <details class="card" style="margin-bottom:12px"><summary style="cursor:pointer"><b>Workflow guide</b> <span class="muted">· how a pair is tracked from job to delivery</span></summary>
      <ol style="line-height:1.7;margin:8px 0 0 18px"><li><b>Job</b>: create the job with articles and target packs.</li><li><b>Routing</b>: set each article's operations once (Daily Production › Operations & rates › Article routing).</li><li><b>Materials</b>: issue materials to the job (Material Batch or Job › Materials).</li><li><b>Log production</b>: every worker logs pairs per operation each day (or ★ All stages if one worker does everything).</li><li><b>Completed</b>: the system counts a pair as completed only after every stage in its routing has it, and shows the stage holding things up.</li><li><b>Release</b>: Jobs › Release moves completed pairs from WIP to finished-goods stock, up to the completed count.</li><li><b>Deliver and invoice</b> from Sales; the tracker then shows delivered pairs.</li></ol></details>
    ${alerts.length ? `<div class="card" style="margin-bottom:12px"><h3>Needs attention</h3><ul style="margin:6px 0 0 18px;line-height:1.7">${alerts.slice(0, 14).map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
    ${D.length ? D.map(x => {
      const pct = x.t.target ? Math.min(100, Math.round(x.t.completed / x.t.target * 100)) : 0, rp = x.t.target ? Math.min(100, Math.round(x.t.released / x.t.target * 100)) : 0;
      return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div><b style="font-size:16px">${E.esc(x.j.no)}</b> <span class="muted">· ${E.esc((E.D.parties.find(p => p.id === x.j.partyId) || { name: 'Stock' }).name)} · due ${E.esc(x.j.due || '-')}${x.left !== null ? ' (' + (x.left >= 0 ? x.left + ' days left' : -x.left + ' days late') + ')' : ''}</span>${badge(E.esc(x.status[0]), x.status[1])}</div>
        <div><button class="btn sm" data-a="trOpen" data-id="${x.j.id}">Open job</button> <button class="btn ${x.t.ready > 0 ? 'p' : ''} sm" data-a="trRel" data-id="${x.j.id}">Release goods${x.t.ready > 0 ? ' (' + x.t.ready + ')' : ''}</button></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${x.steps.map(([n, ok]) => `<span style="padding:3px 10px;border-radius:12px;font-size:12px;background:${ok ? '#d1fae5' : '#f3f4f6'};color:${ok ? '#065f46' : '#6b7280'}">${ok ? '✔' : '○'} ${n}</span>`).join('')}</div>
      <div style="font-size:12px;margin-bottom:4px">Completed <b>${x.t.completed}</b> of ${x.t.target} pairs (${pct}%) · Released <b>${x.t.released}</b> (${rp}%) · Ready <b>${x.t.ready}</b> · Delivered <b>${x.t.delivered}</b> · WIP value <b>${E.m(x.wip)}</b></div>
      <div style="position:relative;background:#eee;border-radius:6px;height:14px"><div style="position:absolute;background:#bfdbfe;height:100%;width:${pct}%;border-radius:6px"></div><div style="position:absolute;background:#059669;height:100%;width:${rp}%;border-radius:6px"></div></div>
      <div class="muted" style="font-size:11px;margin:3px 0 4px">Blue = completed, green = released to stock</div>
      ${x.lines.map(({ l, s }) => lineBlock(l, s)).join('')}</div>`;
    }).join('') : '<div class="card muted">No jobs in progress.</div>'}
    <div class="g2">
      <div class="card"><h3>Today's output by worker</h3>${Object.keys(byW).length ? `<div class="tw"><table><thead><tr><th>Worker</th><th>Operations</th><th class="r">Pairs</th><th class="r">Wages</th></tr></thead><tbody>${Object.entries(byW).sort((a, b) => b[1].pairs - a[1].pairs).map(([id, w]) => `<tr><td><b>${E.esc(enm(id))}</b></td><td>${Object.entries(w.ops).map(([o, p]) => `<span class="tag">${E.esc(o)}: ${p}</span>`).join(' ')}</td><td class="r"><b>${w.pairs}</b></td><td class="r">${E.m(w.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing logged today yet.</p>'}</div>
      <div class="card"><h3>Latest entries</h3>${feed.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Worker</th><th>Article · operation</th><th class="r">Pairs</th></tr></thead><tbody>${feed.map(x => `<tr><td>${E.esc(x.date)}</td><td>${E.esc(enm(x.empId))}</td><td>${E.esc(x.code || '')} · ${E.esc(x.opName || '')}</td><td class="r">${pairsOf(x, x.pairsPerPack || 1)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No production logged yet.</p>'}</div>
    </div>`;
  }
  E.route('tracker', 'Production Tracker', () => trackerHtml());
  E.A.trRefresh = () => E.go();
  E.A.trRel = id => E.A.relM(id);
  E.A.trOpen = id => E.A.openJob(id);
  E.A.trLog = () => { F.tab = 'log'; if (location.hash === '#/production') E.go(); else location.hash = '#/production'; };
  setInterval(() => {
    try {
      const h = location.hash, on = h.indexOf('#/tracker') === 0 || (h.indexOf('#/production') === 0 && F.tab === 'track'), mw = document.getElementById('mw'), ae = document.activeElement;
      if (!on || (mw && mw.classList.contains('o')) || (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) return;
      E.go();
    } catch (e) { /* ignore */ }
  }, 20000);

  E.A.prTab = t => { F.tab = t; E.go(); };
  const body = () => F.tab === 'track' ? trackerHtml() : F.tab === 'log' ? logTab() : F.tab === 'batch' ? matTab() : F.tab === 'sum' ? sumTab() : F.tab === 'prog' ? progTab() : F.tab === 'ops' ? opsTab() : consTab();

  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (t.id === 'pr_gate') { E.setSetting({ prodGate: t.value }).then(() => E.toast('Saved', 'success')); return; }
    if (t.id === 'rt_cp') { const s = it(t.value); document.querySelectorAll('.rt-i').forEach(c => { const r = ((s && s.routing) || []).find(x => x.opId === c.dataset.op); c.checked = !!r; }); document.querySelectorAll('.rt-w').forEach(c => { const r = ((s && s.routing) || []).find(x => x.opId === c.dataset.op); c.checked = !r || r.wait !== false; }); return; }
    if (f && f.startsWith('pr.')) { F[f.slice(3)] = t.value; E.$('prb').innerHTML = body(); return; }
    const r = t.closest && t.closest('.pr');
    if (!r) return;
    const c = r.children; // 0:Worker, 1:Job, 2:Article, 3:Op, 4:Size, 5:Pairs, 6:Rate, 7:Amount
    
    if (t === c[1]) { 
        const j = t.value; 
        c[2].innerHTML = '<option value="">— article —</option>' + (j ? jl(j).map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target} packs</option>`).join('') : ''); 
        c[4].innerHTML = '<option value="">Any</option>';
    }
    
    if (t === c[2]) {
        const l = E.D.jobLines.find(x => x.id === t.value);
        const item = l ? E.D.items.find(x => x.id === l.itemId) : null;
        { const rt0 = item ? E.itemRouting(item) : [], list = rt0.length ? rt0.map(r => r.op) : ops();
          c[3].innerHTML = '<option value="">— operation —</option>' + (rt0.length > 1 ? '<option value="__ALL__">★ All stages (same worker does everything)</option>' : '') + list.map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join(''); c[6].readOnly = false; c[6].dataset.man = ''; }
        c[4].innerHTML = '<option value="">Any</option>';
        if (item && item.sizeRun) {
            const sizes = [...new Set(item.sizeRun.split(',').map(x=>x.trim()))];
            sizes.forEach(sz => c[4].innerHTML += `<option value="${sz}">Size ${sz}</option>`);
        }
    }

    if (t === c[1] || t === c[2] || t === c[3]) {
      const l = E.D.jobLines.find(x => x.id === c[2].value);
      if (l && c[3].value === '__ALL__') { c[6].value = (allTotal(l, 1, E.val('pr_d')).rate / 100) || ''; c[6].readOnly = true; }
      else {
        c[6].readOnly = false;
        if (l && c[3].value && !c[6].dataset.man) {
          const info = E.opRateInfo(c[3].value, l.itemId, E.val('pr_d'));
          c[6].value = (info.rate / 100) || '';
        }
      }
    }
    if (t === c[6]) c[6].dataset.man = '1';
    
    const pairs = parseFloat(c[5].value) || 0; 
    const rt = E.c(c[6].value);
    const line = E.D.jobLines.find(x => x.id === c[2].value);
    
    if (line && c[3].value === '__ALL__') { c[7].value = pairs ? E.m(allTotal(line, pairs, E.val('pr_d')).amount) : ''; }
    else if (line && c[3].value) {
      const info = E.opRateInfo(c[3].value, line.itemId, E.val('pr_d'));
      const conv = info.rateUnit === 'pair' ? pairs : pairs * info.piecesPerPair;
      c[7].value = pairs && rt ? E.m(Math.round(conv * rt)) : '';
    } else c[7].value = '';
    
    tot();
  });

  const row = () => `<div class="jl pr" style="grid-template-columns:1.2fr 1fr 1.5fr 1.2fr 0.8fr 0.8fr 0.8fr 0.9fr 28px">
    <input list="pe" placeholder="Worker">
    <select><option value="">— job —</option>${active().map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select>
    <select><option value="">— article —</option></select>
    <select><option value="">— operation —</option>${ops().map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select>
    <select><option value="">Any</option></select>
    <input type="number" step="0.5" min="0" placeholder="Pairs">
    <input type="number" step="0.01" placeholder="Rate">
    <input readonly placeholder="Amount">
    <button class="btn sm d" data-a="rmPr">✕</button>
  </div>`;
  
  E.A.rmPr = (_, e) => { e.target.closest('.pr').remove(); tot(); };
  E.A.addPr = () => E.$('prr').insertAdjacentHTML('beforeend', row());
  
  function tot() {
    let p = 0, a = 0;
    document.querySelectorAll('#prr .pr').forEach(r => { const c = r.children, n = parseFloat(c[5].value) || 0; p += n; a += E.c((c[7].value || '').replace(/[^0-9.]/g, '')); });
    if (E.$('pr_t')) E.$('pr_t').textContent = p + ' pairs · ' + E.m(a);
  }

  function logTab() {
    const rows = live().concat(logs().filter(l => l.status === 'cancelled'))
      .filter(l => l.date === F.date && (!F.job || l.jobId === F.job) && (!F.emp || l.empId === F.emp))
      .sort((a, b) => b.no.localeCompare(a.no));
    const can = E.role === 'owner' || E.role === 'accountant';
    return `<div class="card">
      <h3>Record today's work (in Pairs)</h3>
      ${!can ? '<p class="muted">View-only.</p>' : !ops().length ? '<p class="bad">Add operations first — go to Operations & rates tab</p>' : !active().length ? '<p class="bad">No job in progress</p>' : `
        <div class="g2">
          <div class="f">Date<input id="pr_d" type="date" value="${F.date}" data-f="pr.date"></div>
          <div class="f"><br><span class="muted">Rate auto-fills. Amount = pairs × rate.</span></div>
        </div>
        <datalist id="pe">${E.empOpts()}</datalist>
        <div id="prr">${row() + row() + row()}</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
          <button class="btn sm" data-a="addPr">+ Add row</button><span class="gap"></span>
          <b id="pr_t">0 pairs · Rs 0.00</b>
          <button class="btn p" data-a="prSave">Save</button>
        </div>`}
    </div>
    <div class="bar">
      <span class="muted">Showing</span>
      <input type="date" class="fs" data-f="pr.date" value="${F.date}">
      <select class="fs" data-f="pr.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${j.no}</option>`).join('')}</select>
      <select class="fs" data-f="pr.emp"><option value="">All workers</option>${E.rows('employees').map(e => `<option value="${e.id}" ${F.emp === e.id ? 'selected' : ''}>${E.esc(e.name)}</option>`).join('')}</select>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Worker</th><th>Job</th><th>Article</th><th>Operation</th><th>Size</th><th class="r">Pairs</th><th class="r">Rate</th><th class="r">Earned</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(l => {
        const pairs = l.convertedQty != null ? l.convertedQty : (l.qty * (l.pairsPerPack || 1));
        return `<tr style="${l.status === 'cancelled' ? 'opacity:.45' : ''}">
          <td>${l.no}</td><td>${E.esc((emp(l.empId) || {}).name)}</td>
          <td>${E.esc((J(l.jobId) || {}).no)}</td><td><b>${E.esc(l.code)}</b></td>
          <td>${E.esc(l.opName)}</td>
          <td><span class="tag">${l.size || 'Any'}</span></td>
          <td class="r"><b>${pairs}</b></td>
          <td class="r">${E.m(l.rate)}<div class="muted" style="font-size:10px">/${l.rateUnit || 'pair'}</div></td>
          <td class="r"><b>${E.m(l.amount)}</b></td>
          <td><span class="tag">${l.status === 'paid' ? 'Paid ' + (l.runNo || '') : l.status}</span></td>
          <td class="r">${l.status === 'accrued' && can ? `<button class="btn sm d" data-a="prCancel" data-id="${l.id}">Cancel</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">No entries</td></tr>'}</tbody>
    </table></div>`;
  }

  E.A.prSave = async () => {
    try {
      const L = [];
      document.querySelectorAll('#prr .pr').forEach((r, i) => {
        const c = r.children;
        if (!c[0].value && !c[5].value && !c[1].value) return;
        const e = empFind(c[0].value), j = J(c[1].value), l = E.D.jobLines.find(x => x.id === c[2].value), o = op(c[3].value);
        const size = c[4].value, allStages = c[3].value === '__ALL__';
        const pairs = parseFloat(c[5].value) || 0, rt = E.c(c[6].value);
        const n = 'Row ' + (i + 1) + ': ';
        if (!e) throw new Error(n + 'worker missing');
        if (!j || j.status !== 'In Progress') throw new Error(n + 'invalid job');
        if (!l) throw new Error(n + 'article missing');
        if (!o && !allStages) throw new Error(n + 'operation missing');
        if (!(pairs > 0)) throw new Error(n + 'enter pairs');
        if (!allStages && !(rt > 0)) throw new Error(n + 'rate not set');
        
        const item = it(l.itemId), pp = (item && item.pack) || 1, packs = pairs / pp;
        const add = (oo, rate) => { const info = E.opRateInfo(oo.id, l.itemId, E.val('pr_d')); const conv = info.rateUnit === 'pair' ? pairs : pairs * info.piecesPerPair; L.push({ e, j, l, o: oo, size, pairs, packs, rt: rate, amount: Math.round(conv * rate), pairsPerPack: pp, info, convertedQty: pairs }); };
        if (allStages) {
          const rr = E.itemRouting(item);
          if (rr.length < 2) throw new Error(n + 'this article has no multi-stage routing');
          rr.forEach(r => { const rate = E.opRateInfo(r.op.id, l.itemId, E.val('pr_d')).rate; if (!(rate > 0)) throw new Error(n + 'rate not set for ' + r.op.name + ' (Operations & rates)'); add(r.op, rate); });
        } else add(o, rt);
      });
      if (!L.length) throw new Error('Nothing to save');
      /* ---- flow control: a stage cannot run ahead of the stages it depends on, and nothing can exceed the job target ---- */
      const mode = E.flowMode();
      if (mode !== 'off') {
        const extra = {}, warn = [];
        const seqL = L.map((x, ix) => ({ x, ix, fl: E.jobFlow(x.l) })).sort((a, b) => a.x.l.id.localeCompare(b.x.l.id) || ((a.x.o.order || 0) - (b.x.o.order || 0)) || a.ix - b.ix);
        for (const { x, fl } of seqL) {
          const idx = fl.stages.findIndex(s => s.opId === x.o.id), st = fl.stages[idx];
          if (!st && !fl.legacy) throw new Error(x.l.code + ': ' + x.o.name + " is not in this article's routing (Operations & rates > Article routing)");
          const key = x.l.id + '|' + x.o.id;
          const after = R2((st ? st.logged : 0) + (extra[key] || 0) + x.pairs);
          if (st && st.wait && idx > 0) {
            const prev = fl.stages.slice(0, idx).map(s => ({ s, v: R2(s.logged + (extra[x.l.id + '|' + s.opId] || 0)) }));
            const lim = prev.reduce((a, b) => (b.v < a.v ? b : a));
            if (after > lim.v + 0.001) warn.push(x.l.code + ' · ' + x.o.name + ': ' + after + ' pairs would be logged but only ' + lim.v + ' pairs have finished ' + lim.s.name);
          }
          if (after > fl.target + 0.001) warn.push(x.l.code + ' · ' + x.o.name + ': ' + after + ' pairs would exceed the job target of ' + fl.target + ' pairs');
          extra[key] = (extra[key] || 0) + x.pairs;
        }
        if (warn.length) {
          if (mode === 'block') throw new Error(warn[0] + (warn.length > 1 ? ' (+' + (warn.length - 1) + ' more)' : ''));
          if (!confirm('Please check before saving:\n\n' + warn.join('\n') + '\n\nSave anyway?')) return;
        }
      }
      const d = E.val('pr_d');
      if (!d) throw new Error('Choose date');
      const no = await E.next('PL');
      const tot = L.reduce((s, x) => s + x.amount, 0);
      const je = await E.post({
        date: d, ref: no, narr: 'Production ' + d + ' · ' + L.length + ' entries', source: 'production',
        lines: L.map(x => ({ acc: '1310', dr: x.amount, job: x.j.id, cat: 'Labour', art: x.l.id, head: '5110' })).concat([{ acc: '2210', cr: tot }])
      });
      let k = 0;
      for (const x of L) {
        await E.save('prodLogs', {
          no: no + '-' + (++k), batch: no, date: d,
          empId: x.e.id, jobId: x.j.id, lineId: x.l.id, itemId: x.l.itemId, variantId: x.l.variantId,
          code: x.l.code, opId: x.o.id, opName: x.o.name, size: x.size,
          qty: x.packs, pairs: x.pairs, pairsPerPack: x.pairsPerPack, 
          rateUnit: x.info.rateUnit, piecesPerPair: x.info.piecesPerPair,
          convertedQty: x.convertedQty, rate: x.rt, amount: x.amount,
          status: 'accrued', jeId: je.id, jeNo: je.no, runId: '', runNo: ''
        });
      }
      F.date = d; E.go();
      E.toast(L.length + ' entries · ' + E.m(tot), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.prCancel = async id => {
    try {
      const l = E.D.prodLogs.find(x => x.id === id);
      if (l.status !== 'accrued') throw new Error('Not cancellable');
      const ll = E.D.jobLines.find(x => x.id === l.lineId);
      if (ll) { const fl = E.jobFlow(ll), st = fl.stages.find(s => s.opId === l.opId); if (st) { const nm = Math.min(...fl.stages.map(s => s.opId === l.opId ? R2(s.logged - pairsOf(l, fl.pp)) : s.logged)); if (nm < fl.released - 0.001) throw new Error('Cannot cancel: ' + fl.released + ' pairs of ' + ll.code + ' are already released to stock and depend on this entry.'); } }
      if (!confirm('Cancel ' + l.no + '?')) return;
      await E.post({ date: E.today(), ref: l.no, narr: 'Cancel ' + l.no, source: 'production',
        lines: [{ acc: '2210', dr: l.amount }, { acc: '1310', cr: l.amount, job: l.jobId, cat: 'Labour', art: l.lineId, head: '5110' }] });
      const b = JSON.parse(JSON.stringify(l));
      l.status = 'cancelled';
      await E.save('prodLogs', l, b);
      E.go(); E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* Material Batches — STRICTLY PAIRS */
  function matTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No job in progress.</div>';
    const bi = E.rows('issues').filter(i => i.batch === true);
    const bno = [...new Set(bi.map(b => b.no))].sort((a, b) => b.localeCompare(a));
    return `<div class="card">
      <h3>📦 Material Batch (in Pairs)</h3>
      <div class="g2">
        <div class="f">Job *<select id="mb_job" onchange="E.A.mbJobChange()"><option value="">—</option>${jobs.map(j => `<option value="${j.id}">${E.esc(j.no)}</option>`).join('')}</select></div>
        <div class="f">Article *<select id="mb_art" onchange="E.A.mbPreview()"><option value="">—</option></select></div>
      </div>
      <div class="g2">
        <div class="f">Pairs *<input id="mb_qty" type="number" step="0.5" min="1" value="1" oninput="E.A.mbPreview()"></div>
        <div class="f">Date<input id="mb_date" type="date" value="${E.today()}"></div>
      </div>
      <div id="mb_preview"><p class="muted">Select job and article.</p></div>
      <button class="btn p" data-a="mbPost" id="mb_postBtn" style="margin-top:12px" disabled>📦 Deduct</button>
    </div>
    ${bno.length ? `<div class="card"><h3>Recent Batches</h3><div class="tw"><table><thead><tr><th>Batch</th><th>Date</th><th>Job</th><th>Materials</th><th class="r">Value</th></tr></thead><tbody>${bno.slice(0, 20).map(no => { const items = bi.filter(b => b.no === no); const first = items[0]; return `<tr><td>${no}</td><td>${first.date}</td><td>${(J(first.jobId) || {}).no || '?'}</td><td>${items.map(i => E.esc(i.code)).join(', ')}</td><td class="r">${E.m(items.reduce((s, i) => s + i.value, 0))}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
  }
  E.A.mbJobChange = () => {
    const jobId = E.val('mb_job');
    const lines = E.rows('jobLines').filter(l => l.jobId === jobId);
    const sel = E.$('mb_art');
    if (!sel) return;
    sel.innerHTML = '<option value="">— article —</option>' + lines.map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target} packs</option>`).join('');
    E.A.mbPreview();
  };
  E.A.mbPreview = () => {
    const pairs = parseFloat(E.val('mb_qty')) || 0, lineId = E.val('mb_art');
    const box = E.$('mb_preview'), btn = E.$('mb_postBtn');
    if (!box) return;
    if (!lineId || pairs <= 0) { box.innerHTML = '<p class="muted">Select article & pairs.</p>'; if (btn) btn.disabled = true; return; }
    const line = E.D.jobLines.find(l => l.id === lineId);
    const item = line && it(line.itemId);
    if (!item || !(item.bom || []).length) { box.innerHTML = '<p class="bad">No BOM on this article. Add it on the Items page first.</p>'; if (btn) btn.disabled = true; return; }
    
    const rows = item.bom.map(b => {
      const need = Math.round((b.qty * pairs) * 1000) / 1000;
      const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
      const st = E.stock(b.itemId, b.variantId);
      const avgCost = st.qty > 0 ? Math.round(st.value / st.qty) : 0;
      return { sku, need, stock: st.qty, short: st.qty + 1e-9 < need, value: Math.round(need * avgCost) };
    });
    const anyShort = rows.some(r => r.short);
    box.innerHTML = `<div class="tw"><table><thead><tr><th>Material</th><th class="r">Need (for ${pairs} pairs)</th><th class="r">Stock</th><th class="r">Value</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${E.esc(r.sku ? r.sku.code : '?')}</td><td class="r">${r.need}</td><td class="r">${r.stock}</td><td class="r">${E.m(r.value)}</td><td>${r.short ? '<span class="bad">Short</span>' : '<span class="ok">OK</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    if (btn) btn.disabled = anyShort;
  };
  E.A.mbPost = async () => {
    try {
      const jobId = E.val('mb_job'), lineId = E.val('mb_art'), pairs = parseFloat(E.val('mb_qty')) || 0, date = E.val('mb_date');
      const line = E.D.jobLines.find(l => l.id === lineId);
      const item = line && it(line.itemId);
      if (!item || !item.bom) throw new Error('No BOM');
      const no = await E.next('BAT');
      let total = 0;
      for (const b of item.bom) {
        const need = Math.round((b.qty * pairs) * 1000) / 1000;
        const st = E.stock(b.itemId, b.variantId);
        if (st.qty + 1e-9 < need) throw new Error('Insufficient stock');
        const val = E.outValue(b.itemId, b.variantId, need);
        await E.stockOut({ date, itemId: b.itemId, variantId: b.variantId, qty: need, type: 'issue', ref: no, job: jobId });
        await E.save('issues', { no, date, jobId, itemId: b.itemId, variantId: b.variantId, qty: need, value: val, batch: true });
        total += val;
      }
      await E.post({ date, ref: no, narr: 'Batch · ' + pairs + ' pairs', source: 'issue',
        lines: [{ acc: '1310', dr: total, job: jobId, cat: 'Material', art: lineId, head: '5000' }, { acc: '1300', cr: total }] });
      
      const pp = item.pack || 1;
      const packs = pairs / pp;
      const bl = JSON.parse(JSON.stringify(line));
      line.started = (line.started || 0) + packs;
      await E.save('jobLines', line, bl);
      E.go(); E.toast(no + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  
  /* Summary Tab */
  function sumTab() {
    const d = F.date;
    const L = live().filter(l => l.date === d);
    const byWorker = {}, byOp = {}, byJob = {};
    L.forEach(l => {
      const p = l.convertedQty || l.qty;
      (byWorker[l.empId] = byWorker[l.empId] || { p: 0, amount: 0 });
      byWorker[l.empId].p += p; byWorker[l.empId].amount += l.amount;
      (byOp[l.opId] = byOp[l.opId] || { p: 0, amount: 0 });
      byOp[l.opId].p += p; byOp[l.opId].amount += l.amount;
      (byJob[l.jobId] = byJob[l.jobId] || { p: 0, amount: 0 });
      byJob[l.jobId].p += p; byJob[l.jobId].amount += l.amount;
    });
    const tot = L.reduce((s, l) => s + l.amount, 0);
    const mk = (title, M, labFn) => `<div class="card"><h3>${title}</h3><div class="tw"><table><thead><tr><th>Item</th><th class="r">Pairs</th><th class="r">Wages</th></tr></thead><tbody>${Object.entries(M).map(([k, v]) => `<tr><td>${labFn(k)}</td><td class="r">${v.p}</td><td class="r">${E.m(v.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No entries</td></tr>'}<tr style="background:var(--s2)"><td><b>Total</b></td><td class="r"><b>${Object.values(M).reduce((s, v) => s + v.p, 0)}</b></td><td class="r"><b>${E.m(tot)}</b></td></tr></tbody></table></div></div>`;
    return `<div class="bar"><span class="muted">Date</span><input type="date" class="fs" data-f="pr.date" value="${d}"><span class="gap"></span><button class="btn" data-a="prSumCsv">⬇ CSV</button></div>${mk('By Worker', byWorker, id => E.esc((emp(id) || {}).name || '?'))}${mk('By Operation', byOp, id => E.esc((op(id) || {}).name || '?'))}${mk('By Job', byJob, id => E.esc((J(id) || {}).no || '?'))}`;
  }
  E.A.prSumCsv = () => {
    const d = F.date;
    const L = live().filter(l => l.date === d);
    const rows = [['No', 'Worker', 'Job', 'Article', 'Operation', 'Size', 'Pairs', 'Rate', 'Amount'].join(',')];
    L.forEach(l => {
      rows.push([
        l.no, (emp(l.empId) || {}).name || '', (J(l.jobId) || {}).no || '', l.code, l.opName, l.size || '',
        l.convertedQty || l.qty, (l.rate / 100).toFixed(2), (l.amount / 100).toFixed(2)
      ].map(E.csvCell).join(','));
    });
    E.download('production-' + d + '.csv', rows.join('\n'), 'text/csv');
  };

  /* Job Progress Tab */
  function progTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No jobs in progress.</div>';
    return jobs.map(j => `<div class="card"><h3>${E.esc(j.no)} · ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}</h3>${E.jobFlowHtml(j.id, true)}</div>`).join('');
  }

  /* Operations & Rates Tab */
  function opsTab0() {
    const O = E.rows('operations').sort((a, b) => (a.order || 0) - (b.order || 0));
    const can = E.role === 'owner' || E.role === 'accountant';
    return `<div class="card"><div class="bar"><span class="gap"></span>${can ? '<button class="btn sm" data-a="opStd">+ Add standard operations</button><button class="btn p" data-a="opNew">+ Operation</button>' : ''}</div>
      <div class="tw"><table><thead><tr><th>Order</th><th>Operation</th><th class="r">Rate/pair</th><th>Active</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${O.map(o => `<tr><td>${o.order || 0}</td><td><b>${E.esc(o.name)}</b></td><td class="r">${E.m(o.rate || 0)}</td><td>${o.active === false ? 'No' : 'Yes'}</td>${can ? `<td class="r"><button class="btn sm" data-a="opEdit" data-id="${o.id}">Edit</button> <button class="btn sm d" data-a="opDel" data-id="${o.id}">${o.active === false ? 'Activate' : 'Deactivate'}</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="5" class="muted">No operations yet. Click "Add standard operations".</td></tr>'}</tbody></table></div>
    </div>`;
  }
  function opsTab() {
    const can = E.role === 'owner' || E.role === 'accountant';
    const fg = E.rows('items').filter(i => i.cat === 'Finished Good' && i.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const gate = E.flowMode();
    const rows = fg.map(i => { const r = E.itemRouting(i); return `<tr><td><b>${E.esc(i.name)}</b></td><td>${r.length ? r.map((x, k) => `${k ? (x.wait ? ' → ' : ' + ') : ''}<span class="tag">${E.esc(x.op.name)}</span>`).join('') : '<span class="bad">No routing set</span>'}</td>${can ? `<td class="r"><button class="btn sm" data-a="rtEdit" data-id="${i.id}">Set routing</button></td>` : ''}</tr>`; }).join('');
    return opsTab0() + `<div class="card"><h3>Article routing</h3><p class="muted">Tell the system which operations every pair of an article goes through. Goods count as <b>completed</b> only when every operation in the routing has been logged for them, whoever did the work. An article made completely by one worker can have a single operation (for example "Full making") or several operations logged together with “★ All stages”. <b>→</b> means the stage needs the earlier stages finished first, <b>+</b> means it can run in parallel.</p>
      <div class="bar"><div class="f" style="margin:0">Flow control when logging production<select id="pr_gate" ${can ? '' : 'disabled'}><option value="block" ${gate === 'block' ? 'selected' : ''}>Block: a stage cannot run ahead of earlier stages or the job target</option><option value="warn" ${gate === 'warn' ? 'selected' : ''}>Warn: ask me to confirm</option><option value="off" ${gate === 'off' ? 'selected' : ''}>Off: no checks</option></select></div></div>
      <div class="tw"><table><thead><tr><th>Article</th><th>Routing</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">No finished-goods articles yet.</td></tr>'}</tbody></table></div></div>`;
  }
  E.A.rtEdit = id => {
    const item = it(id); if (!item) return;
    const cur = item.routing || [], O = ops();
    if (!O.length) return E.toast('Add operations first', 'error');
    E.modal('Routing · ' + item.name, `<p class="muted">Tick every operation one pair must go through. Untick "Needs earlier stages" for a stage that can run in parallel (for example preparing the top while the sole is being made).</p>
      <div class="tw"><table><thead><tr><th>Use</th><th>Operation</th><th>Needs earlier stages first</th></tr></thead><tbody>${O.map(o => { const r = cur.find(x => x.opId === o.id); return `<tr><td><input type="checkbox" class="rt-i" data-op="${o.id}" ${r ? 'checked' : ''}></td><td>${E.esc(o.name)}</td><td><input type="checkbox" class="rt-w" data-op="${o.id}" ${!r || r.wait !== false ? 'checked' : ''}></td></tr>`; }).join('')}</tbody></table></div>
      <div class="f">Copy routing from<select id="rt_cp"><option value="">— choose article —</option>${E.rows('items').filter(x => x.cat === 'Finished Good' && x.id !== id && (x.routing || []).length).map(x => `<option value="${x.id}">${E.esc(x.name)}</option>`).join('')}</select></div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="rt_all"> Also give this routing to every finished article that has none yet</label>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="rtSave" data-id="${id}">Save routing</button>`);
  };
  E.A.rtSave = async id => {
    try {
      const item = it(id); if (!item) throw new Error('Article not found');
      const sel = [...document.querySelectorAll('.rt-i')].filter(c => c.checked).map(c => ({ opId: c.dataset.op, wait: !!([...document.querySelectorAll('.rt-w')].find(w => w.dataset.op === c.dataset.op) || {}).checked })).filter(r => op(r.opId)).sort((a, b) => (op(a.opId).order || 0) - (op(b.opId).order || 0));
      if (!sel.length) throw new Error('Tick at least one operation');
      sel[0].wait = false;
      const targets = [item];
      if (E.$('rt_all') && E.$('rt_all').checked) E.rows('items').filter(x => x.cat === 'Finished Good' && x.id !== id && !(x.routing || []).length).forEach(x => targets.push(x));
      for (const x of targets) { const b = JSON.parse(JSON.stringify(x)); x.routing = JSON.parse(JSON.stringify(sel)); await E.save('items', x, b); }
      E.closeM(); E.go(); E.toast('Routing saved for ' + targets.length + ' article(s)', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opNew = () => E.modal('New operation', `<div class="g2"><div class="f">Name *<input id="op_n"></div><div class="f">Order<input id="op_o" type="number" value="0"></div><div class="f">Rate per PAIR (Rs) *<input id="op_r" type="number" step="0.01"></div></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSave">Save</button>`);
  E.A.opSave = async () => {
    try {
      const name = E.val('op_n'), rate = E.c(E.val('op_r'));
      if (!name) throw new Error('Enter name'); if (!(rate > 0)) throw new Error('Enter rate');
      await E.save('operations', { name, order: parseInt(E.val('op_o')) || 0, rate, rateUnit: 'pair', piecesPerPair: 1, active: true });
      E.closeM(); E.go(); E.toast('Operation saved', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opEdit = id => { const o = op(id); if (!o) return; E.modal('Edit ' + o.name, `<div class="g2"><div class="f">Name *<input id="op_n" value="${E.esc(o.name)}"></div><div class="f">Order<input id="op_o" type="number" value="${o.order || 0}"></div><div class="f">Rate per PAIR (Rs) *<input id="op_r" type="number" step="0.01" value="${(o.rate / 100).toFixed(2)}"></div></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSaveEdit" data-id="${id}">Save</button>`); };
  E.A.opSaveEdit = async id => {
    try {
      const o = op(id); if (!o) throw new Error('Not found'); const b = JSON.parse(JSON.stringify(o));
      o.name = E.val('op_n'); o.order = parseInt(E.val('op_o')) || 0; o.rate = E.c(E.val('op_r'));
      await E.save('operations', o, b); E.closeM(); E.go(); E.toast('Operation updated', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.opDel = async id => { const o = op(id); if (!o) return; const b = JSON.parse(JSON.stringify(o)); o.active = o.active === false; await E.save('operations', o, b); E.go(); };
  E.A.opStd = async () => {
    const STD = ['Top making', 'Upper making', 'Sole fixing', 'Buckle fitting', 'Finishing', 'Packing'];
    let n = 0;
    for (let i = 0; i < STD.length; i++) {
      if (E.rows('operations').some(x => x.name === STD[i])) continue;
      await E.save('operations', { name: STD[i], order: i, rate: 0, rateUnit: 'pair', piecesPerPair: 1, active: true });
      n++;
    }
    E.go(); E.toast(n + ' standard operations added — now set the rates', 'success');
  };

  /* Consumables Tab */
  function consTab() {
    const cons = E.rows('items').filter(i => i.consumable);
    if (!cons.length) return '<div class="card"><h3>Consumables</h3><p class="muted">No consumable materials (glue, thread, etc.) configured. Mark them on the Items page.</p></div>';
    const startDate = F.from || E.today().slice(0, 8) + '01';
    const endDate = F.to || E.today();
    const rows = cons.map(item => {
      const use = E.rows('stockMoves').filter(m => m.itemId === item.id && m.type === 'issue' && m.date >= startDate && m.date <= endDate);
      const usedQty = use.reduce((s, m) => s + Math.abs(m.qty), 0);
      const usedVal = use.reduce((s, m) => s + Math.abs(m.value), 0);
      return `<tr><td><b>${E.esc(item.art)}</b> ${E.esc(item.name)}</td><td>${E.esc(item.consumableMode || 'bom')}</td><td class="r">${usedQty.toFixed(3)} ${E.esc(item.unit || '')}</td><td class="r">${E.m(usedVal)}</td><td class="r">${E.m(E.stock(item.id, '').value)}</td></tr>`;
    }).join('');
    return `<div class="bar"><span class="muted">From</span><input type="date" class="fs" data-f="pr.from" value="${startDate}"><span class="muted">to</span><input type="date" class="fs" data-f="pr.to" value="${endDate}"></div><div class="card"><h3>Consumables usage</h3><div class="tw"><table><thead><tr><th>Item</th><th>Mode</th><th class="r">Used</th><th class="r">Value</th><th class="r">On hand</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">Consumables tracked through material batches (BOM mode) or manual inventory adjustments.</p></div>`;
  }
})(window.ERP);