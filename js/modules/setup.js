/* PART 17 (v3) — Setup Wizard.

   FIXES in v3:
     ✓ Categories bug — d.biz[i] now correctly updates d.biz.cats
     ✓ Size run accepts "36-41" and expands to 36,37,38,39,40,41
     ✓ Placeholder changed to match 36-41 default
     ✓ Help text explains range syntax
*/
(E => {
  const ni = E.N.findIndex(n => n.id === 'opening');
  E.N.splice(ni < 0 ? E.N.length : ni, 0, { g: 'System', id: 'setup', ico: '🧭', label: 'Setup Wizard' });

  const STEPS = [
    { id: 'biz',  l: '1 · Factory',     help: 'Basic factory information' },
    { id: 'bank', l: '2 · Banks',       help: 'Bank and cash accounts with opening balances' },
    { id: 'cust', l: '3 · Customers',   help: 'Customers and amounts they owe you' },
    { id: 'supp', l: '4 · Suppliers',   help: 'Suppliers and amounts you owe them' },
    { id: 'art',  l: '5 · Articles',    help: 'Finished goods with colours and opening stock' },
    { id: 'mat',  l: '6 · Materials',   help: 'Raw materials, accessories, packing items' },
    { id: 'ops',  l: '7 · Operations',  help: 'Production steps and piece rates' },
    { id: 'emp',  l: '8 · Employees',   help: 'Staff with pay type and opening advances' },
    { id: 'bom',  l: '9 · BOMs',        help: 'Material requirements (optional)', optional: true },
    { id: 'rev',  l: '10 · Review',     help: 'Confirm everything before posting' }
  ];

  const KEY = () => 'erp_wiz_' + E.fid;
  let W = null;

  function draft() {
    if (W && W.fid === E.fid && W.version === 3) return W;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) {}
    if (d && d.version === 3) { W = d; return W; }
    W = {
      fid: E.fid, version: 3, step: 'biz',
      biz: { cats: 'Flat, PU', pack: '6' },
      bank: [], cust: [], supp: [], art: [], mat: [], ops: [], emp: [], bom: []
    };
    return W;
  }

  const save = () => localStorage.setItem(KEY(), JSON.stringify(W));
  const cats = () => draft().biz.cats.split(',').map(x => x.trim()).filter(Boolean);

  const COLS = {
    bank: () => [
      { k: 'name', l: 'Account name *', w: 160, ph: 'Commercial Bank - Current' },
      { k: 'kind', l: 'Type *', t: 'sel', o: ['Bank', 'Cash'] },
      { k: 'bankName', l: 'Bank / institution', w: 120 },
      { k: 'acctNo', l: 'Account no', w: 110 },
      { k: 'opening', l: 'Opening balance (Rs)', t: 'n' }
    ],
    cust: () => [
      { k: 'name', l: 'Customer name *', w: 160 },
      { k: 'phone', l: 'Phone', w: 110 },
      { k: 'days', l: 'Credit days', t: 'n' },
      { k: 'limit', l: 'Credit limit (Rs)', t: 'n' },
      { k: 'opening', l: 'Amount they owe you (Rs)', t: 'n' }
    ],
    supp: () => [
      { k: 'name', l: 'Supplier name *', w: 160 },
      { k: 'phone', l: 'Phone', w: 110 },
      { k: 'days', l: 'Credit days', t: 'n' },
      { k: 'opening', l: 'Amount you owe them (Rs)', t: 'n' }
    ],
    art: () => [
      { k: 'art', l: 'Article No *', w: 80, ph: 'F001' },
      { k: 'name', l: 'Name *', w: 150, ph: 'Ladies Flat Slipper' },
      { k: 'cat', l: 'Category *', t: 'sel', o: cats() },
      { k: 'run', l: 'Size run in ONE pack *', w: 160, ph: '36-41' },
      { k: 'cols', l: 'Colours *', w: 150, ph: 'Black, Brown, Navy' },
      { k: 'price', l: 'Selling price / pack', t: 'n' },
      { k: 'opening', l: 'Opening packs per colour', t: 'n' },
      { k: 'cost', l: 'Cost per pack (Rs)', t: 'n' }
    ],
    mat: () => [
      { k: 'code', l: 'Code *', w: 80, ph: 'EVA-01' },
      { k: 'name', l: 'Name *', w: 150 },
      { k: 'type', l: 'Type *', t: 'sel', o: ['Raw Material', 'Accessory', 'Packing'] },
      { k: 'unit', l: 'Unit *', t: 'sel', o: ['Kg', 'Meter', 'Sheet', 'Roll', 'Pcs', 'Pair', 'Litre', 'Box', 'Pack'] },
      { k: 'buy', l: 'Purchase price / unit *', t: 'n' },
      { k: 'sup', l: 'Supplier', w: 120 },
      { k: 'min', l: 'Reorder level', t: 'n' },
      { k: 'opening', l: 'Opening qty', t: 'n' }
    ],
    ops: () => [
      { k: 'name', l: 'Operation *', w: 180, ph: 'Top making' },
      { k: 'rate', l: 'Rate per PACK (Rs) *', t: 'n' }
    ],
    emp: () => [
      { k: 'name', l: 'Full name *', w: 150 },
      { k: 'nic', l: 'NIC', w: 100 },
      { k: 'phone', l: 'Phone', w: 100 },
      { k: 'type', l: 'Pay type *', t: 'sel', o: ['Wage', 'Daily Salaried', 'Monthly Salaried'] },
      { k: 'rate', l: 'Daily rate / monthly salary *', t: 'n' },
      { k: 'allow', l: 'Monthly allowances', t: 'n' },
      { k: 'piece', l: 'Piece work?', t: 'sel', o: ['No', 'Yes'] },
      { k: 'epf', l: 'EPF member?', t: 'sel', o: ['Yes', 'No'] },
      { k: 'advance', l: 'Advance already owed (Rs)', t: 'n' }
    ],
    bom: () => [
      { k: 'art', l: 'Article *', t: 'sel', o: ['(select article)'] },
      { k: 'material', l: 'Material *', w: 180, ph: 'Search material code' },
      { k: 'qty', l: 'Qty per pack *', t: 'n' }
    ]
  };

  const HELP = {
    bank: 'Add every bank account and cash box you use. Opening balance = what is in that account today.',
    cust: 'Add customers. If they already owe you money from before using this system, enter it in the last column.',
    supp: 'Add suppliers. If you already owe them money, enter it in the last column.',
    art: 'One row per article. A pack = one size run in one colour.\n\n<b>Size run examples:</b>\n• <code>36-41</code> → 6 pairs (36,37,38,39,40,41)\n• <code>36-41,36-41</code> → 12 pairs (each size twice)\n• <code>6,7,7,8,8,9</code> → 6 pairs (repeats preserved)\n\nEach colour becomes its own barcode.',
    mat: 'Every material, accessory and packing item you buy. Purchase price = what you pay the supplier. Opening qty = what you have today.',
    ops: 'Each production step a worker is paid for per pack (cutting, top making, sole fixing…).',
    emp: 'Wage = paid by days/pieces. Daily Salaried = fixed daily amount. Monthly Salaried = fixed monthly salary.',
    bom: 'Optional. How much of each material goes into ONE pack. You can add these later from Items → BOM.'
  };

  const blank = s => Object.fromEntries(COLS[s]().map(c => [c.k, c.t === 'sel' ? c.o[0] : '']));

  E.route('setup', 'Setup Wizard', () => {
    const d = draft();
    return `<div class="bar" style="flex-wrap:wrap">
      ${STEPS.map(st => `<button class="btn ${d.step === st.id ? 'p' : ''}" data-a="wzGo" data-id="${st.id}">${st.l}${!['biz', 'rev'].includes(st.id) && Array.isArray(d[st.id]) ? ' <small>(' + d[st.id].filter(r => Object.values(r).some(v => String(v).trim())).length + ')</small>' : ''}</button>`).join('')}
    </div>
    <div id="wzb">${d.step === 'biz' ? stepBiz() : d.step === 'rev' ? stepRev() : d.step === 'bom' ? stepBom() : stepGrid(d.step)}</div>`;
  });

  E.A.wzGo = k => { draft().step = k; save(); E.go(); };

  function stepBiz() {
    const d = draft();
    return `<div class="card">
      <h3>Welcome — set up ${E.esc((E.factory() || {}).name || 'your factory')}</h3>
      <p class="muted" style="margin-bottom:12px">This wizard will set up EVERYTHING at once: bank accounts, customers, suppliers, articles, materials, employees, operations — and post all opening balances in one go.</p>
      <div class="g2">
        <div class="f">Finished-goods categories (comma separated)<input data-w="biz|cats" value="${E.esc(d.biz.cats)}" placeholder="Flat, PU, Sandal"></div>
        <div class="f">Default pairs per pack (for sizes 36-41, use 6)<input data-w="biz|pack" type="number" value="${E.esc(d.biz.pack)}"></div>
      </div>
      <p class="muted">Add more categories later from Settings. You can pause at any step — your answers are saved as a draft.</p>
    </div>${nav(d.step)}`;
  }

  function stepGrid(s) {
    const d = draft();
    const C = COLS[s]();
    const rows = d[s];
    if (!rows.length) for (let i = 0; i < 5; i++) rows.push(blank(s));

    return `<div class="card">
      <h3>${STEPS.find(x => x.id === s).l.slice(3)}</h3>
      <p class="muted" style="margin-bottom:10px;white-space:pre-line;line-height:1.6">${HELP[s] || ''}</p>
      <div class="tw"><table>
        <thead><tr><th>#</th>${C.map(c => `<th>${E.esc(c.l)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td class="muted">${i + 1}</td>
          ${C.map(c => `<td>${c.t === 'sel'
            ? `<select data-w="${s}|${i}|${c.k}" style="padding:6px;border:1px solid var(--bd);border-radius:8px;background:var(--s)">${(c.o || ['']).map(o => `<option ${r[c.k] === o ? 'selected' : ''}>${E.esc(o)}</option>`).join('')}</select>`
            : `<input data-w="${s}|${i}|${c.k}" ${c.t === 'n' ? 'type="number" step="0.01"' : ''} value="${E.esc(r[c.k] || '')}" placeholder="${E.esc(c.ph || '')}" style="width:${c.w || 90}px;padding:6px;border:1px solid var(--bd);border-radius:8px;background:var(--s);color:var(--t)">`
          }</td>`).join('')}
          <td><button class="btn sm d" data-a="wzRm" data-id="${s}|${i}">✕</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn sm" data-a="wzAdd" data-id="${s}">+ 5 rows</button>
        <button class="btn sm" data-a="wzPaste" data-id="${s}">📋 Paste from Excel</button>
      </div>
    </div>${nav(s)}`;
  }

  function stepBom() {
    const d = draft();
    return `<div class="card">
      <h3>Bill of Materials (optional)</h3>
      <p class="muted" style="margin-bottom:10px">BOM = how much of each material goes into ONE pack. Used by Material Batches to auto-deduct materials when you start production. You can skip this now and add BOMs later from <b>Items → BOM</b>.</p>
      <div style="background:#e0f2fe;padding:14px;border-radius:10px;border-left:4px solid #0891b2;margin-bottom:16px">
        <b>💡 Tip:</b> You can add BOMs one-by-one on the Items page at any time. Skipping here is completely fine.
      </div>
      <button class="btn" data-a="wzGo" data-id="rev">⏭ Skip — I'll add BOMs later</button>
      <p class="muted" style="margin-top:16px">Or add BOM lines for your articles below:</p>
      <div class="tw"><table>
        <thead><tr><th>Article</th><th>Material</th><th class="r">Qty per pack</th><th></th></tr></thead>
        <tbody id="bomBody">
          ${(d.bom || []).map((b, i) => bomRow(b, i)).join('')}
          ${bomRow({}, (d.bom || []).length)}
        </tbody>
      </table></div>
      <button class="btn sm" data-a="wzAddBom" style="margin-top:8px">+ Add BOM line</button>
    </div>${nav('bom')}`;
  }

  function bomRow(b, i) {
    const d = draft();
    const arts = d.art.filter(a => a.art && a.name);
    return `<tr data-bom-i="${i}">
      <td><select data-bom="${i}|art" style="padding:6px;border:1px solid var(--bd);border-radius:8px;background:var(--s)">
        <option value="">— article —</option>
        ${arts.map(a => `<option value="${E.esc(a.art)}" ${b.art === a.art ? 'selected' : ''}>${E.esc(a.art)} ${E.esc(a.name || '')}</option>`).join('')}
      </select></td>
      <td><input data-bom="${i}|material" value="${E.esc(b.material || '')}" placeholder="Material code" list="wzMatList" style="padding:6px;border:1px solid var(--bd);border-radius:8px;width:200px">
        <datalist id="wzMatList">${d.mat.filter(m => m.code).map(m => `<option value="${E.esc(m.code)}">${E.esc(m.name || '')}</option>`).join('')}</datalist>
      </td>
      <td class="r"><input data-bom="${i}|qty" type="number" step="0.0001" value="${E.esc(b.qty || '')}" style="padding:6px;border:1px solid var(--bd);border-radius:8px;width:90px;text-align:right"></td>
      <td><button class="btn sm d" data-a="wzRmBom" data-id="${i}">✕</button></td>
    </tr>`;
  }

  function stepRev() {
    const c = check();
    const row = (l, v) => `<tr><td>${l}</td><td class="r"><b>${v}</b></td></tr>`;
    return `<div class="card">
      <h3>Review everything</h3>
      <div class="tw"><table><tbody>
        ${row('Finished-goods categories', E.esc(cats().join(', ')))}
        ${row('Bank & cash accounts', c.bankCount + ' account(s) — opening ' + E.m(c.bankOpen))}
        ${row('Customers', c.custCount + ' — they owe you ' + E.m(c.custOpen))}
        ${row('Suppliers', c.suppCount + ' — you owe them ' + E.m(c.suppOpen))}
        ${row('Articles', c.artCount + ' (' + c.artColours + ' colour packs) — opening ' + E.m(c.fgOpen))}
        ${row('Materials', c.matCount + ' — opening ' + E.m(c.rmOpen))}
        ${row('Operations', c.opsCount)}
        ${row('Employees', c.empCount + ' — advances owed ' + E.m(c.advOpen))}
        ${row('BOMs', c.bomCount + ' line(s)')}
      </tbody></table></div>
      <h4 style="margin-top:20px;margin-bottom:8px">What will be posted:</h4>
      <div class="tw"><table><tbody>
        <tr><td>Dr 1000/1100+ (cash & bank)</td><td class="r">${E.m(c.bankOpen)}</td><td class="muted">/ Cr 3000 Owner Capital</td></tr>
        <tr><td>Dr 1200 (customer receivables)</td><td class="r">${E.m(c.custOpen)}</td><td class="muted">/ Cr 3000</td></tr>
        <tr><td>Dr 3000 Owner Capital</td><td class="r">${E.m(c.suppOpen)}</td><td class="muted">/ Cr 2000 Supplier payables</td></tr>
        <tr><td>Dr 1300 (raw materials)</td><td class="r">${E.m(c.rmOpen)}</td><td class="muted">/ Cr 3200 Opening Balance Equity</td></tr>
        <tr><td>Dr 1320 (finished goods)</td><td class="r">${E.m(c.fgOpen)}</td><td class="muted">/ Cr 3200</td></tr>
        <tr><td>Dr 1250 (employee advances)</td><td class="r">${E.m(c.advOpen)}</td><td class="muted">/ Cr 3200</td></tr>
      </tbody></table></div>
      ${c.err.length ? `<div class="card" style="border:1px solid #dc2626;margin-top:12px"><b class="bad">Fix these before confirming</b><ul style="margin:8px 0 0 18px">${c.err.map(x => `<li>${E.esc(x)}</li>`).join('')}</ul></div>` : '<p class="ok" style="margin-top:12px"><b>✔ Everything needed is filled in.</b></p>'}
      <label style="display:flex;gap:8px;align-items:flex-start;margin-top:16px;padding:12px;background:var(--acs);border-radius:8px">
        <input type="checkbox" id="wz_ok" style="width:auto;margin-top:3px">
        <span>I have checked these details and want to create them now. All opening entries will be posted as described above.</span>
      </label>
    </div>
    <div class="bar">
      <button class="btn" data-a="wzGo" data-id="bom">← Back</button>
      <span class="gap"></span>
      <button class="btn p" data-a="wzDo" ${c.err.length ? 'disabled' : ''}>✔ Confirm & create everything</button>
    </div>`;
  }

  const nav = s => {
    const i = STEPS.findIndex(x => x.id === s);
    const prev = STEPS[Math.max(0, i - 1)].id;
    const next = STEPS[Math.min(STEPS.length - 1, i + 1)].id;
    return `<div class="bar">
      <button class="btn" data-a="wzGo" data-id="${prev}">← Back</button>
      <span class="gap"></span>
      <span class="muted">Answers saved automatically as a draft.</span>
      <button class="btn p" data-a="wzGo" data-id="${next}">Next →</button>
    </div>`;
  };

  /* ═══════════════════════════════════════════════════════════════
     HOOK — FIXED: d.biz[i] not d.biz[k] for 2-part attributes
     ═══════════════════════════════════════════════════════════════ */
  E.hooks.push(e => {
    const t = e.target;
    const w = t.dataset && t.dataset.w;
    if (w) {
      const parts = w.split('|');
      const d = draft();
      if (parts[0] === 'biz') {
        /* "biz|cats" → 2 parts: s='biz', i='cats' */
        d.biz[parts[1]] = t.value;
      } else {
        /* "art|0|art" → 3 parts: s='art', i='0', k='art' */
        const [s, i, k] = parts;
        while (d[s].length <= +i) d[s].push(blank(s));
        d[s][+i][k] = t.value;
      }
      save();
      return;
    }
    const b = t.dataset && t.dataset.bom;
    if (b) {
      const [i, k] = b.split('|');
      const d = draft();
      while (d.bom.length <= +i) d.bom.push({ art: '', material: '', qty: '' });
      d.bom[+i][k] = t.value;
      save();
    }
  });

  E.A.wzAdd = s => { const d = draft(); for (let i = 0; i < 5; i++) d[s].push(blank(s)); save(); E.go(); };
  E.A.wzRm = id => { const [s, i] = id.split('|'); draft()[s].splice(+i, 1); save(); E.go(); };
  E.A.wzAddBom = () => { draft().bom.push({ art: '', material: '', qty: '' }); save(); E.go(); };
  E.A.wzRmBom = i => { draft().bom.splice(+i, 1); save(); E.go(); };

  E.A.wzPaste = s => {
    const t = prompt('Paste from Excel (one row per line, columns separated by Tab or comma).\n\nColumns: ' + COLS[s]().map(c => c.l.replace(' *', '')).join(' | '));
    if (!t) return;
    const d = draft();
    const C = COLS[s]();
    const lines = t.split(/\r?\n/).filter(x => x.trim());
    const parsed = lines.map(l => (l.includes('\t') ? l.split('\t') : (typeof E.parseCsv === 'function' ? (E.parseCsv(l)[0] || l.split(',')) : l.split(','))).map(x => (x || '').trim()));
    const first = parsed[0];
    if (first && C.length && !isNumeric(first[C.length - 1]) && C[C.length - 1].t === 'n') parsed.shift();
    parsed.forEach(cols => {
      const r = blank(s);
      C.forEach((col, k) => { if (cols[k] !== undefined) r[col.k] = cols[k]; });
      d[s].push(r);
    });
    save(); E.go();
    E.toast(parsed.length + ' rows added', 'success');
  };

  function isNumeric(v) { return !isNaN(parseFloat(v)) && isFinite(v); }

  function check() {
    const d = draft(), err = [];
    const list = t => (t || '').split(',').map(x => x.trim()).filter(Boolean);

    if (!cats().length) err.push('Add at least one finished-goods category');

    const banks = d.bank.filter(b => (b.name || '').trim());
    banks.forEach((b, i) => { if (!b.name) err.push('Bank row ' + (i + 1) + ': name missing'); });

    const custs = d.cust.filter(c => (c.name || '').trim());
    custs.forEach((c, i) => { if (!c.name) err.push('Customer row ' + (i + 1) + ': name missing'); });

    const supps = d.supp.filter(s => (s.name || '').trim());

    const arts = d.art.filter(a => (a.art || '').trim());
    const seenA = new Set();
    arts.forEach((a, i) => {
      const n = 'Article row ' + (i + 1) + ': ';
      if (!a.art) err.push(n + 'article no missing');
      else if (seenA.has(a.art.toUpperCase())) err.push(n + a.art + ' repeated');
      seenA.add((a.art || '').toUpperCase());
      if (!a.name) err.push(n + 'name missing');
      const sizes = E.expandSizes(a.run || '');
      if (!sizes.length) err.push(n + 'size run missing (use 36-41 or 6,7,8,9)');
      if (!list(a.cols).length) err.push(n + 'no colours');
      if (+a.opening > 0 && !(+a.cost > 0)) err.push(n + 'opening packs need a cost per pack');
    });

    const mats = d.mat.filter(m => (m.code || '').trim());
    const seenM = new Set();
    mats.forEach((m, i) => {
      const n = 'Material row ' + (i + 1) + ': ';
      if (!m.code) err.push(n + 'code missing');
      else if (seenM.has(m.code.toUpperCase())) err.push(n + m.code + ' repeated');
      seenM.add((m.code || '').toUpperCase());
      if (!m.name) err.push(n + 'name missing');
      if (!(+m.buy > 0)) err.push(n + 'purchase price missing');
    });

    const opsList = d.ops.filter(o => (o.name || '').trim());
    opsList.forEach((o, i) => {
      if (!o.name) err.push('Operation ' + (i + 1) + ': name missing');
      if (!(+o.rate > 0)) err.push('Operation ' + (i + 1) + ': rate missing');
    });

    const emps = d.emp.filter(e => (e.name || '').trim());
    emps.forEach((e, i) => {
      if (!e.name) err.push('Employee ' + (i + 1) + ': name missing');
      if (!(+e.rate > 0)) err.push('Employee ' + (i + 1) + ': rate missing');
    });

    const boms = (d.bom || []).filter(b => (b.art || '').trim() || (b.material || '').trim() || (+b.qty > 0));
    boms.forEach((b, i) => {
      if (!b.art) err.push('BOM ' + (i + 1) + ': choose article');
      if (!b.material) err.push('BOM ' + (i + 1) + ': choose material');
      if (!(+b.qty > 0)) err.push('BOM ' + (i + 1) + ': qty missing');
    });

    const bankOpen = banks.reduce((s, b) => s + Math.round((+b.opening || 0) * 100), 0);
    const custOpen = custs.reduce((s, c) => s + Math.round((+c.opening || 0) * 100), 0);
    const suppOpen = supps.reduce((s, s2) => s + Math.round((+s2.opening || 0) * 100), 0);
    const fgOpen = arts.reduce((s, a) => {
      const pairsPerPack = E.expandSizes(a.run || '').length;
      return s + Math.round((+a.opening || 0) * list(a.cols).length * pairsPerPack > 0 ? (+a.opening || 0) * list(a.cols).length * (+a.cost || 0) * 100 : 0);
    }, 0);
    /* simpler: cost per pack × packs × colours */
    const fgOpenFixed = arts.reduce((s, a) => s + Math.round((+a.opening || 0) * list(a.cols).length * (+a.cost || 0) * 100), 0);
    const rmOpen = mats.reduce((s, m) => s + Math.round((+m.opening || 0) * (+m.buy || 0) * 100), 0);
    const advOpen = emps.reduce((s, e) => s + Math.round((+e.advance || 0) * 100), 0);
    const artColours = arts.reduce((s, a) => s + list(a.cols).length, 0);

    return {
      err,
      bank: banks, bankCount: banks.length, bankOpen,
      cust: custs, custCount: custs.length, custOpen,
      supp: supps, suppCount: supps.length, suppOpen,
      art: arts, artCount: arts.length, artColours, fgOpen: fgOpenFixed,
      mat: mats, matCount: mats.length, rmOpen,
      ops: opsList, opsCount: opsList.length,
      emp: emps, empCount: emps.length, advOpen,
      bom: boms, bomCount: boms.length
    };
  }

  E.A.wzDo = async () => {
    try {
      if (!E.$('wz_ok').checked) throw new Error('Tick the confirmation box first');
      const c = check();
      if (c.err.length) throw new Error('Fix the listed problems first');

      const d = draft();
      const today = E.today();

      await E.setSetting({ fgCats: cats(), packSize: parseInt(d.biz.pack) || 6 });

      /* Banks */
      let nextCode = 1101;
      for (const b of c.bank) {
        while (E.acct(String(nextCode))) nextCode++;
        const code = String(nextCode++);
        await E.save('coa', {
          id: E.fid + '-' + code, factoryId: E.fid, code,
          name: b.name || 'Account', type: 'asset',
          bank: b.kind === 'Cash' ? 0 : 1, kind: b.kind === 'Cash' ? 'cash' : 'bank',
          custom: true,
          bankName: b.bankName || '', acctNo: b.acctNo || ''
        });
        if (+b.opening > 0) {
          b._code = code;
          b._open = Math.round((+b.opening) * 100);
        }
      }
      if (!E.acct('1000')) {
        await E.save('coa', { id: E.fid + '-1000', factoryId: E.fid, code: '1000', name: 'Cash in Hand', type: 'asset', bank: 1, kind: 'cash' });
      }

      /* Customers */
      const custIds = {};
      for (const cu of c.cust) {
        const p = await E.save('parties', {
          active: true, code: await E.next('PTY'), name: cu.name,
          type: 'Customer', phone: cu.phone || '', addr: '',
          limit: Math.round((+cu.limit || 0) * 100), days: parseInt(cu.days) || 0
        });
        custIds[cu.name] = p.id;
        if (+cu.opening > 0) {
          cu._pid = p.id;
          cu._open = Math.round((+cu.opening) * 100);
        }
      }

      /* Suppliers */
      const suppIds = {};
      for (const sp of c.supp) {
        const p = await E.save('parties', {
          active: true, code: await E.next('PTY'), name: sp.name,
          type: 'Supplier', phone: sp.phone || '', addr: '',
          limit: 0, days: parseInt(sp.days) || 0
        });
        suppIds[sp.name] = p.id;
        if (+sp.opening > 0) {
          sp._pid = p.id;
          sp._open = Math.round((+sp.opening) * 100);
        }
      }

      /* Articles — USE expandSizes */
      const fgMoves = [];
      for (const a of c.art) {
        const artUp = a.art.trim().toUpperCase();
        if (E.rows('items').some(i => i.art === artUp)) continue;
        const run = E.expandSizes(a.run || '');          /* ← expand 36-41 to 6 sizes */
        const it = await E.save('items', {
          art: artUp, name: a.name.trim(), cat: 'Finished Good',
          sub: a.cat, unit: 'Pack', pack: run.length,
          sizeRun: run.join(','), price: Math.round((+a.price || 0) * 100),
          buyPrice: 0, min: 0, active: true
        });
        await E.genPacks(it, (a.cols || '').split(',').map(x => x.trim()).filter(Boolean));
        const vs = E.rows('variants').filter(v => v.itemId === it.id);
        if (+a.opening > 0 && +a.cost > 0) {
          vs.forEach(v => fgMoves.push({
            itemId: it.id, variantId: v.id,
            qty: +a.opening,
            value: Math.round((+a.opening) * (+a.cost) * 100)
          }));
        }
      }

      /* Materials */
      const rmMoves = [];
      for (const m of c.mat) {
        const codeUp = m.code.trim().toUpperCase();
        if (E.rows('items').some(i => i.art === codeUp)) continue;
        const supName = (m.sup || '').trim();
        const supId = supName ? (suppIds[supName] || '') : '';
        const it = await E.save('items', {
          art: codeUp, name: m.name.trim(), cat: m.type,
          sub: '', unit: m.unit, pack: 0, sizeRun: '',
          price: 0, buyPrice: Math.round((+m.buy || 0) * 100),
          supId, spec: '', min: +m.min || 0, active: true
        });
        if (+m.opening > 0) {
          rmMoves.push({
            itemId: it.id, variantId: '',
            qty: +m.opening,
            value: Math.round((+m.opening) * (+m.buy) * 100)
          });
        }
      }

      /* Operations */
      let oi = E.rows('operations').length;
      for (const o of c.ops) {
        if (E.rows('operations').some(x => x.name.toLowerCase() === o.name.trim().toLowerCase())) continue;
        await E.save('operations', {
          code: 'OP' + String(++oi).padStart(2, '0'),
          name: o.name.trim(), order: oi,
          rate: Math.round((+o.rate) * 100), active: true
        });
      }

      /* Employees */
      const advList = [];
      for (const e of c.emp) {
        const typeMap = { 'Wage': 'Wage', 'Daily Salaried': 'DailySalaried', 'Monthly Salaried': 'MonthlySalaried' };
        const emp = await E.save('employees', {
          active: true, code: await E.next('EMP'),
          name: e.name.trim(), nic: (e.nic || '').trim(), phone: e.phone || '',
          join: today,
          payType: typeMap[e.type] || 'Wage',
          amount: Math.round((+e.rate) * 100),
          allow: e.type === 'Monthly Salaried' ? Math.round((+e.allow || 0) * 100) : 0,
          piece: e.piece === 'Yes',
          epf: e.epf !== 'No',
          target: 'OH', advInstall: 0
        });
        if (+e.advance > 0) advList.push({ e: emp, a: Math.round((+e.advance) * 100) });
      }

      /* BOMs */
      for (const b of c.bom) {
        const art = b.art.trim().toUpperCase();
        const materialCode = b.material.trim().toUpperCase();
        const it = E.rows('items').find(i => i.art === art && i.cat === 'Finished Good');
        const mat = E.rows('items').find(i => i.art === materialCode && i.cat !== 'Finished Good');
        if (!it || !mat) continue;
        const bl = JSON.parse(JSON.stringify(it));
        it.bom = it.bom || [];
        it.bom.push({ itemId: mat.id, variantId: '', qty: +b.qty });
        await E.save('items', it, bl);
      }

      /* POST OPENING BALANCES */

      const bankWithOpen = c.bank.filter(b => b._code && b._open > 0);
      if (bankWithOpen.length) {
        const no = await E.next('OPN');
        const total = bankWithOpen.reduce((s, b) => s + b._open, 0);
        const lines = bankWithOpen.map(b => ({ acc: b._code, dr: b._open }));
        lines.push({ acc: '3000', cr: total });
        await E.post({ date: today, ref: no, narr: 'Opening cash & bank (setup wizard)', source: 'opening', lines });
      }

      const custWithOpen = c.cust.filter(x => x._pid && x._open > 0);
      for (const cu of custWithOpen) {
        const no = await E.next('INV');
        const je = await E.post({ date: today, ref: no, narr: 'Opening balance · ' + cu.name, source: 'opening', lines: [{ acc: '1200', dr: cu._open }, { acc: '3000', cr: cu._open }] });
        await E.save('invoices', { no, date: today, partyId: cu._pid, dnIds: [], gross: cu._open, disc: 0, total: cu._open, paid: 0, jeId: je.id, cancelled: false, opening: true, ref: 'Opening' });
      }

      const suppWithOpen = c.supp.filter(x => x._pid && x._open > 0);
      for (const sp of suppWithOpen) {
        const no = await E.next('PUR');
        const je = await E.post({ date: today, ref: no, narr: 'Opening balance · ' + sp.name, source: 'opening', lines: [{ acc: '3000', dr: sp._open }, { acc: '2000', cr: sp._open }] });
        await E.save('purchases', { no, date: today, partyId: sp._pid, invNo: 'Opening', lines: [], total: sp._open, paid: 0, jeId: je.id, cancelled: false, opening: true });
      }

      if (rmMoves.length) {
        const tot = rmMoves.reduce((s, m) => s + m.value, 0);
        const no = await E.next('OPN');
        await E.post({ date: today, ref: no, narr: 'Opening stock — materials (setup wizard)', source: 'opening', lines: [{ acc: '1300', dr: tot }, { acc: '3200', cr: tot }] });
        for (const m of rmMoves) {
          await E.stockIn({ date: today, itemId: m.itemId, variantId: m.variantId, qty: m.qty, value: m.value, type: 'open', ref: no });
        }
      }

      if (fgMoves.length) {
        const tot = fgMoves.reduce((s, m) => s + m.value, 0);
        const no = await E.next('OPN');
        await E.post({ date: today, ref: no, narr: 'Opening stock — finished packs (setup wizard)', source: 'opening', lines: [{ acc: '1320', dr: tot }, { acc: '3200', cr: tot }] });
        for (const m of fgMoves) {
          await E.stockIn({ date: today, itemId: m.itemId, variantId: m.variantId, qty: m.qty, value: m.value, type: 'open', ref: no });
        }
      }

      if (advList.length) {
        const tot = advList.reduce((s, x) => s + x.a, 0);
        const no = await E.next('OPN');
        await E.post({ date: today, ref: no, narr: 'Opening staff advances (setup wizard)', source: 'opening', lines: [{ acc: '1250', dr: tot }, { acc: '3200', cr: tot }] });
        for (const x of advList) {
          await E.save('wageRuns', { no: await E.next('ADV'), kind: 'advance', empId: x.e.id, date: today, amount: x.a, note: 'Opening advance', cancelled: false });
        }
      }

      await E.setSetting({ setupDone: true });
      localStorage.removeItem(KEY());
      W = null;

      E.modal('🎉 Setup complete!', `
        <p style="margin-bottom:12px">Your factory is now fully set up and ready for daily transactions.</p>
        <div class="tw"><table><tbody>
          <tr><td>Bank & cash accounts</td><td class="r"><b>${c.bankCount}</b> (${E.m(c.bankOpen)})</td></tr>
          <tr><td>Customers</td><td class="r"><b>${c.custCount}</b> (${E.m(c.custOpen)} owing to you)</td></tr>
          <tr><td>Suppliers</td><td class="r"><b>${c.suppCount}</b> (${E.m(c.suppOpen)} you owe)</td></tr>
          <tr><td>Articles with colour packs</td><td class="r"><b>${c.artCount}</b> (${c.artColours} colour packs)</td></tr>
          <tr><td>Materials</td><td class="r"><b>${c.matCount}</b></td></tr>
          <tr><td>Operations</td><td class="r"><b>${c.opsCount}</b></td></tr>
          <tr><td>Employees</td><td class="r"><b>${c.empCount}</b></td></tr>
          <tr><td>BOMs</td><td class="r"><b>${c.bomCount}</b></td></tr>
        </tbody></table></div>
        <p class="muted" style="margin-top:14px"><b>What's next:</b></p>
        <ol class="muted" style="margin-left:20px;line-height:1.8">
          <li>Print barcode labels for your colour packs</li>
          <li>Create your first Purchase (buy materials)</li>
          <li>Create your first Job (customer order)</li>
          <li>Start a Material Batch (deduct materials)</li>
          <li>Log daily production</li>
        </ol>
        <p class="muted" style="margin-top:12px">Ask the AI Assistant (🤖 bottom-right) if you get stuck!</p>
      `, `<button class="btn p" data-a="wzFinish">Start working →</button>`);

      E.go();
    } catch (e) {
      E.toast(e.message, 'error');
    }
  };

  E.A.wzFinish = () => { E.closeM(); location.hash = '#/dashboard'; };

  E.maybeSetup = () => {
    if ((E.role === 'owner' || E.role === 'accountant')
        && !E.setting('setupDone')
        && !E.rows('items').length
        && location.hash !== '#/setup') {
      location.hash = '#/setup';
      E.toast('New factory — let\'s set it up first', 'success');
    }
  };
})(window.ERP);