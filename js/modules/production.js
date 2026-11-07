/* PART 14 (v2) — Daily Production + Material Batches.
   Adds a "📦 Material Batches" tab: pick job / article / packs → live
   BOM preview with stock check → post deducts raw materials, accessories
   AND packing items in one go. Every batch updates jobLine.started so the
   next batch won't double-deduct the same packs. */
(E => {
  const ni = E.N.findIndex(n => n.id === 'jobs');
  E.N.splice(ni + 1, 0, { g: 'Factory', id: 'production', ico: '🧵', label: 'Daily Production' });

  const F = { tab: 'log', date: E.today(), from: E.today().slice(0, 8) + '01', to: E.today(), job: '', emp: '', st: '' };
  const emp = id => E.D.employees.find(x => x.id === id);
  const op = id => E.D.operations.find(x => x.id === id);
  const J = id => E.D.jobs.find(x => x.id === id);
  const logs = () => E.rows('prodLogs');
  const live = () => logs().filter(l => l.status !== 'cancelled');
  const jl = id => E.rows('jobLines').filter(l => l.jobId === id);
  const active = () => E.rows('jobs').filter(j => j.status === 'In Progress');
  const ops = () => E.rows('operations').filter(o => o.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const elabel = e => e.code + ' — ' + e.name;

  E.opRate = (opId, itemId, date) => {
    const it = E.D.items.find(x => x.id === itemId);
    const cards = E.rows('rateCards').filter(c => c.opId === opId && (!date || (c.from || '') <= date));
    const best = (sc, ref) => cards.filter(c => c.scope === sc && c.ref === ref).sort((a, b) => (b.from || '').localeCompare(a.from || ''))[0];
    const a = it && best('article', it.id);
    const c = it && best('category', it.sub || '');
    const o = op(opId);
    return (a && a.rate) || (c && c.rate) || (o && o.rate) || 0;
  };
  E.empOpts = () => E.rows('employees').filter(e => e.active).sort((a, b) => a.code.localeCompare(b.code)).map(e => `<option value="${E.esc(elabel(e))}" data-g="${e.payType === 'Daily' ? 'Daily-wage workers' : 'Monthly staff'}" data-a="${E.esc(e.code)}" data-b="${E.esc(e.piece ? 'piece work' : e.payType)}" data-k="${E.esc(e.name + ' ' + e.code + ' ' + (e.nic || ''))}">`).join('');
  const empFind = t => {
    t = (t || '').trim().toLowerCase();
    return E.rows('employees').find(e => elabel(e).toLowerCase() === t || e.code.toLowerCase() === t);
  };
  const done = (lineId, opId) => live().filter(l => l.lineId === lineId && l.opId === opId).reduce((s, l) => s + l.qty, 0);

  E.route('production', 'Daily Production', () => {
    const t = live().filter(l => l.date === E.today());
    const un = live().filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0);
    return `<div class="kp">
      ${E.kpi('Packs made today', t.reduce((s, l) => s + l.qty, 0), 'across all operations')}
      ${E.kpi('Wages earned today', E.m(t.reduce((s, l) => s + l.amount, 0)), 'piece-rate, charged to jobs')}
      ${E.kpi('Workers today', new Set(t.map(l => l.empId)).size, '')}
      ${E.kpi('Earned, not yet paid', E.m(un), E.bal('2210') === un ? '<span class="ok">Agrees with ledger 2210</span>' : '<span class="bad">Ledger 2210 differs by ' + E.m(E.bal('2210') - un) + '</span>')}
    </div>
    <div class="bar">
      ${[['log', '📝 Daily log'], ['batch', '📦 Material Batches'], ['sum', '📊 Summary'], ['prog', '🧭 Job progress'], ['ops', '⚙️ Operations & rates']].map(([k, l]) => `<button class="btn ${F.tab === k ? 'p' : ''}" data-a="prTab" data-id="${k}">${l}</button>`).join('')}
    </div>
    <div id="prb">${body()}</div>`;
  });
  E.A.prTab = t => { F.tab = t; E.go(); };

  const body = () => F.tab === 'log' ? logTab() : F.tab === 'batch' ? matTab() : F.tab === 'sum' ? sumTab() : F.tab === 'prog' ? progTab() : opsTab();

  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f && f.startsWith('pr.')) { F[f.slice(3)] = t.value; E.$('prb').innerHTML = body(); return; }
    const r = t.closest && t.closest('.pr');
    if (!r) return;
    const c = r.children;
    if (t === c[1]) { const j = t.value; c[2].innerHTML = '<option value="">— article / colour —</option>' + (j ? jl(j).map(l => `<option value="${l.id}">${E.esc(l.code)} · target ${l.target}</option>`).join('') : ''); }
    if (t === c[1] || t === c[2] || t === c[3]) { const l = E.D.jobLines.find(x => x.id === c[2].value); if (l && c[3].value && !c[5].dataset.man) c[5].value = ((E.opRate(c[3].value, l.itemId, E.val('pr_d')) || 0) / 100) || ''; }
    if (t === c[5]) c[5].dataset.man = '1';
    const q = parseFloat(c[4].value) || 0, rt = E.c(c[5].value);
    c[6].value = q && rt ? E.m(Math.round(q * rt)) : '';
    tot();
  });

  /* ── daily log ── */
  const row = () => `<div class="jl pr" style="grid-template-columns:1.5fr 1.2fr 1.6fr 1.2fr .7fr .8fr .9fr 28px"><input list="pe" placeholder="Click to choose worker"><select><option value="">— job —</option>${active().map(j => `<option value="${j.id}">${j.no}</option>`).join('')}</select><select><option value="">— article / colour —</option></select><select><option value="">— operation —</option>${ops().map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select><input type="number" step="1" min="0" placeholder="Packs"><input type="number" step="0.01" placeholder="Rate / pack"><input readonly placeholder="Amount"><button class="btn sm d" data-a="rmPr">✕</button></div>`;
  E.A.rmPr = (_, e) => { e.target.closest('.pr').remove(); tot(); };
  E.A.addPr = () => E.$('prr').insertAdjacentHTML('beforeend', row());
  function tot() {
    let q = 0, a = 0;
    document.querySelectorAll('#prr .pr').forEach(r => { const c = r.children, n = parseFloat(c[4].value) || 0; q += n; a += Math.round(n * E.c(c[5].value)); });
    if (E.$('pr_t')) E.$('pr_t').textContent = q + ' packs · ' + E.m(a);
  }
  function logTab() {
    const rows = live().concat(logs().filter(l => l.status === 'cancelled'))
      .filter(l => l.date === F.date && (!F.job || l.jobId === F.job) && (!F.emp || l.empId === F.emp))
      .sort((a, b) => b.no.localeCompare(a.no));
    const can = E.role === 'owner' || E.role === 'accountant';
    return `<div class="card">
      <h3>Record today's work</h3>
      ${!can ? '<p class="muted">View-only access.</p>'
        : !ops().length ? '<p class="bad">No operations defined yet. Open "Operations & rates" and add them.</p>'
        : !active().length ? '<p class="bad">No job is in progress. Create a job first.</p>'
        : `<div class="g2">
            <div class="f">Date of work<input id="pr_d" type="date" value="${F.date}" data-f="pr.date"></div>
            <div class="f"><br><span class="muted">Choose worker → job → article/colour → operation → packs. The rate fills in from the rate card.</span></div>
          </div>
          <datalist id="pe">${E.empOpts()}</datalist>
          <div id="prr">${row() + row() + row()}</div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
            <button class="btn sm" data-a="addPr">+ Add row</button>
            <span class="gap"></span>
            <b id="pr_t">0 packs · Rs 0.00</b>
            <button class="btn p" data-a="prSave">Save production</button>
          </div>`}
    </div>
    <div class="bar">
      <span class="muted">Showing</span>
      <input type="date" class="fs" data-f="pr.date" value="${F.date}">
      <select class="fs" data-f="pr.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${j.no}</option>`).join('')}</select>
      <select class="fs" data-f="pr.emp"><option value="">All workers</option>${E.rows('employees').map(e => `<option value="${e.id}" ${F.emp === e.id ? 'selected' : ''}>${E.esc(e.name)}</option>`).join('')}</select>
    </div>
    <div class="tw"><table>
      <thead><tr><th>No</th><th>Worker</th><th>Job</th><th>Article / colour</th><th>Operation</th><th class="r">Packs</th><th class="r">Rate</th><th class="r">Earned</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(l => `<tr style="${l.status === 'cancelled' ? 'opacity:.45' : ''}">
        <td>${l.no}</td>
        <td>${E.esc((emp(l.empId) || {}).name)}</td>
        <td>${E.esc((J(l.jobId) || {}).no)}</td>
        <td><b>${E.esc(l.code)}</b></td>
        <td>${E.esc(l.opName)}</td>
        <td class="r">${l.qty}</td>
        <td class="r">${E.m(l.rate)}</td>
        <td class="r"><b>${E.m(l.amount)}</b></td>
        <td><span class="tag">${l.status === 'paid' ? 'Paid ' + (l.runNo || '') : l.status === 'cancelled' ? 'Cancelled' : 'Earned'}</span></td>
        <td class="r">${l.status === 'accrued' && can ? `<button class="btn sm d" data-a="prCancel" data-id="${l.id}">Cancel</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="10" class="muted">No production logged for this selection</td></tr>'}</tbody>
    </table></div>`;
  }

  E.A.prSave = async () => {
    try {
      const L = [];
      document.querySelectorAll('#prr .pr').forEach((r, i) => {
        const c = r.children;
        if (!c[0].value && !c[4].value && !c[1].value) return;
        const e = empFind(c[0].value), j = J(c[1].value), l = E.D.jobLines.find(x => x.id === c[2].value), o = op(c[3].value);
        const q = parseFloat(c[4].value) || 0, rt = E.c(c[5].value);
        const n = 'Row ' + (i + 1) + ': ';
        if (!e) throw new Error(n + 'choose a worker from the list');
        if (!j || j.status !== 'In Progress') throw new Error(n + 'choose a job that is in progress');
        if (!l) throw new Error(n + 'choose the article / colour');
        if (!o) throw new Error(n + 'choose the operation');
        if (!(q > 0) || q !== Math.floor(q)) throw new Error(n + 'enter whole packs');
        if (!(rt > 0)) throw new Error(n + 'no rate set for ' + o.name + '. Set it under Operations & rates');
        L.push({ e, j, l, o, q, rt, amount: Math.round(q * rt) });
      });
      if (!L.length) throw new Error('Nothing to save');
      const d = E.val('pr_d');
      if (!d) throw new Error('Choose the date of work');
      const over = [];
      L.forEach(x => {
        const dn = done(x.l.id, x.o.id) + L.filter(y => y !== x && y.l.id === x.l.id && y.o.id === x.o.id).reduce((s, y) => s + y.q, 0) + x.q;
        if (dn > x.l.target) over.push(x.l.code + ' / ' + x.o.name + ' → ' + dn + ' of target ' + x.l.target);
      });
      if (over.length && !confirm('Output is more than the job target for:\n' + over.join('\n') + '\n\nSave anyway?')) return;
      const no = await E.next('PL');
      const tot = L.reduce((s, x) => s + x.amount, 0);
      const je = await E.post({
        date: d, ref: no, narr: 'Piece-rate production ' + d + ' · ' + L.length + ' entries', source: 'production',
        lines: L.map(x => ({ acc: '1310', dr: x.amount, job: x.j.id, cat: 'Labour', art: x.l.id, head: '5110' })).concat([{ acc: '2210', cr: tot }])
      });
      let k = 0;
      for (const x of L) await E.save('prodLogs', {
        no: no + '-' + (++k), batch: no, date: d,
        empId: x.e.id, jobId: x.j.id, lineId: x.l.id, itemId: x.l.itemId, variantId: x.l.variantId,
        code: x.l.code, opId: x.o.id, opName: x.o.name, qty: x.q, rate: x.rt, amount: x.amount,
        status: 'accrued', jeId: je.id, jeNo: je.no, runId: '', runNo: ''
      });
      F.date = d;
      E.go();
      E.toast(L.length + ' entries saved · ' + E.m(tot) + ' charged to job labour', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  E.A.prCancel = async id => {
    try {
      const l = E.D.prodLogs.find(x => x.id === id);
      if (l.status !== 'accrued') throw new Error('Already paid or cancelled');
      if ((J(l.jobId) || {}).status !== 'In Progress') throw new Error('Job completed; correct with a journal entry');
      if (!confirm('Cancel ' + l.no + ' (' + l.qty + ' packs, ' + E.m(l.amount) + ')?')) return;
      await E.post({
        date: E.today(), ref: l.no, narr: 'Cancel production ' + l.no, source: 'production',
        lines: [{ acc: '2210', dr: l.amount }, { acc: '1310', cr: l.amount, job: l.jobId, cat: 'Labour', art: l.lineId, head: '5110' }]
      });
      const b = JSON.parse(JSON.stringify(l));
      l.status = 'cancelled';
      await E.save('prodLogs', l, b);
      E.go();
      E.toast('Cancelled', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ═══════════════════════════════════════════════════════════════
     MATERIAL BATCHES — high-accuracy BOM-driven material deduction
     ═══════════════════════════════════════════════════════════════ */
  function matTab() {
    const jobs = active();
    if (!jobs.length) return '<div class="card muted">No job in progress. Create a job first.</div>';

    /* recent batches: group issues where batch=true by document number */
    const batchIssues = E.rows('issues').filter(i => i.batch === true);
    const batchNos = [...new Set(batchIssues.map(b => b.no))].sort((a, b) => b.localeCompare(a));

    return `<div class="card">
      <h3>📦 Start Material Batch</h3>
      <p class="muted" style="margin-bottom:12px">
        Deducts <b>all BOM materials</b> (raw material + accessories + packing) for the packs you are starting.
        Live preview checks stock before you post. Every batch updates <code>jobLine.started</code> so the same packs won't double-deduct.
      </p>
      <div class="g2">
        <div class="f">Job *
          <select id="mb_job" onchange="E.A.mbJobChange()">
            <option value="">— select job —</option>
            ${jobs.map(j => `<option value="${j.id}">${E.esc(j.no)} · ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock production' }).name)}</option>`).join('')}
          </select>
        </div>
        <div class="f">Article / colour *
          <select id="mb_art" onchange="E.A.mbPreview()"><option value="">— select job first —</option></select>
        </div>
      </div>
      <div class="g2">
        <div class="f">Packs starting now *
          <input id="mb_qty" type="number" min="1" step="1" value="1" oninput="E.A.mbPreview()">
        </div>
        <div class="f">Batch date
          <input id="mb_date" type="date" value="${E.today()}">
        </div>
      </div>
      <div id="mb_preview"><p class="muted">Select job and article to see the BOM preview.</p></div>
      <button class="btn p" data-a="mbPost" id="mb_postBtn" style="margin-top:12px" disabled>📦 Deduct Materials & Start Batch</button>
    </div>
    ${batchNos.length ? `<div class="card"><h3>Recent Batches</h3><div class="tw"><table>
      <thead><tr><th>Batch No</th><th>Date</th><th>Job</th><th>Materials</th><th class="r">Value</th></tr></thead>
      <tbody>${batchNos.slice(0, 20).map(no => {
        const items = batchIssues.filter(b => b.no === no);
        const first = items[0];
        const job = J(first.jobId);
        const total = items.reduce((s, i) => s + i.value, 0);
        return `<tr>
          <td><b>${no}</b></td>
          <td>${first.date}</td>
          <td>${job ? E.esc(job.no) : '?'}</td>
          <td>${items.map(i => E.esc(i.code)).join(', ')}</td>
          <td class="r">${E.m(total)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>` : ''}`;
  }

  E.A.mbJobChange = () => {
    const jobId = E.val('mb_job');
    const lines = E.rows('jobLines').filter(l => l.jobId === jobId);
    const sel = E.$('mb_art');
    if (!sel) return;
    if (!lines.length) { sel.innerHTML = '<option value="">— no articles in this job —</option>'; E.A.mbPreview(); return; }
    sel.innerHTML = '<option value="">— article / colour —</option>' + lines.map(l =>
      `<option value="${l.id}">${E.esc(l.code)} · target ${l.target} · started ${l.started || 0}</option>`
    ).join('');
    E.A.mbPreview();
  };

  E.A.mbPreview = () => {
    const qty = parseFloat(E.val('mb_qty')) || 0;
    const lineId = E.val('mb_art');
    const box = E.$('mb_preview');
    const btn = E.$('mb_postBtn');
    if (!box) return;
    if (!lineId || qty <= 0) { box.innerHTML = '<p class="muted">Select article and enter packs.</p>'; if (btn) btn.disabled = true; return; }

    const line = E.D.jobLines.find(l => l.id === lineId);
    if (!line) { box.innerHTML = '<p class="bad">Job line not found.</p>'; if (btn) btn.disabled = true; return; }
    const item = E.D.items.find(i => i.id === line.itemId);
    if (!item || !(item.bom || []).length) {
      box.innerHTML = '<p class="bad">⚠️ This article has no BOM. Add it under <b>Items → BOM</b> before starting material batches.</p>';
      if (btn) btn.disabled = true;
      return;
    }

    const rows = item.bom.map(b => {
      const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
      const need = Math.round(b.qty * qty * 1000) / 1000;
      const stock = E.stock(b.itemId, b.variantId);
      const avgCost = stock.qty > 0 ? Math.round(stock.value / stock.qty) : 0;
      const short = stock.qty + 1e-9 < need;
      return { sku, b, need, stock: stock.qty, avgCost, short, value: Math.round(avgCost * need) };
    });

    const total = rows.reduce((s, r) => s + r.value, 0);
    const anyShort = rows.some(r => r.short);

    box.innerHTML = `<div class="tw"><table>
      <thead><tr>
        <th>Material</th><th class="r">Needed</th><th class="r">In Stock</th>
        <th class="r">Avg Cost</th><th class="r">Value</th><th>Status</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><b>${E.esc(r.sku ? r.sku.code : '?')}</b> ${E.esc(r.sku ? r.sku.name : '')}</td>
        <td class="r">${r.need}</td>
        <td class="r">${r.stock}</td>
        <td class="r">${E.m(r.avgCost)}</td>
        <td class="r">${E.m(r.value)}</td>
        <td>${r.short ? '<span class="bad"><b>Short by ' + (Math.round((r.need - r.stock) * 1000) / 1000) + '</b></span>' : '<span class="ok">OK</span>'}</td>
      </tr>`).join('')}
      <tr style="background:var(--s2)">
        <td colspan="4" class="r"><b>Total material cost</b></td>
        <td class="r"><b>${E.m(total)}</b></td>
        <td></td>
      </tr></tbody>
    </table></div>
    ${anyShort ? '<p class="bad" style="margin-top:8px"><b>⚠️ Some materials are short.</b> Purchase more before posting, or reduce the packs.</p>' : '<p class="ok" style="margin-top:8px"><b>✓ All materials in stock — ready to post.</b></p>'}`;

    if (btn) btn.disabled = anyShort;
  };

  E.A.mbPost = async () => {
    try {
      const jobId = E.val('mb_job');
      const lineId = E.val('mb_art');
      const qty = parseFloat(E.val('mb_qty')) || 0;
      const date = E.val('mb_date');

      if (!jobId) throw new Error('Select a job');
      if (!lineId) throw new Error('Select article / colour');
      if (qty <= 0) throw new Error('Enter packs');
      if (!date) throw new Error('Enter date');

      const line = E.D.jobLines.find(l => l.id === lineId);
      const item = E.D.items.find(i => i.id === line.itemId);
      if (!item || !(item.bom || []).length) throw new Error('Article has no BOM');
      const job = J(jobId);

      const no = await E.next('BAT');
      let total = 0;

      for (const b of item.bom) {
        const sku = E.skuList().find(s => s.itemId === b.itemId && s.variantId === (b.variantId || ''));
        const need = Math.round(b.qty * qty * 1000) / 1000;
        const stock = E.stock(b.itemId, b.variantId);
        if (stock.qty + 1e-9 < need) {
          throw new Error((sku ? sku.code : '?') + ': insufficient stock (need ' + need + ', have ' + stock.qty + ')');
        }
        const value = E.outValue(b.itemId, b.variantId, need);
        await E.stockOut({ date, itemId: b.itemId, variantId: b.variantId, qty: need, type: 'issue', ref: no, job: jobId });
        await E.save('issues', {
          no, date, jobId, itemId: b.itemId, variantId: b.variantId,
          code: sku ? sku.code : '', qty: need, value, art: lineId, batch: true
        });
        total += value;
      }

      await E.post({
        date, ref: no,
        narr: 'Batch material issue · ' + line.code + ' ×' + qty + ' packs · ' + job.no,
        source: 'issue',
        lines: [
          { acc: '1310', dr: total, job: jobId, cat: 'Material', art: lineId, head: '5000' },
          { acc: '1300', cr: total }
        ]
      });

      const b = JSON.parse(JSON.stringify(line));
      line.started = (line.started || 0) + qty;
      await E.save('jobLines', line, b);

      E.go();
      E.toast(no + ' · ' + qty + ' packs started · ' + E.m(total) + ' materials deducted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── summary ── */
  function sumTab() {
    const R = live().filter(l => l.date >= F.from && l.date <= F.to && (!F.job || l.jobId === F.job));
    const by = f => {
      const m = {};
      R.forEach(l => { const k = f(l); const x = m[k] || (m[k] = { q: 0, a: 0 }); x.q += l.qty; x.a += l.amount; });
      return m;
    };
    const w = {};
    R.forEach(l => {
      const x = w[l.empId] || (w[l.empId] = { ops: {}, q: 0, a: 0 });
      const o = x.ops[l.opName] || (x.ops[l.opName] = { q: 0, a: 0 });
      o.q += l.qty; o.a += l.amount; x.q += l.qty; x.a += l.amount;
    });
    const T = R.reduce((s, l) => s + l.amount, 0);
    return `<div class="bar">
      <span class="muted">From</span>
      <input type="date" class="fs" data-f="pr.from" value="${F.from}">
      <span class="muted">to</span>
      <input type="date" class="fs" data-f="pr.to" value="${F.to}">
      <select class="fs" data-f="pr.job"><option value="">All jobs</option>${E.rows('jobs').map(j => `<option value="${j.id}" ${F.job === j.id ? 'selected' : ''}>${j.no}</option>`).join('')}</select>
      <span class="gap"></span>
      <button class="btn" data-a="prCsv">⬇ CSV</button>
    </div>
    <div class="card"><h3>By worker and operation</h3><div class="tw"><table>
      <thead><tr><th>Worker</th><th>Operation</th><th class="r">Packs</th><th class="r">Earned</th></tr></thead>
      <tbody>${Object.keys(w).sort().map(id => {
        const x = w[id], e = emp(id) || { name: '?' };
        return `<tr style="background:var(--s2)"><td colspan="2"><b>${E.esc(e.name)}</b></td><td class="r"><b>${x.q}</b></td><td class="r"><b>${E.m(x.a)}</b></td></tr>` +
          Object.keys(x.ops).map(o => `<tr><td></td><td>${E.esc(o)}</td><td class="r">${x.ops[o].q}</td><td class="r">${E.m(x.ops[o].a)}</td></tr>`).join('');
      }).join('') || '<tr><td colspan="4" class="muted">No production in this period</td></tr>'}
      <tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>${E.m(T)}</b></td></tr></tbody>
    </table></div></div>
    <div class="g2">
      <div class="card"><h3>By operation</h3><div class="tw"><table><tbody>${Object.entries(by(l => l.opName)).map(([k, x]) => `<tr><td>${E.esc(k)}</td><td class="r">${x.q} packs</td><td class="r">${E.m(x.a)}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>By job</h3><div class="tw"><table><tbody>${Object.entries(by(l => (J(l.jobId) || {}).no || '?')).map(([k, x]) => `<tr><td>${E.esc(k)}</td><td class="r">${x.q} packs</td><td class="r">${E.m(x.a)}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div></div>
    </div>`;
  }
  E.A.prCsv = () => {
    const R = live().filter(l => l.date >= F.from && l.date <= F.to && (!F.job || l.jobId === F.job));
    E.download('production-' + F.from + '-to-' + F.to + '.csv',
      [['Date', 'Entry', 'Worker', 'Job', 'Article', 'Operation', 'Packs', 'Rate', 'Earned', 'Status'].join(',')]
        .concat(R.map(l => [l.date, l.no, (emp(l.empId) || {}).name, (J(l.jobId) || {}).no, l.code, l.opName, l.qty, l.rate / 100, l.amount / 100, l.status].map(E.csvCell).join(',')))
        .join('\n'), 'text/csv');
  };

  /* ── job progress ── */
  function progTab() {
    const op2 = ops();
    return active().map(j => `<div class="card">
      <h3>${E.esc(j.no)} · ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock production' }).name)}</h3>
      <div class="tw"><table>
        <thead><tr><th>Article / colour</th><th class="r">Target</th>${op2.map(o => `<th class="r">${E.esc(o.name)}</th>`).join('')}<th class="r">Released</th></tr></thead>
        <tbody>${jl(j.id).map(l => `<tr>
          <td><b>${E.esc(l.code)}</b></td>
          <td class="r">${l.target}</td>
          ${op2.map(o => { const d = done(l.id, o.id), p = l.target ? Math.min(100, Math.round(d * 100 / l.target)) : 0; return `<td class="r"><b>${d}</b><div style="height:5px;background:var(--s2);border-radius:3px;margin-top:3px"><div style="height:5px;width:${p}%;background:${p >= 100 ? '#16a34a' : 'var(--ac)'};border-radius:3px"></div></div></td>`; }).join('')}
          <td class="r">${l.released}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('') || '<div class="card muted">No jobs in progress.</div>';
  }

  /* ── operations & rates ── */
  const STD = [['Cutting / Sole cutting'], ['Top (upper) making'], ['Sole preparation'], ['Sole fixing / pressing'], ['Buckle / strap fitting'], ['Finishing & cleaning'], ['Quality check'], ['Packing']];

  function opsTab() {
    const cards = E.rows('rateCards').sort((a, b) => (b.from || '').localeCompare(a.from || ''));
    return `<div class="bar">
      <span class="muted">An operation is one step of making a slipper. Set the rate paid per PACK; override it for a category (Flat, PU…) or a single article.</span>
      <span class="gap"></span>
      ${ops().length ? '' : '<button class="btn" data-a="opStd">Add standard slipper operations</button>'}
      <button class="btn" data-a="rcNew">+ Rate override</button>
      <button class="btn p" data-a="opNew">+ Operation</button>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Order</th><th>Code</th><th>Operation</th><th class="r">Standard rate / pack</th><th>Status</th><th></th></tr></thead>
      <tbody>${E.rows('operations').sort((a, b) => (a.order || 0) - (b.order || 0)).map(o => `<tr style="${o.active === false ? 'opacity:.5' : ''}">
        <td>${o.order || ''}</td>
        <td>${E.esc(o.code)}</td>
        <td><b>${E.esc(o.name)}</b></td>
        <td class="r">${o.rate ? E.m(o.rate) : '<span class="bad">not set</span>'}</td>
        <td>${o.active === false ? 'Inactive' : 'Active'}</td>
        <td class="r"><button class="btn sm" data-a="opEdit" data-id="${o.id}">Edit</button> <button class="btn sm" data-a="opTog" data-id="${o.id}">${o.active === false ? 'Activate' : 'Deactivate'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">No operations yet</td></tr>'}</tbody>
    </table></div>
    <div class="card"><h3>Rate overrides</h3><div class="tw"><table>
      <thead><tr><th>Operation</th><th>Applies to</th><th>From</th><th class="r">Rate / pack</th><th></th></tr></thead>
      <tbody>${cards.map(c => `<tr>
        <td>${E.esc((op(c.opId) || {}).name)}</td>
        <td>${c.scope === 'article' ? 'Article <b>' + E.esc(((E.D.items.find(i => i.id === c.ref) || {}).art) || '?') + '</b>' : 'Category <b>' + E.esc(c.ref) + '</b>'}</td>
        <td>${c.from || ''}</td>
        <td class="r"><b>${E.m(c.rate)}</b></td>
        <td class="r"><button class="btn sm d" data-a="rcDel" data-id="${c.id}">Remove</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No overrides — the standard rate is used</td></tr>'}</tbody>
    </table></div>
    <p class="muted">Rate changes apply to work logged from the "From" date. Work already logged keeps its original rate.</p></div>`;
  }

  E.A.opStd = async () => {
    let i = 0;
    for (const [n] of STD) await E.save('operations', { code: 'OP' + String(++i).padStart(2, '0'), name: n, order: i, rate: 0, active: true });
    E.go();
    E.toast('Added. Now enter the rate for each operation.', 'success');
  };

  const opForm = id => {
    const o = id ? op(id) : null;
    E.modal(o ? 'Edit operation' : 'New operation', `
      <div class="g2">
        <div class="f">Operation name *<input id="o_n" value="${E.esc(o && o.name)}" placeholder="Top making"></div>
        <div class="f">Order in process<input id="o_o" type="number" value="${(o && o.order) || ops().length + 1}"></div>
        <div class="f">Standard rate per PACK (Rs) *<input id="o_r" type="number" step="0.01" value="${o && o.rate ? o.rate / 100 : ''}"></div>
      </div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="opSave" data-id="${id || ''}">Save</button>`);
  };
  E.A.opNew = () => opForm();
  E.A.opEdit = id => opForm(id);
  E.A.opSave = async id => {
    const n = E.val('o_n');
    if (!n) return E.toast('Name required', 'error');
    const o = id ? op(id) : { active: true, code: 'OP' + String(E.rows('operations').length + 1).padStart(2, '0') };
    const b = id ? JSON.parse(JSON.stringify(o)) : null;
    Object.assign(o, { name: n, order: parseInt(E.val('o_o')) || 0, rate: E.c(E.val('o_r')) });
    await E.save('operations', o, b);
    E.closeM(); E.go();
  };
  E.A.opTog = async id => {
    const o = op(id), b = JSON.parse(JSON.stringify(o));
    o.active = o.active === false;
    await E.save('operations', o, b);
    E.go();
  };

  E.A.rcNew = () => {
    if (!ops().length) return E.toast('Add operations first', 'error');
    const subs = [...new Set(E.rows('items').filter(i => i.cat === 'Finished Good').map(i => i.sub).filter(Boolean))];
    E.modal('Rate override', `
      <div class="g2">
        <div class="f">Operation *<select id="rc_o">${ops().map(o => `<option value="${o.id}">${E.esc(o.name)}</option>`).join('')}</select></div>
        <div class="f">Applies to *<select id="rc_s"><option value="category">A category</option><option value="article">One article</option></select></div>
        <div class="f">Category<select id="rc_c">${subs.map(s => `<option>${E.esc(s)}</option>`).join('')}</select></div>
        <div class="f">…or article<select id="rc_a">${E.rows('items').filter(i => i.cat === 'Finished Good').map(i => `<option value="${i.id}">${E.esc(i.art)}</option>`).join('')}</select></div>
        <div class="f">Rate per PACK (Rs) *<input id="rc_r" type="number" step="0.01"></div>
        <div class="f">From date<input id="rc_f" type="date" value="${E.today()}"></div>
      </div>
    `, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="rcSave">Save</button>`);
  };
  E.A.rcSave = async () => {
    const sc = E.val('rc_s'), r = E.c(E.val('rc_r'));
    if (r <= 0) return E.toast('Enter the rate', 'error');
    await E.save('rateCards', { opId: E.val('rc_o'), scope: sc, ref: sc === 'article' ? E.val('rc_a') : E.val('rc_c'), rate: r, from: E.val('rc_f') });
    E.closeM(); E.go();
  };
  E.A.rcDel = async id => { if (confirm('Remove this rate override?')) { await E.del('rateCards', id); E.go(); } };
})(window.ERP);