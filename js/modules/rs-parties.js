/* REPORT SUITE — RECEIVABLES, PAYABLES, STATEMENTS, CHEQUES, COLLECTIONS
   Ageing is shown with every date: invoice date, credit days, due date, age, days overdue. For today it uses the live open items (checked against ledger 1200 / 2000);
   for a past date it ages the party's ledger balance on the first-in-first-out basis, so any date can be reported. */
(E => {
  const RS = E.RS, D = RS.d, dt = RS.dt, add = RS.add;
  const isToday = d => d >= E.today();

  /* open documents as at a date: [{party,no,date,due,total,paid,bal,ref,opening}] */
  function docsAt(kind, asat) {
    if (isToday(asat)) return D.openDocs(kind);
    const all = (kind === 'ar' ? E.rows('invoices') : E.rows('purchases')).filter(d => !d.cancelled && d.date <= asat), by = {};
    all.forEach(d => (by[d.partyId] = by[d.partyId] || []).push(d));
    const out = [];
    Object.keys(by).forEach(pid => {
      const L = D.partyLedger(pid, '', asat); let left = kind === 'ar' ? L.close : -L.close; if (left <= 0) return;
      by[pid].sort((a, b) => b.date.localeCompare(a.date) || (b.no || '').localeCompare(a.no || '')).forEach(d => {
        if (left <= 0) return; const take = Math.min(left, d.total); left -= take;
        out.push({ d, id: d.id, no: d.no, date: d.date, party: pid, due: D.dueOf(d), total: d.total, paid: d.total - take, bal: take, opening: !!d.opening, ref: kind === 'ar' ? ((d.dnIds || []).map(k => (E.D.deliveries.find(q => q.id === k) || {}).no).filter(Boolean).join(', ') || d.ref || '') : (d.invNo ? 'Supplier inv ' + d.invNo : '') });
      });
      if (left > 0) out.push({ id: '', no: 'On account / unallocated', date: '', party: pid, due: '', total: left, paid: 0, bal: left, opening: false, ref: 'Balance not matched to a document' });
    });
    return out;
  }
  const bucketOf = (days, S) => days <= 0 ? 0 : days <= S ? 1 : days <= 2 * S ? 2 : days <= 3 * S ? 3 : 4;
  const bLabels = S => ['Not due', '1-' + S + ' days', (S + 1) + '-' + 2 * S + ' days', (2 * S + 1) + '-' + 3 * S + ' days', 'Over ' + 3 * S + ' days'];

  const ageing = kind => ({
    id: kind, g: 'ar', t: kind === 'ar' ? 'Receivables Ageing (Customers)' : 'Payables Ageing (Suppliers)',
    d: kind === 'ar' ? 'What every customer owes, by invoice date, due date and days overdue, with credit limit use. Any date, any bucket size.' : 'What you owe every supplier, by bill date, due date and days overdue. Any date, any bucket size.',
    kw: kind === 'ar' ? 'debtors outstanding customers aging overdue' : 'creditors outstanding suppliers aging overdue',
    f: [kind === 'ar' ? 'cust' : 'supp', 'asat', { k: 'step', l: 'Bucket size (days)', def: 30 }, { k: 'basis', l: 'Count days from', o: [['due', 'Due date (days overdue)'], ['inv', 'Invoice / bill date (age)']], all: false, def: 'due' }, 'detail'], detailLabel: 'Show every invoice / bill (with dates)',
    build(P) {
      const S = Math.max(1, parseInt(P.extra.step) || 30), asat = P.asat, basis = P.extra.basis || 'due', L = bLabels(S);
      let docs = docsAt(kind, asat).filter(x => !P.party || x.party === P.party);
      docs.forEach(x => { x.age = x.date ? dt.diff(x.date, asat) : 9999; x.late = x.due ? dt.diff(x.due, asat) : 9999; x.b = bucketOf(basis === 'inv' ? x.age : x.late, S); });
      const by = {}; docs.forEach(x => (by[x.party] = by[x.party] || []).push(x));
      const bk = ['b0', 'b1', 'b2', 'b3', 'b4'], tot = [0, 0, 0, 0, 0], rows = [];
      const P_ = D.party;
      if (P.detail) {
        const cols = [{ k: 'party', l: kind === 'ar' ? 'Customer' : 'Supplier', t: 'text', always: true, w: 180 }, { k: 'no', l: 'Document', t: 'text', always: true }, { k: 'date', l: kind === 'ar' ? 'Invoice date' : 'Bill date', t: 'text' }, { k: 'terms', l: 'Credit days', t: 'int' }, { k: 'due', l: 'Due date', t: 'text' }, { k: 'age', l: 'Age (days)', t: 'days' }, { k: 'late', l: 'Days overdue', t: 'days' }, { k: 'ref', l: 'Reference', t: 'text', w: 160 }, { k: 'total', l: 'Document total', t: 'money' }, { k: 'paid', l: 'Settled', t: 'money' }, ...bk.map((k, i) => ({ k, l: L[i], t: 'money' })), { k: 'bal', l: 'Balance', t: 'money', always: true }];
        Object.keys(by).sort((a, b) => D.pname(a).localeCompare(D.pname(b))).forEach(pid => {
          const g = by[pid].sort((a, b) => (a.date || '').localeCompare(b.date || '')), s = { total: 0, paid: 0, bal: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
          g.forEach(x => { const r = { party: D.pname(pid), no: x.no, date: x.date, terms: P_(pid).days || 0, due: x.due, age: x.date ? x.age : '', late: x.due ? Math.max(0, x.late) : '', ref: x.ref, total: x.total, paid: x.paid, bal: x.bal }; bk.forEach((k, i) => r[k] = x.b === i ? x.bal : 0); ['total', 'paid', 'bal', ...bk].forEach(k => s[k] += r[k]); rows.push({ k: 'd', c: r, drill: { r: 'statement', p: { party: pid, preset: 'fy' } } }); });
          bk.forEach(k => tot[+k[1]] += s[k]); rows.push({ k: 's', c: Object.assign({ party: D.pname(pid), no: 'Total' }, s) });
        });
        const all = rows.filter(r => r.k === 's').reduce((q, r) => q + r.c.bal, 0);
        rows.push({ k: 't', c: Object.assign({ party: 'GRAND TOTAL', no: '' }, { total: rows.filter(r => r.k === 's').reduce((q, r) => q + r.c.total, 0), paid: rows.filter(r => r.k === 's').reduce((q, r) => q + r.c.paid, 0), bal: all }, Object.fromEntries(bk.map((k, i) => [k, tot[i]]))) });
        return wrap(cols, rows, tot, all, true);
      }
      const cols = [{ k: 'party', l: kind === 'ar' ? 'Customer' : 'Supplier', t: 'text', always: true, w: 200 }, { k: 'phone', l: 'Phone', t: 'text' }, { k: 'terms', l: 'Credit days', t: 'int' }, ...(kind === 'ar' ? [{ k: 'limit', l: 'Credit limit', t: 'money' }] : []), { k: 'n', l: 'Open docs', t: 'int' }, { k: 'oldest', l: 'Oldest document', t: 'text' }, { k: 'maxlate', l: 'Max days overdue', t: 'days', tot: false }, ...bk.map((k, i) => ({ k, l: L[i], t: 'money' })), { k: 'bal', l: 'Total outstanding', t: 'money', always: true }, ...(kind === 'ar' ? [{ k: 'use', l: 'Limit used', t: 'pct', tot: false }] : []), { k: 'last', l: kind === 'ar' ? 'Last receipt' : 'Last payment', t: 'text' }];
      Object.keys(by).forEach(pid => {
        const g = by[pid], p = P_(pid), r = { party: p.name || '(deleted)', phone: p.phone || '', terms: p.days || 0, limit: p.limit || 0, n: g.length, oldest: g.filter(x => x.date).map(x => x.date).sort()[0] || '', maxlate: Math.max(0, ...g.map(x => x.due ? x.late : 0)), bal: 0, last: kind === 'ar' ? D.lastReceipt(pid) : D.lastPayment(pid) };
        bk.forEach(k => r[k] = 0); g.forEach(x => { r['b' + x.b] += x.bal; r.bal += x.bal; }); bk.forEach(k => tot[+k[1]] += r[k]);
        r.use = kind === 'ar' && p.limit ? r.bal * 100 / p.limit : ''; if (kind === 'ar' && p.limit && r.bal > p.limit) r.party += '  ⚠ over limit';
        rows.push({ k: 'd', c: r, drill: { r: 'statement', p: { party: pid, preset: 'fy' } } });
      });
      rows.sort((a, b) => b.c.bal - a.c.bal);
      return wrap(cols, rows, tot, rows.reduce((q, r) => q + r.c.bal, 0), false);
      function wrap(cols, rows, tot, all, detail) {
        const over = tot.slice(1).reduce((s, x) => s + x, 0), parties = Object.keys(by).length, gl = E.acct(kind === 'ar' ? '1200' : '2000') ? E.bal(kind === 'ar' ? '1200' : '2000') : 0;
        const checks = isToday(asat) && !P.party ? [[all === gl, (kind === 'ar' ? 'Open invoices agree with ledger 1200 (Trade Receivables)' : 'Open bills agree with ledger 2000 (Trade Payables)'), all === gl ? E.m(gl) : 'Differs by ' + E.m(all - gl) + ' - manual entries posted straight to the control account?']] : [];
        return { cols, rows, flat: !detail, sub: 'As at ' + asat + (isToday(asat) ? ' (live open items)' : ' (balance aged first-in-first-out)'), kpis: [['Total outstanding', E.m(all)], ['Overdue', E.m(over), all ? (over * 100 / all).toFixed(1) + '% of total' : ''], [kind === 'ar' ? 'Customers' : 'Suppliers', String(parties)], ['Documents', String(docs.length)]], checks, notes: ['Credit days come from each party’s record; due date = document date + credit days. ' + (basis === 'inv' ? 'Buckets count days since the document date.' : 'Buckets count days past the due date.')], land: true };
      }
    }
  });
  add(ageing('ar')); add(ageing('ap'));

  /* ═══════════════ STATEMENT OF ACCOUNT ═══════════════ */
  add({
    id: 'statement', g: 'ar', t: 'Customer / Supplier Statement', d: 'Complete transaction statement of one customer or supplier - invoices, receipts, cheques, returns - with running balance.', kw: 'party ledger statement of account customer supplier',
    f: ['range', 'party'], preset: 'fy',
    build(P) {
      if (!P.party) return null; const p = D.party(P.party), L = D.partyLedger(P.party, P.from, P.to), rows = [];
      rows.push({ k: 'd', c: { date: P.from, no: '', type: 'Balance brought forward', ref: '', desc: '', dr: 0, cr: 0, bal: L.open }, cls: 'rsg' });
      L.rows.forEach(t => rows.push({ k: 'd', c: { date: t.date, no: t.no, type: t.type, ref: t.ref, desc: t.desc, dr: t.dr, cr: t.cr, bal: t.bal } }));
      const word = L.close > 0 ? p.name + ' owes you ' + E.m(L.close) : L.close < 0 ? 'You owe ' + p.name + ' ' + E.m(-L.close) : 'Nothing outstanding';
      return { cols: [{ k: 'date', l: 'Date', t: 'text', always: true }, { k: 'no', l: 'Entry', t: 'text' }, { k: 'type', l: 'Type', t: 'text', w: 180 }, { k: 'ref', l: 'Reference', t: 'text', w: 160 }, { k: 'desc', l: 'Details', t: 'text', w: 160 }, { k: 'dr', l: 'Debit', t: 'money', always: true }, { k: 'cr', l: 'Credit', t: 'money', always: true }, { k: 'bal', l: 'Balance', t: 'bal', tot: false, always: true }], rows, flat: true, sub: p.name + (p.phone ? ' · ' + p.phone : '') + ' · ' + RS.periodLabel(P.from, P.to), kpis: [['Opening', RS.fmt(L.open, 'bal') || '0.00'], ['Debits', E.m(L.dr)], ['Credits', E.m(L.cr)], ['Closing', RS.fmt(L.close, 'bal') || '0.00', word]], notes: ['Debit balance = the party owes you; credit balance = you owe the party. Credit terms: ' + (p.days || 0) + ' days' + (p.limit ? ' · credit limit ' + E.m(p.limit) : '') + '.'] };
    }
  });

  /* ═══════════════ PARTY BALANCES ═══════════════ */
  add({
    id: 'balances', g: 'ar', t: 'Party Balances List', d: 'Every customer and supplier with opening, debits, credits and closing balance for the period.', kw: 'debtors creditors list balances parties trial',
    f: ['range', 'gb', 'zero'], preset: 'fy', gb: [['all', 'Customers and suppliers'], ['Customer', 'Customers only'], ['Supplier', 'Suppliers only']],
    build(P) {
      const rows = []; let T = { od: 0, ox: 0, dr: 0, cr: 0, cd: 0, cc: 0 };
      E.rows('parties').filter(p => P.gb === 'all' || p.type === P.gb || p.type === 'Both').sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(p => {
        const L = D.partyLedger(p.id, P.from, P.to); if (!P.zero && !L.open && !L.dr && !L.cr && !L.close) return;
        const r = { name: p.name, type: p.type, code: p.code || '', terms: p.days || 0, open: L.open, dr: L.dr, cr: L.cr, close: L.close, cd: L.close > 0 ? L.close : 0, cc: L.close < 0 ? -L.close : 0 };
        T.dr += L.dr; T.cr += L.cr; T.cd += r.cd; T.cc += r.cc; rows.push({ k: 'd', c: r, drill: { r: 'statement', p: { party: p.id, from: P.from, to: P.to } } });
      });
      return { cols: [{ k: 'code', l: 'Code', t: 'text' }, { k: 'name', l: 'Party', t: 'text', always: true, w: 220 }, { k: 'type', l: 'Type', t: 'text' }, { k: 'terms', l: 'Credit days', t: 'int', tot: false }, { k: 'open', l: 'Opening', t: 'bal' }, { k: 'dr', l: 'Debits', t: 'money' }, { k: 'cr', l: 'Credits', t: 'money' }, { k: 'cd', l: 'Closing Dr (they owe)', t: 'money', always: true }, { k: 'cc', l: 'Closing Cr (we owe)', t: 'money', always: true }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), kpis: [['Owed to you', E.m(T.cd)], ['You owe', E.m(T.cc)], ['Net', E.m(T.cd - T.cc)]], notes: ['A party that is both customer and supplier shows its net position.'] };
    }
  });

  /* ═══════════════ CUSTOMER PERFORMANCE ═══════════════ */
  add({
    id: 'custperf', g: 'ar', t: 'Customer Sales vs Collection', d: 'For each customer: net sales, receipts, balance and how many days of sales are outstanding (collection performance).', kw: 'collection performance dso customer turnover',
    f: ['range'], preset: 'fy',
    build(P) {
      const sales = {}; D.salesIn(P.from, P.to).forEach(x => { const s = sales[x.party] || (sales[x.party] = 0); sales[x.party] = s + x.gross - x.ret - x.disc; });
      const rcp = {}; E.rows('receipts').filter(r => r.kind !== 'credit' && !r.reversed && r.date >= P.from && r.date <= P.to).forEach(r => rcp[r.partyId] = (rcp[r.partyId] || 0) + r.amount);
      E.rows('cheques').filter(c => c.dir === 'in' && !['Bounced', 'Cancelled'].includes(c.status) && (c.recvDate || c.date) >= P.from && (c.recvDate || c.date) <= P.to).forEach(c => rcp[c.partyId] = (rcp[c.partyId] || 0) + c.amount);
      const days = Math.max(1, dt.diff(P.from, P.to) + 1), rows = [];
      new Set([...Object.keys(sales), ...Object.keys(rcp)]).forEach(pid => { const L = D.partyLedger(pid, P.from, P.to), s = sales[pid] || 0, r = rcp[pid] || 0; rows.push({ k: 'd', c: { name: D.pname(pid), sales: s, rcp: r, pct: s ? r * 100 / s : '', close: L.close, dso: s && L.close > 0 ? L.close * days / s : '', terms: D.party(pid).days || 0 }, drill: { r: 'statement', p: { party: pid, from: P.from, to: P.to } } }); });
      rows.sort((a, b) => b.c.sales - a.c.sales);
      return { cols: [{ k: 'name', l: 'Customer', t: 'text', always: true, w: 220 }, { k: 'sales', l: 'Net sales', t: 'money' }, { k: 'rcp', l: 'Receipts (cash + cheques)', t: 'money' }, { k: 'pct', l: 'Collected % of sales', t: 'pct', tot: false }, { k: 'close', l: 'Closing balance', t: 'bal' }, { k: 'dso', l: 'Days of sales outstanding', t: 'days', tot: false }, { k: 'terms', l: 'Credit days given', t: 'int', tot: false }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['Days of sales outstanding = closing balance / net sales x days in the period. Compare it with the credit days you give.'] };
    }
  });

  /* ═══════════════ COLLECTIONS / PAYMENTS REGISTERS ═══════════════ */
  const register = (kind) => ({
    id: kind === 'in' ? 'collections' : 'payregister', g: 'ar', t: kind === 'in' ? 'Collections Register (Receipts)' : 'Payments Register (Suppliers)', d: kind === 'in' ? 'Every receipt and customer cheque received in the period - by customer, bank, month or as a list.' : 'Every supplier payment and cheque issued in the period - by supplier, bank, month or as a list.', kw: kind === 'in' ? 'receipts collections customer payments received' : 'payments suppliers paid cheques issued',
    f: [kind === 'in' ? 'cust' : 'supp', 'range', 'gb'], preset: 'mtd', gb: [['list', 'Every transaction'], ['party', kind === 'in' ? 'By customer' : 'By supplier'], ['month', 'By month'], ['acct', 'By bank / cash account']],
    build(P) {
      const col = kind === 'in' ? 'receipts' : 'payments', ev = [];
      E.rows(col).filter(r => r.kind !== (kind === 'in' ? 'credit' : 'debit') && r.date >= P.from && r.date <= P.to).forEach(r => { const by = (r.allocs || []).map(a => { const d = (kind === 'in' ? E.D.invoices : E.D.purchases).find(x => x.id === a.id); return d ? d.no : ''; }).filter(Boolean).join(', '); ev.push({ date: r.date, no: r.no, type: kind === 'in' ? 'Receipt' : 'Payment', party: r.partyId, acct: r.acc, ref: by ? 'Settles ' + by : '', amt: r.reversed ? 0 : r.amount, void: r.reversed ? r.amount : 0, st: r.reversed ? 'Reversed' : 'Posted' }); });
      E.rows('cheques').filter(c => c.dir === kind && (c.recvDate || c.date) >= P.from && (c.recvDate || c.date) <= P.to).forEach(c => { const bad = ['Bounced', 'Cancelled'].includes(c.status); ev.push({ date: c.recvDate || c.date, no: c.no, type: kind === 'in' ? 'Cheque received' : 'Cheque issued', party: c.partyId, acct: c.bankAcc || c.clearAcc || '', ref: 'Cheque ' + c.chqNo + ' · ' + (c.bank || '') + ' · dated ' + c.date, amt: bad ? 0 : c.amount, void: bad ? c.amount : 0, st: c.status }); });
      const f = ev.filter(x => !P.party || x.party === P.party); let rows;
      const nm = x => ({ list: null, party: D.pname(x.party), month: x.date.slice(0, 7), acct: x.acct ? x.acct + ' ' + ((E.acct(x.acct) || {}).name || '') : '(not yet banked)' })[P.gb];
      if (P.gb === 'list') rows = f.sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ k: 'd', c: { date: x.date, no: x.no, type: x.type, party: D.pname(x.party), acct: x.acct ? ((E.acct(x.acct) || {}).name || x.acct) : '', ref: x.ref, st: x.st, amt: x.amt, void: x.void } }));
      else { const g = {}; f.forEach(x => { const k = nm(x), r = g[k] || (g[k] = { date: k, no: '', type: '', party: k, acct: '', ref: '', st: '', n: 0, amt: 0, void: 0 }); r.n++; r.amt += x.amt; r.void += x.void; r.type = r.n + ' item(s)'; }); rows = Object.keys(g).sort().map(k => ({ k: 'd', c: Object.assign(g[k], { date: P.gb === 'month' ? k : '' }) })); }
      return { cols: [{ k: 'date', l: P.gb === 'list' ? 'Date' : 'Group', t: 'text', always: true }, { k: 'no', l: 'No', t: 'text' }, { k: 'type', l: 'Type', t: 'text' }, { k: 'party', l: kind === 'in' ? 'Customer' : 'Supplier', t: 'text', w: 200 }, { k: 'acct', l: 'Bank / account', t: 'text' }, { k: 'ref', l: 'Details', t: 'text', w: 240 }, { k: 'st', l: 'Status', t: 'text' }, { k: 'amt', l: 'Amount', t: 'money', always: true }, { k: 'void', l: 'Reversed / returned', t: 'money' }], rows, flat: true, sub: RS.periodLabel(P.from, P.to), notes: ['Cheques are counted when received/issued (the date shown). Returned, cancelled and reversed items are shown separately and are not in the Amount total.'] };
    }
  });
  add(register('in')); add(register('out'));

  /* ═══════════════ CHEQUES ═══════════════ */
  const chqRow = (c, today) => { const d = dt.diff(today, c.date); return { dir: c.dir === 'in' ? 'Received' : 'Issued', no: c.chqNo, party: D.pname(c.partyId), bank: c.bank || '', recv: c.recvDate || '', date: c.date, days: d, st: c.status, clear: c.clearDate || c.bounceDate || c.cancelDate || '', why: c.bounceReason || '', amt: c.amount }; };
  add({
    id: 'chqsched', g: 'ar', t: 'Post-Dated Cheque Maturity Schedule', d: 'Cheques in hand and cheques issued that have not cleared, grouped by how soon they mature - plan your cash.', kw: 'pdc cheques due maturity pending',
    f: ['party', { k: 'dir', l: 'Direction', o: [['in', 'Received (in hand)'], ['out', 'Issued']] }], gb: [['list', 'Cheque list'], ['bucket', 'Maturity buckets']],
    build(P) {
      const t = E.today(), L = E.rows('cheques').filter(c => c.status === 'Pending' && (!P.party || c.partyId === P.party) && (!P.extra.dir || c.dir === P.extra.dir)).sort((a, b) => a.date.localeCompare(b.date));
      const bk = d => d <= 0 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : d <= 30 ? 3 : d <= 60 ? 4 : 5, BL = ['Due / overdue', 'Within 7 days', '8-14 days', '15-30 days', '31-60 days', 'Over 60 days'];
      const inH = L.filter(c => c.dir === 'in').reduce((s, c) => s + c.amount, 0), out = L.filter(c => c.dir === 'out').reduce((s, c) => s + c.amount, 0), kp = [['Cheques in hand', E.m(inH)], ['Cheques issued', E.m(out)], ['Net cash effect', E.m(inH - out)]];
      if (P.gb === 'bucket') {
        const rows = BL.map((l, i) => { const x = L.filter(c => bk(dt.diff(t, c.date)) === i), a = x.filter(c => c.dir === 'in'), b = x.filter(c => c.dir === 'out'); return { k: 'd', c: { b: l, ni: a.length, ai: a.reduce((s, c) => s + c.amount, 0), no: b.length, ao: b.reduce((s, c) => s + c.amount, 0), net: a.reduce((s, c) => s + c.amount, 0) - b.reduce((s, c) => s + c.amount, 0) } }; });
        return { cols: [{ k: 'b', l: 'Matures', t: 'text', always: true }, { k: 'ni', l: 'Received (count)', t: 'int' }, { k: 'ai', l: 'Received (amount)', t: 'money' }, { k: 'no', l: 'Issued (count)', t: 'int' }, { k: 'ao', l: 'Issued (amount)', t: 'money' }, { k: 'net', l: 'Net', t: 'money', always: true }], rows, flat: true, sub: 'As at ' + t, kpis: kp };
      }
      return { cols: [{ k: 'dir', l: 'Direction', t: 'text' }, { k: 'no', l: 'Cheque no', t: 'text', always: true }, { k: 'party', l: 'Party', t: 'text', w: 200 }, { k: 'bank', l: 'Bank', t: 'text' }, { k: 'recv', l: 'Received / issued on', t: 'text' }, { k: 'date', l: 'Cheque date', t: 'text', always: true }, { k: 'days', l: 'Days to maturity', t: 'days', tot: false }, { k: 'amt', l: 'Amount', t: 'money', always: true }], rows: L.map(c => ({ k: 'd', c: chqRow(c, t), drill: { r: 'statement', p: { party: c.partyId, preset: 'fy' } } })), flat: true, sub: 'As at ' + t, kpis: kp, notes: ['Negative days = already due. Received cheques sit in account 1110 until deposited and cleared.'] };
    }
  });
  add({
    id: 'chqreg', g: 'ar', t: 'Cheque Register (all statuses)', d: 'Every cheque received or issued with status, clearing or return date and reason. Includes returned cheques.', kw: 'cheque register returned bounced cleared',
    f: ['range', 'party', { k: 'dir', l: 'Direction', o: [['in', 'Received'], ['out', 'Issued']] }, { k: 'st', l: 'Status', o: [['Pending', 'Pending'], ['Cleared', 'Cleared'], ['Bounced', 'Returned'], ['Cancelled', 'Cancelled'], ['Endorsed', 'Endorsed']] }], preset: 'fy',
    build(P) {
      const t = E.today(), L = E.rows('cheques').filter(c => c.date >= P.from && c.date <= P.to && (!P.party || c.partyId === P.party) && (!P.extra.dir || c.dir === P.extra.dir) && (!P.extra.st || c.status === P.extra.st)).sort((a, b) => a.date.localeCompare(b.date));
      const ret = L.filter(c => c.status === 'Bounced');
      return { cols: [{ k: 'dir', l: 'Direction', t: 'text' }, { k: 'no', l: 'Cheque no', t: 'text', always: true }, { k: 'party', l: 'Party', t: 'text', w: 200 }, { k: 'bank', l: 'Bank', t: 'text' }, { k: 'recv', l: 'Received / issued', t: 'text' }, { k: 'date', l: 'Cheque date', t: 'text', always: true }, { k: 'st', l: 'Status', t: 'text' }, { k: 'clear', l: 'Cleared / returned on', t: 'text' }, { k: 'why', l: 'Return reason', t: 'text' }, { k: 'amt', l: 'Amount', t: 'money', always: true }], rows: L.map(c => ({ k: 'd', c: chqRow(c, t), drill: { r: 'statement', p: { party: c.partyId, preset: 'fy' } } })), flat: true, sub: RS.periodLabel(P.from, P.to) + ' (by cheque date)', kpis: [['Cheques', String(L.length)], ['Value', E.m(L.reduce((s, c) => s + c.amount, 0))], ['Returned', String(ret.length), E.m(ret.reduce((s, c) => s + c.amount, 0))]] };
    }
  });

  /* ═══════════════ CREDIT CONTROL ═══════════════ */
  add({
    id: 'credit', g: 'ar', t: 'Credit Control & Overdue Customers', d: 'Customers over their credit limit or with overdue invoices, ranked by amount overdue - for collection follow-up.', kw: 'overdue credit limit exceeded collection follow up',
    f: ['asat'],
    build(P) {
      const docs = docsAt('ar', P.asat), by = {}; docs.forEach(x => { const g = by[x.party] || (by[x.party] = { bal: 0, over: 0, oldest: '', maxlate: 0, n: 0 }); g.bal += x.bal; g.n++; const late = x.due ? dt.diff(x.due, P.asat) : 9999; if (late > 0) { g.over += x.bal; g.maxlate = Math.max(g.maxlate, late); } if (x.date && (!g.oldest || x.date < g.oldest)) g.oldest = x.date; });
      const rows = Object.keys(by).map(pid => { const p = D.party(pid), g = by[pid], lim = p.limit || 0; return { k: 'd', c: { name: p.name, phone: p.phone || '', terms: p.days || 0, limit: lim, bal: g.bal, avail: lim ? lim - g.bal : '', over: g.over, late: Math.min(g.maxlate, 99999), cq: E.rows('cheques').filter(c => c.partyId === pid && c.dir === 'in' && c.status === 'Pending').reduce((s, c) => s + c.amount, 0), flag: (lim && g.bal > lim ? 'OVER LIMIT ' : '') + (g.over ? 'OVERDUE' : '') }, drill: { r: 'statement', p: { party: pid, preset: 'fy' } } }; }).filter(r => r.c.over || (r.c.limit && r.c.bal > r.c.limit)).sort((a, b) => b.c.over - a.c.over);
      return { cols: [{ k: 'name', l: 'Customer', t: 'text', always: true, w: 200 }, { k: 'phone', l: 'Phone', t: 'text' }, { k: 'terms', l: 'Credit days', t: 'int', tot: false }, { k: 'limit', l: 'Credit limit', t: 'money' }, { k: 'bal', l: 'Outstanding', t: 'money' }, { k: 'avail', l: 'Limit left', t: 'money', tot: false }, { k: 'over', l: 'Overdue amount', t: 'money', always: true }, { k: 'late', l: 'Worst days overdue', t: 'days', tot: false }, { k: 'cq', l: 'Cheques in hand', t: 'money' }, { k: 'flag', l: 'Alert', t: 'text' }], rows, flat: true, sub: 'As at ' + P.asat, kpis: [['Customers to follow up', String(rows.length)], ['Total overdue', E.m(rows.reduce((s, r) => s + r.c.over, 0))]] };
    }
  });
})(window.ERP);
