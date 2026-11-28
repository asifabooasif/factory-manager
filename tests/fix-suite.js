const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, S = [];
    { const od = EventTarget.prototype.dispatchEvent; EventTarget.prototype.dispatchEvent = function (ev) { if (ev.type === 'change' && ev.isTrusted === false && this instanceof HTMLSelectElement) od.call(this, new Event('input', { bubbles: true })); return od.call(this, ev); }; }
    const run = async fn => { window.toasts.length = 0; try { await fn(); } catch (e) { window.toasts.push('EXC: ' + e.message); } return window.toasts.join(' / '); };
    const failOn = (key, match) => { const o = E[key]; E[key] = async function (...a) { if (match(...a)) { E[key] = o; throw new Error('INJECTED'); } return o.apply(this, a); }; };
    const T = (n, ok, i) => S.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' | ' + String(i).slice(0, 160) : ''));
    const state = () => JSON.stringify({ b: balances(), inv: E.D.invoices.map(i => i.no + ':' + i.paid + ':' + !!i.cancelled), chq: E.D.cheques.map(c => c.chqNo + ':' + c.status), loans: E.D.loans.map(l => l.no + ':' + l.rows.map(r => !!r.paid).join('') + ':' + !!l.cancelled + ':' + !!l.settled), assets: E.D.assets.map(a => a.no + ':' + a.accum + ':' + a.status + ':' + a.depTo), coa: E.D.coa.length, pur: E.D.purchases.length, rec: E.D.receipts.length, cc: (E.D.cashCounts || []).length, wr: E.D.wageRuns.length });
    const eq = (a) => state() === a;
    const BANK = '1100';
    await E.post({ date: E.today(), ref: 'CAP', narr: 'cap', source: 'journal', lines: [{ acc: '1100', dr: 100000000 }, { acc: '1000', dr: 5000000 }, { acc: '3000', cr: 105000000 }] });
    const month = (n) => { const d = new Date(E.today()); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7) + '-05'; };
    // ---------- fixed assets
    failOn('save', c => c === 'assets'); await run(async () => { E.A.astM(); fill({ f_n: 'warm', f_c: 'Machinery', f_d: E.today(), f_a: '1000', f_r: '0', f_l: '5', f_s: BANK }); document.getElementById('f_s').value = BANK; document.getElementById('f_c').value = 'Machinery'; await E.A.saveAst(); });
    let s0 = state(); failOn('save', c => c === 'assets'); let m = await run(async () => { E.A.astM(); fill({ f_n: 'M1', f_c: 'Machinery', f_d: E.today(), f_a: '120000', f_r: '0', f_l: '5', f_s: BANK }); document.getElementById('f_s').value = BANK; document.getElementById('f_c').value = 'Machinery'; await E.A.saveAst(); });
    T('asset purchase: failed save leaves nothing behind', eq(s0), m);
    m = await run(async () => { E.A.astM(); fill({ f_n: 'M1', f_c: 'Machinery', f_d: month(2), f_a: '120000', f_r: '0', f_l: '5', f_s: BANK }); document.getElementById('f_s').value = BANK; document.getElementById('f_c').value = 'Machinery'; await E.A.saveAst(); }); T('asset purchase works', E.D.assets.length === 1, m);
    s0 = state(); failOn('save', c => c === 'assets'); m = await run(async () => { E.A.depM(); fill({ g_m: E.today().slice(0, 7) }); await E.A.saveDep(); });
    T('depreciation of 3 months: failure takes all 3 monthly entries back', eq(s0), m);
    m = await run(async () => { E.A.depM(); fill({ g_m: E.today().slice(0, 7) }); await E.A.saveDep(); }); T('depreciation works (3 months)', /posted/.test(m) && Math.round(E.bal('1410')) === -600000, m + ' ' + E.bal('1410'));
    s0 = state(); failOn('save', c => c === 'assets'); m = await run(async () => { E.A.disM(E.D.assets[0].id); fill({ x_d: E.today(), x_p: '0', x_s: '' }); await E.A.saveDis(E.D.assets[0].id); });
    T('asset disposal: failed save leaves nothing behind', eq(s0), m);
    // ---------- cash count
    s0 = state(); m = await run(async () => { E.A.acBook && E.A.acBook(); });
    // ---------- loans
    s0 = state(); failOn('save', c => c === 'loans'); m = await run(async () => { E.A.lnNew(); fill({ ln_l: 'Bank', ln_ref: 'L1', ln_p: '100000', ln_r: '12', ln_n: '12', ln_f: E.today(), ln_d: E.today(), ln_b: BANK }); document.getElementById('ln_b').value = BANK; document.getElementById('ln_m').value = 'reducing'; await E.A.lnSave(); });
    T('bank loan creation: failure leaves no entry, no loan, no orphan account', eq(s0), m);
    m = await run(async () => { E.A.lnNew(); fill({ ln_l: 'Bank', ln_ref: 'L2', ln_p: '100000', ln_r: '12', ln_n: '12', ln_f: E.today(), ln_d: E.today(), ln_b: BANK }); document.getElementById('ln_b').value = BANK; document.getElementById('ln_m').value = 'reducing'; await E.A.lnSave(); }); const L = E.D.loans[0]; T('bank loan created', !!L, m);
    s0 = state(); failOn('save', c => c === 'loans'); m = await run(async () => { E.A.lnPay(L.id + ':0'); fill({ lp_d: E.today(), lp_b: BANK, lp_i: String(L.rows[0].interest / 100), lp_r: '' }); document.getElementById('lp_b').value = BANK; await E.A.lnPaySave(L.id + ':0'); });
    T('loan instalment: failure leaves ledger and instalment unchanged', eq(s0), m);
    m = await run(async () => { E.A.lnPay(L.id + ':0'); fill({ lp_d: E.today(), lp_b: BANK, lp_i: String(L.rows[0].interest / 100), lp_r: '' }); document.getElementById('lp_b').value = BANK; await E.A.lnPaySave(L.id + ':0'); }); T('loan instalment posted', L.rows[0].paid === true, m);
    s0 = state(); failOn('reverse', () => true); m = await run(() => E.A.lnUndo(L.id + ':0')); T('undo instalment: failure at the ledger leaves instalment paid', eq(s0), m);
    m = await run(() => E.A.lnUndo(L.id + ':0')); T('undo instalment works', L.rows[0].paid === false, m);
    s0 = state(); failOn('save', c => c === 'loans'); m = await run(async () => { E.A.lnSettle(L.id); fill({ ls_d: E.today(), ls_b: BANK, ls_i: '0', ls_f: '0' }); document.getElementById('ls_b').value = BANK; await E.A.lnSettleSave(L.id); });
    T('early settlement: failure leaves nothing behind', eq(s0), m);
    s0 = state(); failOn('reverse', () => true); m = await run(() => E.A.lnCancel(L.id)); T('cancel loan: failure at the ledger leaves loan active', eq(s0), m);
    // ---------- EPF/ETF remit
    await E.post({ date: E.today(), ref: 'T', narr: 'epf', source: 'journal', lines: [{ acc: '5140', dr: 1000000 }, { acc: '2100', cr: 1000000 }] });
    s0 = state(); failOn('save', c => c === 'wageRuns'); m = await run(async () => { E.A.remitM(); fill({ z_a: '10000', z_s: BANK, z_d: E.today() }); document.getElementById('z_s').value = BANK; await E.A.saveRemit(); }); T('EPF/ETF remittance: failure leaves ledger unchanged', eq(s0), m);
    // ---------- opening balances (supplier / customer)
    const sup = await E.save('parties', { name: 'S', type: 'Supplier', active: true, code: 'PS', limit: 0, days: 30 }), cus = await E.save('parties', { name: 'C', type: 'Customer', active: true, code: 'PC', limit: 0, days: 30 });
    s0 = state(); failOn('save', c => c === 'purchases'); m = await run(async () => { fill({ os_p: sup.id, os_a: '5000', os_d: E.today(), os_r: 'OB' }); document.getElementById('os_p') || 0; await E.A.obSup(); }); T('opening supplier balance: failure leaves ledger unchanged', eq(s0), m);
    s0 = state(); failOn('save', c => c === 'invoices'); m = await run(async () => { fill({ oc_p: cus.id, oc_a: '5000', oc_d: E.today(), oc_r: 'OB' }); await E.A.obCus(); }); T('opening customer balance: failure leaves ledger unchanged', eq(s0), m);
    // ---------- cheques: bounce + cancel
    const fab = await E.save('items', { art: 'A1', name: 'Flat', cat: 'Finished Good', unit: 'Pack', pack: 6, sizeRun: '6,7,7,8,8,9', sub: 'Flat', price: 200000, cost: 0, buyPrice: 0, active: true, bom: [] }); await E.save('variants', { itemId: fab.id, sku: 'A1-BLK', color: 'Black', size: '', barcode: '', active: true });
    await run(async () => { fill({ ost_i: 'A1-BLK', ost_q: '10', ost_c: '1000', ost_d: E.today() }); await E.A.obStock(); });
    await run(async () => { E.A.newDN(); const rr = document.querySelectorAll('#dlr .dl'); rr[0].children[0].value = 'A1-BLK'; rr[0].children[1].value = 2; rr[0].children[5].value = '500'; document.getElementById('d_p').value = cus.id; await E.A.saveDN(); });
    await run(async () => { E.A.newInv(); const sel = document.getElementById('n_p'); sel.value = cus.id; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('n_pc').value = '0'; await E.A.saveInv(); });
    const invs = E.D.invoices.filter(i => i.no.startsWith('INV') && !i.opening);
    const mr = await run(async () => { E.A.recv(); const sel = document.getElementById('st_p'); sel.value = cus.id; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('st_m').value = 'cheque'; document.getElementById('st_m').dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('st_a').value = '3000'; document.getElementById('st_a').dispatchEvent(new Event('input', { bubbles: true })); fill({}); ['st_cn', 'st_ck', 'st_cd'].forEach((k, i) => { document.getElementById(k).value = ['900001', 'BOC', E.today()][i]; }); await E.A.stRecv(); });
    const ch = E.D.cheques.find(c => c.chqNo === '900001'); T('cheque received', !!ch, mr + ' | invs ' + JSON.stringify(E.D.invoices.map(i => i.no + '/' + i.total)) + ' | dn ' + E.D.deliveries.length); if (!ch) return S;
    await run(async () => { E.A.cdDep(ch.id); document.getElementById('dp_a').value = BANK; await E.A.cdDepSave(ch.id); });
    s0 = state(); failOn('save', c => c === 'cheques'); m = await run(async () => { E.A.cdBnc(ch.id); fill({ bn_d: E.today(), bn_f: '500', bn_a: BANK, bn_r: 'Insufficient funds' }); document.getElementById('bn_a').value = BANK; await E.A.cdBncSave(ch.id); });
    T('cheque returned: failure puts back the invoice, the cheque, and the bank-charge entry', eq(s0), m);
    m = await run(async () => { E.A.cdBnc(ch.id); fill({ bn_d: E.today(), bn_f: '500', bn_a: BANK, bn_r: 'Insufficient funds' }); document.getElementById('bn_a').value = BANK; await E.A.cdBncSave(ch.id); }); T('cheque returned works and reopens the invoice', ch.status === 'Bounced' && invs.every(i => i.paid === 0), m + ' ' + ch.status);
    T('health clean after all failures and recoveries', chk().filter(x => !/cash|overdrawn/i.test(x)).length === 0, chk().join('; '));
    T('trial balance balanced', tb().diff === 0);
    // ---------- manual journal controls
    const jv = async (a1, a2, amt) => run(async () => { E.A.newJV(); const rows = document.querySelectorAll('#jrows .jl'); rows[0].children[0].value = a1; rows[0].children[1].value = String(amt); rows[1].children[0].value = a2; rows[1].children[2].value = String(amt); fill({ j_d: E.today(), j_r: 'JV', j_n: 'test' }); await E.A.saveJV(); });
    s0 = state(); m = await jv('1300', '3000', 10000); T('manual journal to Raw Material Stock 1300 is refused', /controlled by/.test(m) && eq(s0), m);
    m = await jv('6140', '1300', 100); T('manual journal crediting Stock 1300 is refused', /controlled by/.test(m), m);
    m = await jv('2000', '6140', 100); T('manual journal to Trade Payables 2000 is refused', /controlled by/.test(m), m);
    m = await jv('1200', '6140', 100); T('manual journal to Trade Receivables 1200 is refused', /controlled by/.test(m), m);
    m = await jv('1400', '3000', 100); T('manual journal to Fixed Assets 1400 is refused', /controlled by/.test(m), m);
    const loanAcc = E.D.loans[0].loanAcc; m = await jv(loanAcc, '6140', 100); T('manual journal to a loan account is refused', /controlled by/.test(m), m);
    m = await jv('6140', '1100', 250); T('ordinary manual journal (bank charge) still works', /posted/.test(m), m);
    const je = E.D.journalEntries.find(j => j.source === 'manual'); const sysJe = E.D.journalEntries.find(j => j.source === 'sale' && !j.reversedBy);
    m = await run(() => E.A.revJV(sysJe.id)); T('Journal screen cannot reverse a system entry (invoice/receipt/…)', /Only manual journals/.test(m), m);
    m = await run(() => E.A.revJV(je.id)); T('a manual journal can be reversed', /Reversed/.test(m), m);
    // ---------- pool limit
    T('final health clean', chk().filter(x => !/cash|overdrawn/i.test(x)).length === 0, chk().join('; '));
    return S;
  });
  console.log(out.join('\n')); console.log('PASS', out.filter(x => x.startsWith('PASS')).length, 'FAIL', out.filter(x => x.startsWith('FAIL')).length); console.log(errs.join('\n')); await b.close();
})();
