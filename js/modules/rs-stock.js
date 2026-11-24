/* REPORT SUITE — INVENTORY & STOCK
   Stock is valued from the stock moves (quantity and value in cents, weighted-average cost) and tied to ledger 1300 (materials, accessories, packing) and 1320 (finished goods).
   "Value by source" shows where every rupee of stock value came from: opening entries, purchases, production, returns, adjustments. */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const KINDS = [['Raw Material', 'Raw materials'], ['Accessory', 'Accessories'], ['Packing', 'Packing'], ['Finished Good', 'Finished goods']];
  const info = s => { const i = D.item(s.itemId); return { i, itemId: s.itemId, variantId: s.variantId, code: D.code(s.itemId, s.variantId), name: D.name(s.itemId), colour: D.colour(s.variantId), cat: D.catOf(i), kind: D.kindOf(i), unit: i ? (D.isFG(i) ? 'Pack' : (i.unit || '')) : '', fg: D.isFG(i) }; };
  const pass = (x, P) => (!P.item || x.itemId === P.item) && (!P.cat || x.cat === P.cat) && (!P.extra.kind || (x.i && x.i.cat === P.extra.kind));
  const kindF = { k: 'kind', l: 'Stock type', o: KINDS };
  const gbSku = [['sku', 'Item / colour wise'], ['cat', 'Category wise (summary)'], ['kind', 'Stock type wise (summary)']];
  const gl13 = d => { const m = D.upTo(d); return { rm: D.natC('1300', m), fg: D.natC('1320', m), wip: D.natC('1310', m) }; };
  const lastBuy = () => RS.memo('lastbuy', () => { const m = {}; D.purchaseEvents().filter(x => x.t === 'buy').forEach(x => { const k = x.itemId + '|' + x.variantId; if (!m[k] || x.date >= m[k].date) m[k] = { date: x.date, rate: x.rate, party: x.party }; }); return m; });
  const lastSell = () => RS.memo('lastsell', () => { const m = {}; D.salesEvents().filter(x => x.t === 'sale').forEach(x => { const k = x.itemId + '|' + x.variantId, r = x.pairs ? Math.round(x.gross / x.pairs) : 0; if (!m[k] || x.date >= m[k].date) m[k] = { date: x.date, rate: r, party: x.party }; }); return m; });
  const groupKey = (P, x) => P.gb === 'cat' ? x.cat : P.gb === 'kind' ? x.kind : x.itemId + '|' + x.variantId;

  /* ═══════════════ STOCK VALUATION ═══════════════ */
  add({
    id: 'stockval', g: 'stk', t: 'Stock Valuation Report', d: 'Quantity, average cost and value of every item as at any date - by item, category or stock type - checked against the ledger.', kw: 'inventory valuation stock value on hand',
    f: ['asat', 'gb', 'mat', 'cat', kindF, 'zero'], gb: [...gbSku, ['grp', 'Category with item detail and sub-totals']],
    build(P) {
      const map = D.stockAt(P.asat), L = []; let total = 0;
      Object.values(map).forEach(s => { const x = info(s); if (!pass(x, P)) return; if (!P.zero && !s.qty && !s.value) return; L.push(Object.assign(x, { qty: s.qty, value: s.value })); });
      L.forEach(x => total += x.value);
      const lb = lastBuy(), min = x => (x.i && x.i.min) || 0;
      const mk = x => { const lk = lb[x.itemId + '|' + x.variantId]; return { code: x.code, name: x.name, colour: x.colour, cat: x.cat, kind: x.kind, unit: x.unit, qty: x.qty, cost: x.qty ? Math.round(x.value / x.qty) : 0, value: x.value, share: total ? x.value * 100 / total : 0, lastrate: lk ? lk.rate : '', lastdate: lk ? lk.date : '', min: min(x) || '', st: x.qty < 0 ? 'NEGATIVE' : (min(x) && x.qty < min(x) ? 'Below minimum' : x.qty === 0 ? 'Nil' : 'OK') }; };
      const base = [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Item', t: 'text', always: true, w: 200 }, { k: 'colour', l: 'Colour', t: 'text' }, { k: 'cat', l: 'Category', t: 'text' }, { k: 'kind', l: 'Stock type', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'qty', l: 'Quantity', t: 'qty' }, { k: 'cost', l: 'Average cost', t: 'money', tot: false }, { k: 'value', l: 'Stock value', t: 'money', always: true }, { k: 'share', l: '% of total', t: 'pct', tot: false }, { k: 'lastrate', l: 'Last purchase rate', t: 'money', tot: false }, { k: 'lastdate', l: 'Last purchased', t: 'text' }, { k: 'min', l: 'Minimum stock', t: 'qty', tot: false }, { k: 'st', l: 'Status', t: 'text' }];
      const g = gl13(P.asat), rmV = L.filter(x => !x.fg).reduce((s, x) => s + x.value, 0), fgV = L.filter(x => x.fg).reduce((s, x) => s + x.value, 0), full = !P.item && !P.cat && !P.extra.kind && !(P.gb === 'x');
      const checks = full ? [[rmV === g.rm, 'Materials, accessories & packing = ledger 1300', rmV === g.rm ? E.m(g.rm) : 'Stock records ' + E.m(rmV) + ' vs ledger ' + E.m(g.rm) + ' (difference ' + E.m(rmV - g.rm) + ')'], [fgV === g.fg, 'Finished goods = ledger 1320', fgV === g.fg ? E.m(g.fg) : 'Stock records ' + E.m(fgV) + ' vs ledger ' + E.m(g.fg) + ' (difference ' + E.m(fgV - g.fg) + ')']] : [];
      const kpis = [['Total stock value', E.m(total)], ['Materials', E.m(rmV)], ['Finished goods', E.m(fgV)], ['Lines', String(L.length)]];
      if (P.gb === 'grp') {
        const cols = base.filter(c => !['kind', 'share'].includes(c.k)), rows = [], cats = [...new Set(L.map(x => x.cat))].sort();
        cats.forEach(c => { const g2 = L.filter(x => x.cat === c).sort((a, b) => a.code.localeCompare(b.code)); rows.push({ k: 'h', c: { code: c } }); g2.forEach(x => rows.push({ k: 'd', c: mk(x), drill: { r: 'itemcard', p: { item: x.itemId, preset: 'fy' } } })); rows.push({ k: 's', c: { code: '', name: 'Total ' + c, value: g2.reduce((s, x) => s + x.value, 0), share: total ? g2.reduce((s, x) => s + x.value, 0) * 100 / total : 0 } }); });
        rows.push({ k: 't', c: { code: '', name: 'TOTAL STOCK', value: total } });
        return { cols, rows, sub: 'As at ' + P.asat, kpis, checks, land: true };
      }
      if (P.gb === 'sku') return { cols: base, rows: L.sort((a, b) => a.cat.localeCompare(b.cat) || a.code.localeCompare(b.code)).map(x => ({ k: 'd', c: mk(x), drill: { r: 'itemcard', p: { item: x.itemId, preset: 'fy' } } })), flat: true, sub: 'As at ' + P.asat, kpis, checks, land: true };
      const G = {}; L.forEach(x => { const k = groupKey(P, x), r = G[k] || (G[k] = { name: k, n: 0, value: 0, lines: [] }); r.n++; r.value += x.value; });
      const cols = [{ k: 'name', l: P.gb === 'cat' ? 'Category' : 'Stock type', t: 'text', always: true, w: 240 }, { k: 'n', l: 'Item lines', t: 'int' }, { k: 'value', l: 'Stock value', t: 'money', always: true }, { k: 'share', l: '% of total', t: 'pct', tot: false }];
      return { cols, rows: Object.values(G).sort((a, b) => b.value - a.value).map(r => ({ k: 'd', c: Object.assign(r, { share: total ? r.value * 100 / total : 0 }) })), flat: true, sub: 'As at ' + P.asat, kpis, checks };
    }
  });

  /* ═══════════════ VALUE BY SOURCE ═══════════════ */
  add({
    id: 'stockcomp', g: 'stk', t: 'Stock Value by Source (what the value is made of)', d: 'Opening stock + each source of stock value in the period (purchases, production, returns, adjustments) - each issue and sale - to closing stock.', kw: 'stock value source composition purchases production movement',
    f: ['range', 'gb', 'mat', 'cat', kindF, 'mode'], preset: 'fy', gb: gbSku, modes: [['value', 'Value (Rs)'], ['qty', 'Quantity']],
    build(P) {
      const op = D.stockAt(dt.addDays(P.from, -1)), cl = D.stockAt(P.to), fl = D.flow(P.from, P.to), q = P.mode === 'qty', kf = q ? 'qty' : 'value', keys = new Set([...Object.keys(op), ...Object.keys(cl), ...Object.keys(fl)]);
      const types = Object.keys(D.moveTypes).filter(t => Object.keys(fl).some(k => fl[k][t] && (fl[k][t].qty || fl[k][t].value)));
      const R = {}; keys.forEach(k => { const [itemId, variantId] = k.split('|'), x = info({ itemId, variantId }); if (!pass(x, P)) return; const gk = groupKey(P, x), r = R[gk] || (R[gk] = { code: P.gb === 'sku' ? x.code : '', name: P.gb === 'sku' ? x.name : gk, colour: P.gb === 'sku' ? x.colour : '', unit: P.gb === 'sku' ? x.unit : '', open: 0, close: 0, itemId }); r.open += (op[k] || { [kf]: 0 })[kf]; r.close += (cl[k] || { [kf]: 0 })[kf]; types.forEach(t => r['t_' + t] = (r['t_' + t] || 0) + ((fl[k] && fl[k][t]) ? fl[k][t][kf] : 0)); });
      const T = q ? 'qty' : 'money', cols = [{ k: 'code', l: 'Code', t: 'text', always: P.gb === 'sku' }, { k: 'name', l: P.gb === 'sku' ? 'Item' : (P.gb === 'cat' ? 'Category' : 'Stock type'), t: 'text', always: true, w: 200 }, ...(P.gb === 'sku' ? [{ k: 'colour', l: 'Colour', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }] : []), { k: 'open', l: 'Opening ' + (q ? 'qty' : 'value'), t: T, always: true }, ...types.map(t => ({ k: 't_' + t, l: D.moveTypes[t], t: T })), { k: 'close', l: 'Closing ' + (q ? 'qty' : 'value'), t: T, always: true }];
      if (q && P.gb !== 'sku') { cols.forEach(c => { if (c.t === 'qty') c.tot = false; }); }
      const rows = Object.values(R).filter(r => r.open || r.close || types.some(t => r['t_' + t])).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(r => ({ k: 'd', c: r, drill: P.gb === 'sku' ? { r: 'itemcard', p: { item: r.itemId, preset: 'fy' } } : undefined }));
      const sumOf = f => rows.reduce((s, r) => s + (r.c[f] || 0), 0), calc = sumOf('open') + types.reduce((s, t) => s + sumOf('t_' + t), 0), g = gl13(P.to), g0 = gl13(dt.addDays(P.from, -1));
      const full = !P.item && !P.cat && !P.extra.kind, checks = [[calc === sumOf('close'), 'Opening + all sources = closing', calc === sumOf('close') ? '' : 'Difference ' + (q ? calc - sumOf('close') : E.m(calc - sumOf('close')))]];
      if (!q && full) checks.push([sumOf('close') === g.rm + g.fg, 'Closing stock = ledger 1300 + 1320', sumOf('close') === g.rm + g.fg ? E.m(g.rm + g.fg) : 'Stock records ' + E.m(sumOf('close')) + ' vs ledger ' + E.m(g.rm + g.fg)], [sumOf('open') === g0.rm + g0.fg, 'Opening stock = ledger 1300 + 1320 at the start', sumOf('open') === g0.rm + g0.fg ? E.m(g0.rm + g0.fg) : 'Stock records ' + E.m(sumOf('open')) + ' vs ledger ' + E.m(g0.rm + g0.fg)]);
      return { cols, rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: q ? [] : [['Opening stock', E.m(sumOf('open'))], ['Added in period', E.m(types.reduce((s, t) => s + Math.max(0, sumOf('t_' + t)), 0))], ['Taken out in period', E.m(types.reduce((s, t) => s + Math.min(0, sumOf('t_' + t)), 0))], ['Closing stock', E.m(sumOf('close'))]], checks, land: true, notes: ['Each column is the net movement of that kind. Positive = added to stock, negative = taken out (issued to jobs, sold, lost, returned to suppliers). Cancellations show the reversal of earlier purchases or sales.'] };
    }
  });

  /* ═══════════════ STOCK MOVEMENT SUMMARY ═══════════════ */
  add({
    id: 'stockmove', g: 'stk', t: 'Stock Movement Summary', d: 'Opening, received, issued and closing quantity and value for every item in the period.', kw: 'stock movement in out summary',
    f: ['range', 'gb', 'mat', 'cat', kindF, 'zero'], preset: 'fy', gb: gbSku,
    build(P) {
      const keys = new Set(D.moves().map(m => m.itemId + '|' + (m.variantId || ''))), R = {}, sku = P.gb === 'sku';
      D.moves().forEach(m => { const k = m.itemId + '|' + (m.variantId || ''), x = info({ itemId: m.itemId, variantId: m.variantId || '' }); if (!pass(x, P)) return; const gk = groupKey(P, x), r = R[gk] || (R[gk] = { code: sku ? x.code : '', name: sku ? x.name : gk, colour: sku ? x.colour : '', unit: sku ? x.unit : '', oq: 0, ov: 0, iq: 0, iv: 0, xq: 0, xv: 0, av: 0, cq: 0, cv: 0, itemId: m.itemId }); if (m.date < P.from) { r.oq += m.qty; r.ov += m.value; } else if (m.date <= P.to) { if (m.qty > 0) { r.iq += m.qty; r.iv += m.value; } else if (m.qty < 0) { r.xq += -m.qty; r.xv += -m.value; } else r.av += m.value; } else return; r.cq += m.qty; r.cv += m.value; });
      let rows = Object.values(R); if (!P.zero) rows = rows.filter(r => r.oq || r.iq || r.xq || r.cq || r.ov || r.iv || r.xv || r.cv || r.av);
      rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const qc = sku ? 'qty' : 'qty', cols = [{ k: 'code', l: 'Code', t: 'text', always: sku }, { k: 'name', l: sku ? 'Item' : (P.gb === 'cat' ? 'Category' : 'Stock type'), t: 'text', always: true, w: 200 }, ...(sku ? [{ k: 'colour', l: 'Colour', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }] : []), ...(sku ? [{ k: 'oq', l: 'Opening qty', t: 'qty' }, { k: 'iq', l: 'Qty in', t: 'qty' }, { k: 'xq', l: 'Qty out', t: 'qty' }, { k: 'cq', l: 'Closing qty', t: 'qty', always: true }] : []), { k: 'ov', l: 'Opening value', t: 'money' }, { k: 'iv', l: 'Value in', t: 'money' }, { k: 'xv', l: 'Value out', t: 'money' }, { k: 'av', l: 'Value adjustments (final costing)', t: 'money' }, { k: 'cv', l: 'Closing value', t: 'money', always: true }];
      const g = gl13(P.to), g0 = gl13(dt.addDays(P.from, -1)), full = !P.item && !P.cat && !P.extra.kind, S = f => rows.reduce((s, r) => s + r[f], 0);
      return { cols, rows: rows.map(r => ({ k: 'd', c: Object.assign({}, r), drill: sku ? { r: 'itemcard', p: { item: r.itemId, preset: 'fy' } } : undefined })), flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Opening value', E.m(S('ov'))], ['Value in', E.m(S('iv'))], ['Value out', E.m(S('xv'))], ['Closing value', E.m(S('cv'))]], checks: full ? [[S('cv') === g.rm + g.fg, 'Closing value = ledger 1300 + 1320', S('cv') === g.rm + g.fg ? E.m(g.rm + g.fg) : 'Differs by ' + E.m(S('cv') - g.rm - g.fg)], [S('ov') === g0.rm + g0.fg, 'Opening value = ledger at the start', S('ov') === g0.rm + g0.fg ? E.m(g0.rm + g0.fg) : 'Differs by ' + E.m(S('ov') - g0.rm - g0.fg)]] : [], land: true };
    }
  });

  /* ═══════════════ ITEM CARD ═══════════════ */
  add({
    id: 'itemcard', g: 'stk', t: 'Item Stock Card (Stock Ledger)', d: 'Every movement of one item - with the supplier, customer or job it came from or went to - quantity and value balance after each line.', kw: 'stock ledger bin card item history movement',
    f: ['range', 'item', 'job'], preset: 'fy',
    build(P) {
      const it = D.item(P.item); if (!it) return null; let oq = 0, ov = 0, q = 0, v = 0, iq = 0, xq = 0; const rows = [];
      D.moves().filter(m => m.itemId === it.id && (!P.job || m.job === P.job)).forEach(m => {
        if (m.date < P.from) { oq += m.qty; ov += m.value; q = oq; v = ov; return; } if (m.date > P.to) return;
        q += m.qty; v += m.value; if (m.qty > 0) iq += m.qty; else xq -= m.qty; const party = D.moveParty(m), jb = D.jobNo(m.job);
        rows.push({ k: 'd', c: { date: m.date, type: D.moveTypes[m.type] || m.type || '', ref: m.ref || '', who: party || (jb ? 'Job ' + jb : ''), colour: D.colour(m.variantId), qi: m.qty > 0 ? m.qty : 0, qo: m.qty < 0 ? -m.qty : 0, val: m.value, rate: m.qty ? Math.round(Math.abs(m.value / m.qty)) : '', bq: q, bv: v } });
      });
      rows.unshift({ k: 'd', c: { date: P.from, type: 'Balance brought forward', ref: '', who: '', colour: '', qi: 0, qo: 0, val: 0, rate: '', bq: oq, bv: ov }, cls: 'rsg' });
      return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'type', l: 'Movement', t: 'text', w: 200 }, { k: 'ref', l: 'Reference', t: 'text' }, { k: 'who', l: 'Supplier / customer / job', t: 'text', w: 180 }, { k: 'colour', l: 'Colour', t: 'text' }, { k: 'qi', l: 'Qty in', t: 'qty', always: true }, { k: 'qo', l: 'Qty out', t: 'qty', always: true }, { k: 'val', l: 'Value (+/-)', t: 'money' }, { k: 'rate', l: 'Rate', t: 'money', tot: false }, { k: 'bq', l: 'Qty balance', t: 'qty', tot: false, always: true }, { k: 'bv', l: 'Value balance', t: 'money', tot: false }], rows, flat: true, sub: (it.art ? it.art + ' · ' : '') + it.name + ' · ' + RS.periodLabel(P.from, P.to), kpis: [['Opening', String(Math.round(oq * 1000) / 1000)], ['In', String(Math.round(iq * 1000) / 1000)], ['Out', String(Math.round(xq * 1000) / 1000)], ['On hand', String(Math.round(q * 1000) / 1000), 'value ' + E.m(v)]], land: true };
    }
  });

  /* ═══════════════ REORDER ═══════════════ */
  add({
    id: 'reorder', g: 'stk', t: 'Reorder & Low Stock Report', d: 'Materials, accessories and packing below their minimum, with average daily usage, days of cover and the quantity to order.', kw: 'reorder low stock minimum purchase planning shortage',
    f: ['cat', { k: 'days', l: 'Usage look-back (days)', def: 90 }, { k: 'lead', l: 'Lead time (days)', def: 14 }, { k: 'only', l: 'Show', o: [['low', 'Only items to order']], all: 'All materials' }],
    build(P) {
      const back = Math.max(1, parseInt(P.extra.days) || 90), lead = Math.max(0, parseInt(P.extra.lead) || 14), from = dt.addDays(E.today(), -back), map = D.stockAt(''), use = {};
      D.moves().filter(m => m.type === 'issue' && m.date >= from).forEach(m => { const k = m.itemId + '|' + (m.variantId || ''); use[k] = (use[k] || 0) - m.qty; });
      const keys = new Set(Object.keys(map)); E.rows('items').filter(i => !D.isFG(i) && i.active !== false).forEach(i => { if (!keys.has(i.id + '|')) keys.add(i.id + '|'); });
      const rows = []; keys.forEach(k => { const [itemId, variantId] = k.split('|'), x = info({ itemId, variantId }); if (x.fg || !x.i || (P.cat && x.cat !== P.cat) || (P.item && x.itemId !== P.item)) return; const s = map[k] || { qty: 0, value: 0 }, perDay = (use[k] || 0) / back, cover = perDay > 0 ? s.qty / perDay : '', need = Math.max(x.i.min || 0, perDay * lead), order = Math.max(0, Math.ceil((need + perDay * lead - s.qty) * 1000) / 1000), lb = lastBuy()[k]; const status = s.qty <= 0 ? 'OUT OF STOCK' : (x.i.min && s.qty < x.i.min) ? 'Below minimum' : (cover !== '' && cover < lead) ? 'Will run out in lead time' : 'OK'; if (P.extra.only === 'low' && status === 'OK') return; rows.push({ k: 'd', c: { code: x.code, name: x.name, cat: x.cat, unit: x.unit, qty: s.qty, min: x.i.min || '', perDay, cover, order: status === 'OK' ? 0 : order, rate: lb ? lb.rate : (x.i.buyPrice || 0), est: status === 'OK' ? 0 : Math.round(order * (lb ? lb.rate : (x.i.buyPrice || 0))), sup: lb ? D.pname(lb.party) : '', st: status }, drill: { r: 'itemcard', p: { item: x.itemId, preset: 'fy' } } }); });
      rows.sort((a, b) => (a.c.st === 'OK') - (b.c.st === 'OK') || a.c.name.localeCompare(b.c.name));
      return { cols: [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Material', t: 'text', always: true, w: 200 }, { k: 'cat', l: 'Type', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'qty', l: 'On hand', t: 'qty', tot: false }, { k: 'min', l: 'Minimum', t: 'qty', tot: false }, { k: 'perDay', l: 'Avg daily use', t: 'qty', tot: false }, { k: 'cover', l: 'Days of cover', t: 'days', tot: false }, { k: 'order', l: 'Suggested order qty', t: 'qty', tot: false, always: true }, { k: 'rate', l: 'Last purchase rate', t: 'money', tot: false }, { k: 'est', l: 'Estimated cost', t: 'money' }, { k: 'sup', l: 'Last supplier', t: 'text' }, { k: 'st', l: 'Status', t: 'text', always: true }], rows, flat: true, kpis: [['Items to order', String(rows.filter(r => r.c.st !== 'OK').length)], ['Estimated purchase', E.m(rows.reduce((s, r) => s + r.c.est, 0))]], notes: ['Suggested quantity covers the lead time plus the minimum stock, based on average issues to jobs over the look-back period.'], land: true };
    }
  });

  /* ═══════════════ STOCK AGEING (FIFO layers) ═══════════════ */
  add({
    id: 'stockage', g: 'stk', t: 'Stock Ageing & Slow-Moving Stock', d: 'How old the stock on hand is (first-in-first-out layers) and which items have not moved - to find dead and slow stock.', kw: 'ageing aging slow moving dead stock obsolete old',
    f: ['asat', 'mat', 'cat', kindF],
    build(P) {
      const BK = [30, 60, 90, 180], lab = ['0-30 days', '31-60 days', '61-90 days', '91-180 days', 'Over 180 days'], by = {};
      D.moves().filter(m => m.date <= P.asat).forEach(m => (by[m.itemId + '|' + (m.variantId || '')] = by[m.itemId + '|' + (m.variantId || '')] || []).push(m));
      const rows = [];
      Object.keys(by).forEach(k => {
        const [itemId, variantId] = k.split('|'), x = info({ itemId, variantId }); if (!pass(x, P)) return; const layers = []; let lastIn = '', lastOut = '';
        by[k].forEach(m => { if (m.qty > 0) { layers.push({ date: m.date, qty: m.qty }); if (m.type !== 'cancel') lastIn = m.date; } else if (m.qty < 0) { let need = -m.qty; if (['issue', 'sale', 'loss'].includes(m.type)) lastOut = m.date; while (need > 1e-9 && layers.length) { const l = layers[0], t = Math.min(l.qty, need); l.qty -= t; need -= t; if (l.qty <= 1e-9) layers.shift(); } } });
        const q = layers.reduce((s, l) => s + l.qty, 0); if (q <= 1e-9) return; const st = D.stockAt(P.asat)[k] || { qty: q, value: 0 }, unit = st.qty ? st.value / st.qty : 0, b = [0, 0, 0, 0, 0];
        layers.forEach(l => { const a = dt.diff(l.date, P.asat), i = a <= BK[0] ? 0 : a <= BK[1] ? 1 : a <= BK[2] ? 2 : a <= BK[3] ? 3 : 4; b[i] += l.qty; });
        const idle = dt.diff(lastOut || lastIn || P.asat, P.asat), cls = idle > 180 ? 'Dead (180+ days)' : idle > 90 ? 'Slow' : 'Moving';
        rows.push({ k: 'd', c: { code: x.code, name: x.name, cat: x.cat, unit: x.unit, qty: Math.round(q * 1000) / 1000, b0: b[0], b1: b[1], b2: b[2], b3: b[3], b4: b[4], value: Math.round(unit * q), lastIn, lastOut, idle, cls }, drill: { r: 'itemcard', p: { item: itemId, preset: 'fy' } } });
      });
      rows.sort((a, b) => b.c.b4 - a.c.b4 || b.c.idle - a.c.idle);
      const dead = rows.filter(r => r.c.cls.startsWith('Dead')).reduce((s, r) => s + r.c.value, 0);
      return { cols: [{ k: 'code', l: 'Code', t: 'text', always: true }, { k: 'name', l: 'Item', t: 'text', always: true, w: 200 }, { k: 'cat', l: 'Category', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'qty', l: 'On hand', t: 'qty', tot: false }, ...lab.map((l, i) => ({ k: 'b' + i, l: l + ' (qty)', t: 'qty', tot: false })), { k: 'value', l: 'Stock value', t: 'money', always: true }, { k: 'lastIn', l: 'Last received', t: 'text' }, { k: 'lastOut', l: 'Last issued / sold', t: 'text' }, { k: 'idle', l: 'Days since last issue / sale', t: 'days', tot: false }, { k: 'cls', l: 'Class', t: 'text', always: true }], rows, flat: true, sub: 'As at ' + P.asat, kpis: [['Items in stock', String(rows.length)], ['Dead stock value (no issue/sale 180+ days)', E.m(dead)], ['Slow items (90+ days)', String(rows.filter(r => r.c.cls === 'Slow').length)]], notes: ['Age is taken from the oldest receipts still on hand (first-in-first-out). Value uses the current average cost.'], land: true };
    }
  });

  /* ═══════════════ MATERIAL CONSUMPTION ═══════════════ */
  add({
    id: 'matuse', g: 'stk', t: 'Material Consumption Report', d: 'Materials issued to production (and returned) by material, job or month - quantity, value and average cost.', kw: 'material consumption usage issued jobs raw material',
    f: ['range', 'gb', 'mat', 'job', 'cat'], preset: 'fy', gb: [['item', 'By material'], ['job', 'By job'], ['month', 'By month'], ['jobitem', 'Job × material']],
    build(P) {
      const R = {}; D.moves().filter(m => (m.type === 'issue' || m.type === 'return') && m.date >= P.from && m.date <= P.to && (!P.job || m.job === P.job)).forEach(m => {
        const x = info({ itemId: m.itemId, variantId: m.variantId || '' }); if (!pass(x, P)) return;
        const k = P.gb === 'job' ? m.job : P.gb === 'month' ? m.date.slice(0, 7) : P.gb === 'jobitem' ? m.job + '|' + m.itemId + '|' + (m.variantId || '') : m.itemId + '|' + (m.variantId || '');
        const r = R[k] || (R[k] = { name: P.gb === 'job' ? D.jobNo(m.job) : P.gb === 'month' ? dt.monLabel(k) : x.name, job: P.gb === 'jobitem' ? D.jobNo(m.job) : '', code: P.gb === 'item' || P.gb === 'jobitem' ? x.code : '', unit: P.gb === 'item' || P.gb === 'jobitem' ? x.unit : '', sort: k, iq: 0, iv: 0, rq: 0, rv: 0, jobId: m.job, itemId: m.itemId });
        if (m.type === 'issue') { r.iq -= m.qty; r.iv -= m.value; } else { r.rq += m.qty; r.rv += m.value; }
      });
      const rows = Object.values(R).map(r => Object.assign(r, { nq: r.iq - r.rq, nv: r.iv - r.rv })).sort((a, b) => P.gb === 'month' ? a.sort.localeCompare(b.sort) : b.nv - a.nv);
      const tv = rows.reduce((s, r) => s + r.nv, 0), cols = [{ k: 'code', l: 'Code', t: 'text', always: P.gb === 'item' || P.gb === 'jobitem' }, { k: 'name', l: P.gb === 'job' ? 'Job' : P.gb === 'month' ? 'Month' : 'Material', t: 'text', always: true, w: 200 }, ...(P.gb === 'jobitem' ? [{ k: 'job', l: 'Job', t: 'text' }] : []), { k: 'unit', l: 'Unit', t: 'text' }, ...(P.gb === 'item' || P.gb === 'jobitem' ? [{ k: 'iq', l: 'Qty issued', t: 'qty' }, { k: 'rq', l: 'Qty returned', t: 'qty' }, { k: 'nq', l: 'Net qty used', t: 'qty', always: true }] : []), { k: 'iv', l: 'Value issued', t: 'money' }, { k: 'rv', l: 'Value returned', t: 'money' }, { k: 'nv', l: 'Net value used', t: 'money', always: true }, { k: 'share', l: '% of total', t: 'pct', tot: false }];
      rows.forEach(r => r.share = tv ? r.nv * 100 / tv : 0);
      return { cols, rows: rows.map(r => ({ k: 'd', c: r, drill: P.gb === 'job' ? { r: 'jobsheet', p: { job: r.jobId } } : (P.gb === 'item' ? { r: 'itemcard', p: { item: r.itemId, preset: 'fy' } } : undefined) })), flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Net material used', E.m(tv)], ['Lines', String(rows.length)]], land: true };
    }
  });

  /* ═══════════════ FINISHED GOODS ═══════════════ */
  add({
    id: 'fgstock', g: 'stk', t: 'Finished Goods Stock (Article & Colour)', d: 'Packs and pairs of every article and colour in stock, with cost per pack and per pair, last selling rate and margin on current stock.', kw: 'finished goods stock packs pairs article colour fg',
    f: ['asat', 'fg', 'cat'],
    build(P) {
      const map = D.stockAt(P.asat), ls = lastSell(), rows = [];
      Object.values(map).forEach(s => { const x = info(s); if (!x.fg || !pass(x, P) || (!s.qty && !s.value)) return; const pk = D.pairsPerPack(s.itemId), pairs = s.qty * pk, cpp = pairs ? Math.round(s.value / pairs) : 0, l = ls[s.itemId + '|' + s.variantId], mv = l ? Math.round(pairs * l.rate) : '';
        rows.push({ k: 'd', c: { code: x.code, name: x.name, colour: x.colour, cat: x.cat, packs: s.qty, pairs, cpack: s.qty ? Math.round(s.value / s.qty) : 0, cpair: cpp, value: s.value, rate: l ? l.rate : '', rdate: l ? l.date : '', mval: mv, gp: l && mv ? (mv - s.value) * 100 / mv : '' }, drill: { r: 'itemcard', p: { item: s.itemId, preset: 'fy' } } }); });
      rows.sort((a, b) => a.c.cat.localeCompare(b.c.cat) || a.c.code.localeCompare(b.c.code));
      const g = gl13(P.asat), tv = rows.reduce((s, r) => s + r.c.value, 0), full = !P.item && !P.cat;
      return { cols: [{ k: 'code', l: 'Article / colour code', t: 'text', always: true }, { k: 'name', l: 'Article', t: 'text', w: 180 }, { k: 'colour', l: 'Colour', t: 'text' }, { k: 'cat', l: 'Category', t: 'text' }, { k: 'packs', l: 'Packs', t: 'qty' }, { k: 'pairs', l: 'Pairs', t: 'qty' }, { k: 'cpack', l: 'Cost per pack', t: 'money', tot: false }, { k: 'cpair', l: 'Cost per pair', t: 'money', tot: false }, { k: 'value', l: 'Stock value (cost)', t: 'money', always: true }, { k: 'rate', l: 'Last selling rate / pair', t: 'money', tot: false }, { k: 'rdate', l: 'Last sold', t: 'text' }, { k: 'mval', l: 'Value at last selling rate', t: 'money' }, { k: 'gp', l: 'Margin on stock %', t: 'pct', tot: false }], rows, flat: true, sub: 'As at ' + P.asat, kpis: [['Packs in stock', String(Math.round(rows.reduce((s, r) => s + r.c.packs, 0) * 1000) / 1000)], ['Pairs in stock', String(Math.round(rows.reduce((s, r) => s + r.c.pairs, 0)))], ['Stock value', E.m(tv)]], checks: full ? [[tv === g.fg, 'Finished goods = ledger 1320', tv === g.fg ? E.m(g.fg) : 'Differs by ' + E.m(tv - g.fg)]] : [], land: true };
    }
  });

  /* ═══════════════ STOCK-TAKE VARIANCE ═══════════════ */
  add({
    id: 'stvar', g: 'stk', t: 'Stock-Take Variance Report', d: 'Counted vs system quantity from every stock take, with the variance and its value.', kw: 'stock take count variance shortage excess physical',
    f: ['range', { k: 'status', l: 'Status', o: [['Posted', 'Posted'], ['Counting', 'Counting'], ['Cancelled', 'Cancelled']], all: 'All statuses' }], preset: 'fy',
    build(P) {
      const rows = []; let net = 0;
      E.rows('stockTakes').filter(s => s.date >= P.from && s.date <= P.to && (!P.extra.status || s.status === P.extra.status)).sort((a, b) => a.date.localeCompare(b.date)).forEach(s => (s.lines || []).forEach(l => {
        if (l.counted == null) return; const sys = l.sysPost != null ? l.sysPost : l.sys0, v = Math.round((l.counted - sys) * 1000) / 1000; if (!v) return;
        const st = D.stockAt(s.date)[l.itemId + '|' + (l.variantId || '')], avg = st && st.qty ? st.value / st.qty : (D.item(l.itemId) || {}).buyPrice || 0, val = v < 0 ? -Math.round(-v * avg) : Math.round(v * (l.cost || avg)); net += val;
        rows.push({ k: 'd', c: { no: s.no, date: s.date, st: s.status, code: l.code, name: l.name, cat: l.cat || '', unit: l.unit || '', sys, counted: l.counted, v, val } });
      }));
      return { cols: [{ k: 'no', l: 'Stock take', t: 'text', always: true }, { k: 'date', l: 'Date', t: 'text' }, { k: 'st', l: 'Status', t: 'text' }, { k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Item', t: 'text', w: 220 }, { k: 'cat', l: 'Category', t: 'text' }, { k: 'unit', l: 'Unit', t: 'text' }, { k: 'sys', l: 'System qty', t: 'qty', tot: false }, { k: 'counted', l: 'Counted', t: 'qty', tot: false }, { k: 'v', l: 'Variance qty', t: 'qty', tot: false }, { k: 'val', l: 'Variance value', t: 'money', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Lines with a difference', String(rows.length)], ['Net variance value', E.m(net)]], notes: ['Shortages are valued at average cost; gains at the cost entered on the count (or average cost).'] };
    }
  });
})(window.ERP);
