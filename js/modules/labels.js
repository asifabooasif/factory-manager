/* Article labels — 24 per A4 sheet (3 columns x 8 rows, 70 x 37.125 mm) with small EAN-13 barcodes.
   - Replaces the old big-label printer (E.printLabels), so Items / Stock / Import-Export all print 24 per sheet.
   - New screen: Article Labels (pick packs and copies, preview, print).
   - After "Release Goods" on a job, asks: "Print the article labels now?" and fills in the released packs.
   Printing uses a preview inside the app and prints that preview, so it also works in the Windows app (no pop-up windows). */
(E => {
  const COLS = 3, ROWS = 8, PER = COLS * ROWS, MAXC = 500;
  const OPT_KEY = 'erp_lbl_opt';

  /* ---------- EAN-13 as a compact SVG ---------- */
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  function barcode(code) {
    code = String(code || '').trim();
    if (!/^\d{13}$/.test(code)) return '<div class="nb">' + E.esc(code || 'no barcode') + '</div>';
    let b = '101'; const p = P[+code[0]];
    for (let i = 1; i < 7; i++) b += (p[i - 1] === 'L' ? L : G)[+code[i]];
    b += '01010';
    for (let i = 7; i < 13; i++) b += R[+code[i]];
    b += '101';
    let d = '', i = 0;
    while (i < b.length) {
      if (b[i] === '1') { let j = i; while (j < b.length && b[j] === '1') j++; d += 'M' + (i + 7) + ',0h' + (j - i) + 'v26h-' + (j - i) + 'z'; i = j; } else i++;
    }
    return '<svg viewBox="0 0 109 34" shape-rendering="crispEdges"><path d="' + d + '" fill="#000"/><text x="54.5" y="33" font-size="8" text-anchor="middle" font-family="Arial,sans-serif">' + code + '</text></svg>';
  }

  /* ---------- one label ---------- */
  const cell = k => {
    if (!k) return '<div class="c"></div>';
    const run = (k.run || '').split(',').map(x => x.trim()).filter(Boolean).join(' · ');
    return '<div class="c"><div class="t"><span class="ar">' + E.esc(k.art || k.code || '') + '</span>' + (k.color ? '<span class="co">' + E.esc(k.color) + '</span>' : '') + '</div>'
      + (run ? '<div class="sz">' + E.esc(run) + '</div>' : '')
      + '<div class="bc">' + barcode(k.barcode) + '</div>'
      + (k.pairs ? '<div class="pk">' + E.esc(k.group || '') + ' · pack of ' + k.pairs + ' pairs</div>' : '') + '</div>';
  };

  const CSS = '@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}'
    + '.pg{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto;page-break-after:auto}'
    + '.gr{position:absolute;display:grid;grid-template-columns:repeat(' + COLS + ',70mm);grid-template-rows:repeat(' + ROWS + ',37.125mm)}'
    + '.c{padding:2mm 3mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center}'
    + '.g .c{outline:.2mm dashed #999;outline-offset:-.1mm}'
    + '.t{display:flex;align-items:baseline;justify-content:center;gap:2.5mm;width:100%;white-space:nowrap;overflow:hidden}'
    + '.ar{font-size:15pt;font-weight:900;line-height:1.05}.co{font-size:10pt;font-weight:700}'
    + '.sz{font-size:7pt;letter-spacing:.3pt;line-height:1.2;margin-top:.4mm;white-space:nowrap}'
    + '.bc svg{display:block;width:34mm;height:10.6mm;margin:1mm auto 0}.nb{font:8pt monospace;margin-top:1mm}'
    + '.pk{font-size:5.5pt;color:#333;margin-top:.3mm}'
    + '@media screen{body{background:#cfcfd6;padding:8px}.pg{zoom:.62;background:#fff;margin:0 auto 10px;box-shadow:0 1px 6px rgba(0,0,0,.3)}}';

  const getOpt = () => { let o = {}; try { o = JSON.parse(localStorage.getItem(OPT_KEY) || '{}'); } catch (e) {} return { dx: +o.dx || 0, dy: +o.dy || 0, guides: !!o.guides }; };
  const setOpt = o => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch (e) {} };

  function sheetHtml(cells, skip, o) {
    const all = Array(Math.max(0, skip)).fill(null).concat(cells), pages = [];
    for (let i = 0; i < all.length; i += PER) pages.push(all.slice(i, i + PER));
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body class="' + (o.guides ? 'g' : '') + '">'
      + pages.map(pg => { const f = pg.concat(Array(PER - pg.length).fill(null)); return '<div class="pg"><div class="gr" style="left:' + o.dx + 'mm;top:' + o.dy + 'mm">' + f.map(cell).join('') + '</div></div>'; }).join('') + '</body></html>';
  }

  /* ---------- preview + print window (inside the app) ---------- */
  let CUR = [];
  const readOpts = () => ({ skip: Math.min(PER - 1, Math.max(0, parseInt(E.val('lp_skip')) || 0)), o: { dx: parseFloat(E.val('lp_dx')) || 0, dy: parseFloat(E.val('lp_dy')) || 0, guides: !!(E.$('lp_g') && E.$('lp_g').checked) } });
  function refresh() {
    const f = E.$('lp_f'); if (!f) return;
    const { skip, o } = readOpts(), pages = Math.max(1, Math.ceil((CUR.length + skip) / PER));
    f.srcdoc = sheetHtml(CUR, skip, o);
    E.$('lp_info').innerHTML = '<b>' + CUR.length + '</b> label' + (CUR.length === 1 ? '' : 's') + ' · <b>' + pages + '</b> A4 sheet' + (pages === 1 ? '' : 's') + ' (24 labels per sheet)';
  }
  function openSheet(cells) {
    if (!cells.length) return E.toast('Nothing to print — choose at least one label', 'error');
    CUR = cells; const o = getOpt();
    E.modal('Print article labels — 24 per A4 sheet', `
      <div id="lp_info" style="margin-bottom:8px"></div>
      <div class="g2" style="grid-template-columns:repeat(4,1fr)">
        <div class="f">Skip first labels<input id="lp_skip" type="number" min="0" max="${PER - 1}" value="0" title="Use when the sheet is already partly used"></div>
        <div class="f">Shift right (mm)<input id="lp_dx" type="number" step="0.5" value="${o.dx}"></div>
        <div class="f">Shift down (mm)<input id="lp_dy" type="number" step="0.5" value="${o.dy}"></div>
        <div class="f">Cut guides<label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input id="lp_g" type="checkbox" ${o.guides ? 'checked' : ''}> print dashed lines</label></div>
      </div>
      <iframe id="lp_f" title="Label preview" style="width:100%;height:430px;border:1px solid var(--bd);border-radius:8px;background:#fff;margin-top:8px"></iframe>
      <p class="muted" style="font-size:12px;margin-top:8px">In the print window choose <b>A4</b>, <b>Scale 100%</b> (not “fit to page”) and <b>Margins: None</b>. If the labels sit slightly off, use Shift right / Shift down and print again.</p>`,
      '<button class="btn" data-a="close">Close</button><button class="btn p" data-a="lpPrint">🖨 Print</button>', 1);
    refresh();
  }
  E.hooks.push(e => { if (e.target && e.target.id && e.target.id.startsWith('lp_') && e.target.id !== 'lp_f') refresh(); });
  E.A.lpPrint = () => {
    const f = E.$('lp_f'); if (!f || !f.contentWindow) return;
    const { o } = readOpts(); setOpt(o);
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { E.toast('Could not open the print window: ' + e.message, 'error'); }
  };

  /* expand [{k, n}] into one entry per printed label */
  const expand = list => { const out = []; list.forEach(x => { const n = Math.min(MAXC, Math.max(0, parseInt(x.n) || 0)); for (let i = 0; i < n; i++) out.push(x.k); }); return out; };

  /* the old API still works: E.printLabels(listOfPacks, copiesEach) */
  E.printLabels = (list, n) => { if (!list || !list.length) return E.toast('No finished-good packs found', 'error'); openSheet(expand(list.map(k => ({ k, n: n || 1 })))); };
  E.printLabelSheet = openSheet;

  /* ---------- Article Labels screen ---------- */
  const F = { q: '', g: '', n: {} };
  const key = k => k.itemId + '|' + (k.variantId || '');
  const packs = () => {
    const q = F.q.toLowerCase();
    return E.skuList(i => i.cat === 'Finished Good').filter(k => (!F.g || k.group === F.g) && (!q || (k.label + ' ' + k.color + ' ' + k.barcode).toLowerCase().includes(q)));
  };
  const total = () => Object.values(F.n).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const tbl = () => {
    const m = E.stockMap(), rows = packs();
    if (!rows.length) return '<p class="muted" style="padding:14px">No finished-good packs match. Add articles under Items first.</p>';
    return '<div class="tw"><table><thead><tr><th>Article</th><th>Colour</th><th>Size run</th><th>Barcode</th><th class="r">In stock (packs)</th><th class="r" style="width:110px">Labels to print</th></tr></thead><tbody>'
      + rows.map(k => { const s = m[key(k)] || { qty: 0 }; return '<tr><td><b>' + E.esc(k.art) + '</b> <span class="muted">' + E.esc(k.name) + '</span></td><td>' + E.esc(k.color || '') + '</td><td>' + E.esc(k.run || '') + '</td><td>' + E.esc(k.barcode || '—') + '</td><td class="r">' + s.qty + '</td><td class="r"><input type="number" min="0" max="' + MAXC + '" style="width:80px;text-align:right" data-lk="' + E.esc(key(k)) + '" value="' + (F.n[key(k)] || '') + '" placeholder="0"></td></tr>'; }).join('')
      + '</tbody></table></div>';
  };
  const totText = () => { const t = total(), s = Math.ceil(t / PER); return '<b>' + t + '</b> label' + (t === 1 ? '' : 's') + ' selected · ' + s + ' sheet' + (s === 1 ? '' : 's'); };
  const counter = () => { const el = E.$('lb_tot'); if (el) el.innerHTML = totText(); };
  const at = E.N.findIndex(n => n.id === 'items');
  E.N.splice(at < 0 ? E.N.length : at + 1, 0, { g: at < 0 ? 'Purchases & Stock' : E.N[at].g, id: 'labels', ico: '🏷', label: 'Article Labels' });
  E.route('labels', 'Article Labels', () => `
    <div class="card"><h3>Article labels — 24 per A4 sheet</h3>
      <p class="muted">One small label (article number, colour, size run, barcode) per colour pack. Type how many labels you need for each pack, then Preview &amp; print. Sheets of 24 (3 × 8) with a 70 × 37 mm label.</p>
      <div class="bar"><input class="fs" style="max-width:300px" placeholder="🔍 Search article, colour, barcode…" data-f="lb.q" value="${E.esc(F.q)}">
        <select class="fs" data-f="lb.g"><option value="">All categories</option>${E.fgCats().map(c => `<option ${F.g === c ? 'selected' : ''}>${E.esc(c)}</option>`).join('')}</select><span class="gap"></span>
        <span id="lb_tot" class="muted">${totText()}</span>
        <button class="btn" data-a="lbOne">1 each</button><button class="btn" data-a="lbStock">As per stock</button><button class="btn" data-a="lbClear">Clear</button>
        <button class="btn p" data-a="lbPrint">🏷 Preview &amp; print</button></div>
      <div id="lb_t">${tbl()}</div></div>`);
  E.hooks.push(e => {
    const t = e.target, f = t.dataset && t.dataset.f;
    if (f === 'lb.q' || f === 'lb.g') { F[f.slice(3)] = t.value; E.$('lb_t').innerHTML = tbl(); counter(); return; }
    if (t.dataset && t.dataset.lk !== undefined) { const v = Math.min(MAXC, Math.max(0, parseInt(t.value) || 0)); if (v) F.n[t.dataset.lk] = v; else delete F.n[t.dataset.lk]; counter(); }
  });
  const fill = fn => { packs().forEach(k => { const v = fn(k); if (v > 0) F.n[key(k)] = Math.min(MAXC, v); else delete F.n[key(k)]; }); E.$('lb_t').innerHTML = tbl(); counter(); };
  E.A.lbOne = () => fill(() => 1);
  E.A.lbStock = () => { const m = E.stockMap(); fill(k => Math.ceil(((m[key(k)] || { qty: 0 }).qty) - 0.0001)); };
  E.A.lbClear = () => { F.n = {}; E.$('lb_t').innerHTML = tbl(); counter(); };
  E.A.lbPrint = () => { const all = E.skuList(i => i.cat === 'Finished Good'); openSheet(expand(all.filter(k => F.n[key(k)]).map(k => ({ k, n: F.n[key(k)] })))); };

  /* ---------- ask after Release Goods ---------- */
  let ASK = [];
  function askPrint(jobId, rel) {
    const job = E.rows('jobs').find(j => j.id === jobId) || {}, skus = E.skuList();
    ASK = rel.map(r => {
      const l = r.l, k = skus.find(s => s.itemId === l.itemId && (s.variantId || '') === (l.variantId || '')) || { art: l.code, code: l.code, color: '', barcode: '', run: '' };
      return { k, packs: r.packs, n: Math.max(1, Math.ceil(r.packs - 0.0001)) };
    });
    E.modal('Goods released — print the article labels?', `
      <p style="margin-bottom:10px">${job.no ? '<b>' + E.esc(job.no) + '</b>: ' : ''}the goods are now in finished stock. Do you want to print the article labels now?<br><span class="muted">24 labels per A4 sheet, with small barcodes. Change the number of labels if you need more or fewer.</span></p>
      <div class="tw"><table><thead><tr><th>Article</th><th>Colour</th><th class="r">Packs released</th><th class="r" style="width:110px">Labels</th></tr></thead><tbody>`
      + ASK.map((x, i) => '<tr><td><b>' + E.esc(x.k.art || x.k.code) + '</b></td><td>' + E.esc(x.k.color || '') + '</td><td class="r">' + (Math.round(x.packs * 100) / 100) + '</td><td class="r"><input class="lpn" data-i="' + i + '" type="number" min="0" max="' + MAXC + '" value="' + x.n + '" style="width:80px;text-align:right"></td></tr>').join('')
      + '</tbody></table></div>',
      '<button class="btn" data-a="close">No, not now</button><button class="btn p" data-a="lpAsk">🏷 Yes, print labels</button>');
  }
  E.A.lpAsk = () => {
    const list = [...document.querySelectorAll('.lpn')].map(i => ({ k: ASK[+i.dataset.i].k, n: i.value }));
    const cells = expand(list);
    if (!cells.length) { E.closeM(); return; }
    openSheet(cells);
  };
  const orig = E.A.saveRel;
  if (orig && !orig.__lbl) {
    E.A.saveRel = async function (id) {
      const before = {}; E.rows('jobLines').filter(l => l.jobId === id).forEach(l => { before[l.id] = l.released || 0; });
      await orig.apply(this, arguments);
      const rel = []; E.rows('jobLines').filter(l => l.jobId === id).forEach(l => { const d = (l.released || 0) - (before[l.id] || 0); if (d > 0.0001) rel.push({ l, packs: d }); });
      if (rel.length) setTimeout(() => askPrint(id, rel), 60);
    };
    E.A.saveRel.__lbl = 1;
  }
})(window.ERP);
