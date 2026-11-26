/* SENTINEL - the unified factory agent (engine)
   One agent that merges the Accounting Guardian, the AI Assistant and a new "daily rhythm" intelligence.
   It never posts accounting entries by itself - it watches, learns how THIS factory normally works, notices what is missing
   (expenses, wages, attendance, opening stock ...), explains why it matters with real numbers, and tells you exactly what to do next
   with a button that opens the right screen. Things you confirm ("no expenses today") are remembered so it stops asking.
   E.sentinel = { analyze, state, tasks, readiness, ask, decl, banner, ... } - the look and feel is in sentinel-ui.js */
(E => {
  'use strict';
  const SN = E.sentinel = { state: { tasks: [], ready: null, rhythm: null, stats: null, at: '', ms: 0, busy: false, runs: 0 }, cfg: {} };
  const R = c => { try { return E.fid ? E.rows(c) : []; } catch (e) { return []; } };
  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const K = s => 'erp_sn_' + (E.fid || 'x') + '_' + s;
  const money = n => E.m(n);
  const H = x => E.esc(String(x == null ? '' : x));
  const pad = n => String(n).padStart(2, '0');
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const wday = d => new Date(d + 'T00:00:00Z').getUTCDay();
  const isWork = d => (E.isWorkingDate ? E.isWorkingDate(d) : wday(d) !== 0);
  const DNAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dlab = d => DNAME[wday(d)] + ' ' + d.slice(8) + '/' + d.slice(5, 7);
  const list = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const plural = (n, w) => n + ' ' + (n === 1 ? w : (/[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's'));
  const EXP_SRC = ['expense', 'petty', 'voucher', 'manual'];
  const NOT_EXP = ['5400', '5290', '5291', '5300', '5260', '5390', '5295'];
  const pastEod = () => { const n = new Date(), p = String(SN.cfg.eod || '17:30').split(':'), h = Number.isFinite(+p[0]) ? +p[0] : 17, m = Number.isFinite(+p[1]) ? +p[1] : 0; return n.getHours() * 60 + n.getMinutes() >= h * 60 + m; };

  /* ---------- things you confirmed: "no expenses that day" etc. ---------- */
  const decl = () => { const a = ls.get(K('decl'), {}), b = E.setting && E.setting('agentDecl'); return Object.assign({}, b && typeof b === 'object' ? b : {}, a); };
  SN.declare = async (key, days, items) => {
    const d = decl(); (days || []).forEach(x => { (d[x] = d[x] || {})[key] = 1; });
    if (key === 'stockZero') { d.stockZero = Object.assign({}, d.stockZero || {}); (items || []).forEach(id => { d.stockZero[id] = 1; }); }
    const keep = {}, lim = addDays(E.today(), -90); Object.keys(d).forEach(k => { if (k >= lim || k === 'stockZero') keep[k] = d[k]; });
    ls.set(K('decl'), keep); try { await E.setSetting({ agentDecl: keep }); } catch (e) { /* view-only users keep it on this device */ }
  };
  const declared = (date, key) => !!(decl()[date] && decl()[date][key]);
  const snoozes = () => ls.get(K('snooze'), {});
  SN.snooze = (id, days) => { const s = snoozes(), t = E.today(); s[id] = addDays(t, days || 1); Object.keys(s).forEach(k => { if (s[k] < t) delete s[k]; }); ls.set(K('snooze'), s); };
  const snoozed = id => { const s = snoozes()[id]; return !!s && s >= E.today(); };

  /* ---------- what happened on each day (from the real records) ---------- */
  function activity(from, to) {
    const m = {}, A = d => m[d] || (m[d] = { rcp: 0, rcpAmt: 0, sale: 0, buy: 0, pay: 0, exp: 0, expAmt: 0, wage: 0, prod: 0, att: 0, issue: 0, jv: 0 }), inR = d => d && d >= from && d <= to;
    R('receipts').forEach(r => { if (r.kind === 'credit' || r.reversed || !inR(r.date)) return; const a = A(r.date); a.rcp++; a.rcpAmt += r.amount || 0; });
    R('cheques').forEach(c => { const d = c.recvDate || c.date; if (c.dir !== 'in' || c.status === 'Cancelled' || !inR(d)) return; const a = A(d); a.rcp++; a.rcpAmt += c.amount || 0; });
    R('deliveries').forEach(d => { if (d.status !== 'Cancelled' && inR(d.date)) A(d.date).sale++; });
    R('purchases').forEach(p => { if (!p.cancelled && !p.opening && inR(p.date)) A(p.date).buy++; });
    R('payments').forEach(p => { if (p.kind !== 'debit' && !p.reversed && inR(p.date)) A(p.date).pay++; });
    const ex = {}; R('coa').forEach(a => { if (a.type === 'expense' && !NOT_EXP.includes(a.code)) ex[a.code] = 1; });
    R('journalEntries').forEach(j => { if (!inR(j.date)) return; const a = A(j.date); a.jv++; if (j.reversedBy || !EXP_SRC.includes(j.source || 'manual')) return; const v = j.lines.reduce((s, l) => s + (ex[l.acc] ? (l.dr || 0) : 0), 0); if (v > 0) { a.exp++; a.expAmt += v; } });
    R('wageRuns').forEach(w => { if (!w.cancelled && (w.kind === 'run' || w.kind === 'daily-salary') && inR(w.date)) A(w.date).wage++; });
    R('prodLogs').forEach(l => { if (l.status !== 'cancelled' && inR(l.date)) A(l.date).prod++; });
    R('attendance').forEach(a => { if (inR(a.date)) A(a.date).att++; });
    R('stockMoves').forEach(s => { if (!inR(s.date)) return; if (s.type === 'issue') A(s.date).issue++; else if (s.type === 'release') A(s.date).prod++; });
    return m;
  }
  const busy = a => !!a && (a.rcp || a.sale || a.buy || a.pay || a.prod || a.att || a.issue);

  /* ---------- go-live readiness (opening data) ---------- */
  function readiness() {
    const items = R('items').filter(i => i.active !== false), parties = R('parties'), moves = R('stockMoves'), withMove = new Set(moves.map(m => m.itemId)), zero = (decl().stockZero || {});
    const mats = items.filter(i => i.cat !== 'Finished Good'), fgs = items.filter(i => i.cat === 'Finished Good');
    const cov = L => L.length ? L.filter(i => withMove.has(i.id) || zero[i.id]).length / L.length : 1;
    const bank = R('coa').filter(a => a.bank || a.code === '1010'), bankSet = new Set(bank.map(a => a.code));
    const bankOpen = R('journalEntries').some(j => (j.source === 'opening') && j.lines.some(l => bankSet.has(l.acc) && l.dr));
    const pOpen = R('invoices').filter(x => x.opening).length + R('purchases').filter(x => x.opening).length;
    const S = [
      { id: 'items', label: 'Items & finished goods entered', done: items.length > 0, pct: items.length ? 1 : 0, detail: plural(mats.length, 'material') + ', ' + plural(fgs.length, 'finished good'), route: 'items', w: 2 },
      { id: 'parties', label: 'Customers & suppliers entered', done: parties.length > 0, pct: parties.length ? 1 : 0, detail: plural(parties.length, 'party'), route: 'parties', w: 2 },
      { id: 'pbal', label: 'Customer & supplier opening balances', done: pOpen > 0 || !parties.length, pct: pOpen > 0 ? 1 : 0, detail: pOpen ? plural(pOpen, 'opening document') + ' entered' : 'none entered yet', route: 'opening', w: 2 },
      { id: 'bank', label: 'Cash & bank opening balances', done: bankOpen, pct: bankOpen ? 1 : 0, detail: bankOpen ? 'entered' : 'no opening cash or bank balance found', route: 'opening', w: 2 },
      { id: 'stkm', label: 'Opening stock - materials & accessories', done: cov(mats) >= 0.999, pct: cov(mats), detail: mats.filter(i => !withMove.has(i.id) && !zero[i.id]).length + ' of ' + mats.length + ' still have no opening quantity', route: 'opening', w: 3 },
      { id: 'stkf', label: 'Opening stock - finished goods', done: cov(fgs) >= 0.999, pct: cov(fgs), detail: fgs.filter(i => !withMove.has(i.id) && !zero[i.id]).length + ' of ' + fgs.length + ' still have no opening quantity', route: 'opening', w: 3 },
      { id: 'emp', label: 'Employees entered', done: R('employees').length > 0, pct: R('employees').length ? 1 : 0, detail: plural(R('employees').length, 'employee'), route: 'employees', w: 1 }
    ];
    const tw = S.reduce((s, x) => s + x.w, 0), got = S.reduce((s, x) => s + x.w * x.pct, 0);
    return { steps: S, score: Math.round(got * 100 / tw), stockReady: cov(mats) >= 0.95 && cov(fgs) >= 0.95, missingItems: items.filter(i => !withMove.has(i.id) && !zero[i.id]), items: items.length };
  }
  /* shown on stock / margin / profit reports until opening stock is in */
  const STOCKY = ['stk', 'sal', 'prd'], STOCKY_IDS = ['pl', 'plm', 'trading', 'bs', 'ratios', 'contrib', 'mfg'];
  SN.banner = (repId, grp) => { const r = SN.state.ready; if (!r || r.stockReady || !r.items) return ''; if (!(STOCKY.includes(grp) || STOCKY_IDS.includes(repId))) return ''; return '<div class="card" style="border-left:4px solid #ef6c00;padding:10px 14px">🧭 <b>Opening stock is incomplete</b> - ' + r.missingItems.length + ' of ' + r.items + ' items have no opening quantity yet. Stock values, margins and profit on this report are <b>not final</b> until opening stock is entered. <a data-a="snGo" data-id="opening" style="cursor:pointer;color:var(--ac)">Open Opening Balances</a></div>'; };

  /* ---------- the detectors ---------- */
  const DET = SN.det = [];
  const det = (id, name, fn) => DET.push({ id, name, fn });

  det('expenses', 'Daily expenses not recorded', c => {
    const out = [], win = []; for (let i = c.eod ? 0 : 1; i <= 5; i++) win.push(addDays(c.today, -i));
    const gaps = win.filter(d => isWork(d) && busy(c.act[d]) && !(c.act[d].exp) && !declared(d, 'expenses')).sort();
    const r = c.base.expRate;
    if (!(gaps.length >= 2 || (gaps.length === 1 && r != null && r >= 0.6))) return out;
    const money_in = gaps.reduce((s, d) => s + c.act[d].rcpAmt, 0), what = [];
    if (money_in) what.push('receipts of ' + money(money_in)); if (gaps.some(d => c.act[d].prod)) what.push('production'); if (gaps.some(d => c.act[d].att)) what.push('attendance'); if (gaps.some(d => c.act[d].sale)) what.push('deliveries'); if (gaps.some(d => c.act[d].buy)) what.push('purchases');
    out.push({ id: 'sn:exp:' + gaps.join(','), sev: gaps.length >= 3 ? 'warn' : 'info', pr: 70 + gaps.length, icon: '🧾', area: 'Daily routine', title: 'No expenses recorded for ' + plural(gaps.length, 'working day') + ' (' + list(gaps.map(dlab)) + ')',
      why: 'On ' + (gaps.length > 1 ? 'those days' : 'that day') + ' the system recorded ' + (list(what) || 'activity') + ', but not one expense. ' + (r != null ? 'Normally you record expenses on ' + Math.round(r * 100) + '% of working days (' + c.base.expDays + ' of ' + c.base.bizDays + ' in the last 60 days). ' : 'Every factory has daily costs - transport, tea and food, repairs, power, packing. ') + 'Unrecorded costs make profit look higher than it really is and the cash book will not match the cash in your drawer.',
      steps: ['Collect the day’s bills and cash payments from the accounts clerk or admin.', 'Open Expenses (or Petty Cash) and add each voucher with the right account and the right date.', 'If really nothing was spent, press “No expenses on those days” so I stop asking.'],
      act: { label: 'Open Expenses', route: ['expenses', 'petty'] }, decl: { key: 'expenses', days: gaps, label: 'No expenses on those days' } });
    return out;
  });

  det('wages', 'Wages not recorded', c => {
    const out = [], runs = R('wageRuns').filter(w => !w.cancelled && (w.kind === 'run' || w.kind === 'daily-salary')), last = runs.reduce((m, w) => { const t = w.to || w.date; return t > m ? t : m; }, ''), emps = R('employees').filter(e => e.active !== false);
    /* piece-rate wages earned but unpaid for more than a week */
    const old = R('prodLogs').filter(l => l.status === 'accrued' && diff(l.date, c.today) > 7);
    if (old.length) { const amt = old.reduce((s, l) => s + (l.amount || 0), 0), first = old.map(l => l.date).sort()[0]; out.push({ id: 'sn:piece:' + first.slice(0, 7), sev: 'warn', pr: 76, icon: '💰', area: 'Daily routine', title: 'Piece-rate wages of ' + money(amt) + ' unpaid for over a week', why: 'Production entries from ' + dlab(first) + ' onward earned wages, but no wage run has paid them. Workers who are not paid on time leave, and the cost sits as a liability (account 2210).', steps: ['Open Wages and choose the period that covers these entries.', 'Run the wage calculation, check each worker’s amount, then pay.'], act: { label: 'Open Wages', route: ['wages', 'payroll'] } }); }
    /* attendance marked but no wage run after it */
    const att = Object.keys(c.act).filter(d => d > (last || '0000') && d < c.today && c.act[d].att && isWork(d) && !declared(d, 'wages')).sort();
    if (att.length >= 4 && emps.length) out.push({ id: 'sn:att:' + att[0], sev: att.length >= 8 ? 'warn' : 'info', pr: 74, icon: '👷', area: 'Daily routine', title: 'Attendance for ' + plural(att.length, 'day') + ' not yet turned into wages', why: 'Attendance is marked from ' + dlab(att[0]) + ' to ' + dlab(att[att.length - 1]) + (last ? ', but the last wage run only covered up to ' + dlab(last) : ' and no wage run exists yet') + '. Labour cost for these days is missing from your costs and profit.', steps: ['Open Daily Salaries (or Wages) and select the unpaid period.', 'Review the days and amounts, then process the run.', 'If these days are covered some other way, press “Already handled”.'], act: { label: 'Open Wages', route: ['daily-salaries', 'wages', 'payroll'] }, decl: { key: 'wages', days: att, label: 'Already handled' } });
    /* monthly salaries for last month */
    const pm = addDays(c.today.slice(0, 8) + '01', -1), pmKey = pm.slice(0, 7), mon = emps.filter(e => e.payType === 'MonthlySalaried' || e.payType === 'Monthly');
    if (mon.length && +c.today.slice(8) >= 6 && !runs.some(w => (w.to || w.date).slice(0, 7) >= pmKey || (w.from || '').slice(0, 7) === pmKey) && !declared(pm, 'wages')) out.push({ id: 'sn:msal:' + pmKey, sev: 'warn', pr: 78, icon: '🗓️', area: 'Daily routine', title: 'Monthly salaries for ' + pmKey + ' not processed', why: plural(mon.length, 'employee') + ' on monthly salary and no payroll run covers ' + pmKey + '. EPF/ETF and advance recoveries are also pending.', steps: ['Open Monthly Salaries and select ' + pmKey + '.', 'Check attendance, advances and loan recoveries, then process and pay.'], act: { label: 'Open Monthly Salaries', route: ['monthly-salaries', 'payroll'] }, decl: { key: 'wages', days: [pm], label: 'Already paid outside the system' } });
    return out;
  });

  det('attendance', 'Attendance not marked', c => {
    const used = R('attendance').length > 0, emps = R('employees').filter(e => e.active !== false).length; if (!emps) return [];
    const days = []; for (let i = 1; i <= 6; i++) { const d = addDays(c.today, -i); if (isWork(d) && !c.act[d].att && (c.act[d].rcp || c.act[d].sale || c.act[d].prod || c.act[d].exp) && !declared(d, 'attendance')) days.push(d); }
    if (days.length < 2) return [];
    return [{ id: 'sn:attn:' + days.sort()[0], sev: 'info', pr: 50, icon: '📋', area: 'Daily routine', title: 'Attendance not marked for ' + plural(days.length, 'working day'), why: 'Other work was recorded on ' + list(days.sort().map(dlab)) + ' but nobody’s attendance. ' + (used ? 'Without it, daily wages and overtime cannot be calculated correctly.' : 'You have ' + plural(emps, 'employee') + ' in the system. Attendance drives daily wages and overtime.'), steps: ['Open Attendance and mark each worker for those days (copy from the gate or supervisor sheet).', 'If no one worked, press “Nobody worked”.'], act: { label: 'Open Attendance', route: ['attendance'] }, decl: { key: 'attendance', days, label: 'Nobody worked' } }];
  });

  det('golive', 'Opening data missing', c => {
    const r = c.ready, out = []; if (!r.items) return out;
    const started = Object.values(c.act).some(a => a.rcp || a.exp || a.sale || a.buy || a.issue);
    const miss = r.missingItems.length;
    if (miss) out.push({ id: 'sn:openstock:' + Math.floor(miss / 5), sev: started ? 'warn' : 'info', pr: started ? 82 : 55, icon: '📦', area: 'Getting started', title: 'Opening stock missing for ' + miss + ' of ' + r.items + ' items',
      why: 'The system will not let you issue material to a job or deliver a finished good that has no stock, so production and sales are blocked for these items. Until the quantities are in, stock values, cost of sales and profit are not reliable' + (started ? ' - and you have already started recording receipts and expenses, so today’s profit figure is overstated or understated.' : '.'),
      steps: ['Ask the factory admin for the counted quantity (and value if known) of every material and finished good as on your start date.', 'Open Inventory → Opening stock / Adjustment, choose type “Opening stock”, and set the Date to your cut-over date (not today), one line per item and colour with quantity and unit cost.', 'Items that truly have no stock: press “These items truly have no stock” so I stop counting them.'], act: { label: 'Open Inventory', route: ['stock', 'opening'] }, decl: { key: 'stockZero', days: [], items: r.missingItems.map(i => i.id), label: 'These items truly have no stock' } });
    r.steps.filter(s => s.id === 'bank' && !s.done).forEach(() => { if (started) out.push({ id: 'sn:bankopen', sev: 'warn', pr: 80, icon: '🏦', area: 'Getting started', title: 'No opening cash or bank balance', why: 'Money is being received and spent, but the cash and bank accounts never got an opening balance, so every balance shown is only the movement since you started - not what is really in the drawer or the bank.', steps: ['Count the cash and read the bank statement balance for your start date.', 'Enter them in Opening Balances (Banks & Cash).'], act: { label: 'Open Opening Balances', route: ['opening'] } }); });
    return out;
  });

  det('silent', 'System not updated', c => {
    const dates = R('journalEntries').map(j => j.date).concat(R('attendance').map(a => a.date)).sort(); if (!dates.length) return [];
    const last = dates[dates.length - 1]; let n = 0; for (let d = addDays(last, 1); d < c.today; d = addDays(d, 1)) if (isWork(d)) n++;
    if (n < 2) return [];
    return [{ id: 'sn:silent:' + last, sev: n >= 4 ? 'warn' : 'info', pr: 60, icon: '⏳', area: 'Daily routine', title: 'Nothing recorded for ' + plural(n, 'working day') + ' (last entry ' + dlab(last) + ')', why: 'Books that are updated late lose detail - bills are forgotten, cash differences become impossible to trace and month-end becomes a rush. The longer the gap, the harder it is to remember.', steps: ['Open the Daily Workflow and record what happened, oldest day first.', 'If the factory was closed, mark those dates as holidays in Working Days.'], act: { label: 'Open Daily Workflow', route: ['daily', 'dashboard'] } }];
  });

  det('unallocated', 'Receipts not matched to invoices', c => {
    const L = R('receipts').filter(r => r.kind !== 'credit' && !r.reversed && diff(r.date, c.today) >= 1).map(r => ({ r, un: (r.amount || 0) - (r.allocs || []).reduce((s, a) => s + (a.a || 0), 0) })).filter(x => x.un > 100 && !x.r.refund);
    if (!L.length) return [];
    const tot = L.reduce((s, x) => s + x.un, 0), who = [...new Set(L.map(x => (R('parties').find(p => p.id === x.r.partyId) || {}).name).filter(Boolean))];
    return [{ id: 'sn:unalloc:' + L.length + ':' + Math.round(tot / 100), sev: 'info', pr: 48, icon: '🔗', area: 'Receivables', title: money(tot) + ' received but not matched to any invoice', why: 'Receipts from ' + list(who.slice(0, 3)) + (who.length > 3 ? ' and ' + (who.length - 3) + ' more' : '') + ' are sitting as customer credit. The customer’s invoices still look unpaid, so the ageing report overstates what they owe. This is common when payments arrive for opening balances.', steps: ['Open Sales & Receivables and find the customer.', 'Apply the credit to the oldest unpaid invoices (or the opening balance invoice).'], act: { label: 'Open Sales & Receivables', route: ['sales', 'advances'] } }];
  });

  det('duplicates', 'Possible duplicate entries', c => {
    const out = [], seen = {}; const add = (k, label, route) => { (seen[k] = seen[k] || { n: 0, label, route }).n++; };
    R('receipts').forEach(r => { if (r.kind === 'credit' || r.reversed || diff(r.date, c.today) > 14) return; add('r|' + r.partyId + '|' + r.amount + '|' + r.date, 'receipt of ' + money(r.amount) + ' from ' + ((R('parties').find(p => p.id === r.partyId) || {}).name || 'a customer') + ' on ' + r.date, 'sales'); });
    R('expenses').forEach(v => { if (v.kind !== 'voucher' || v.cancelled || diff(v.date, c.today) > 14) return; add('e|' + v.head + '|' + v.amount + '|' + v.date + '|' + (v.payee || ''), 'expense of ' + money(v.amount) + ' (' + (v.headName || v.head) + ') on ' + v.date, 'expenses'); });
    Object.keys(seen).filter(k => seen[k].n > 1).slice(0, 3).forEach(k => out.push({ id: 'sn:dup:' + k, sev: 'warn', pr: 66, icon: '👯', area: 'Accuracy', title: 'Possible double entry: ' + seen[k].label + ' recorded ' + seen[k].n + ' times', why: 'Same amount, same party and same date entered more than once. If it is a genuine repeat, ignore this; otherwise your cash and balances are wrong by the extra amount.', steps: ['Open the list and compare the entries.', 'If one is a mistake, cancel it - a reversing entry keeps the audit trail.'], act: { label: 'Open ' + (seen[k].route === 'sales' ? 'Sales & Receivables' : 'Expenses'), route: [seen[k].route] } }));
    return out;
  });

  det('recurring', 'Regular expense missing this month', c => {
    const out = [], now = c.today.slice(0, 7), months = [1, 2, 3, 4].map(i => addDays(now + '-01', -i * 28).slice(0, 7)).filter((m, i, a) => a.indexOf(m) === i), by = {};
    R('journalEntries').forEach(j => { if (!EXP_SRC.includes(j.source || 'manual') || j.reversedBy) return; const m = j.date.slice(0, 7); if (m !== now && !months.includes(m)) return; j.lines.forEach(l => { if (!(l.dr > 0) || NOT_EXP.includes(l.acc)) return; const a = R('coa').find(x => x.code === l.acc); if (!a || a.type !== 'expense') return; const o = by[l.acc] || (by[l.acc] = { name: a.name, m: {}, days: [] }); o.m[m] = (o.m[m] || 0) + l.dr; if (months.includes(m)) o.days.push(+j.date.slice(8)); }); });
    Object.keys(by).forEach(code => { const o = by[code], hist = months.filter(m => o.m[m]).length; if (hist < 3 || o.m[now]) return; const typ = Math.round(o.days.sort((a, b) => a - b)[Math.floor(o.days.length / 2)] || 15); if (+c.today.slice(8) < typ + 5) return; const avg = Math.round(months.reduce((s, m) => s + (o.m[m] || 0), 0) / hist);
      out.push({ id: 'sn:rec:' + code + ':' + now, sev: 'info', pr: 45, icon: '🔁', area: 'Daily routine', title: o.name + ' not recorded this month', why: 'You recorded ' + o.name + ' in ' + hist + ' of the last 4 months (about ' + money(avg) + ', usually around the ' + typ + 'th). Nothing yet this month - it may simply be unpaid, or forgotten.', steps: ['Check whether the bill has been paid.', 'Record it in Expenses (or Fixed Expenses if it repeats every month).'], act: { label: 'Open Expenses', route: ['expenses', 'fixedexpenses'] }, decl: { key: 'rec:' + code, days: [now + '-01'], label: 'Not due this month' } }); });
    return out.filter(t => !declared(now + '-01', t.decl.key));
  });

  /* ---------- today's checklist (always shown) ---------- */
  function todayList(c) {
    const a = c.act[c.today] || {}, d = c.today, tick = (ok, label, detail, route, key) => ({ ok, label, detail, route, key });
    return [
      tick(a.rcp + a.sale > 0, 'Money in & sales', a.rcp || a.sale ? [a.rcp ? plural(a.rcp, 'receipt') + ' ' + money(a.rcpAmt) : '', a.sale ? plural(a.sale, 'delivery') : ''].filter(Boolean).join(', ') : 'nothing yet', 'sales'),
      tick(a.exp > 0 || declared(d, 'expenses'), 'Expenses', a.exp ? plural(a.exp, 'voucher') + ' ' + money(a.expAmt) : declared(d, 'expenses') ? 'none today (confirmed)' : 'none recorded', 'expenses', 'expenses'),
      tick(a.att > 0 || declared(d, 'attendance'), 'Attendance', a.att ? plural(a.att, 'worker') + ' marked' : declared(d, 'attendance') ? 'nobody worked (confirmed)' : 'not marked', 'attendance', 'attendance'),
      tick(a.prod + a.issue > 0, 'Production', a.prod || a.issue ? (a.prod ? plural(a.prod, 'entry') : '') + (a.issue ? ' ' + plural(a.issue, 'material issue') : '') : 'nothing yet', 'production')
    ];
  }

  /* ---------- the analysis ---------- */
  SN.analyze = () => {
    if (!E.fid) return SN.state;
    const t0 = Date.now(), today = E.today(), from = addDays(today, -75), act = activity(from, today), eod = pastEod() && isWork(today);
    /* learn the normal rhythm from the 60 days before the last 5 */
    let biz = 0, ex = 0; for (let i = 6; i <= 66; i++) { const d = addDays(today, -i); if (!isWork(d) || !busy(act[d])) continue; biz++; if (act[d] && act[d].exp) ex++; }
    const base = { bizDays: biz, expDays: ex, expRate: biz >= 8 ? ex / biz : null };
    const ready = readiness(), c = { today, act: new Proxy(act, { get: (o, k) => o[k] || { rcp: 0, rcpAmt: 0, sale: 0, buy: 0, pay: 0, exp: 0, expAmt: 0, wage: 0, prod: 0, att: 0, issue: 0, jv: 0 } }), base, ready, eod };
    let tasks = []; DET.forEach(d => { try { tasks = tasks.concat(d.fn(c) || []); } catch (e) { console.error('Sentinel ' + d.id, e); } });
    tasks.forEach(t => { t.src = 'sentinel'; });
    /* fold in the Accounting Guardian */
    try { if (E.guardian) E.guardian.live().forEach(f => tasks.push({ id: 'gd:' + f.id, sev: f.sev, pr: f.sev === 'critical' ? 100 : f.sev === 'warn' ? 60 : 30, icon: f.sev === 'critical' ? '🛑' : f.sev === 'warn' ? '⚠️' : '💡', area: f.area || 'Books', title: f.title, why: (f.detail ? f.detail + ' ' : '') + (f.why || ''), steps: f.fix ? [f.fix] : [], act: { label: 'Open', route: [f.route || 'guardian'] }, src: 'guardian' })); } catch (e) { }
    tasks.forEach(t => { t.snoozed = snoozed(t.id); });
    const SV = { critical: 3, warn: 2, info: 1 }; tasks.sort((a, b) => (b.snoozed ? -1 : 0) - (a.snoozed ? -1 : 0) || SV[b.sev] - SV[a.sev] || b.pr - a.pr);
    /* 14-day rhythm grid */
    const cats = [['in', 'Money in / sales', a => a.rcp + a.sale], ['prod', 'Production', a => a.prod + a.issue], ['att', 'Attendance', a => a.att], ['exp', 'Expenses', a => a.exp], ['wage', 'Wages', a => a.wage], ['buy', 'Purchases', a => a.buy]], days = [];
    for (let i = 13; i >= 0; i--) days.push(addDays(today, -i));
    const grid = cats.map(([k, l, f]) => ({ k, l, cells: days.map(d => { const a = c.act[d], v = f(a), w = isWork(d); return { d, v, st: !w ? 'off' : v > 0 ? 'ok' : (k === 'exp' || k === 'att') && busy(a) && !declared(d, k === 'exp' ? 'expenses' : 'attendance') ? 'gap' : (d === today ? 'wait' : 'none') }; }) }));
    SN.state.tasks = tasks; SN.state.ready = ready; SN.state.rhythm = { days, grid }; SN.state.stats = { base, today: todayList(c) }; SN.state.at = new Date().toISOString(); SN.state.ms = Date.now() - t0; SN.state.runs++;
    SN.state.counts = { critical: tasks.filter(t => !t.snoozed && t.sev === 'critical').length, warn: tasks.filter(t => !t.snoozed && t.sev === 'warn').length, info: tasks.filter(t => !t.snoozed && t.sev === 'info').length };
    return SN.state;
  };
  SN.live = () => SN.state.tasks.filter(t => !t.snoozed);
  SN.go = r => { const ids = Array.isArray(r) ? r : [r], id = ids.find(x => E.R && E.R[x]) || ids[0]; if (id) location.hash = '#/' + id; return id; };

  /* ---------- Ask: plain-language questions answered from your own data ---------- */
  SN.ask = q => {
    const t = String(q || '').toLowerCase().trim(), S = SN.state, live = SN.live(), act = (label, route) => ({ label, route }), has = (...w) => w.some(x => t.includes(x));
    if (!t) return { html: 'Ask me anything about your factory - for example “what should I do next?”, “what is missing today?”, “cash balance”, “who owes us?”.' };
    if (has('next', 'what should i', 'todo', 'to do', 'instruct', 'help me', 'what now')) {
      if (!live.length) return { html: '✅ Nothing needs you right now. Your books look consistent and today’s routine is on track.' };
      return { html: '<b>Do this next:</b><br>' + live.slice(0, 3).map((x, i) => (i + 1) + '. ' + x.icon + ' ' + H(x.title)).join('<br>') + (live[0].steps && live[0].steps[0] ? '<br><br><i>Start with: ' + H(live[0].steps[0]) + '</i>' : ''), actions: [act(live[0].act ? live[0].act.label : 'Open', live[0].act ? live[0].act.route : 'guardian')] };
    }
    if (has('missing', 'gap', 'not record', 'forgot', 'forgotten', 'pending')) { const g = live.filter(x => x.src === 'sentinel'); return { html: g.length ? '<b>What I found missing:</b><br>' + g.map(x => x.icon + ' ' + H(x.title)).join('<br>') : 'Nothing is missing from the daily routine that I can see.' }; }
    if (has('today', 'summary', 'status')) return { html: '<b>Today</b><br>' + S.stats.today.map(x => (x.ok ? '✅ ' : '⬜ ') + H(x.label) + ' - ' + H(x.detail)).join('<br>') };
    if (has('ready', 'go live', 'go-live', 'start', 'opening')) return { html: '<b>Setup progress: ' + S.ready.score + '%</b><br>' + S.ready.steps.map(x => (x.done ? '✅ ' : '⬜ ') + H(x.label) + ' - ' + H(x.detail)).join('<br>'), actions: [act('Open Opening Balances', 'opening')] };
    if (has('report') && E.RS) { const reps = Object.values(E.RS.R).filter(r => (r.t + ' ' + (r.d || '') + ' ' + (r.kw || '')).toLowerCase().split(/\W+/).some(w => w.length > 3 && t.includes(w) && w !== 'report' && w !== 'reports')).slice(0, 5); if (reps.length) return { html: 'These reports match:', actions: reps.map(r => act(r.t, 'rs:' + r.id)) }; }
    if (has('cash', 'bank balance', 'bank')) { const A = R('coa').filter(a => a.bank || a.code === '1010' || a.code === '1000'); return { html: '<b>Cash & bank</b><br>' + A.map(a => H(a.name) + ': ' + money(E.bal(a.code))).join('<br>') }; }
    if (has('owe us', 'owes', 'receivable', 'debtor', 'outstanding')) { const m = {}; R('invoices').filter(i => !i.cancelled && i.total - i.paid > 0).forEach(i => m[i.partyId] = (m[i.partyId] || 0) + i.total - i.paid); const L = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); return { html: L.length ? '<b>Customers who owe you</b><br>' + L.map(([p, v]) => H((R('parties').find(x => x.id === p) || {}).name || '?') + ': ' + money(v)).join('<br>') : 'No customer owes you anything right now.', actions: [act('Receivables ageing', 'rs:ar')] }; }
    if (has('we owe', 'payable', 'creditor', 'suppliers owe')) { const m = {}; R('purchases').filter(i => !i.cancelled && i.total - i.paid > 0).forEach(i => m[i.partyId] = (m[i.partyId] || 0) + i.total - i.paid); const L = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); return { html: L.length ? '<b>You owe</b><br>' + L.map(([p, v]) => H((R('parties').find(x => x.id === p) || {}).name || '?') + ': ' + money(v)).join('<br>') : 'You owe no supplier anything right now.', actions: [act('Payables ageing', 'rs:ap')] }; }
    if (has('profit', 'loss', 'margin')) { if (!E.RS) return { html: 'Open the Report Suite → Profit & Loss.' }; const f = E.today().slice(0, 8) + '01', m = E.RS.d.range(f, E.today()), ns = E.RS.d.natC('4000', m) + E.RS.d.natC('4010', m), np = E.RS.d.sum(m, a => a.type === 'income') - E.RS.d.sum(m, a => a.type === 'expense'); return { html: '<b>This month so far</b><br>Net sales ' + money(ns) + '<br>Net profit ' + money(np) + (S.ready && !S.ready.stockReady ? '<br><br>⚠️ <i>Opening stock is incomplete, so this profit is not final.</i>' : ''), actions: [act('Profit & Loss', 'rs:pl')] }; }
    if (has('stock of', 'how much stock', 'stock')) { const w = t.replace(/.*stock of|how much stock( of)?|stock/g, '').trim(); const it = w ? R('items').find(i => (i.name || '').toLowerCase().includes(w) || (i.art || '').toLowerCase().includes(w)) : null; if (it && E.RS) { const qs = E.RS.d.stockAt(''); let q = 0, v = 0; Object.keys(qs).forEach(k => { if (qs[k].itemId === it.id) { q += qs[k].qty; v += qs[k].value; } }); return { html: '<b>' + H(it.name) + '</b>: ' + (Math.round(q * 1000) / 1000) + ' ' + H(it.unit || '') + ' on hand, worth ' + money(v), actions: [act('Item stock card', 'rs:itemcard:' + it.id)] }; } return { html: 'Tell me which item, for example “stock of leather”.', actions: [act('Stock valuation', 'rs:stockval')] }; }
    if (has('guardian', 'health', 'score', 'accounts ok')) { const g = E.guardian; return { html: g ? 'Guardian health score <b>' + g.score() + '/100</b> with ' + g.live().length + ' open finding(s).' : 'Guardian is not loaded.', actions: [act('Open Guardian', 'guardian')] }; }
    const m = /^(open|go to|show)\s+(.+)/.exec(t); if (m) { const key = m[2]; const n = (E.N || []).find(x => (x.label || '').toLowerCase().includes(key) || x.id === key); if (n) return { html: 'Opening ' + H(n.label) + '…', actions: [act('Open ' + n.label, n.id)], auto: n.id }; }
    const reps = E.RS ? Object.values(E.RS.R).filter(r => (r.t + ' ' + (r.d || '') + ' ' + (r.kw || '')).toLowerCase().split(/\W+/).some(w => w.length > 3 && t.includes(w))).slice(0, 4) : [];
    if (reps.length) return { html: 'These reports may help:', actions: reps.map(r => act(r.t, 'rs:' + r.id)) };
    return { html: 'I did not understand that yet. Try “what should I do next?”, “what is missing?”, “today”, “cash balance”, “who owes us?”, “profit this month” or “stock of leather”.' + (E.AI ? ' For open-ended questions use the full AI assistant.' : ''), actions: E.AI ? [act('Open AI assistant', '#ai')] : [] };
  };
})(window.ERP);
