/* ACCOUNTING BOOKS (v101) - the simple, classic books every accountant expects, read straight from the ledger (journal entries):
   Daily Transaction Report, Day Book, Cash Book, Bank Book, Receipts & Payments, Sales Book, Purchase Book, Expense Book.
   Every figure is the journal itself, so each book agrees with the Trial Balance. Every tab can be printed or saved as CSV.
   The newer Report Suite (Reports > Reports) is unchanged; these books sit beside it. */
(E => {
  const esc = E.esc, m = E.m;
  const F = { tab: 'daily', d: E.today(), f: E.today().slice(0, 8) + '01', t: E.today(), acc: '', src: '' };
  const TABS = [['daily', 'Daily Transaction'], ['daybook', 'Day Book'], ['cash', 'Cash Book'], ['bank', 'Bank Book'], ['rp', 'Receipts & Payments'], ['sales', 'Sales Book'], ['purch', 'Purchase Book'], ['exp', 'Expense Book']];
  const TITLE = { daily: 'DAILY TRANSACTION REPORT', daybook: 'DAY BOOK', cash: 'CASH BOOK', bank: 'BANK BOOK', rp: 'RECEIPTS & PAYMENTS ACCOUNT', sales: 'SALES BOOK', purch: 'PURCHASE BOOK', exp: 'EXPENSE BOOK' };
  let LAST = { head: [], rows: [], sub: '' };
  { const at = E.N.findIndex(n => n.id === 'rs'); const n = { g: 'Reports', id: 'books', ico: '📒', label: 'Accounting Books' }; if (at < 0) E.N.push(n); else E.N.splice(at + 1, 0, n); }

  /* ───────── helpers ───────── */
  const cents = c => (c / 100).toFixed(2);
  const nm = c => { const a = E.acct(c); return c + ' ' + (a ? a.name : ''); };
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const cmp = (a, b) => (a.date || '').localeCompare(b.date || '') || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || (a._i - b._i);
  const ents = () => E.rows('journalEntries').map((j, i) => Object.assign({ _i: i }, j)).filter(j => (j.lines || []).length).sort(cmp);
  const coa = () => E.rows('coa');
  const cashA = () => coa().filter(a => a.code === '1000' || a.code === '1010').map(a => a.code);
  const bankA = () => coa().filter(a => a.bank && a.code !== '1000').map(a => a.code);
  const liqA = () => [...new Set(cashA().concat(bankA()))];
  const bal = (accs, upto, before) => { const S = new Set(accs); let v = 0; E.rows('journalEntries').forEach(j => { if (before ? (j.date || '') < before : (j.date || '') <= upto) (j.lines || []).forEach(l => { if (S.has(l.acc)) v += (l.dr || 0) - (l.cr || 0); }); }); return v; };
  const contra = (j, S) => { const s = [...new Set(j.lines.filter(l => !S.has(l.acc)).map(l => nm(l.acc)))]; return s.length ? s.join(', ') : '(transfer between cash / bank accounts)'; };
  const EXPX = new Set(['5400', '5291', '5390']);
  const isExp = c => { const a = E.acct(c); return !!a && a.type === 'expense' && !EXPX.has(c); };
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const T = (h, rows, foot) => `<div class="tw"><table><thead><tr>${h.map(x => `<th class="${x[1] ? 'r' : ''}">${esc(x[0])}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${h.length}" class="muted">Nothing found for this selection.</td></tr>`}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
  const td = (v, r, b) => `<td class="${r ? 'r' : ''}" ${b ? 'style="font-weight:600"' : ''}>${v}</td>`;
  const srcTag = j => `<span class="tag">${esc(j.source || 'manual')}</span>${j.reversedBy ? ' <span class="tag">reversed</span>' : ''}`;
  const chk = (ok, text) => `<div class="${ok ? 'ok' : 'bad'}" style="margin:8px 0">${ok ? '✔' : '✖'} ${text}</div>`;
  const csvLine = (...a) => LAST.rows.push(a);

  /* one journal entry per block, one row per ledger line (the Day Book layout) */
  const entryRows = (list, cols) => list.map(j => {
    const ls = j.lines.filter(l => (l.dr || 0) || (l.cr || 0)), op = j.reversedBy ? ' style="opacity:.6"' : '';
    ls.forEach(l => csvLine(j.date, j.no || '', j.source || 'manual', j.narr || j.ref || '', nm(l.acc), l.dr ? cents(l.dr) : '', l.cr ? cents(l.cr) : ''));
    return ls.map((l, i) => `<tr${op}>${i === 0 ? `<td rowspan="${ls.length}">${j.date}</td><td rowspan="${ls.length}">${esc(j.no || '')}<br>${srcTag(j)}</td><td rowspan="${ls.length}">${esc(j.narr || j.ref || '')}</td>` : ''}<td>${esc(nm(l.acc))}</td><td class="r">${l.dr ? m(l.dr) : ''}</td><td class="r">${l.cr ? m(l.cr) : ''}</td></tr>`).join('');
  });
  const EH = [['Date'], ['Entry'], ['Narration'], ['Account'], ['Debit', 1], ['Credit', 1]];
  const CSVH_E = ['Date', 'Entry', 'Source', 'Narration', 'Account', 'Debit', 'Credit'];

  /* ───────── 1. Daily Transaction Report ───────── */
  function daily() {
    const day = F.d, A = liqA(), S = new Set(A), list = ents().filter(j => j.date === day);
    const open = bal(A, 0, day), mv = [];
    list.forEach(j => j.lines.forEach(l => { if (S.has(l.acc) && ((l.dr || 0) || (l.cr || 0))) mv.push({ j, l }); }));
    const rec = sum(mv, x => x.l.dr || 0), pay = sum(mv, x => x.l.cr || 0), close = open + rec - pay;
    const salesN = sum(list, j => sum(j.lines.filter(l => l.acc === '4000' || l.acc === '4010'), l => (l.cr || 0) - (l.dr || 0)));
    const purN = sum(list.filter(j => j.lines.some(l => l.acc === '1300') && j.lines.some(l => l.acc === '2000')), j => sum(j.lines.filter(l => l.acc === '2000'), l => (l.cr || 0) - (l.dr || 0)));
    const expN = sum(list, j => sum(j.lines.filter(l => isExp(l.acc)), l => (l.dr || 0) - (l.cr || 0)));
    LAST = { head: CSVH_E, rows: [], sub: 'Date: ' + day };
    const per = A.map(c => { const r = sum(mv.filter(x => x.l.acc === c), x => x.l.dr || 0), p = sum(mv.filter(x => x.l.acc === c), x => x.l.cr || 0), o = bal([c], 0, day); return { c, o, r, p, cl: o + r - p }; }).filter(x => x.o || x.r || x.p);
    const bySrc = {}; list.forEach(j => { const k = j.source || 'manual', o = bySrc[k] || (bySrc[k] = { n: 0, dr: 0 }); o.n++; o.dr += sum(j.lines, l => l.dr || 0); });
    const docs = [['Delivery notes', E.rows('deliveries').filter(x => x.date === day && x.status !== 'Cancelled' && !x.cancelled), x => x.total], ['Invoices', E.rows('invoices').filter(x => x.date === day && !x.cancelled), x => x.total], ['Customer receipts', E.rows('receipts').filter(x => x.date === day && !x.cancelled), x => x.amount], ['Purchase bills', E.rows('purchases').filter(x => x.date === day && !x.cancelled), x => x.total], ['Supplier payments', E.rows('payments').filter(x => x.date === day && !x.cancelled), x => x.amount], ['Expenses', E.rows('expenses').filter(x => x.date === day && !x.cancelled), x => x.amount], ['Cheques received', E.rows('cheques').filter(x => x.dir === 'in' && (x.recvDate || x.date) === day), x => x.amount], ['Cheques issued', E.rows('cheques').filter(x => x.dir === 'out' && (x.recvDate || x.date) === day), x => x.amount]].filter(d => d[1].length);
    return `<div class="kp">${E.kpi('Opening cash & bank', m(open), day)}${E.kpi('Received', m(rec), 'into cash & bank')}${E.kpi('Paid', m(pay), 'out of cash & bank')}${E.kpi('Closing cash & bank', m(close), 'end of ' + day)}${E.kpi('Sales (net)', m(salesN), 'accounts 4000 / 4010')}${E.kpi('Purchases (net)', m(purN), 'bills less returns')}${E.kpi('Expenses booked', m(expN), 'excl. cost of sales')}${E.kpi('Entries', list.length, '')}</div>`
      + '<h4 style="margin:14px 0 6px">Cash & bank balances</h4>' + T([['Account'], ['Opening', 1], ['Received', 1], ['Paid', 1], ['Closing', 1]], per.map(x => `<tr><td>${esc(nm(x.c))}</td>${td(m(x.o), 1)}${td(m(x.r), 1)}${td(m(x.p), 1)}${td(m(x.cl), 1)}</tr>`), `<tr><td><b>Total</b></td>${td(m(open), 1, 1)}${td(m(rec), 1, 1)}${td(m(pay), 1, 1)}${td(m(close), 1, 1)}</tr>`)
      + chk(close === bal(A, day), 'Closing cash & bank agrees with the ledger as at ' + day)
      + '<h4 style="margin:14px 0 6px">Money received and paid today</h4>' + T([['Entry'], ['Account'], ['Particulars'], ['Received', 1], ['Paid', 1]], mv.map(x => `<tr><td>${esc(x.j.no || '')} ${srcTag(x.j)}</td><td>${esc(nm(x.l.acc))}</td><td>${esc(x.j.narr || '')}<br><span class="muted">${esc(contra(x.j, S))}</span></td>${td(x.l.dr ? m(x.l.dr) : '', 1)}${td(x.l.cr ? m(x.l.cr) : '', 1)}</tr>`), `<tr><td colspan="3"><b>Total</b></td>${td(m(rec), 1, 1)}${td(m(pay), 1, 1)}</tr>`)
      + '<h4 style="margin:14px 0 6px">Documents of the day (cancelled ones excluded)</h4>' + T([['Document'], ['Count', 1], ['Value', 1]], docs.map(d => `<tr><td>${d[0]}</td>${td(d[1].length, 1)}${td(m(sum(d[1], d[2])), 1)}</tr>`))
      + '<h4 style="margin:14px 0 6px">Entries by source</h4>' + T([['Source'], ['Entries', 1], ['Total debit', 1]], Object.keys(bySrc).sort().map(k => `<tr><td><span class="tag">${esc(k)}</span></td>${td(bySrc[k].n, 1)}${td(m(bySrc[k].dr), 1)}</tr>`))
      + '<h4 style="margin:14px 0 6px">Every entry posted on ' + day + '</h4>' + T(EH, entryRows(list));
  }

  /* ───────── 2. Day Book ───────── */
  function daybook() {
    const list = ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t && (!F.src || (j.source || 'manual') === F.src));
    LAST = { head: CSVH_E, rows: [], sub: F.f + ' to ' + F.t + (F.src ? ' · ' + F.src : '') };
    const dr = sum(list, j => sum(j.lines, l => l.dr || 0)), cr = sum(list, j => sum(j.lines, l => l.cr || 0));
    const cap = 400, shown = list.slice(0, cap);
    const body = []; let last = '';
    shown.forEach(j => { if (j.date !== last) { last = j.date; const day = list.filter(x => x.date === last); body.push(`<tr style="background:var(--bg2,#f3f3f3)"><td colspan="4"><b>${last}</b> · ${day.length} entr${day.length === 1 ? 'y' : 'ies'}</td>${td(m(sum(day, x => sum(x.lines, l => l.dr || 0))), 1, 1)}${td('', 1)}</tr>`); } body.push(entryRows([j]).join('')); });
    LAST.rows = []; entryRows(list);   /* the CSV always carries every entry, not only the ones shown */
    return `<div class="kp">${E.kpi('Entries', list.length, F.f + ' to ' + F.t)}${E.kpi('Total debit', m(dr), '')}${E.kpi('Total credit', m(cr), '')}</div>` + chk(dr === cr, dr === cr ? 'Total debits equal total credits' : 'Debits and credits differ by ' + m(dr - cr)) + (list.length > cap ? `<div class="muted" style="margin:6px 0">Showing the first ${cap} of ${list.length} entries. Narrow the dates to see the rest, or use Save CSV for everything.</div>` : '')
      + T(EH, body, `<tr><td colspan="4"><b>Total</b></td>${td(m(dr), 1, 1)}${td(m(cr), 1, 1)}</tr>`);
  }

  /* ───────── 3 / 4. Cash Book and Bank Book ───────── */
  function book(kind) {
    const accs = kind === 'cash' ? cashA() : bankA(), sel = F.acc && accs.includes(F.acc) ? [F.acc] : accs, S = new Set(sel);
    const open = bal(sel, 0, F.f), rows = []; let run = open;
    LAST = { head: ['Date', 'Entry', 'Account', 'Particulars', 'Received', 'Paid', 'Balance'], rows: [], sub: sel.map(nm).join(' / ') + ' · ' + F.f + ' to ' + F.t };
    csvLine(F.f, '', '', 'Opening balance', '', '', cents(open));
    let rc = 0, pm = 0;
    ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t).forEach(j => j.lines.forEach(l => {
      if (!S.has(l.acc) || !((l.dr || 0) || (l.cr || 0))) return;
      run += (l.dr || 0) - (l.cr || 0); rc += l.dr || 0; pm += l.cr || 0;
      const who = contra(j, S); csvLine(j.date, j.no || '', nm(l.acc), (j.narr || '') + ' | ' + who, l.dr ? cents(l.dr) : '', l.cr ? cents(l.cr) : '', cents(run));
      rows.push(`<tr${j.reversedBy ? ' style="opacity:.6"' : ''}><td>${j.date}</td><td>${esc(j.no || '')} ${srcTag(j)}</td>${sel.length > 1 ? `<td>${esc(nm(l.acc))}</td>` : ''}<td>${esc(j.narr || '')}<br><span class="muted">${esc(who)}</span></td>${td(l.dr ? m(l.dr) : '', 1)}${td(l.cr ? m(l.cr) : '', 1)}${td(m(run), 1)}</tr>`);
    }));
    csvLine(F.t, '', '', 'Closing balance', cents(rc), cents(pm), cents(run));
    const head = [['Date'], ['Entry']].concat(sel.length > 1 ? [['Account']] : []).concat([['Particulars'], ['Received', 1], ['Paid', 1], ['Balance', 1]]), n = head.length - 3;
    if (!sel.length) return '<div class="muted">There is no ' + (kind === 'cash' ? 'cash' : 'bank') + ' account in the chart of accounts.</div>';
    return `<div class="kp">${E.kpi('Opening balance', m(open), 'at ' + F.f)}${E.kpi('Received', m(rc), '')}${E.kpi('Paid', m(pm), '')}${E.kpi('Closing balance', m(run), 'at ' + F.t)}</div>` + chk(run === bal(sel, F.t), 'Closing balance agrees with the ledger as at ' + F.t)
      + T(head, [`<tr style="font-weight:600"><td colspan="${n + 2}">Opening balance</td>${td(m(open), 1, 1)}</tr>`].concat(rows), `<tr><td colspan="${n}"><b>Total / closing balance</b></td>${td(m(rc), 1, 1)}${td(m(pm), 1, 1)}${td(m(run), 1, 1)}</tr>`);
  }

  /* ───────── 5. Receipts & Payments Account ───────── */
  function rp() {
    const A = liqA(), S = new Set(A), rec = {}, pay = {};
    let tr = 0, tp = 0;
    ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t).forEach(j => {
      const L = sum(j.lines.filter(l => S.has(l.acc)), l => (l.dr || 0) - (l.cr || 0)); if (!L) return;
      const o = j.lines.filter(l => !S.has(l.acc));
      if (L > 0) { o.forEach(l => { const v = (l.cr || 0) - (l.dr || 0); if (v) rec[l.acc] = (rec[l.acc] || 0) + v; }); tr += L; }
      else { o.forEach(l => { const v = (l.dr || 0) - (l.cr || 0); if (v) pay[l.acc] = (pay[l.acc] || 0) + v; }); tp += -L; }
    });
    const open = bal(A, 0, F.f), close = bal(A, F.t), net = sum(E.rows('journalEntries').filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t), j => sum(j.lines.filter(l => S.has(l.acc)), l => (l.dr || 0) - (l.cr || 0)));
    const part = (o, tot) => Object.keys(o).sort().map(c => `<tr><td>${esc(nm(c))}</td>${td(m(o[c]), 1)}</tr>`).join('');
    LAST = { head: ['Side', 'Account', 'Amount'], rows: [], sub: F.f + ' to ' + F.t };
    csvLine('Receipts', 'Opening cash & bank', cents(open)); Object.keys(rec).sort().forEach(c => csvLine('Receipts', nm(c), cents(rec[c]))); csvLine('Receipts', 'TOTAL RECEIPTS incl. opening', cents(open + tr));
    csvLine('Payments', '', ''); Object.keys(pay).sort().forEach(c => csvLine('Payments', nm(c), cents(pay[c]))); csvLine('Payments', 'Closing cash & bank', cents(close)); csvLine('Payments', 'TOTAL PAYMENTS incl. closing', cents(tp + close));
    const side = (title, openRow, o, endRow, total) => `<div style="flex:1;min-width:300px"><h4 style="margin:6px 0">${title}</h4>${T([['Particulars'], ['Amount', 1]], [openRow].concat(part(o)), `<tr><td><b>Total</b></td>${td(m(total), 1, 1)}</tr>`)}</div>`;
    return `<div class="kp">${E.kpi('Opening cash & bank', m(open), 'at ' + F.f)}${E.kpi('Total receipts', m(tr), '')}${E.kpi('Total payments', m(tp), '')}${E.kpi('Closing cash & bank', m(close), 'at ' + F.t)}</div>`
      + chk(open + tr - tp === close && net === tr - tp, 'Opening + receipts − payments = closing cash & bank, and it agrees with the ledger')
      + `<div style="display:flex;gap:16px;flex-wrap:wrap">${side('Receipts', `<tr><td><b>Opening cash & bank</b></td>${td(m(open), 1, 1)}</tr>`, rec, '', open + tr)}${side('Payments', '', pay, '', tp + close).replace('</tbody>', `<tr><td><b>Closing cash & bank</b></td>${td(m(close), 1, 1)}</tr></tbody>`)}</div>`
      + '<div class="muted" style="margin-top:8px">Each receipt or payment is shown under the account on the other side of the entry, so the head names are your ledger accounts. Transfers between cash and bank accounts cancel out.</div>';
  }

  /* ───────── 6. Sales Book ───────── */
  function sales() {
    const rows = [], list = ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t && j.lines.some(l => l.acc === '4000' || l.acc === '4010'));
    LAST = { head: ['Date', 'Entry', 'Source', 'Narration', 'Gross sales', 'Discount', 'Net sales'], rows: [], sub: F.f + ' to ' + F.t };
    let g = 0, d = 0;
    list.forEach(j => { const a = sum(j.lines.filter(l => l.acc === '4000'), l => (l.cr || 0) - (l.dr || 0)), b = sum(j.lines.filter(l => l.acc === '4010'), l => (l.cr || 0) - (l.dr || 0)); g += a; d += b; csvLine(j.date, j.no || '', j.source || 'manual', j.narr || '', cents(a), cents(b), cents(a + b)); rows.push(`<tr${j.reversedBy ? ' style="opacity:.6"' : ''}><td>${j.date}</td><td>${esc(j.no || '')}</td><td>${esc(j.narr || '')}<br>${srcTag(j)}</td>${td(m(a), 1)}${td(m(b), 1)}${td(m(a + b), 1)}</tr>`); });
    return `<div class="kp">${E.kpi('Gross sales', m(g), '')}${E.kpi('Discounts', m(d), 'shown as a minus')}${E.kpi('Net sales', m(g + d), F.f + ' to ' + F.t)}${E.kpi('Entries', list.length, '')}</div>`
      + T([['Date'], ['Entry'], ['Details'], ['Gross sales', 1], ['Discount', 1], ['Net sales', 1]], rows, `<tr><td colspan="3"><b>Total</b></td>${td(m(g), 1, 1)}${td(m(d), 1, 1)}${td(m(g + d), 1, 1)}</tr>`)
      + '<div class="muted" style="margin-top:8px">Revenue is booked when goods are delivered; cancellations and returns appear as minus lines.</div>';
  }

  /* ───────── 7. Purchase Book ───────── */
  function purch() {
    const rows = [], list = ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t && j.lines.some(l => l.acc === '1300') && j.lines.some(l => l.acc === '2000'));
    LAST = { head: ['Date', 'Entry', 'Source', 'Narration', 'Stock value', 'Owed to supplier'], rows: [], sub: F.f + ' to ' + F.t };
    let sv = 0, ow = 0;
    list.forEach(j => { const a = sum(j.lines.filter(l => l.acc === '1300'), l => (l.dr || 0) - (l.cr || 0)), b = sum(j.lines.filter(l => l.acc === '2000'), l => (l.cr || 0) - (l.dr || 0)); sv += a; ow += b; csvLine(j.date, j.no || '', j.source || 'manual', j.narr || '', cents(a), cents(b)); rows.push(`<tr${j.reversedBy ? ' style="opacity:.6"' : ''}><td>${j.date}</td><td>${esc(j.no || '')}</td><td>${esc(j.narr || '')}<br>${srcTag(j)}</td>${td(m(a), 1)}${td(m(b), 1)}</tr>`); });
    return `<div class="kp">${E.kpi('Materials bought (net)', m(sv), 'added to stock')}${E.kpi('Owed to suppliers (net)', m(ow), 'bills less returns')}${E.kpi('Entries', list.length, F.f + ' to ' + F.t)}</div>`
      + T([['Date'], ['Entry'], ['Details'], ['Stock value', 1], ['Owed to supplier', 1]], rows, `<tr><td colspan="3"><b>Total</b></td>${td(m(sv), 1, 1)}${td(m(ow), 1, 1)}</tr>`)
      + '<div class="muted" style="margin-top:8px">Purchase bills, purchase returns and their cancellations. Payments to suppliers are in the Cash Book / Bank Book.</div>';
  }

  /* ───────── 8. Expense Book ───────── */
  function expbook() {
    const lines = []; ents().filter(j => (j.date || '') >= F.f && (j.date || '') <= F.t).forEach(j => j.lines.forEach(l => { if (isExp(l.acc) && ((l.dr || 0) || (l.cr || 0))) lines.push({ j, l, v: (l.dr || 0) - (l.cr || 0) }); }));
    LAST = { head: ['Date', 'Entry', 'Account', 'Narration', 'Amount'], rows: [], sub: F.f + ' to ' + F.t };
    const by = {}; lines.forEach(x => { by[x.l.acc] = (by[x.l.acc] || 0) + x.v; csvLine(x.j.date, x.j.no || '', nm(x.l.acc), x.l.narr || x.j.narr || '', cents(x.v)); });
    const tot = sum(lines, x => x.v);
    return `<div class="kp">${E.kpi('Total expenses', m(tot), F.f + ' to ' + F.t)}${E.kpi('Lines', lines.length, '')}${E.kpi('Accounts', Object.keys(by).length, '')}</div>`
      + '<h4 style="margin:10px 0 6px">By account</h4>' + T([['Account'], ['Amount', 1]], Object.keys(by).sort().map(c => `<tr><td>${esc(nm(c))}</td>${td(m(by[c]), 1)}</tr>`), `<tr><td><b>Total</b></td>${td(m(tot), 1, 1)}</tr>`)
      + '<h4 style="margin:14px 0 6px">Every expense line</h4>' + T([['Date'], ['Entry'], ['Account'], ['Details'], ['Amount', 1]], lines.slice(0, 500).map(x => `<tr${x.j.reversedBy ? ' style="opacity:.6"' : ''}><td>${x.j.date}</td><td>${esc(x.j.no || '')}</td><td>${esc(nm(x.l.acc))}</td><td>${esc(x.l.narr || x.j.narr || '')}<br>${srcTag(x.j)}</td>${td(m(x.v), 1)}</tr>`))
      + (lines.length > 500 ? `<div class="muted">Showing 500 of ${lines.length} lines; Save CSV has all of them.</div>` : '')
      + '<div class="muted" style="margin-top:8px">Cost of goods sold, wages absorbed into stock and job-closing adjustments are not expenses of the period on their own, so they are left out here (see the Profit & Loss).</div>';
  }

  const BUILD = { daily, daybook, cash: () => book('cash'), bank: () => book('bank'), rp, sales, purch, exp: expbook };
  const body = () => { try { return BUILD[F.tab](); } catch (e) { LAST = { head: [], rows: [], sub: '' }; return `<div class="bad">This book could not be built: ${esc(e.message)}</div>`; } };

  const bar = () => {
    const one = F.tab === 'daily', acc = F.tab === 'cash' || F.tab === 'bank';
    const accs = F.tab === 'cash' ? cashA() : bankA();
    return `<div class="bar" style="flex-wrap:wrap">${TABS.map(t => `<button class="btn ${F.tab === t[0] ? 'p' : ''}" data-a="bkTab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div>`
      + `<div class="bar" style="flex-wrap:wrap">${one ? `<button class="btn sm" data-a="bkDay" data-id="-1">‹ Previous day</button><input type="date" class="fs" data-f="bk.d" value="${F.d}"><button class="btn sm" data-a="bkDay" data-id="1">Next day ›</button><button class="btn sm" data-a="bkPre" data-id="td">Today</button>`
        : `<span class="muted">From</span><input type="date" class="fs" data-f="bk.f" value="${F.f}"><span class="muted">to</span><input type="date" class="fs" data-f="bk.t" value="${F.t}"><button class="btn sm" data-a="bkPre" data-id="td">Today</button><button class="btn sm" data-a="bkPre" data-id="mtd">This month</button><button class="btn sm" data-a="bkPre" data-id="lm">Last month</button><button class="btn sm" data-a="bkPre" data-id="fy">This year</button>`}`
      + (acc ? `<select class="fs" data-f="bk.acc"><option value="">All ${F.tab === 'cash' ? 'cash' : 'bank'} accounts</option>${accs.map(c => `<option value="${c}" ${F.acc === c ? 'selected' : ''}>${esc(nm(c))}</option>`).join('')}</select>` : '')
      + (F.tab === 'daybook' ? `<select class="fs" data-f="bk.src"><option value="">All sources</option>${[...new Set(E.rows('journalEntries').map(j => j.source || 'manual'))].sort().map(x => `<option ${F.src === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : '')
      + `<span class="gap"></span><button class="btn" data-a="bkCsv">⬇ Save CSV</button><button class="btn" data-a="bkPrint">🖨 Print</button></div>`;
  };

  E.route('books', 'Accounting Books', () => bar() + `<div id="bkb">${body()}</div>`);
  const redraw = () => { const b = E.$('bkb'); if (b) b.innerHTML = body(); };
  E.A.bkTab = t => { F.tab = t; E.go(); };
  E.A.bkDay = n => { F.d = addDays(F.d, +n); E.go(); };
  E.A.bkPre = id => {
    const t = E.today();
    if (F.tab === 'daily') F.d = t;
    else if (id === 'td') { F.f = t; F.t = t; }
    else if (id === 'mtd') { F.f = t.slice(0, 8) + '01'; F.t = t; }
    else if (id === 'lm') { const x = new Date(t.slice(0, 8) + '01T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - 1); F.f = x.toISOString().slice(0, 8) + '01'; F.t = addDays(t.slice(0, 8) + '01', -1); }
    else if (id === 'fy') { const fm = Math.min(12, Math.max(1, parseInt(E.setting && E.setting('fyMonth')) || 1)), y = +t.slice(0, 4), mo = +t.slice(5, 7); F.f = (mo >= fm ? y : y - 1) + '-' + String(fm).padStart(2, '0') + '-01'; F.t = t; }
    E.go();
  };
  E.A.bkCsv = () => {
    if (!LAST.rows.length && !LAST.head.length) return E.toast('Nothing to save', 'error');
    const rows = [[(E.factory() || {}).name || '', TITLE[F.tab], LAST.sub], LAST.head].concat(LAST.rows);
    E.download((F.tab + '-' + (F.tab === 'daily' ? F.d : F.f + '_' + F.t) + '.csv'), rows.map(r => r.map(E.csvCell).join(',')).join('\n'), 'text/csv');
  };
  E.A.bkPrint = () => {
    const w = window.open('', '_blank'); if (!w) return E.toast('Allow pop-ups to print', 'error');
    w.document.write('<html><head><title>' + TITLE[F.tab] + '</title><style>body{font:12px Arial;padding:18px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{padding:4px 6px;border-bottom:1px solid #ccc;text-align:left;vertical-align:top}th.r,td.r{text-align:right}.kp{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.k{border:1px solid #ccc;padding:6px 10px}.k small,.k i{display:block;color:#666;font-size:10px;font-style:normal}.tag{border:1px solid #aaa;border-radius:4px;padding:0 4px;font-size:10px}.muted{color:#666}.ok{color:#176b2c}.bad{color:#b00020}</style></head><body><h2 style="margin:0">' + esc((E.factory() || {}).name || '') + '</h2><h3 style="margin:2px 0">' + TITLE[F.tab] + '</h3><div class="muted">' + esc(LAST.sub) + '</div>' + (E.$('bkb') || {}).innerHTML + '</body></html>');
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  E.hooks.push(e => { const f = e.target && e.target.dataset && e.target.dataset.f; if (!f || f.slice(0, 3) !== 'bk.') return; const v = e.target.value; if ((f === 'bk.d' || f === 'bk.f' || f === 'bk.t') && !v) return; F[f.slice(3)] = v; redraw(); });
  E.books = { build: id => { const o = F.tab; F.tab = id; const h = body(); F.tab = o; return h; }, state: F };
})(window.ERP);
