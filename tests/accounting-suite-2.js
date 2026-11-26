const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, R = { tests: [] };
    const T = (name, ok, info) => R.tests.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' | ' + info : ''));
    const snap = () => ({ b: balances(), s: E.stockMap(), j: E.D.jobs.map(j => j.status), d: E.D.deliveries.map(d => d.status), i: E.D.invoices.map(i => i.cancelled + ':' + i.paid), n: E.D.invoices.length, ex: E.D.expenses.map(x => !!x.cancelled), pl: E.D.prodLogs.map(l => l.status), al: E.rows('costAllocations').filter(a => !a.cancelled).length });
    const eqs = o => { const n = snap(); const bad = Object.keys(o).filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k])); return bad.length ? 'DIFF ' + bad.join(',') : ''; };
    const failOn = (key, match) => { const o = E[key]; E[key] = async function (...a) { if (match(...a)) { E[key] = o; throw new Error('INJECTED'); } return o.apply(this, a); }; };
    const run = async fn => { window.toasts.length = 0; try { await fn(); } catch (e) { window.toasts.push('EXC: ' + e.message); } return window.toasts.join(' / '); };
    // ---- data
    const eq = E.D.coa.find(a => a.type === 'equity');
    await E.post({ date: E.today(), ref: 'OB', narr: 'capital', source: 'journal', lines: [{ acc: '1010', dr: 5000000 }, { acc: eq.code, cr: 5000000 }] });
    const BANK = (E.D.coa.find(a => a.bank && a.code !== '1000') || E.D.coa.find(a => a.bank)).code; await E.post({ date: E.today(), ref: 'OB2', narr: 'bank funding', source: 'journal', lines: [{ acc: BANK, dr: 5000000 }, { acc: eq.code, cr: 5000000 }] });
    const sup = await E.save('parties', { name: 'Sup A', type: 'Supplier', active: true, code: 'P1', limit: 0, days: 0 });
    const cus = await E.save('parties', { name: 'Cus A', type: 'Customer', active: true, code: 'P2', limit: 0, days: 0 });
    const mk = (art, name, unit, price, cat, sub) => E.save('items', { art, name, cat: cat || 'Raw Material', unit, buyPrice: price, cost: 0, pack: 0, sizeRun: '', sub: sub || '', price: 0, min: 0, active: true, consumable: false });
    const fab = await mk('FAB', 'Fabric', 'kg', 50000), glue = await mk('GLUE', 'Glue', 'kg', 20000, 'Miscellaneous', 'Glue');
    const fg = await E.save('items', { art: 'A100', name: 'Flat A100', cat: 'Finished Good', unit: 'Pack', pack: 6, sizeRun: '6,7,7,8,8,9', sub: 'Flat', price: 150000, cost: 0, buyPrice: 0, active: true, bom: [{ itemId: fab.id, variantId: '', qty: 0.1 }, { itemId: glue.id, variantId: '', qty: 0.02 }] });
    const v = await E.save('variants', { itemId: fg.id, sku: 'A100-BLK', color: 'Black', size: '', barcode: '', active: true });
    const op = await E.save('operations', { name: 'Sewing', order: 1, rate: 2000, rateUnit: 'pair', piecesPerPair: 1, active: true });
    const ib = JSON.parse(JSON.stringify(fg)); fg.routing = [{ opId: op.id, wait: false }]; await E.save('items', fg, ib);
    await E.save('employees', { code: 'E1', name: 'Worker One', active: true, type: 'Piece' });
    E.A.newPur(); { const rows = document.querySelectorAll('#plrows .pl'); const sr = (r, c, q, rt) => { r.children[0].value = c; r.children[1].value = q; r.children[2].value = rt }; sr(rows[0], 'FAB', 200, 500); sr(rows[1], 'GLUE', 40, 200); fill({ u_p: sup.id, u_d: E.today(), u_i: 'INV1' }); document.getElementById('u_p').value = sup.id; await E.A.savePur(); }
    const mkJob = async (packs) => { const job = await E.save('jobs', { no: await E.next('JOB'), status: 'In Progress', date: E.today(), partyId: cus.id }); const jl = await E.save('jobLines', { jobId: job.id, itemId: fg.id, variantId: v.id, code: 'A100-BLK', name: 'Flat A100', target: packs, released: 0, fgValue: 0 }); await E.issueByBom({ jobId: job.id, date: E.today(), packs: { [jl.id]: packs }, adj: null }); return { job, jl }; };
    const tag = async (head, amt, jobSel) => { fill({ ex_h: head, ex_a: String(amt), ex_t: 'job', ex_pm: '1010', ex_d: E.today(), ex_p: '', ex_n: 'tag ' + head, ex_r: '', ex_am: jobSel || 'all' }); return run(() => E.A.exSave()); };
    const logPairs = async (job, jl, pairs) => { document.getElementById('prr')?.remove(); document.body.insertAdjacentHTML('beforeend', '<div id="prr"><div class="pr"><input><input><input><input><input><input><input></div></div>'); const c = document.querySelector('#prr .pr').children; c[0].value = 'E1'; c[1].value = job.id; c[2].value = jl.id; c[3].value = op.id; c[4].value = ''; c[5].value = pairs; c[6].value = '20'; fill({ pr_d: E.today() }); return run(() => E.A.prSave()); };
    const release = async (job, pairs) => { E.A.relM(job.id); const m = document.querySelector('.rq'); if (m) { m.value = pairs; fill({ r_d: E.today() }); } return run(() => E.A.saveRel(job.id)); };
    const ok = (name) => { const c = chk().filter(x => !/Cash|cash|overdrawn/i.test(x)); T(name + ' · health checks clean', c.length === 0, c.join('; ')); const t = tb(); T(name + ' · trial balance', t.diff === 0, 'diff ' + t.diff); };

    const Z = await mkJob(1);
    // ---- manual issue / return ----
    const issue = (k, q) => { E.A.issueM && 0; fill({ x_i: 'FAB', x_q: String(q), x_d: E.today(), x_a: '', x_k: k }); return run(() => E.A.saveIssue(Z.job.id)); };
    let s1 = snap(); failOn('put', c => c === 'stockMoves'); let m = await issue('issue', 5); T('P1 manual issue failing at the stock step leaves nothing behind', !eqs(s1), eqs(s1) + ' ' + m.slice(0, 80));
    m = await issue('issue', 5); T('P2 manual issue posted', /posted/.test(m), m); ok('P2');
    s1 = snap(); failOn('save', c => c === 'issues'); m = await issue('return', 2); T('P3 manual return failing at the record step leaves nothing behind', !eqs(s1), eqs(s1) + ' ' + m.slice(0, 80));
    m = await issue('return', 2); T('P4 manual return posted', /posted/.test(m), m); ok('P4');
    // ---- stock adjustments ----
    const adj = (t, q, c) => { fill({ a_t: t, a_d: E.today(), a_i: 'FAB', a_q: String(q), a_c: String(c || ''), a_n: '' }); return run(() => E.A.saveAdj()); };
    s1 = snap(); failOn('stockIn', () => true); m = await adj('loss', 1); T('Q1 write-off failing at the stock step leaves ledger unchanged', !eqs(s1), eqs(s1) + ' ' + m.slice(0, 80));
    m = await adj('loss', 1); T('Q2 write-off posted', /Posted/.test(m), m); ok('Q2');
    m = await adj('loss', 99999); T('Q3 write-off larger than stock is refused', /Insufficient/.test(m), m);
    m = await adj('gain', 2, 500); T('Q4 stock gain posted', /Posted/.test(m), m); ok('Q4');
    // ---- accrued expense + payment ----
    fill({ ex_h: '5210', ex_a: '700', ex_t: 'pool', ex_pm: 'ACCR', ex_d: E.today(), ex_p: '', ex_n: 'accrued', ex_r: '', ex_am: 'none' }); m = await run(() => E.A.exSave()); T('R1 accrued expense posted', /posted/.test(m), m); ok('R1');
    const acc = E.D.expenses.find(x => !x.cancelled && x.pay === 'ACCR');
    E.A.exPay(acc.id); document.getElementById('z_s').value = BANK;
    s1 = snap(); failOn('save', c => c === 'expenses'); m = await run(() => E.A.exPaySave(acc.id)); T('R2 payment failing at the record step leaves nothing behind', !eqs(s1), eqs(s1) + ' ' + m.slice(0, 80));
    E.A.exPay(acc.id); document.getElementById('z_s').value = BANK; m = await run(() => E.A.exPaySave(acc.id)); T('R3 accrued expense paid', /Paid/.test(m) && E.D.expenses.find(x => x.id === acc.id).paid === true, m); ok('R3');
    // ---- completing a job that only has material and misc (no wages) ----
    await logPairs(Z.job, Z.jl, 6); await release(Z.job, 6); m = await run(() => E.A.complete(Z.job.id)); T('S1 job completes', E.D.jobs.find(x => x.id === Z.job.id).status === 'Completed', m); ok('S1');
    const RS = E.RS, bad = [];
    for (const id of Object.keys(RS.R)) { try { const P = RS.params(id); P.from = '2000-01-01'; P.to = E.today(); P.asat = E.today(); P.preset = 'all'; P.date = E.today(); P.job = P.job || ''; RS.clear(); const mm = RS.R[id].build(P, RS.R[id]); if (mm && mm.checks) mm.checks.filter(c => !c[0]).forEach(c => bad.push(id + ': ' + c[1] + ' | ' + (c[2] || ''))); } catch (e) { bad.push(id + ' ERROR ' + e.message); } }
    T('S2 every report builds and every built-in check passes', bad.length === 0, bad.join(' || '));
    R.balances = balances();
    return R;
  });
  console.log(out.tests.join('\n')); console.log(JSON.stringify({ bal: out.balances }, null, 0)); console.log(errs.join('\n')); await b.close();
})();
