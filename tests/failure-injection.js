const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, S = [];
    const run = async fn => { window.toasts.length = 0; try { await fn(); } catch (e) { window.toasts.push('EXC: ' + e.message); } return window.toasts.join(' / '); };
    const failOn = (key, match) => { const o = E[key]; E[key] = async function (...a) { if (match(...a)) { E[key] = o; throw new Error('INJECTED'); } return o.apply(this, a); }; };
    const net = () => { const t = E.totals(), o = {}; for (const k in t) { const x = E.bal(k, t); if (x) o[k] = x; } return JSON.stringify(o); };
    await E.post({ date: E.today(), ref: 'CAP', narr: 'cap', source: 'journal', lines: [{ acc: '1100', dr: 100000000 }, { acc: '3000', cr: 100000000 }] });
    const T = (n, ok, i) => S.push((ok ? 'OK   ' : 'BUG  ') + n + (i ? ' | ' + i : ''));
    // fixed asset
    let before = net(); failOn('save', c => c === 'assets'); let m = await run(async () => { E.A.astM(); fill({ f_n: 'Machine', f_c: 'Machinery', f_d: E.today(), f_a: '120000', f_r: '0', f_l: '5', f_s: '1100' }); document.getElementById('f_s').value = '1100'; document.getElementById('f_c').value = 'Machinery'; await E.A.saveAst(); });
    T('fixed asset: save fails after posting', net() === before && E.D.assets.length === 0, 'ledger changed: ' + (net() !== before) + ' assets saved: ' + E.D.assets.length + ' | ' + m.slice(0, 70));
    // bank loan
    before = net(); const coa0 = E.D.coa.length; failOn('save', c => c === 'loans'); m = await run(async () => { E.A.lnNew(); fill({ ln_l: 'Bank', ln_ref: 'L1', ln_p: '100000', ln_r: '12', ln_n: '12', ln_f: E.today(), ln_d: E.today(), ln_b: '1100' }); document.getElementById('ln_b').value = '1100'; document.getElementById('ln_m').value = 'reducing'; await E.A.lnSave(); });
    T('bank loan: save fails after posting', net() === before && E.D.loans.length === 0 && E.D.coa.length === coa0, 'ledger changed: ' + (net() !== before) + ' loans: ' + E.D.loans.length + ' new accounts left: ' + (E.D.coa.length - coa0) + ' | ' + m.slice(0, 70));
    // good loan then instalment failing
    m = await run(async () => { E.A.lnNew(); fill({ ln_l: 'Bank', ln_ref: 'L2', ln_p: '100000', ln_r: '12', ln_n: '12', ln_f: E.today(), ln_d: E.today(), ln_b: '1100' }); document.getElementById('ln_b').value = '1100'; document.getElementById('ln_m').value = 'reducing'; await E.A.lnSave(); });
    const l = E.D.loans[0]; if (l) { before = net(); failOn('save', c => c === 'loans'); m = await run(async () => { E.A.lnPay(l.id + ':0'); fill({ lp_d: E.today(), lp_b: '1100', lp_i: String(l.rows[0].interest / 100), lp_r: '' }); document.getElementById('lp_b').value = '1100'; await E.A.lnPaySave(l.id + ':0'); }); T('loan instalment: save fails after posting', net() === before && !l.rows[0].paid, 'ledger changed: ' + (net() !== before) + ' instalment marked paid: ' + !!l.rows[0].paid + ' | ' + m.slice(0, 70)); }
    // EPF remit
    await E.post({ date: E.today(), ref: 'T', narr: 'epf accrual', source: 'journal', lines: [{ acc: '5140', dr: 1000000 }, { acc: '2100', cr: 1000000 }] });
    before = net(); failOn('save', c => c === 'wageRuns'); m = await run(async () => { E.A.remitM(); fill({ z_a: '10000', z_s: '1100', z_d: E.today() }); document.getElementById('z_s').value = '1100'; await E.A.saveRemit(); });
    T('EPF/ETF remittance: save fails after posting', net() === before, 'ledger changed: ' + (net() !== before) + ' | ' + m.slice(0, 70));
    return S;
  });
  console.log(out.join('\n')); console.log(errs.join('\n')); await b.close();
})();
