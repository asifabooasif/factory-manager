/* REPORT SUITE — ENGINE
   One framework behind every report: period presets and comparatives, filters, column chooser, sorting, search, top-N,
   saved views, drill-down, print (with your logo), Excel and CSV. Reports are small builder functions registered with RS.add().
   Money is always whole cents. Every figure comes from the ledger, the stock moves or the document records - never from screen state. */
(E => {
  const RS = E.RS = { R: {}, G: [], P: {}, cur: '', hist: [], drills: [], cache: {} };

  /* ───────────────────────── dates ───────────────────────── */
  const pad = n => String(n).padStart(2, '0'), iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + (+n || 0)); return x.toISOString().slice(0, 10); };
  const monthEnd = d => { const [y, m] = d.split('-').map(Number); return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); };
  const addMonths = (d, n) => { const [y, m, dd] = d.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)), ty = t.getUTCFullYear(), tm = t.getUTCMonth() + 1, last = new Date(Date.UTC(ty, tm, 0)).getUTCDate(); return iso(ty, tm, Math.min(dd, last)); };
  const diff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const fyM = () => Math.min(12, Math.max(1, parseInt(E.setting('fyMonth')) || 1));
  const fyStart = off => { const t = E.today(), y = +t.slice(0, 4), m = +t.slice(5, 7), fm = fyM(); return iso((m >= fm ? y : y - 1) + (off || 0), fm, 1); };
  const fyEnd = off => addDays(addMonths(fyStart(off), 12), -1);
  const fyOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7), fm = fyM(); return iso(m >= fm ? y : y - 1, fm, 1); };
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monLabel = ym => MN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
  const monthsBetween = (from, to) => { const out = []; let c = from.slice(0, 7) + '-01'; while (c <= to) { out.push(c.slice(0, 7)); c = addMonths(c, 1); if (out.length > 60) break; } return out; };
  RS.dt = { pad, iso, addDays, addMonths, monthEnd, diff, fyStart, fyEnd, fyOf, fyM, MN, monLabel, monthsBetween };

  const PRESETS = [['td', 'Today'], ['mtd', 'This month'], ['lm', 'Last month'], ['qtd', 'This quarter'], ['lq', 'Last quarter'], ['fy', 'This financial year'], ['lfy', 'Last financial year'], ['l12', 'Last 12 months'], ['all', 'All dates'], ['cu', 'Custom dates']];
  function presetRange(k) {
    const t = E.today();
    if (k === 'td') return [t, t];
    if (k === 'mtd') return [t.slice(0, 8) + '01', t];
    if (k === 'lm') { const f = addMonths(t.slice(0, 8) + '01', -1); return [f, monthEnd(f)]; }
    if (k === 'qtd' || k === 'lq') {
      const fs = fyStart(0), mi = (+t.slice(0, 4) - +fs.slice(0, 4)) * 12 + (+t.slice(5, 7) - +fs.slice(5, 7)), q = Math.floor(mi / 3) - (k === 'lq' ? 1 : 0), f = addMonths(fs, q * 3);
      return [f, k === 'lq' ? monthEnd(addMonths(f, 2)) : t];
    }
    if (k === 'fy') return [fyStart(0), t];
    if (k === 'lfy') return [fyStart(-1), fyEnd(-1)];
    if (k === 'l12') return [addDays(addMonths(t, -12), 1), t];
    if (k === 'all') return ['2000-01-01', t];
    return null;
  }
  function cmpRange(from, to, mode) {
    if (!mode) return null;
    const aligned = from.slice(8) === '01' && to === monthEnd(to);
    if (mode === 'ly') return [addMonths(from, -12), aligned ? monthEnd(addMonths(to, -12)) : addMonths(to, -12)];
    if (aligned) { const n = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1; return [addMonths(from, -n), monthEnd(addMonths(to, -n))]; }
    const len = diff(from, to) + 1, t2 = addDays(from, -1); return [addDays(t2, -(len - 1)), t2];
  }
  /* as-at reports compare against: previous month end / same date last year / previous year end */
  function cmpAsat(d, mode) { if (!mode) return null; if (mode === 'ly') return addMonths(d, -12); if (mode === 'pm') return monthEnd(addMonths(d.slice(0, 8) + '01', -1)); return addDays(fyStart(0) > d ? fyOf(d) : fyOf(d), -1); }
  RS.cmpRange = cmpRange; RS.cmpAsat = cmpAsat; RS.presetRange = presetRange;
  RS.periodLabel = (f, t) => (f === t ? t : f + ' to ' + t);

  /* ───────────────────────── formatting ───────────────────────── */
  const n2 = c => (Math.abs(c) / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qf = v => { const x = Math.round((+v || 0) * 1000) / 1000; return x.toLocaleString('en-LK', { maximumFractionDigits: 3 }); };
  RS.fmt = (v, t, o) => {
    if (v == null || v === '') return '';
    if (t === 'money') { v = Math.round(+v); return v === 0 ? (o && o.zero ? '0.00' : '') : (v < 0 ? '-' : '') + n2(v); }
    if (t === 'bal') { v = Math.round(+v); return v === 0 ? '' : n2(v) + (v > 0 ? ' Dr' : ' Cr'); }
    if (t === 'qty') { return +v === 0 ? '' : qf(v); }
    if (t === 'int') { return +v === 0 ? '' : String(Math.round(+v)); }
    if (t === 'pct') { return (Math.round(+v * 10) / 10).toFixed(1) + '%'; }
    if (t === 'days') { return String(Math.round(+v)); }
    if (t === 'x') { return (Math.round(+v * 100) / 100).toFixed(2); }
    return String(v);
  };
  /* raw value for Excel / CSV: money in rupees, balances signed */
  RS.raw = (v, t) => {
    if (v == null || v === '') return '';
    if (t === 'money' || t === 'bal') return (Math.round(+v) / 100).toFixed(2);
    if (t === 'qty') return String(Math.round(+v * 1000) / 1000);
    if (t === 'pct' || t === 'x') return String(Math.round(+v * 100) / 100);
    return String(v);
  };
  const isNum = t => ['money', 'bal', 'qty', 'int', 'pct', 'days', 'x'].includes(t);

  /* ───────────────────────── registry ───────────────────────── */
  RS.groups = [
    ['fin', '📈', 'Financial statements', 'Trial balance, profit & loss, balance sheet, cash flow, ledgers and ratios'],
    ['ar', '🧾', 'Receivables & payables', 'Ageing with dates, open invoices and bills, statements, collections, cheques'],
    ['stk', '📦', 'Inventory & stock', 'Valuation, value by source, movements, item cards, reorder, ageing, consumption'],
    ['sal', '🛒', 'Sales', 'Item wise, category wise, customer wise, monthly trend, margins, returns, price analysis'],
    ['pur', '🚚', 'Purchases', 'Supplier wise, item wise, price comparison, purchase register, returns'],
    ['prd', '🏭', 'Production & costing', 'Production account, job costing, WIP, output, operations, overheads, wastage, BOM variance'],
    ['ppl', '👷', 'People & payroll', 'Payroll register, earnings, attendance, advances and loans, labour cost'],
    ['exp', '💼', 'Expenses, assets & funding', 'Expense analysis, budget vs actual, fixed assets, loans'],
    ['ctl', '🛡️', 'Control & audit', 'Reconciliations, abnormal balances, audit trail, period locks']
  ];
  RS.add = spec => { spec.g = spec.g || 'fin'; RS.R[spec.id] = spec; };

  /* ───────────────────────── caches / data access ───────────────────────── */
  RS.clear = () => { RS.cache = {}; };
  RS.memo = (k, fn) => (k in RS.cache ? RS.cache[k] : (RS.cache[k] = fn()));

  /* ───────────────────────── parameters ───────────────────────── */
  function defaults(spec) {
    const [f, t] = presetRange(spec.preset || 'fy');
    const P = { preset: spec.preset || 'fy', from: f, to: t, asat: E.today(), cmp: '', party: '', item: '', cat: '', acct: '', job: '', emp: '', bank: '', src: '', status: '', mode: '', gb: '', detail: false, zero: false, top: '', q: '', sort: null, hide: {}, ptitle: '', open: false, extra: {} };
    if (spec.gb && spec.gb.length) P.gb = spec.gb[0][0];
    if (spec.modes && spec.modes.length) P.mode = spec.modes[0][0];
    (spec.f || []).forEach(x => { if (typeof x === 'object' && x.k) P.extra[x.k] = x.def != null ? x.def : ''; });
    return Object.assign(P, spec.def || {});
  }
  RS.params = id => RS.P[id] || (RS.P[id] = defaults(RS.R[id]));
  RS.reset = id => { delete RS.P[id]; };

  /* ───────────────────────── choice lists ───────────────────────── */
  const parties = type => E.rows('parties').filter(p => !type || p.type === type || p.type === 'Both').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const items = f => E.rows('items').filter(f || (() => 1)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const catList = () => [...new Set(E.rows('items').map(i => i.cat === 'Finished Good' ? (i.sub || 'Other (finished goods)') : i.cat))].sort();
  const opt = (v, l, sel) => `<option value="${E.esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${E.esc(l)}</option>`;
  const sel = (key, label, list, cur, all) => `<label class="rsf"><span>${label}</span><select class="fs" data-rs="${key}">${all === false ? '' : opt('', all || 'All', cur)}${list.map(x => opt(x[0], x[1], cur)).join('')}</select></label>`;
  const SRC = { manual: 'Manual journal', purchase: 'Purchases', payment: 'Supplier payments', receipt: 'Customer receipts', sale: 'Sales / returns', issue: 'Material issues', release: 'Production release', production: 'Piece-rate production', payroll: 'Payroll', expense: 'Expenses', petty: 'Petty cash', adjust: 'Stock adjustments', opening: 'Opening balances', asset: 'Fixed assets', loan: 'Loans', cheque: 'Cheques', advance: 'Advances', voucher: 'Vouchers', jobcost: 'Job costs', reversal: 'Reversals', writeoff: 'Write-offs', cleanup: 'Clean-up', server: 'System' };
  RS.srcName = s => SRC[s] || s || 'Manual journal';

  function filterBar(spec, P) {
    const h = [], F = spec.f || [], has = k => F.includes(k);
    if (has('range')) h.push(`<label class="rsf"><span>Period</span><select class="fs" data-rs="preset">${PRESETS.map(x => opt(x[0], x[1], P.preset)).join('')}</select></label>` +
      `<label class="rsf"><span>From</span><input class="fs" type="date" data-rs="from" value="${P.from}"></label><label class="rsf"><span>To</span><input class="fs" type="date" data-rs="to" value="${P.to}"></label>`);
    if (has('asat')) h.push(`<label class="rsf"><span>As at</span><input class="fs" type="date" data-rs="asat" value="${P.asat}"></label>`);
    if (has('cmp')) h.push(sel('cmp', 'Compare with', [['prev', 'Previous period'], ['ly', 'Same period last year']], P.cmp, 'No comparison'));
    if (has('cmpa')) h.push(sel('cmp', 'Compare with', [['pm', 'Previous month end'], ['ly', 'Same date last year'], ['fy', 'Last financial year end']], P.cmp, 'No comparison'));
    if (has('mode') && spec.modes) h.push(sel('mode', 'Format', spec.modes, P.mode, false));
    if (has('gb') && spec.gb) h.push(sel('gb', 'Group by', spec.gb, P.gb, false));
    if (has('cust')) h.push(sel('party', 'Customer', parties('Customer').map(p => [p.id, p.name]), P.party, 'All customers'));
    if (has('supp')) h.push(sel('party', 'Supplier', parties('Supplier').map(p => [p.id, p.name]), P.party, 'All suppliers'));
    if (has('party')) h.push(sel('party', 'Party', parties().map(p => [p.id, p.name]), P.party, 'All parties'));
    if (has('item')) h.push(sel('item', 'Item', items().map(i => [i.id, (i.art ? i.art + ' · ' : '') + i.name]), P.item, 'All items'));
    if (has('mat')) h.push(sel('item', 'Material', items(i => i.cat !== 'Finished Good').map(i => [i.id, (i.art ? i.art + ' · ' : '') + i.name]), P.item, 'All materials'));
    if (has('fg')) h.push(sel('item', 'Article', items(i => i.cat === 'Finished Good').map(i => [i.id, (i.art ? i.art + ' · ' : '') + i.name]), P.item, 'All articles'));
    if (has('cat')) h.push(sel('cat', 'Category', catList().map(c => [c, c]), P.cat, 'All categories'));
    if (has('acct')) h.push(`<label class="rsf"><span>Account</span><select class="fs" data-rs="acct" style="max-width:260px">${opt('', 'All accounts', P.acct)}${E.rows('coa').slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => opt(a.code, a.code + ' · ' + a.name, P.acct)).join('')}</select></label>`);
    if (has('acct1')) h.push(`<label class="rsf"><span>Account *</span><select class="fs" data-rs="acct" style="max-width:280px">${opt('', 'Choose account…', P.acct)}${E.rows('coa').slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => opt(a.code, a.code + ' · ' + a.name, P.acct)).join('')}</select></label>`);
    if (has('job')) h.push(sel('job', 'Job', E.rows('jobs').slice().sort((a, b) => (b.no || '').localeCompare(a.no || '')).map(j => [j.id, j.no + (j.status ? ' · ' + j.status : '')]), P.job, 'All jobs'));
    if (has('job1')) h.push(sel('job', 'Job *', E.rows('jobs').slice().sort((a, b) => (b.no || '').localeCompare(a.no || '')).map(j => [j.id, j.no + (j.status ? ' · ' + j.status : '')]), P.job, 'Choose job…'));
    if (has('emp')) h.push(sel('emp', 'Employee', E.rows('employees').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(e => [e.id, (e.code ? e.code + ' · ' : '') + e.name]), P.emp, 'All employees'));
    if (has('bank')) h.push(sel('bank', 'Bank / cash account', E.rows('coa').filter(a => a.bank).sort((a, b) => a.code.localeCompare(b.code)).map(a => [a.code, a.code + ' · ' + a.name]), P.bank, 'All'));
    if (has('src')) h.push(sel('src', 'Source', Object.keys(SRC).map(k => [k, SRC[k]]), P.src, 'All sources'));
    F.forEach(x => {
      if (typeof x !== 'object' || !x.k) return; const o = typeof x.o === 'function' ? x.o() : x.o;
      h.push(o ? `<label class="rsf"><span>${x.l}</span><select class="fs" data-rs="x:${x.k}">${x.all === false ? '' : opt('', x.all || 'All', P.extra[x.k])}${o.map(q => opt(q[0], q[1], P.extra[x.k])).join('')}</select></label>`
        : `<label class="rsf"><span>${x.l}</span><input class="fs" ${x.text ? '' : 'type="number"'} style="width:${x.text ? 150 : 90}px" data-rs="x:${x.k}" value="${E.esc(P.extra[x.k])}"></label>`);
    });
    return h.join('');
  }

  /* ───────────────────────── saved views ───────────────────────── */
  const VIEWKEYS = ['preset', 'from', 'to', 'cmp', 'party', 'item', 'cat', 'acct', 'job', 'emp', 'bank', 'src', 'status', 'mode', 'gb', 'detail', 'zero', 'top', 'q', 'sort', 'hide', 'ptitle', 'extra'];
  const views = () => { const v = E.setting('rsViews'); return v && typeof v === 'object' ? v : {}; };
  RS.saveView = async (id, name) => {
    const P = RS.params(id), snap = {}; VIEWKEYS.forEach(k => snap[k] = JSON.parse(JSON.stringify(P[k] == null ? '' : P[k])));
    if (snap.preset !== 'cu') { delete snap.from; delete snap.to; }
    const all = JSON.parse(JSON.stringify(views())); (all[id] = all[id] || {})[name] = snap; await E.setSetting({ rsViews: all });
  };
  RS.delView = async (id, name) => { const all = JSON.parse(JSON.stringify(views())); if (all[id]) delete all[id][name]; await E.setSetting({ rsViews: all }); };
  RS.loadView = (id, name) => { const v = (views()[id] || {})[name]; if (!v) return; const P = RS.params(id); Object.assign(P, JSON.parse(JSON.stringify(v))); if (P.preset !== 'cu') { const r = presetRange(P.preset); if (r) { P.from = r[0]; P.to = r[1]; } } };
  const pins = () => { const p = E.setting('rsPins'); return Array.isArray(p) ? p : []; };

  /* ───────────────────────── model → table ───────────────────────── */
  function cellVal(c) { return c && typeof c === 'object' && 'v' in c ? c.v : c; }
  function visibleCols(m, P) { return m.cols.filter(c => !(P.hide || {})[c.k]); }
  /* flat models: apply search, sort and top-N, then auto totals */
  function prepare(m, P) {
    let rows = m.rows.slice();
    if (m.flat) {
      const q = (P.q || '').trim().toLowerCase();
      if (q) rows = rows.filter(r => m.cols.some(c => !isNum(c.t) && String(cellVal(r.c[c.k]) == null ? '' : cellVal(r.c[c.k])).toLowerCase().includes(q)));
      if (P.sort && m.cols.some(c => c.k === P.sort.k)) {
        const col = m.cols.find(c => c.k === P.sort.k), dir = P.sort.dir === 'desc' ? -1 : 1;
        rows.sort((a, b) => { const x = cellVal(a.c[col.k]), y = cellVal(b.c[col.k]); return (isNum(col.t) ? (+x || 0) - (+y || 0) : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true })) * dir; });
      }
      const top = parseInt(P.top); if (top > 0) rows = rows.slice(0, top);
    }
    let foot = m.foot;
    if (m.flat && m.foot !== false) {
      foot = {}; m.cols.forEach((c, i) => {
        if (i === 0) { foot[c.k] = rows.length + ' line' + (rows.length === 1 ? '' : 's'); return; }
        if (c.f) foot[c.k] = c.f(rows); else if (isNum(c.t) && c.tot !== false && c.t !== 'pct' && c.t !== 'days' && c.t !== 'x' && c.t !== 'bal') foot[c.k] = rows.reduce((s, r) => s + (+cellVal(r.c[c.k]) || 0), 0);
        else if (c.t === 'bal' && c.tot !== false) foot[c.k] = rows.reduce((s, r) => s + (+cellVal(r.c[c.k]) || 0), 0);
      });
    }
    return { rows, foot };
  }
  /* a cell may carry its own type ({v, t}) so one column can mix money, percentages and days (ratios) */
  function cellHtml(c, v, o) {
    const val = cellVal(v), cls = (v && typeof v === 'object' && v.cls) || '', tt = (v && typeof v === 'object' && v.t) || c.t;
    if (isNum(tt)) return `<td class="r ${cls} ${tt === 'money' && val < 0 ? 'bad' : ''}">${RS.fmt(val, tt, o)}</td>`;
    return `<td class="${cls}">${E.esc(val == null ? '' : val)}</td>`;
  }
  function tableHtml(m, P, print) {
    const cols = visibleCols(m, P), { rows, foot } = prepare(m, P);
    RS.drills = print ? RS.drills : [];
    const head = cols.map(c => {
      const so = P.sort && P.sort.k === c.k ? (P.sort.dir === 'desc' ? ' ▾' : ' ▴') : '';
      return `<th class="${isNum(c.t) ? 'r' : ''} ${m.flat && !print ? 'srt' : ''}" ${m.flat && !print ? `data-a="rsSort" data-id="${c.k}"` : ''} ${c.w ? `style="min-width:${c.w}px"` : ''}>${E.esc(c.l)}${so}</th>`;
    }).join('');
    const body = rows.map(r => {
      const k = r.k || 'd';
      if (k === 'h') return `<tr class="rsh"><td colspan="${cols.length}">${E.esc(cellVal(r.c[cols[0].k]) || r.t || '')}</td></tr>`;
      if (k === 'sp') return `<tr class="rssp"><td colspan="${cols.length}"></td></tr>`;
      let at = '';
      if (r.drill && !print) { RS.drills.push(r.drill); at = ` data-a="rsDrill" data-id="${RS.drills.length - 1}" style="cursor:pointer"`; }
      return `<tr class="rs${k} ${r.cls || ''}"${at}>${cols.map((c, i) => { const h = cellHtml(c, r.c[c.k], { zero: k === 't' }); return i === 0 && r.i ? h.replace('<td', `<td style="padding-left:${12 + r.i * 16}px"`) : h; }).join('')}</tr>`;
    }).join('') || `<tr><td colspan="${cols.length}" class="muted">Nothing found for this selection</td></tr>`;
    const ft = foot && Object.keys(foot).length ? `<tfoot><tr class="rst">${cols.map((c, i) => { const v = foot[c.k]; return isNum(c.t) ? `<td class="r">${v == null ? '' : RS.fmt(v, c.t, { zero: true })}</td>` : `<td>${i === 0 && typeof v === 'string' ? E.esc(v) : (v == null ? '' : E.esc(v))}</td>`; }).join('')}</tr></tfoot>` : '';
    return `<div class="tw rsw"><table class="rst ${print ? 'it cmp' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${ft}</table></div>`;
  }
  RS.tableHtml = tableHtml;

  function build(id) {
    const spec = RS.R[id], P = RS.params(id);
    RS.clear();
    const m = spec.build(P, spec);
    if (!m) return { cols: [], rows: [], note: 'Choose the required selection above.' };
    return m;
  }

  /* ───────────────────────── page ───────────────────────── */
  function chip(label, kind) { return `<span class="tag" style="${kind === 'bad' ? 'background:#fee2e2;color:#b91c1c' : kind === 'ok' ? 'background:#dcfce7;color:#166534' : ''}">${label}</span>`; }
  function bodyOut(id) {
    const spec = RS.R[id], P = RS.params(id);
    let m; try { m = build(id); } catch (e) { console.error(e); return `<div class="card bad">This report could not be built: ${E.esc(e.message)}</div>`; }
    const kp = (m.kpis || []).length ? `<div class="kp">${m.kpis.map(k => E.kpi(E.esc(k[0]), k[1], k[2] || '')).join('')}</div>` : '';
    const checks = (m.checks || []).length ? `<div class="card" style="padding:12px 16px">${m.checks.map(c => `<div style="margin:3px 0">${c[0] ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'} <b>${E.esc(c[1])}</b> <span class="muted">${E.esc(c[2] || '')}</span></div>`).join('')}</div>` : '';
    const notes = (m.notes || []).map(n => `<p class="muted" style="margin:4px 0">${n}</p>`).join('');
    const warn = E.sentinel && E.sentinel.banner ? E.sentinel.banner(id, spec.g) : '';
    return `${warn}${m.title ? `<div class="rsttl"><b>${E.esc(m.title)}</b><span class="muted"> ${E.esc(m.sub || '')}</span></div>` : ''}${kp}${tableHtml(m, P)}${checks}${notes}`;
  }
  function customize(spec, P, m) {
    const cols = m ? m.cols.filter(c => !c.always) : [];
    return `<div class="card rscz"><div class="g2">
      <div><h4>Columns to show</h4><div class="rscols">${cols.map(c => `<label><input type="checkbox" data-rs="col:${c.k}" ${(P.hide || {})[c.k] ? '' : 'checked'}> ${E.esc(c.l)}</label>`).join('') || '<span class="muted">This report has fixed columns.</span>'}</div></div>
      <div><h4>Display</h4>
        ${spec.f && spec.f.includes('detail') ? `<label class="rsc"><input type="checkbox" data-rs="detail" ${P.detail ? 'checked' : ''}> ${E.esc(spec.detailLabel || 'Show every document / line')}</label>` : ''}
        ${spec.f && spec.f.includes('zero') ? `<label class="rsc"><input type="checkbox" data-rs="zero" ${P.zero ? 'checked' : ''}> Include zero balances</label>` : ''}
        ${m && m.flat ? `<label class="rsf"><span>Show only top</span><input class="fs" type="number" min="0" style="width:90px" data-rs="top" value="${E.esc(P.top)}" placeholder="all"></label>` : ''}
        <label class="rsf"><span>Print heading (optional)</span><input class="fs" data-rs="ptitle" value="${E.esc(P.ptitle)}" placeholder="e.g. Prepared for the directors"></label>
        <div class="bar" style="margin-top:8px"><button class="btn sm" data-a="rsReset">↺ Reset this report</button>${P.sort ? '<button class="btn sm" data-a="rsUnsort">Clear sorting</button>' : ''}</div>
      </div></div></div>`;
  }
  function viewsMenu(id) {
    const v = views()[id] || {}, names = Object.keys(v).sort();
    return `<div class="card rscz"><h4>Saved views for this report</h4><p class="muted">A view remembers the period setting, filters, grouping, columns and sorting so a report you run every week opens exactly the way you like it. Views are saved for all devices.</p>
      <div class="bar">${names.map(n => `<span class="tag" style="padding:5px 10px"><a data-a="rsLoadView" data-id="${E.esc(n)}" style="cursor:pointer">${E.esc(n)}</a> <a data-a="rsDelView" data-id="${E.esc(n)}" style="cursor:pointer;color:#b91c1c;margin-left:6px" title="Delete view">✕</a></span>`).join('') || '<span class="muted">No saved views yet.</span>'}</div>
      <div class="bar"><input class="fs" id="rs_vn" placeholder="Name this view…" style="min-width:220px"><button class="btn p" data-a="rsSaveView">💾 Save current settings</button></div></div>`;
  }
  RS.view = () => {
    const id = RS.cur, spec = RS.R[id], P = RS.params(id);
    if (E.$('pt')) E.$('pt').textContent = spec.t;
    let m0 = null; try { RS.clear(); m0 = spec.build(P, spec); } catch (e) { m0 = null; }
    const pinned = pins().includes(id);
    return `<div class="bar rshd"><button class="btn" data-a="rsBack">← ${RS.hist.length ? 'Back' : 'All reports'}</button><div><b style="font-size:17px">${E.esc(spec.t)}</b><div class="muted">${E.esc(spec.d || '')}</div></div><span class="gap"></span>
      <button class="btn sm" data-a="rsPin" title="Pin to the top of the report list">${pinned ? '★ Pinned' : '☆ Pin'}</button>
      <button class="btn sm ${P.open === 'c' ? 'p' : ''}" data-a="rsOpen" data-id="c">⚙ Customize</button><button class="btn sm ${P.open === 'v' ? 'p' : ''}" data-a="rsOpen" data-id="v">💾 Views</button>
      <button class="btn" data-a="rsXls">⬇ Excel</button><button class="btn" data-a="rsCsv">⬇ CSV</button><button class="btn p" data-a="rsPrint">🖨 Print / PDF</button></div>
      <div class="bar rsfb">${filterBar(spec, P)}${spec.q !== false && m0 && m0.flat ? `<label class="rsf"><span>Search</span><input class="fs" data-rs="q" value="${E.esc(P.q)}" placeholder="Type to filter lines…" style="min-width:200px"></label>` : ''}</div>
      ${P.open === 'c' ? customize(spec, P, m0) : ''}${P.open === 'v' ? viewsMenu(id) : ''}
      <div id="rs_out">${bodyOut(id)}</div>`;
  };
  RS.home = () => {
    if (E.$('pt')) E.$('pt').textContent = 'Report Suite';
    const pn = pins(), tile = r => `<div class="rstile" data-a="rsGo" data-id="${r.id}"><b>${E.esc(r.t)}</b><span class="muted">${E.esc(r.d || '')}</span></div>`;
    const pinned = pn.map(i => RS.R[i]).filter(Boolean);
    return `<div class="bar"><input class="fs" id="rs_find" placeholder="Find a report: trial balance, ageing, item wise sales, job cost…" style="min-width:380px;flex:1"><span class="muted">${Object.keys(RS.R).length} reports · every figure comes from your ledger and stock records</span></div>
      <div id="rs_home">${homeList('')}</div>`;
  };
  function homeList(q) {
    q = (q || '').toLowerCase().trim();
    const pn = pins(), tile = r => `<div class="rstile" data-a="rsGo" data-id="${r.id}"><b>${E.esc(r.t)}</b><span class="muted">${E.esc(r.d || '')}</span></div>`, match = r => !q || (r.t + ' ' + (r.d || '') + ' ' + (r.kw || '')).toLowerCase().includes(q);
    let h = '';
    const pinned = pn.map(i => RS.R[i]).filter(r => r && match(r));
    if (pinned.length) h += `<div class="card"><h3>★ Pinned</h3><div class="rsgrid">${pinned.map(tile).join('')}</div></div>`;
    RS.groups.forEach(g => { const L = Object.values(RS.R).filter(r => r.g === g[0] && match(r)); if (L.length) h += `<div class="card"><h3>${g[1]} ${g[2]}</h3><p class="muted" style="margin:-6px 0 10px">${g[3]}</p><div class="rsgrid">${L.map(tile).join('')}</div></div>`; });
    return h || '<p class="muted">No report matches. Try another word.</p>';
  }
  E.route('rs', 'Report Suite', () => RS.cur && RS.R[RS.cur] ? RS.view() : RS.home());
  const at = E.N.findIndex(n => n.id === 'reports');
  E.N.splice(at < 0 ? E.N.length : at, 0, { g: 'Reports', id: 'rs', ico: '🗂', label: 'Report Suite' });

  RS.open = (id, p, keep) => {
    if (RS.cur && keep !== false) RS.hist.push(RS.cur);
    const spec = RS.R[id]; if (!spec) return E.toast('That report is not available', 'error');
    RS.reset(id); const P = RS.params(id); Object.assign(P, p || {});
    if (p && (p.from || p.to) && !p.preset) P.preset = 'cu';
    RS.cur = id; if (location.hash === '#/rs') E.go(); else location.hash = '#/rs';
  };
  E.A.rsGo = id => { RS.hist = []; RS.cur = ''; RS.open(id, null, false); };
  E.A.rsBack = () => { RS.cur = RS.hist.length ? RS.hist.pop() : ''; E.go(); };
  E.A.rsDrill = i => { const d = RS.drills[+i]; if (d) RS.open(d.r, d.p); };
  E.A.rsOpen = k => { const P = RS.params(RS.cur); P.open = P.open === k ? false : k; E.go(); };
  E.A.rsReset = () => { RS.reset(RS.cur); E.go(); };
  E.A.rsUnsort = () => { RS.params(RS.cur).sort = null; E.go(); };
  E.A.rsSort = k => { const P = RS.params(RS.cur); P.sort = !P.sort || P.sort.k !== k ? { k, dir: 'asc' } : P.sort.dir === 'asc' ? { k, dir: 'desc' } : null; E.$('rs_out').innerHTML = bodyOut(RS.cur); };
  E.A.rsPin = async () => { try { const p = pins().slice(), i = p.indexOf(RS.cur); i < 0 ? p.push(RS.cur) : p.splice(i, 1); await E.setSetting({ rsPins: p }); E.go(); } catch (e) { E.toast(e.message, 'error'); } };
  E.A.rsSaveView = async () => { const n = E.val('rs_vn'); if (!n) return E.toast('Give the view a name', 'error'); try { await RS.saveView(RS.cur, n); E.toast('View saved', 'success'); E.go(); } catch (e) { E.toast(e.message, 'error'); } };
  E.A.rsLoadView = n => { RS.loadView(RS.cur, n); E.go(); };
  E.A.rsDelView = async n => { if (!confirm('Delete the view "' + n + '"?')) return; try { await RS.delView(RS.cur, n); E.go(); } catch (e) { E.toast(e.message, 'error'); } };

  E.hooks.push(e => {
    const t = e.target; if (!t || !t.dataset) return;
    if (t.id === 'rs_find') { E.$('rs_home').innerHTML = homeList(t.value); return; }
    const k = t.dataset.rs; if (!k || !RS.cur || !RS.R[RS.cur]) return;
    const P = RS.params(RS.cur), v = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'preset') { P.preset = v; const r = presetRange(v); if (r) { P.from = r[0]; P.to = r[1]; } E.go(); return; }
    if (k === 'from' || k === 'to') { P[k] = v; P.preset = 'cu'; if (P.from && P.to && P.from > P.to) { if (k === 'from') P.to = P.from; else P.from = P.to; } E.go(); return; }
    if (k.startsWith('col:')) { P.hide = Object.assign({}, P.hide); if (v) delete P.hide[k.slice(4)]; else P.hide[k.slice(4)] = 1; E.$('rs_out').innerHTML = bodyOut(RS.cur); return; }
    if (k.startsWith('x:')) { P.extra = Object.assign({}, P.extra); P.extra[k.slice(2)] = v; E.go(); return; }
    P[k] = v;
    if (k === 'q' || k === 'top' || k === 'ptitle') { if (k !== 'ptitle') E.$('rs_out').innerHTML = bodyOut(RS.cur); return; }
    E.go();
  });

  /* ───────────────────────── export / print ───────────────────────── */
  function flat(id) {
    const spec = RS.R[id], P = RS.params(id), m = build(id), cols = visibleCols(m, P), { rows, foot } = prepare(m, P);
    const out = [cols.map(c => c.l)];
    rows.forEach(r => { const k = r.k || 'd'; if (k === 'sp') return; if (k === 'h') { out.push([cellVal(r.c[cols[0].k]) || r.t || '']); return; } out.push(cols.map((c, i) => { const x = r.c[c.k], v = cellVal(x), tt = (x && typeof x === 'object' && x.t) || c.t; return isNum(tt) ? RS.raw(v, tt) : (v == null ? '' : v); })); });
    if (foot && Object.keys(foot).length) out.push(cols.map(c => { const v = foot[c.k]; return v == null ? '' : isNum(c.t) ? RS.raw(v, c.t) : v; }));
    return { spec, P, m, cols, rows: out, kpis: m.kpis || [] };
  }
  const fname = (spec, ext) => spec.t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + E.today() + '.' + ext;
  const headLines = (f, id) => { const P = f.P, spec = f.spec, per = spec.f && (spec.f.includes('range') || spec.f.includes('asat')) ? (spec.f.includes('range') ? RS.periodLabel(P.from, P.to) : 'As at ' + P.asat) : ''; return [[E.factory().name], [spec.t + (f.m.sub ? ' - ' + f.m.sub : '')], per ? ['Period', per] : [], P.ptitle ? [P.ptitle] : [], ['Printed', E.today()], ['All amounts in Rs'], []].filter(x => x.length); };
  E.A.rsCsv = () => { const f = flat(RS.cur), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; E.download(fname(f.spec, 'csv'), headLines(f).concat(f.rows).map(r => r.map(q).join(',')).join('\r\n'), 'text/csv'); };
  E.A.rsXls = () => {
    const f = flat(RS.cur), esc = E.esc, num = (v, t) => isNum(t) && v !== '' ? `<td style="mso-number-format:'#,##0.00';text-align:right">${v}</td>` : `<td>${esc(v)}</td>`;
    const head = headLines(f).map(r => `<tr><td colspan="${Math.max(2, f.cols.length)}"><b>${esc(r.join(' : '))}</b></td></tr>`).join('');
    const body = f.rows.map((r, ri) => ri === 0 ? `<tr>${r.map(v => `<th style="background:#e8e4f4">${esc(v)}</th>`).join('')}</tr>` : `<tr>${r.map((v, i) => num(v, (f.cols[i] || {}).t)).join('')}</tr>`).join('');
    E.download(fname(f.spec, 'xls'), `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`, 'application/vnd.ms-excel');
  };
  E.A.rsPrint = () => {
    const id = RS.cur, spec = RS.R[id], P = RS.params(id); let m; try { m = build(id); } catch (e) { return E.toast(e.message, 'error'); }
    const cols = visibleCols(m, P), land = cols.length > 5 || m.land;
    const meta = [];
    if (spec.f && spec.f.includes('range')) meta.push(['Period', RS.periodLabel(P.from, P.to)]); else if (spec.f && spec.f.includes('asat')) meta.push(['As at', P.asat]);
    if (P.cmp && m.cmpLabel) meta.push(['Compared with', m.cmpLabel]);
    meta.push(['Printed', E.today()]);
    const kp = (m.kpis || []).length ? `<div class="cards" style="grid-template-columns:repeat(${Math.min(6, m.kpis.length)},1fr);margin:6px 0">${m.kpis.map(k => `<div class="card" style="min-height:0"><h4>${E.esc(k[0])}</h4><strong>${String(k[1]).replace(/<[^>]+>/g, '')}</strong></div>`).join('')}</div>` : '';
    const chk = (m.checks || []).map(c => `<div class="sm">${c[0] ? '✓' : '✗ '} ${E.esc(c[1])} ${E.esc(c[2] || '')}</div>`).join('');
    const nts = (m.notes || []).map(n => `<p class="sm">${String(n).replace(/<[^>]+>/g, '')}</p>`).join('');
    const body = `${P.ptitle ? `<p style="margin:0 0 6px;font-size:13px"><b>${E.esc(P.ptitle)}</b></p>` : ''}${m.sub ? `<p style="margin:0 0 6px;font-size:12px"><b>${E.esc(m.sub)}</b></p>` : ''}${kp}${tableHtml(m, P, true)}${chk}${nts}<p class="sm" style="margin-top:8px">All amounts in Rs.</p>`;
    E.prOut(E.prPage(E.esc(spec.t).toUpperCase(), meta, body, { nosign: true, land }));
  };

  /* ───────────────────────── style ───────────────────────── */
  const st = document.createElement('style');
  st.textContent = `.rsf{display:flex;flex-direction:column;gap:3px;font-size:10.5px;color:var(--t3);text-transform:uppercase}.rsf .fs{text-transform:none;font-size:12px}.rsc{display:flex;gap:6px;align-items:center;margin:6px 0;font-size:12px}
  .rsfb{align-items:flex-end;background:var(--s);border:1px solid var(--bd);border-radius:14px;padding:10px 14px}.rshd{align-items:center}.rsttl{margin:0 0 8px}
  .rsgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.rstile{border:1px solid var(--bd);border-radius:12px;padding:11px 13px;cursor:pointer;display:flex;flex-direction:column;gap:3px;background:var(--s)}.rstile:hover{border-color:var(--ac);background:var(--acs)}.rstile span{font-size:11px}
  .rst th.srt{cursor:pointer}.rst th.srt:hover{color:var(--ac)}tr.rsh td{background:var(--s2);font-weight:700;color:var(--t)}tr.rsg td{background:var(--s2);font-weight:700}tr.rss td,tr.rst td{font-weight:700;border-top:1px solid var(--bd)}tfoot.rst td,tr.rst td{border-top:2px solid var(--t3)}tr.rssp td{padding:3px;border:0}
  tr.rsd:hover td{background:var(--acs)}tr.rsd[data-a]:hover td{background:var(--acs)}.rscols{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px;font-size:12px}.rscols label{display:flex;gap:6px;align-items:center}.rscz h4{margin:0 0 8px;font-size:12px}
  .rsw{max-height:75vh}.rsw thead th{position:sticky;top:0;z-index:2}`;
  document.head.appendChild(st);
})(window.ERP);
