/* ACCOUNTING GUARDIAN + YEAR-END CLOSE + CHART-OF-ACCOUNTS CLEAN-UP
   1. Guardian  - watches the books by itself (on opening, after every posting, every few minutes). It runs every control total,
      then looks for things a careful accountant would notice: abnormal balances, price jumps, sales below cost, material
      over-use against the BOM, expense spikes against your own history, stale receivables/deliveries, missed depreciation,
      unremitted EPF/ETF, manual journals on control accounts, back-dated entries, BOM gaps and duplicate accounts.
      Every finding says WHAT is wrong, WHY it matters and WHAT TO DO, and can be snoozed. New critical findings notify you.
   2. Year-End Close - checklist, profit carried forward to retained earnings, period lock, saved year-end snapshot, reopen.
   3. Account clean-up - finds duplicate accounts and merges them safely (balance moved by a journal, old account hidden). */
(E => {
  'use strict';
  const R = c => { try { return E.fid ? E.rows(c) : []; } catch (e) { return []; } };
  const day = s => String(s || '').slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ago = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const ym = s => s.slice(0, 7);
  const money = n => E.m(n);
  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const NK = s => 'erp_gd_' + E.fid + '_' + s;
  const SEV = { critical: 3, warn: 2, info: 1 };
  const SEVN = { critical: 'Critical', warn: 'Warning', info: 'Notice' };
  const CONTROL = ['1200', '1210', '1300', '1310', '1320', '2000', '2210', '2200', '2100', '1110', '2150', '1250', '2400', '1260'];
  const CONTRA = ['1410', '4010', '5290', '5291'];

  /* ---------- tuneable limits (shown on the Rules list) ---------- */
  const TH = { priceMove: 0.15, lowMargin: 0.05, bomOver: 0.10, wastagePct: 0.03, spikeX: 1.5, spikeMin: 500000, recvDays: 60, unbilledDays: 14, epfDays: 45, backdate: 35 };

  const nameOf = (col, id) => { const x = R(col).find(r => r.id === id); return x ? (x.name || x.no || x.code || '') : ''; };
  const itemName = id => { const i = R('items').find(x => x.id === id); return i ? (i.art || i.name) : 'item'; };

  /* ---------- the rules ---------- */
  const RULES = [];
  const rule = (id, area, name, desc, fn) => RULES.push({ id, area, name, desc, fn });

  rule('controls', 'Integrity', 'Control totals', 'Runs every Health Check control: debits = credits, stock = ledger, receivables, payables, WIP, cheques, wages, staff loans.', ctx => {
    const out = [];
    (E.healthChecks ? E.healthChecks() : []).forEach(c => {
      if (c[0]) return;
      out.push({ id: 'hc:' + c[1], sev: 'critical', area: 'Integrity', title: c[1], detail: c[2],
        why: 'Two records that must always agree do not. Something was posted outside its normal screen, or a save was interrupted. Every report that uses this account is now unreliable.',
        fix: 'Open the Health Check, find the document that differs, then correct the record or reverse the stray journal. Do not close a period while this is red.', route: 'health' });
    });
    return out;
  });

  rule('abnormal', 'Integrity', 'Abnormal balances', 'An account sitting on the wrong side (for example stock below zero, a supplier account in debit, an expense in credit).', ctx => {
    const out = [];
    E.rows('coa').filter(a => !a.inactive).forEach(a => {
      if (CONTRA.includes(a.code)) return;
      const b = E.bal(a.code);
      if (!b) return;
      const must = ['1300', '1310', '1320'].includes(a.code) || a.bank, soft = ['1200', '2000', '2200', '2100', '1000', '1010'].includes(a.code) || a.type === 'income' || a.type === 'expense';
      if (b < 0 && (must || soft) && !(a.code === '5300')) {
        out.push({ id: 'ab:' + a.code, sev: must ? 'critical' : 'warn', area: 'Integrity', title: a.code + ' ' + a.name + ' has an abnormal balance', detail: 'Balance ' + money(b) + ' on the wrong side.',
          why: a.type === 'expense' || a.type === 'income' ? 'An expense with a credit balance (or income with a debit balance) usually means a wrong account was used or an entry was reversed twice.' : 'This account cannot normally go below zero. It points to a missing entry, a double entry or the wrong account.',
          fix: 'Open the ledger for this account, find the entry that pushed it below zero, and correct it with a reversal or a proper entry.', route: 'ledger' });
      }
    });
    return out;
  });

  rule('manualjv', 'Integrity', 'Manual journals on control accounts', 'Journals typed by hand that touch stock, receivables, payables, wages, cheques or loans bypass the sub-ledgers.', ctx => {
    const cut = addDays(ctx.today, -90), bad = R('journalEntries').filter(j => j.source === 'manual' && j.date >= cut && !j.reversedBy && j.narr && !/^Reversal/.test(j.narr) && j.lines.some(l => CONTROL.includes(l.acc)));
    if (!bad.length) return [];
    return [{ id: 'manualjv', sev: 'warn', area: 'Integrity', title: bad.length + ' manual journal(s) touch control accounts', detail: bad.slice(0, 5).map(j => j.no + ' ' + j.date).join(' · ') + (bad.length > 5 ? ' …' : ''),
      why: 'Stock, receivable, payable, wage and cheque balances are also kept by their own screens. A hand-typed journal changes the ledger but not the sub-ledger, so the two drift apart.',
      fix: 'Post these through the proper screen (purchase, invoice, receipt, payment, cheque desk, payroll). If a journal is genuinely needed, tell the Guardian by snoozing this notice.', route: 'journal' }];
  });

  rule('futurejv', 'Integrity', 'Future and back-dated entries', 'Entries dated well into the future, or entered long after their date in an open period.', ctx => {
    const out = [], fut = R('journalEntries').filter(j => j.date > addDays(ctx.today, 7)), lk = E.setting('lockedUntil') || '';
    if (fut.length) out.push({ id: 'future', sev: 'warn', area: 'Integrity', title: fut.length + ' entry(ies) dated more than a week ahead', detail: fut.slice(0, 4).map(j => j.no + ' ' + j.date).join(' · '),
      why: 'Future dates hide cost or income from today\'s reports and usually come from a wrong year or month typed in a date box.', fix: 'Reverse the entry and post it again with the correct date.', route: 'journal' });
    const back = R('journalEntries').filter(j => j.createdAt && day(j.createdAt) >= addDays(ctx.today, -3) && ago(j.date, day(j.createdAt)) > TH.backdate && j.source !== 'reversal' && !(lk && j.date <= lk));
    if (back.length) out.push({ id: 'backdated', sev: 'info', area: 'Integrity', title: back.length + ' entry(ies) entered recently but dated more than ' + TH.backdate + ' days back', detail: back.slice(0, 4).map(j => j.no + ' ' + j.date).join(' · '),
      why: 'Back-dating changes reports you may already have printed or filed. It is sometimes right (late bills) but should always be intentional.', fix: 'Confirm each one is intended. Lock the period after month-end so old months cannot change.', route: 'closing' });
    return out;
  });

  rule('price', 'Costing', 'Purchase price jumps', 'A material bought at a price far from its previous purchases or from your average cost.', ctx => {
    const out = [], by = {};
    R('purchases').filter(p => !p.cancelled).sort((a, b) => a.date.localeCompare(b.date)).forEach(p => p.lines.forEach(l => { (by[l.itemId] = by[l.itemId] || []).push({ d: p.date, r: l.rate, no: p.no }); }));
    Object.keys(by).forEach(id => {
      const a = by[id]; if (a.length < 2) return; const last = a[a.length - 1]; if (ago(last.d, ctx.today) > 45) return;
      const prev = a.slice(0, -1).slice(-5), avg = prev.reduce((s, x) => s + x.r, 0) / prev.length; if (!avg) return;
      const ch = (last.r - avg) / avg;
      if (Math.abs(ch) >= TH.priceMove) out.push({ id: 'price:' + id + ':' + last.no, sev: ch > 0 ? 'warn' : 'info', area: 'Costing', title: itemName(id) + ' price ' + (ch > 0 ? 'rose ' : 'fell ') + Math.round(Math.abs(ch) * 100) + '%',
        detail: last.no + ' (' + last.d + ') at ' + money(last.r) + ' vs earlier average ' + money(Math.round(avg)),
        why: 'The weighted-average cost of this material moves with every purchase, so job costs from now on are higher/lower. A typo in the rate (an extra zero) would silently distort stock value and every job that uses it.',
        fix: ch > 0 ? 'Check the supplier bill. If the rate is a typing error, cancel and re-enter the purchase. If the price really rose, review your selling prices.' : 'Check the bill for a typing error. If genuine, note the better supplier price.', route: 'matledger' });
    });
    return out;
  });

  rule('belowcost', 'Sales', 'Sales below cost', 'Deliveries priced under (or barely above) their cost of production.', ctx => {
    const out = [], cut = addDays(ctx.today, -60);
    R('deliveries').filter(d => d.status !== 'Cancelled' && d.date >= cut).forEach(d => {
      const amt = d.lines.reduce((s, l) => s + l.amount, 0), cost = d.lines.reduce((s, l) => s + l.cost, 0); if (!cost) return;
      const mg = (amt - cost) / (amt || 1);
      if (amt < cost) out.push({ id: 'below:' + d.no, sev: 'critical', area: 'Sales', title: d.no + ' sold below cost', detail: 'Sales ' + money(amt) + ' vs cost ' + money(cost) + ' (loss ' + money(cost - amt) + ')', why: 'Every pair on this delivery loses money. It is usually a wrong price, wrong pack count or a missing discount rule.', fix: 'Check the rate per pair on the delivery. If the price is right, review the job cost - it may be too high.', route: 'sales' });
      else if (mg < TH.lowMargin) out.push({ id: 'lowm:' + d.no, sev: 'info', area: 'Sales', title: d.no + ' margin only ' + (mg * 100).toFixed(1) + '%', detail: 'Sales ' + money(amt) + ' vs cost ' + money(cost), why: 'Almost no profit before overheads and selling costs.', fix: 'Review price and cost.', route: 'sales' });
    });
    return out;
  });

  rule('bomover', 'Costing', 'Material use against BOM', 'Materials issued to an open job beyond what the BOM allows for the pairs started.', ctx => {
    const out = [];
    R('jobs').filter(j => j.status === 'In Progress').forEach(j => {
      const need = {};
      R('jobLines').filter(l => l.jobId === j.id && l.started > 0).forEach(l => { const it = R('items').find(x => x.id === l.itemId); ((it && it.bom) || []).forEach(b => { const k = b.itemId + '|' + (b.variantId || ''); need[k] = (need[k] || 0) + b.qty * l.started * ((it && it.pack) || 1); }); });
      Object.keys(need).forEach(k => {
        const [iid, vid] = k.split('|'), used = R('issues').filter(x => x.jobId === j.id && x.itemId === iid && (x.variantId || '') === vid), q = used.reduce((s, x) => s + x.qty, 0), v = used.reduce((s, x) => s + x.value, 0);
        if (q > need[k] * (1 + TH.bomOver) && (q - need[k]) * (v / (q || 1)) > 50000) out.push({ id: 'bom:' + j.id + ':' + k, sev: 'warn', area: 'Costing', title: j.no + ': ' + itemName(iid) + ' used ' + Math.round((q / need[k] - 1) * 100) + '% above BOM',
          detail: 'Issued ' + (Math.round(q * 1000) / 1000) + ' vs BOM allows ' + (Math.round(need[k] * 1000) / 1000) + ' (extra value about ' + money(Math.round((q - need[k]) * v / q)) + ')', why: 'Either the BOM is too tight, material is being wasted or taken for something else, or issues were entered twice. The extra cost lands on this job.', fix: 'Compare with the Job material tab. Correct a wrong issue by returning the extra to stock, or update the BOM if the real usage is higher.', route: 'jobs' });
      });
    });
    return out;
  });

  rule('wastage', 'Costing', 'Wastage level', 'Factory loss this month compared with the materials put into production.', ctx => {
    const ms = ctx.today.slice(0, 8) + '01';
    let loss = 0, issued = 0;
    ctx.JL.forEach(l => { if (l.date < ms) return; if (l.acc === '5300') loss += l.dr - l.cr; if (l.acc === '1300' && l.src === 'issue') issued += l.cr - l.dr; });
    if (loss > 100000 && issued > 0 && loss / issued > TH.wastagePct) return [{ id: 'wastage', sev: 'warn', area: 'Costing', title: 'Factory loss is ' + (loss * 100 / issued).toFixed(1) + '% of materials issued this month', detail: money(loss) + ' lost against ' + money(issued) + ' issued',
      why: 'Wastage above your normal level eats margin directly.', fix: 'Open the Factory Loss account and look for damaged batches, cutting waste or stock-take shortages.', route: 'ledger' }];
    return [];
  });

  rule('spike', 'Expenses', 'Expense spikes', 'An expense account running well above its own three-month average.', ctx => {
    const out = [], t = ctx.today, curM = ym(t), dn = +t.slice(8, 10), mkey = k => { const d = new Date(t.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); };
    const mths = [1, 2, 3, 4].map(mkey), per = {};
    ctx.JL.forEach(l => { const a = ctx.acc[l.acc]; if (!a || a.type !== 'expense' || ['5290', '5291', '5400', '5300', '5260', '6150', '5295', '5390'].includes(l.acc)) return; const m = ym(l.date); if (m !== curM && !mths.includes(m)) return; (per[l.acc] = per[l.acc] || {})[m] = ((per[l.acc] || {})[m] || 0) + l.dr - l.cr; });
    Object.keys(per).forEach(code => {
      const p = per[code], base = [mths[1], mths[2], mths[3]].map(m => p[m] || 0), avg = base.reduce((s, x) => s + x, 0) / 3; if (avg <= 0 || base.filter(x => x > 0).length < 2) return;
      const chk = (val, label) => { if (val > avg * TH.spikeX && val - avg > TH.spikeMin) out.push({ id: 'spike:' + code + ':' + label, sev: 'warn', area: 'Expenses', title: ctx.acc[code].name + ' is ' + Math.round(val * 100 / avg) + '% of its usual level (' + label + ')', detail: money(Math.round(val)) + ' vs three-month average ' + money(Math.round(avg)),
        why: 'A sudden jump is either a real cost increase, a one-off, or an entry posted to the wrong account or twice.', fix: 'Open the ledger for this account and review the biggest entries.', route: 'ledger' }); };
      if (dn >= 5) chk(p[curM] || 0, 'this month so far');
      chk(p[mths[0]] || 0, mths[0]);
    });
    return out;
  });

  rule('recv', 'Receivables', 'Overdue customers', 'Invoices unpaid beyond ' + TH.recvDays + ' days.', ctx => {
    const old = R('invoices').filter(i => !i.cancelled && i.total - i.paid > 0 && ago(i.date, ctx.today) > TH.recvDays);
    if (!old.length) return [];
    const tot = old.reduce((s, i) => s + i.total - i.paid, 0), very = old.filter(i => ago(i.date, ctx.today) > 120).length;
    return [{ id: 'recv', sev: very ? 'warn' : 'info', area: 'Receivables', title: old.length + ' invoice(s) unpaid for over ' + TH.recvDays + ' days', detail: money(tot) + ' outstanding' + (very ? ' · ' + very + ' older than 120 days' : ''),
      why: 'Old receivables are the most likely to become bad debts and they tie up your cash.', fix: 'Open the customer ageing and follow up. Write off only with the owner\'s approval.', route: 'sales' }];
  });

  rule('cheques', 'Cash', 'Cheques', 'Customer cheques past their date and not cleared; supplier cheques falling due.', ctx => {
    const out = [], p = R('cheques').filter(c => c.status === 'Pending'), od = p.filter(c => c.date < ctx.today), soon = p.filter(c => c.date >= ctx.today && c.date <= addDays(ctx.today, 3) && c.dir === 'out');
    if (od.length) out.push({ id: 'chq-od', sev: 'warn', area: 'Cash', title: od.length + ' cheque(s) past their date and still pending', detail: od.slice(0, 4).map(c => c.chqNo + ' ' + c.date).join(' · '), why: 'Money you expect (or owe) is not recorded as cleared, so the bank balance in the books is off.', fix: 'Deposit, clear or postpone each cheque in the Cheque Desk.', route: 'chqdesk' });
    if (soon.length) out.push({ id: 'chq-soon', sev: 'info', area: 'Cash', title: soon.length + ' cheque(s) of yours fall due within 3 days', detail: 'Total ' + money(soon.reduce((s, c) => s + c.amount, 0)), why: 'Make sure the bank has the cash.', fix: 'Check the bank balance.', route: 'chqdesk' });
    return out;
  });

  rule('epf', 'Compliance', 'EPF / ETF remittance', 'EPF/ETF payable building up without being paid.', ctx => {
    const bal = E.acct('2100') ? E.bal('2100') : 0; if (bal <= 0) return [];
    let last = '', first = '';
    ctx.JL.forEach(l => { if (l.acc !== '2100') return; if (l.dr > 0 && l.date > last) last = l.date; if (l.cr > 0 && (!first || l.date < first)) first = l.date; });
    const ref = last || first, d = ref ? ago(ref, ctx.today) : 0;
    if (d > TH.epfDays) return [{ id: 'epf', sev: 'warn', area: 'Compliance', title: 'EPF/ETF payable of ' + money(bal) + ' not remitted for ' + d + ' days', detail: last ? 'Last remittance ' + last : 'No remittance recorded yet', why: 'EPF and ETF contributions are due monthly. Late payment normally carries surcharges.', fix: 'Pay the contributions and record it with Remit EPF/ETF in People & Payroll.', route: 'payroll' }];
    return [];
  });

  rule('deprec', 'Compliance', 'Depreciation up to date', 'Assets whose depreciation is more than a month behind.', ctx => {
    const lim = ym(addDays(ctx.today.slice(0, 8) + '01', -1)), out = [];
    const beh = R('assets').filter(a => a.status !== 'Disposed' && (a.accum || 0) < a.cost - (a.residual || 0) - 1 && ym(a.depTo || addDays(a.date.slice(0, 8) + '01', -1)) < addMon(lim, -1));
    if (beh.length) out.push({ id: 'deprec', sev: 'warn', area: 'Compliance', title: beh.length + ' asset(s) have depreciation more than a month behind', detail: beh.slice(0, 4).map(a => a.name).join(' · '), why: 'Profit is overstated until depreciation is posted, and it cannot be disposed correctly.', fix: 'Run Fixed Assets > Post depreciation up to last month.', route: 'assets' });
    return out;
  });
  function addMon(m, n) { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); }

  rule('unbilled', 'Sales', 'Delivered but not invoiced', 'Deliveries waiting for an invoice for more than ' + TH.unbilledDays + ' days.', ctx => {
    const u = R('deliveries').filter(d => d.status === 'Delivered' && d.unbilled && ago(d.date, ctx.today) > TH.unbilledDays);
    return u.length ? [{ id: 'unbilled', sev: 'info', area: 'Sales', title: u.length + ' delivery note(s) not invoiced for over ' + TH.unbilledDays + ' days', detail: 'Value ' + money(u.reduce((s, d) => s + d.total, 0)), why: 'The customer cannot pay what has not been billed.', fix: 'Raise the invoice from the Sales screen.', route: 'sales' }] : [];
  });

  rule('jobs', 'Production', 'Job hygiene', 'Completed jobs still holding WIP, and open jobs with no movement for a long time.', ctx => {
    const out = [], wip = {};
    ctx.JL.forEach(l => { if (l.acc === '1310' && l.job) wip[l.job] = (wip[l.job] || 0) + l.dr - l.cr; });
    R('jobs').forEach(j => {
      const w = wip[j.id] || 0;
      if (j.status === 'Completed' && Math.abs(w) > 100) out.push({ id: 'jobwip:' + j.id, sev: 'warn', area: 'Production', title: j.no + ' is completed but still holds ' + money(w) + ' in WIP', detail: 'WIP should be zero on a completed job.', why: 'Cost is stuck in work-in-progress instead of finished goods or loss.', fix: 'Reopen the job costing, release the remaining pairs or post the difference as factory loss.', route: 'jobs' });
      if (j.status === 'In Progress') { const last = ctx.JL.filter(l => l.job === j.id).reduce((m, l) => l.date > m ? l.date : m, ''); if (last && ago(last, ctx.today) > 60 && w > 0) out.push({ id: 'jobold:' + j.id, sev: 'info', area: 'Production', title: j.no + ' has had no activity for ' + ago(last, ctx.today) + ' days', detail: 'WIP ' + money(w), why: 'Old open jobs hide stock value that may not be recoverable.', fix: 'Complete or close the job.', route: 'jobs' }); }
    });
    return out;
  });

  rule('master', 'Master data', 'BOM and item set-up', 'Finished goods without a BOM, BOM lines pointing at missing materials, duplicate item codes.', ctx => {
    const out = [], items = R('items').filter(i => i.active !== false), ids = new Set(items.map(i => i.id));
    const nob = items.filter(i => i.cat === 'Finished Good' && !(i.bom || []).length);
    if (nob.length) out.push({ id: 'nobom', sev: 'warn', area: 'Master data', title: nob.length + ' finished good(s) have no BOM', detail: nob.slice(0, 6).map(i => i.art).join(' · '), why: 'Without a BOM, materials cannot be issued by BOM, requirements cannot be planned and costs depend on manual issues.', fix: 'Open Items and add the BOM (material quantity per pair).', route: 'items' });
    const badb = items.filter(i => (i.bom || []).some(b => !ids.has(b.itemId) || !(b.qty > 0)));
    if (badb.length) out.push({ id: 'badbom', sev: 'warn', area: 'Master data', title: badb.length + ' BOM(s) contain a missing material or a zero quantity', detail: badb.slice(0, 6).map(i => i.art).join(' · '), why: 'Issuing by BOM silently skips or under-charges those lines.', fix: 'Edit the BOM and remove or correct the line.', route: 'items' });
    const seen = {}, dup = []; items.forEach(i => { const k = (i.art || '').trim().toLowerCase(); if (!k) return; if (seen[k]) dup.push(i.art); seen[k] = 1; });
    if (dup.length) out.push({ id: 'dupitem', sev: 'warn', area: 'Master data', title: 'Duplicate item codes: ' + dup.slice(0, 4).join(', '), detail: '', why: 'Two items with one code get mixed up on documents and reports.', fix: 'Rename or merge the duplicates.', route: 'items' });
    const nop = items.filter(i => i.cat !== 'Finished Good' && !i.buyPrice && E.stock(i.id, '').qty > 0).length;
    if (nop) out.push({ id: 'noprice', sev: 'info', area: 'Master data', title: nop + ' material(s) in stock have no purchase price', detail: '', why: 'BOM cost estimates and reorder values will be zero.', fix: 'Enter a purchase price on the item.', route: 'items' });
    return out;
  });

  rule('structure', 'Structure', 'Chart of accounts', 'Duplicate accounts and opening-balance equity still open.', ctx => {
    const out = [], g = dupGroups();
    if (g.length) out.push({ id: 'dupacc', sev: 'info', area: 'Structure', title: g.length + ' group(s) of duplicate accounts', detail: g.slice(0, 3).map(x => x.map(a => a.code).join(' = ')).join(' · '), why: 'The same cost split across two accounts makes every account report unreliable and invites mis-posting.', fix: 'Open Account Clean-up and merge each group into one account.', route: 'coaclean' });
    const first = ctx.JL.reduce((m, l) => !m || l.date < m ? l.date : m, '');
    if (E.acct('3200') && E.bal('3200') !== 0 && first && ago(first, ctx.today) > 90) out.push({ id: 'obe', sev: 'info', area: 'Structure', title: 'Opening Balance Equity still holds ' + money(E.bal('3200')), detail: '', why: 'Opening balances should end up as Owner Capital / retained earnings once the opening position is confirmed.', fix: 'Post one journal Dr 3200 / Cr 3000 (or the reverse) to move it to Owner Capital.', route: 'journal' });
    return out;
  });

  rule('orphans', 'Integrity', 'Ledger entries without their record', 'Asset purchases, loan entries and EPF/ETF remittances posted to the ledger but with no matching record (a save that stopped half-way).', ctx => {
    const live = R('journalEntries').filter(j => !j.reversedBy);
    const assets = new Set(R('assets').map(a => a.jeId)), remits = new Set(R('wageRuns').filter(w => w.kind === 'remit').flatMap(w => [w.jeId, w.no]));
    const loanIds = new Set(); R('loans').forEach(l => { loanIds.add(l.disbJe); if (l.settled) loanIds.add(l.settled.jeId); (l.rows || []).forEach(r => { if (r.jeId) loanIds.add(r.jeId); }); });
    const bad = live.filter(j => (j.source === 'asset' && /^Asset purchase/.test(j.narr) && !assets.has(j.id)) || (j.source === 'loan' && !loanIds.has(j.id)) || (j.source === 'payroll' && j.narr === 'EPF/ETF remit' && !remits.has(j.id) && !remits.has(j.ref)));
    if (!bad.length) return [];
    return [{ id: 'orphans', sev: 'warn', area: 'Integrity', title: bad.length + ' ledger entr' + (bad.length > 1 ? 'ies' : 'y') + ' with no matching record', detail: bad.slice(0, 5).map(j => j.no + ' ' + j.date + ' ' + (j.narr || '')).join(' · '),
      why: 'New saves post the entry and the record as one unit and undo themselves on failure. An entry left behind means money moved in the ledger but the asset, loan or remittance does not show in its own screen.',
      fix: 'Open the Journal and reverse the entry, then enter the asset / loan / remittance again through its own screen.', route: 'journal' }];
  });

  rule('jobvar', 'Costing', 'Job closing variances', 'Completed jobs whose final cost differed a lot from the provisional cost the sold pairs were charged at (5390 Closed Job Adjustments).', ctx => {
    const per = {};
    R('journalEntries').filter(j => !j.reversedBy && j.narr === 'Final costing').forEach(j => j.lines.forEach(l => { if (l.acc === '5390' && l.job) per[l.job] = (per[l.job] || 0) + l.dr - l.cr; }));
    const out = [];
    Object.keys(per).forEach(id => {
      const job = R('jobs').find(x => x.id === id); if (!job) return;
      const cost = R('jobLines').filter(l => l.jobId === id).reduce((s, l) => s + (l.fgValue || 0), 0);
      if (Math.abs(per[id]) >= 100000 && cost > 0 && Math.abs(per[id]) / cost >= 0.03) out.push(job.no + ' ' + (per[id] > 0 ? 'cost of sales +' : 'cost of sales -') + money(Math.abs(per[id])));
    });
    if (!out.length) return [];
    return [{ id: 'jobvar', sev: 'info', area: 'Costing', title: out.length + ' job(s) closed with a large cost variance', detail: out.slice(0, 5).join(' · '),
      why: 'Pairs were sold at a provisional cost before the job finished. At completion the sold pairs are charged their share of the final cost (5390), so profit for the month of completion moves.',
      fix: 'Normal when costs arrive late. To reduce it, tag wages and overheads to the job as they happen and release goods only after most costs are in.', route: 'jobs' }];
  });

  rule('poolover', 'Costing', 'Overhead shared beyond what was booked', 'Overhead charged to jobs (tagged or shared) that is more than the overhead booked in the ledger.', ctx => {
    const skip = ['5260', '5290', '5291', '5295', '5390'], t = E.totals();
    const booked = R('coa').filter(a => a.type === 'expense' && a.nature === 'oh' && !skip.includes(a.code)).reduce((s, a) => s + E.bal(a.code, t), 0) + E.bal('5290', t);
    const charged = R('costAllocations').filter(a => E.allocAlive(a) && a.cat === 'Overhead' && a.kind !== 'bommisc' && (a.kind === 'absorb' || a.jeId)).reduce((s, a) => s + a.amount, 0);
    if (charged <= booked + 100) return [];
    return [{ id: 'poolover', sev: 'critical', area: 'Costing', title: 'Jobs carry ' + money(charged - booked) + ' more overhead than was booked', detail: 'Booked ' + money(booked) + ' · charged to jobs ' + money(charged),
      why: 'Overhead shared twice inflates work in progress and stock with no expense behind it, so profit is overstated.',
      fix: 'Open Expenses & Costs > Overhead pool > History and reverse the latest month-end sharing, then share only the Unabsorbed amount.', route: 'expenses' }];
  });

  rule('pool', 'Costing', 'Factory overhead not absorbed', 'Factory overhead sitting in the pool and not yet charged to jobs at month-end.', ctx => {
    const un = E.unabsorbed ? E.unabsorbed() : 0; if (un < 500000) return [];
    const last = R('costRuns').filter(r => !r.cancelled && r.kind === 'absorb').reduce((m, r) => r.date > m ? r.date : m, '');
    if (last && ago(last, ctx.today) <= 35) return [];
    return [{ id: 'pool', sev: 'warn', area: 'Costing', title: money(un) + ' of factory overhead has not been charged to jobs', detail: last ? 'Last absorption ' + last : 'No absorption has been posted yet',
      why: 'Until overhead is absorbed, finished goods and job costs show only material and labour, so product cost and margin look better than they are, and the overhead hits profit in the month it was spent.',
      fix: 'Open Expenses & Costs > Overhead pool and post the month-end absorption (choose packs, labour or material as the basis). If you prefer to treat overhead as a period expense, snooze this notice.', route: 'expenses' }];
  });

  rule('close', 'Compliance', 'Month-end discipline', 'Months that were never locked.', ctx => {
    const lk = E.setting('lockedUntil') || '', first = ctx.JL.reduce((m, l) => !m || l.date < m ? l.date : m, '');
    if (!first) return [];
    const ref = lk || first;
    if (ago(ref, ctx.today) > 75) return [{ id: 'nolock', sev: 'info', area: 'Compliance', title: lk ? 'Last period lock is ' + ago(lk, ctx.today) + ' days old' : 'No period has ever been locked', detail: lk ? 'Locked up to ' + lk : '',
      why: 'Without a lock, an old month can still be changed after you printed or filed its reports.', fix: 'Run the Month-end Close checklist and lock the finished month.', route: 'closing' }];
    return [];
  });

  /* ---------- scan engine ---------- */
  const state = { findings: [], at: '', ran: false, busy: false, ms: 0, perRule: {} };
  const dupGroups = () => {
    const A = R('coa').filter(a => !a.inactive && (a.type === 'expense' || a.type === 'income')), g = {};
    const nz = n => n.toLowerCase().replace(/\b(factory|machine|machinery|general|expense|expenses|and|&)\b/g, '').replace(/[^a-z0-9]/g, '');
    A.forEach(a => { const k = a.type + ':' + nz(a.name); (g[k] = g[k] || []).push(a); });
    const pairs = [['6000', '5220'], ['6010', '5210'], ['6040', '5230']], out = Object.values(g).filter(x => x.length > 1);
    pairs.forEach(p => { const a = A.find(x => x.code === p[0]), b = A.find(x => x.code === p[1]); if (a && b && !out.some(x => x.includes(a) && x.includes(b))) out.push([b, a]); });
    return out.map(x => x.sort((a, b) => a.code.localeCompare(b.code)));
  };
  const snooze = () => E.setting('gdSnooze') || {};
  function scan() {
    const t0 = Date.now(), ctx = { today: E.today(), JL: [], acc: {} };
    R('coa').forEach(a => { ctx.acc[a.code] = a; });
    R('journalEntries').forEach(j => j.lines.forEach(l => ctx.JL.push({ acc: l.acc, dr: l.dr || 0, cr: l.cr || 0, date: j.date, src: j.source, job: l.job, je: j.id })));
    const all = [], per = {};
    RULES.forEach(r => { try { const f = r.fn(ctx) || []; per[r.id] = f.length; f.forEach(x => { x.rule = r.id; all.push(x); }); } catch (e) { per[r.id] = -1; console.error('Guardian rule ' + r.id, e); } });
    const sn = snooze(), td = ctx.today;
    all.forEach(f => { f.snoozed = !!(sn[f.id] && sn[f.id] >= td); });
    all.sort((a, b) => (SEV[b.sev] - SEV[a.sev]) || a.area.localeCompare(b.area));
    state.findings = all; state.at = new Date().toISOString(); state.ran = true; state.ms = Date.now() - t0; state.perRule = per;
    return all;
  }
  const live = () => state.findings.filter(f => !f.snoozed);
  const score = () => { const L = live(); return Math.max(0, 100 - L.filter(f => f.sev === 'critical').length * 25 - L.filter(f => f.sev === 'warn').length * 6 - L.filter(f => f.sev === 'info').length * 1); };

  /* ---------- notify (reuses the Notification Center) ---------- */
  function notifyNew() {
    const seen = ls.get(NK('seen'), {}), td = E.today(), L = live(); let fresh = 0;
    L.forEach(f => {
      if (f.sev === 'info') return;
      const last = seen[f.id], due = !last || (f.sev === 'critical' ? last < td : ago(last, td) >= 7);
      if (!due) return; seen[f.id] = td; fresh++;
      const msg = { id: 'gd:' + f.id + ':' + td, title: (f.sev === 'critical' ? '🛑 ' : '⚠️ ') + f.title, body: f.detail || f.why, route: 'guardian', level: f.sev === 'critical' ? 'critical' : 'warn', by: 'Accounting Guardian' };
      try { if (E.notify && E.notify.addMessage) E.notify.addMessage(msg); if (f.sev === 'critical' && E.notify && E.notify.sys) E.notify.sys({ title: msg.title, body: msg.body, route: 'guardian', level: 'critical', tag: 'gd-' + f.id }); } catch (e) { }
    });
    Object.keys(seen).forEach(k => { if (!L.some(f => f.id === k)) delete seen[k]; });
    ls.set(NK('seen'), seen);
    const crit = L.filter(f => f.sev === 'critical');
    if (fresh && crit.length && E.toast) E.toast('🛡️ Guardian: ' + crit.length + ' critical issue(s) in your books - ' + crit[0].title, 'error');
  }
  function chip() {
    let c = document.getElementById('gdchip');
    if (!E.fid) { if (c) c.style.display = 'none'; return; }
    if (!c) { c = document.createElement('div'); c.id = 'gdchip'; c.title = 'Accounting Guardian'; c.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:60;padding:7px 12px;border-radius:20px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);color:#fff;user-select:none'; c.onclick = () => { location.hash = '#/guardian'; }; document.body.appendChild(c); }
    const L = live(), cr = L.filter(f => f.sev === 'critical').length, wr = L.filter(f => f.sev === 'warn').length, s = score();
    c.style.display = ''; c.style.background = cr ? '#c62828' : wr ? '#ef6c00' : '#2e7d32';
    c.textContent = '🛡️ ' + s + (cr ? ' · ' + cr + ' critical' : wr ? ' · ' + wr + ' warning' + (wr > 1 ? 's' : '') : ' · healthy');
  }
  let timer = null, lastRun = 0;
  function run(notify) { if (state.busy || !E.fid) return state.findings; state.busy = true; try { scan(); if (notify !== false) notifyNew(); chip(); } finally { state.busy = false; lastRun = Date.now(); } return state.findings; }
  function soon() { if (timer) return; const wait = Math.max(4000, 20000 - (Date.now() - lastRun)); timer = setTimeout(() => { timer = null; run(true); }, wait); }
  const _post = E.post;
  E.post = async function () { const r = await _post.apply(this, arguments); try { soon(); } catch (e) { } return r; };
  setInterval(() => { if (E.fid && (!state.ran || Date.now() - lastRun > 5 * 60000)) run(true); }, 5000);
  E.guardian = { run: () => run(false), scan, findings: () => state.findings, live, score, rules: () => RULES, state, TH };

  /* ---------- Guardian screen ---------- */
  const NAVAT = E.N.findIndex(n => n.id === 'health');
  [['guardian', '🛡️', 'Accounting Guardian'], ['yearend', '📅', 'Year-End Close'], ['coaclean', '🧹', 'Account Clean-up']].forEach((x, i) => E.N.splice(NAVAT < 0 ? E.N.length : NAVAT + 1 + i, 0, { g: 'Reports', id: x[0], ico: x[1], label: x[2] }));
  const G = { sev: '', area: '' };
  const colr = s => s === 'critical' ? '#c62828' : s === 'warn' ? '#ef6c00' : '#1565c0';
  E.route('guardian', 'Accounting Guardian', () => {
    if (!state.ran) run(false);
    const L = state.findings, vis = L.filter(f => !f.snoozed && (!G.sev || f.sev === G.sev) && (!G.area || f.area === G.area)), sn = L.filter(f => f.snoozed);
    const cr = L.filter(f => !f.snoozed && f.sev === 'critical').length, wr = L.filter(f => !f.snoozed && f.sev === 'warn').length, inf = L.filter(f => !f.snoozed && f.sev === 'info').length;
    const areas = [...new Set(L.map(f => f.area))].sort();
    const card = f => `<div class="card" style="border-left:5px solid ${colr(f.sev)};margin-bottom:10px"><div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px"><div class="muted" style="font-size:11px;text-transform:uppercase">${SEVN[f.sev]} · ${E.esc(f.area)}</div><b>${E.esc(f.title)}</b>${f.detail ? `<div class="muted" style="margin-top:2px">${E.esc(f.detail)}</div>` : ''}
      <div style="margin-top:6px"><b>Why it matters:</b> ${E.esc(f.why)}</div><div style="margin-top:4px"><b>What to do:</b> ${E.esc(f.fix)}</div></div><div style="display:flex;gap:6px">${f.route ? `<button class="btn sm p" data-a="gdOpen" data-id="${E.esc(f.route)}">Open</button>` : ''}<button class="btn sm" data-a="gdSnooze" data-id="${E.esc(f.id)}">Snooze 7 days</button></div></div></div>`;
    return `<div class="kp">${E.kpi('Books health', score() + ' / 100', score() >= 90 ? '<span class="ok">Healthy</span>' : '<span class="bad">Needs attention</span>')}${E.kpi('Critical', cr, 'must fix')}${E.kpi('Warnings', wr, 'should review')}${E.kpi('Notices', inf, 'good to know')}${E.kpi('Last scan', state.at ? state.at.slice(11, 16) : '—', state.ms + ' ms · ' + RULES.length + ' rules')}</div>
    <div class="bar"><button class="btn ${G.sev === '' ? 'p' : ''}" data-a="gdFilter" data-id="">All</button><button class="btn ${G.sev === 'critical' ? 'p' : ''}" data-a="gdFilter" data-id="critical">Critical</button><button class="btn ${G.sev === 'warn' ? 'p' : ''}" data-a="gdFilter" data-id="warn">Warnings</button><button class="btn ${G.sev === 'info' ? 'p' : ''}" data-a="gdFilter" data-id="info">Notices</button><span class="gap"></span>
      <select class="fs" id="gd_area"><option value="">All areas</option>${areas.map(a => `<option ${G.area === a ? 'selected' : ''}>${E.esc(a)}</option>`).join('')}</select><button class="btn" data-a="gdRun">Scan now</button></div>
    ${vis.length ? vis.map(card).join('') : '<div class="card"><b class="ok">✅ Nothing needs your attention.</b><div class="muted">The Guardian checks again automatically after every posting.</div></div>'}
    ${sn.length ? `<details class="card"><summary><b>${sn.length} snoozed</b></summary>${sn.map(f => `<div style="padding:6px 0;border-top:1px solid var(--line,#ddd)">${E.esc(f.title)} <button class="btn sm" data-a="gdUnsnooze" data-id="${E.esc(f.id)}">Bring back</button></div>`).join('')}</details>` : ''}
    <details class="card"><summary><b>What the Guardian watches (${RULES.length} rules)</b></summary><div class="tw"><table><thead><tr><th>Rule</th><th>Area</th><th>Looks for</th><th class="r">Found</th></tr></thead><tbody>${RULES.map(r => `<tr><td><b>${E.esc(r.name)}</b></td><td>${E.esc(r.area)}</td><td class="muted">${E.esc(r.desc)}</td><td class="r">${state.perRule[r.id] < 0 ? '<span class="bad">rule error</span>' : state.perRule[r.id] || 0}</td></tr>`).join('')}</tbody></table></div></details>`;
  });
  E.hooks.push(e => { if (e.target && e.target.id === 'gd_area') { G.area = e.target.value; E.go(); } });
  E.A.gdRun = () => { run(false); E.go(); };
  E.A.gdFilter = id => { G.sev = id || ''; E.go(); };
  E.A.gdOpen = id => { location.hash = '#/' + id; };
  E.A.gdSnooze = async id => { const s = Object.assign({}, snooze()); s[id] = addDays(E.today(), 7); await E.setSetting({ gdSnooze: s }); scan(); chip(); E.go(); E.toast('Snoozed for 7 days', 'success'); };
  E.A.gdUnsnooze = async id => { const s = Object.assign({}, snooze()); delete s[id]; await E.setSetting({ gdSnooze: s }); scan(); chip(); E.go(); };

  /* ---------- YEAR-END CLOSE ---------- */
  const fyM = () => Math.min(12, Math.max(1, parseInt(E.setting('fyMonth')) || 1));
  const pad = n => String(n).padStart(2, '0');
  const fyStartOf = (date) => { const y = +date.slice(0, 4), m = +date.slice(5, 7), fm = fyM(); return (m >= fm ? y : y - 1) + '-' + pad(fm) + '-01'; };
  const fyEndOf = (start) => { const y = +start.slice(0, 4), fm = fyM(), ey = fm === 1 ? y : y + 1, em = fm === 1 ? 12 : fm - 1; return ey + '-' + pad(em) + '-' + pad(new Date(ey, em, 0).getDate()); };
  const closed = () => (E.setting('yearEnds') || []).filter(y => !y.reopened);
  function pendingYears() {
    const first = R('journalEntries').reduce((m, j) => !m || j.date < m ? j.date : m, ''); if (!first) return [];
    const done = new Set(closed().map(y => y.fyEnd)), out = []; let st = fyStartOf(first);
    while (fyEndOf(st) < E.today()) { const en = fyEndOf(st); if (!done.has(en)) out.push({ start: st, end: en }); st = addDays(en, 1); }
    return out;
  }
  function yearFigures(start, end) {
    const rt = E.totals ? null : null, A = R('coa'), P = { sales: 0, disc: 0, cogs: 0, exp: 0, inc: 0 };
    const upto = (d, f) => { const b = {}; R('journalEntries').forEach(j => { if (j.date > d || (f && j.date < f)) return; j.lines.forEach(l => { const o = b[l.acc] || (b[l.acc] = { dr: 0, cr: 0 }); o.dr += l.dr || 0; o.cr += l.cr || 0; }); }); return b; };
    const yr = upto(end, start), cum = upto(end, ''), nat = (a, m) => !m ? 0 : (a.type === 'asset' || a.type === 'expense') ? m.dr - m.cr : m.cr - m.dr;
    let inc = 0, exp = 0, assets = 0, liab = 0, eq = 0, stock = 0, incAll = 0, expAll = 0;
    A.forEach(a => { const y = nat(a, yr[a.code]), c = nat(a, cum[a.code]); if (a.type === 'income') { inc += y; incAll += c; } else if (a.type === 'expense') { exp += y; expAll += c; } else if (a.type === 'asset') { assets += c; if (['1300', '1310', '1320'].includes(a.code)) stock += c; } else if (a.type === 'liability') liab += c; else if (a.type === 'equity') eq += c; });
    return { profit: inc - exp, income: inc, expenses: exp, assets, liab, eq, stock, cumProfit: incAll - expAll };
  }
  function yeChecks(end) {
    const C = [], add = (n, ok, d, go, soft) => C.push({ n, ok, d, go, soft: !!soft });
    const hc = E.healthChecks ? E.healthChecks().filter(c => !c[0]) : [];
    add('All ledger control checks agree (Health Check)', !hc.length, hc.length ? hc.length + ' check(s) failing: ' + hc.slice(0, 2).map(c => c[1]).join('; ') : 'All agree', 'health');
    const crit = (state.ran ? state : (run(false), state)).findings.filter(f => f.sev === 'critical' && !f.snoozed);
    add('Accounting Guardian shows no critical issue', !crit.length, crit.length ? crit.slice(0, 2).map(c => c.title).join('; ') : 'Clean', 'guardian');
    const lm = ym(end), beh = R('assets').filter(a => a.status !== 'Disposed' && (a.accum || 0) < a.cost - (a.residual || 0) - 1 && ym(a.depTo || addDays(a.date.slice(0, 8) + '01', -1)) < lm);
    add('Depreciation posted up to the year-end month', !beh.length, beh.length ? beh.length + ' asset(s) behind: ' + beh.slice(0, 3).map(a => a.name).join(', ') : 'Up to date', 'assets');
    const unpaid = R('wageRuns').filter(r => !r.cancelled && (r.kind === 'run' || r.kind === 'daily-salary') && !r.paid && r.to && r.to <= end).length;
    add('Wage runs up to year-end are paid', !unpaid, unpaid ? unpaid + ' unpaid run(s)' : 'All paid', 'payroll');
    const acc = E.acct('2300') ? E.bal('2300') : 0;
    add('Accrued expenses reviewed (2300)', true, acc ? 'Balance ' + money(acc) + ' will carry forward as a liability' : 'None', 'expenses');
    const st = R('stockTakes').filter(s => s.date <= end && ago(s.date, end) <= 45).length;
    add('A stock-take was done within 45 days of year-end', st > 0, st ? 'Stock-take found' : 'None found. Count the stock so closing stock is proven (advisory).', 'stocktake', true);
    const prev = pendingYears().filter(y => y.end < end);
    add('Earlier financial years are closed', !prev.length, prev.length ? 'Close ' + prev[0].end + ' first' : 'Yes', '');
    return C;
  }
  E.route('yearend', 'Year-End Close', () => {
    const pend = pendingYears(), done = (E.setting('yearEnds') || []), sel = E._ye || (pend[0] && pend[0].end) || '';
    const cur = pend.find(y => y.end === sel) || pend[0];
    let body = '';
    if (!cur) body += `<div class="card"><b class="ok">✅ No financial year is waiting to be closed.</b><div class="muted">Financial year starts in month ${fyM()} (change it in Financial Reports).</div></div>`;
    else {
      const C = yeChecks(cur.end), F = yearFigures(cur.start, cur.end), bad = C.filter(c => !c.ok && !c.soft).length;
      body += `<div class="card"><h3>Close the financial year ${cur.start} to ${cur.end}</h3>${pend.length > 1 ? `<div class="f">Year<select id="ye_sel">${pend.map(y => `<option value="${y.end}" ${y.end === cur.end ? 'selected' : ''}>${y.start} to ${y.end}</option>`).join('')}</select></div>` : ''}
      <div class="kp">${E.kpi('Income', money(F.income), '')}${E.kpi('Expenses', money(F.expenses), '')}${E.kpi('Net profit for the year', money(F.profit), F.profit >= 0 ? '<span class="ok">profit</span>' : '<span class="bad">loss</span>')}${E.kpi('Closing stock', money(F.stock), 'carries forward')}</div>
      <div class="tw"><table><tbody>${C.map(c => `<tr><td style="width:34px;font-size:18px">${c.ok ? '✅' : c.soft ? 'ℹ️' : '⚠️'}</td><td><b>${E.esc(c.n)}</b><div class="muted">${E.esc(c.d)}</div></td><td class="r">${c.go ? `<button class="btn sm" data-a="gdOpen" data-id="${c.go}">Open</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="muted" style="margin:10px 0">What closing does: it carries the year's profit of <b>${money(F.profit)}</b> forward into retained earnings on the Balance Sheet, locks every entry up to ${cur.end}, and saves a year-end snapshot (profit, closing stock, assets, liabilities, equity). Closing stock becomes next year's opening stock automatically. Sales, expenses and cost accounts start the new year from zero in every report.</div>
      ${E.role === 'owner' ? `<div class="f">Type the year-end date to confirm<input id="ye_c" placeholder="${cur.end}"></div><button class="btn p" data-a="yeClose" data-id="${cur.end}" ${bad ? 'disabled title="Fix the red checks first"' : ''}>Close financial year</button>${bad ? ' <span class="bad">Fix the items marked ⚠️ first</span>' : ''}` : '<div class="muted">Only the owner can close a year.</div>'}</div>`;
    }
    body += `<div class="card"><h3>Closed years</h3><div class="tw"><table><thead><tr><th>Year</th><th class="r">Net profit</th><th class="r">Closing stock</th><th class="r">Assets</th><th class="r">Liabilities</th><th>Closed</th><th></th></tr></thead><tbody>${done.slice().reverse().map((y, i) => `<tr><td>${y.fyStart} to ${y.fyEnd}</td><td class="r">${money(y.profit)}</td><td class="r">${money(y.stock)}</td><td class="r">${money(y.assets)}</td><td class="r">${money(y.liab)}</td><td>${y.reopened ? '<span class="bad">reopened ' + y.reopened + '</span>' : y.closedAt.slice(0, 10) + ' by ' + E.esc(y.by || '')}</td><td>${!y.reopened && i === done.filter(q => !q.reopened).length - 1 && E.role === 'owner' && y.fyEnd === closed()[closed().length - 1].fyEnd ? `<button class="btn sm d" data-a="yeReopen" data-id="${y.fyEnd}">Reopen</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No year has been closed yet</td></tr>'}</tbody></table></div></div>`;
    return body;
  });
  E.hooks.push(e => { if (e.target && e.target.id === 'ye_sel') { E._ye = e.target.value; E.go(); } });
  E.A.yeClose = async end => {
    try {
      if (E.role !== 'owner') throw new Error('Only the owner can close a year');
      if (E.val('ye_c').trim() !== end) throw new Error('Type the year-end date ' + end + ' to confirm');
      const y = pendingYears().find(x => x.end === end); if (!y) throw new Error('This year is not waiting to be closed');
      if (pendingYears().some(x => x.end < end)) throw new Error('Close the earlier years first');
      const C = yeChecks(end).filter(c => !c.ok && !c.soft); if (C.length) throw new Error('Fix first: ' + C[0].n);
      const F = yearFigures(y.start, y.end), u = E.sync && E.sync.user, rec = { fyStart: y.start, fyEnd: y.end, profit: F.profit, income: F.income, expenses: F.expenses, stock: F.stock, assets: F.assets, liab: F.liab, equity: F.eq, closedAt: new Date().toISOString(), by: (u && u.email) || E.role, prevLock: E.setting('lockedUntil') || '' };
      const all = (E.setting('yearEnds') || []).concat([rec]);
      await E.setSetting({ yearEnds: all, lockedUntil: end });
      await E.audit('yearend', 'settings', 'yearEnds', null, rec);
      E._ye = ''; E.go(); E.toast('Financial year ' + y.start + ' to ' + end + ' closed and locked', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.yeReopen = async end => {
    try {
      if (E.role !== 'owner') throw new Error('Only the owner can reopen a year');
      const all = (E.setting('yearEnds') || []).map(x => Object.assign({}, x)), live = all.filter(x => !x.reopened), last = live[live.length - 1];
      if (!last || last.fyEnd !== end) throw new Error('Only the most recent closed year can be reopened');
      if (!confirm('Reopen ' + end + '? Entries in that year can be changed again until you close it once more.')) return;
      last.reopened = E.today();
      await E.setSetting({ yearEnds: all, lockedUntil: last.prevLock || '' });
      await E.audit('yearreopen', 'settings', 'yearEnds', null, { fyEnd: end });
      E.go(); E.toast('Year reopened', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---------- ACCOUNT CLEAN-UP ---------- */
  E.route('coaclean', 'Account Clean-up', () => {
    const G2 = dupGroups(), act = a => { let n = 0; R('journalEntries').forEach(j => j.lines.forEach(l => { if (l.acc === a.code) n++; })); return n; };
    return `<div class="card"><h3>Duplicate accounts</h3><p class="muted">Two accounts for the same cost split your reports. Merging moves the balance of the duplicate into the account you keep (one journal, visible in the ledger) and hides the duplicate. History stays readable; new entries can only use the account you keep.</p>
    ${G2.length ? G2.map(g => `<div class="card" style="margin:8px 0"><b>${E.esc(g[0].name)}</b><div class="tw"><table><thead><tr><th>Code</th><th>Name</th><th class="r">Balance</th><th class="r">Entries</th><th></th></tr></thead><tbody>${g.map((a, i) => `<tr><td>${a.code}</td><td>${E.esc(a.name)}</td><td class="r">${money(E.bal(a.code))}</td><td class="r">${act(a)}</td><td>${i > 0 ? `<button class="btn sm p" data-a="coaMerge" data-id="${a.code}|${g[0].code}">Merge into ${g[0].code}</button>` : '<span class="muted">keep</span>'}</td></tr>`).join('')}</tbody></table></div></div>`).join('') : '<div class="ok">✅ No duplicate accounts found.</div>'}</div>`;
  });
  E.A.coaMerge = async id => {
    try {
      const [from, to] = id.split('|'), a = E.acct(from), b = E.acct(to);
      if (!a || !b) throw new Error('Account not found'); if (a.type !== b.type) throw new Error('Both accounts must be the same type');
      const d = E.today(); if (E.locked && E.locked(d)) throw new Error('The period is locked');
      if (!confirm('Merge ' + from + ' ' + a.name + ' into ' + to + ' ' + b.name + '?\nThe balance (' + money(E.bal(from)) + ') moves to ' + to + ' and ' + from + ' is hidden.')) return;
      const bal = (a.type === 'asset' || a.type === 'expense') ? E.bal(from) : E.bal(from), dr = a.type === 'asset' || a.type === 'expense';
      if (bal !== 0) { const amt = Math.abs(bal), move = bal > 0; const lines = dr ? (move ? [{ acc: to, dr: amt }, { acc: from, cr: amt }] : [{ acc: from, dr: amt }, { acc: to, cr: amt }]) : (move ? [{ acc: from, dr: amt }, { acc: to, cr: amt }] : [{ acc: to, dr: amt }, { acc: from, cr: amt }]);
        await E.post({ date: d, ref: 'MERGE', narr: 'Account clean-up: ' + from + ' ' + a.name + ' merged into ' + to + ' ' + b.name, source: 'cleanup', lines }); }
      const bf = JSON.parse(JSON.stringify(a)); a.inactive = true; a.mergedInto = to; await E.save('coa', a, bf);
      await E.audit('merge', 'coa', a.id, null, { from, to });
      run(false); E.go(); E.toast(from + ' merged into ' + to, 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
})(window.ERP);
