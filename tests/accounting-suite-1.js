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

    // ========== A. IAS 2 rule ==========
    const A = await mkJob(10);
    const m1 = await tag('5120', 400); T('A1 wage tag accepted', /posted|saved|EXP|Costed|job/i.test(m1) && E.jobPool(A.job.id) === 40000, m1 + ' pool=' + E.jobPool(A.job.id));
    const adm = E.D.coa.find(a => a.type === 'expense' && a.nature === 'adm');
    const sA = snap(); const m2 = await tag(adm.code, 300); T('A2 admin cost tagged to job is refused', /Only direct material|period costs/.test(m2) && !eqs(sA), eqs(sA) + ' ' + m2.slice(0,80));
    // ========== B. release + completion math ==========
    await logPairs(A.job, A.jl, 36); await release(A.job, 36); await logPairs(A.job, A.jl, 24);
    ok('B0 after logs+release');
    // ---- B1 completion failure injection (job save fails) ----
    const s0 = snap(); failOn('save', (c) => c === 'jobs'); const mc = await run(() => E.A.complete(A.job.id));
    T('B1 completion that fails midway leaves nothing changed', !eqs(s0) && /undone/.test(mc), mc);
    ok('B1');
    // ---- B2 completion cancelled at confirm -> nothing posted ----
    const origConfirm = window.confirm; let n = 0; window.confirm = () => (++n < 2); const s1 = snap(); const mcc = await run(() => E.A.complete(A.job.id)); window.confirm = origConfirm;
    T('B2 cancelling the final confirm posts nothing', !eqs(s1), mcc);
    // ---- B3 release the rest and complete ----
    await release(A.job, 24); const mdone = await run(() => E.A.complete(A.job.id));
    const jj = E.D.jobs.find(x => x.id === A.job.id);
    T('B3 completion succeeds', jj.status === 'Completed', mdone);
    T('B3 FG value = materials + wages (Rs 5,040? )', E.stock(fg.id, v.id).value === E.bal('1320') * 1 && E.jobWip(A.job.id) === 0, 'FG ' + E.stock(fg.id, v.id).value + ' WIP ' + E.jobWip(A.job.id) + ' absorbed ' + E.jobAbsorbed(A.job.id));
    ok('B3');
    // ========== C. cancelling costs of a COMPLETED job ==========
    const exC = E.D.expenses.find(x => x.headName && !x.cancelled && E.rows('costAllocations').some(a => a.jeId === x.jeId && a.jobId === A.job.id));
    const sC = snap(); const mC = await run(() => E.A.exCancel(exC.id)); T('C1 cancel expense already absorbed into a completed job is refused', /already absorbed|overstated/.test(mC) && !eqs(sC), mC);
    const sC2 = snap(); const mC2 = await run(async () => { await E.reverse(exC.jeId); }); T('C2 reversing its journal entry is refused', /overstated/.test(mC2) && !eqs(sC2), mC2);
    const lg = E.D.prodLogs.find(l => l.jobId === A.job.id && l.status === 'accrued'); const sC3 = snap(); const mC3 = await run(() => E.A.prCancel(lg.id)); T('C3 cancelling a wage log of a completed job is refused', !eqs(sC3), mC3);
    ok('C');
    // ========== D. sales: delivery, invoice (discount), failure injection ==========
    const dn = async (packs, rate) => { E.A.newDN(); const rows = document.querySelectorAll('#dlr .dl'); rows[0].children[0].value = 'A100-BLK'; rows[0].children[1].value = packs; rows[0].children[5].value = String(rate); document.getElementById('d_p').value = cus.id; document.getElementById('d_j').value = A.job.id; return run(() => E.A.saveDN()); };
    const md = await dn(6, 250); T('D1 delivery posted', E.D.deliveries.length === 1, md);
    const cogs1 = E.D.deliveries[0].cogs;
    const mkInv = async (pc) => { E.A.newInv(); const sel = document.getElementById('n_p'); sel.value = cus.id; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('n_pc').value = String(pc); return run(() => E.A.saveInv()); };
    const sD = snap(); failOn('save', (c) => c === 'deliveries'); const mi = await mkInv(5); T('D2 invoice failing midway leaves no invoice/ledger trace', !eqs(sD) && E.D.invoices.length === 0, eqs(sD) + ' ' + mi);
    const mi2 = await mkInv(5); T('D3 invoice created', E.D.invoices.length === 1, mi2); ok('D3');
    const inv = E.D.invoices[0];
    const sD4 = snap(); failOn('reverse', () => true); const mci = await run(() => E.A.canInv(inv.id)); T('D4 invoice cancel failing at the ledger leaves invoice and delivery untouched', !eqs(sD4), mci);
    // ========== E. sales return with discount ==========
    const net0 = E.bal('4000') + E.bal('4010'), d0 = E.bal('4010'), fg0 = E.stock(fg.id, v.id).qty, cogs0 = E.bal('5400');
    E.A.newSR(); { const sel = document.getElementById('rt_i'); sel.value = inv.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    const rq = document.querySelector('.rtq'); T('E0 return screen shows rows', !!rq);
    if (rq) { rq.value = 2; fill({}); document.getElementById('rt_d').value = E.today(); document.getElementById('rt_s').value = '';
      const mr = await run(() => E.A.saveSR());
      T('E1 sales return posted', /posted/.test(mr), mr);
      T('E2 net sales fell by the net value (2 packs @ 1500 less 5% = 2,850)', Math.round(net0 - (E.bal('4000') + E.bal('4010'))) === 285000, 'delta ' + (net0 - (E.bal('4000') + E.bal('4010'))));
      T('E3 sales return keeps the original posting (4010 unchanged, reports stay consistent)', Math.round(E.bal('4010') - d0) === 0, 'delta ' + (E.bal('4010') - d0));
      T('E4 stock came back at cost', E.stock(fg.id, v.id).qty === fg0 + 2 && Math.round(cogs0 - E.bal('5400')) === Math.round(E.D.deliveries[0].cogs * 2 / 6), 'qty ' + E.stock(fg.id, v.id).qty + ' cogs delta ' + (cogs0 - E.bal('5400')));
      ok('E'); }
    // ========== G. receipt + reversal with failure injection ==========
    const rec = async (amtRs) => { E.A.recv(); const sel = document.getElementById('st_p'); sel.value = cus.id; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('st_a').value = String(amtRs); document.getElementById('st_a').dispatchEvent(new Event('input', { bubbles: true })); const s = document.getElementById('st_s'); if (s) s.value = BANK; return run(() => E.A.stRecv()); };
    const mrc = await rec(3000); T('G1 receipt posted', /posted/.test(mrc), mrc); ok('G1');
    const rcp = E.D.receipts.find(x => x.kind !== 'credit' && !x.reversed);
    if (rcp) { const sG = snap(); failOn('reverse', () => true); const mg = await run(() => E.A.revRecv(rcp.id)); T('G2 receipt reversal failing at the ledger leaves everything unchanged', !eqs(sG), eqs(sG) + ' ' + mg);
      const mg2 = await run(() => E.A.revRecv(rcp.id)); T('G3 receipt reversed', E.D.receipts.find(x => x.id === rcp.id).reversed === true, mg2); ok('G3'); }
    // ========== H. supplier payment ==========
    E.A.paySup(); { const sel = document.getElementById('st_p'); sel.value = sup.id; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('st_a').value = '10000'; document.getElementById('st_a').dispatchEvent(new Event('input', { bubbles: true })); const s = document.getElementById('st_s'); if (s) s.value = BANK; }
    const mp = await run(() => E.A.stPay()); T('H1 supplier payment posted', /posted/.test(mp), mp); ok('H1');
    const pay = E.D.payments.find(x => !x.reversed && x.kind !== 'debit');
    if (pay) { const sH = snap(); failOn('reverse', () => true); const mh = await run(() => E.A.revPay(pay.id)); T('H2 payment reversal failing leaves everything unchanged', !eqs(sH), eqs(sH) + ' ' + mh); const mh2 = await run(() => E.A.revPay(pay.id)); T('H3 payment reversed', E.D.payments.find(x => x.id === pay.id).reversed === true, mh2); ok('H3'); }
    // ========== I. TRUE-DOWN: cost tag cancelled before completion ==========
    const Bj = await mkJob(1);
    await tag('5120', 200); const exB = E.D.expenses.filter(x => !x.cancelled).slice(-1)[0];
    await logPairs(Bj.job, Bj.jl, 6);
    { const matIss = E.D.journalEntries.flatMap(j => j.lines).filter(l => l.job === Bj.job.id && l.acc === '1310' && l.cat === 'Material').reduce((a, l) => a + l.dr - l.cr, 0), wipPre = E.jobWip(Bj.job.id); T('I0 WIP carries materials + tagged wages as they are incurred (tag 200 + piece wages 120)', wipPre === matIss + 32000, 'WIP ' + wipPre + ' materials ' + matIss); }
    await release(Bj.job, 3);
    const abs1 = E.jobAbsorbed(Bj.job.id); T('I1 tagged wages were absorbed into WIP when incurred (200 + 120 = 320); release moves half of the whole WIP to stock', abs1 === 32000, 'absorbed ' + abs1);
    const mx = await run(() => E.A.exCancel(exB.id)); T('I2 cancelling the tag while the job is still open is allowed', /Cancelled/.test(mx), mx);
    await release(Bj.job, 3);
    const mI = await run(() => E.A.complete(Bj.job.id));
    T('I3 completion trues the stock down (absorbed = remaining piece wages 120 only)', E.jobAbsorbed(Bj.job.id) === 12000 && E.D.jobs.find(x => x.id === Bj.job.id).status === 'Completed', mI + ' absorbed ' + E.jobAbsorbed(Bj.job.id)); ok('I3');
    // ========== J. TRUE-DOWN on pairs already SOLD ==========
    const Cj = await mkJob(1);
    await tag('5120', 300); const exC2 = E.D.expenses.filter(x => !x.cancelled).slice(-1)[0];
    await logPairs(Cj.job, Cj.jl, 6); await release(Cj.job, 6);
    const stockBefore = E.stock(fg.id, v.id).qty;
    A.job = Cj.job; await dn(stockBefore, 250);   // sell all finished packs (incl. this job's)
    const cg0 = E.bal('5400'), c390 = E.bal('5390'); const mj = await run(() => E.A.exCancel(exC2.id)); T('J1 cancel tag while open', /Cancelled/.test(mj), mj);
    const mJ = await run(() => E.A.complete(Cj.job.id));
    T('J2 completion with sold pairs corrects cost of sales (no negative stock value)', E.D.jobs.find(x => x.id === Cj.job.id).status === 'Completed' && E.stock(fg.id, v.id).value >= 0, mJ + ' fgValue ' + E.stock(fg.id, v.id).value + ' cogsDelta ' + (E.bal('5400') - cg0)); ok('J2');
    // ========== L. cancelJob guard ==========
    const Dj = await mkJob(1); await tag('5120', 100); const exD = E.D.expenses.filter(x => !x.cancelled).slice(-1)[0];
    const mcj = await run(() => E.A.cancelJob(Dj.job.id)); T('L1 job with tagged costs cannot be cancelled', E.D.jobs.find(x => x.id === Dj.job.id).status === 'In Progress', mcj);
    // ========== N. purchase cancel (unused) + failure injection ==========
    E.A.newPur(); { const rows = document.querySelectorAll('#plrows .pl'); rows[0].children[0].value = 'GLUE'; rows[0].children[1].value = 2; rows[0].children[2].value = 200; fill({ u_p: sup.id, u_d: E.today(), u_i: 'INV9' }); document.getElementById('u_p').value = sup.id; await E.A.savePur(); }
    const pu = E.D.purchases.filter(x => !x.cancelled).slice(-1)[0]; const sN = snap(); failOn('reverse', () => true); const mn = await run(() => E.A.cancelPur(pu.id)); T('N1 purchase cancel failing at the ledger leaves stock + purchase unchanged', !eqs(sN), eqs(sN) + ' ' + mn);
    const mn2 = await run(() => E.A.cancelPur(pu.id)); T('N2 purchase cancelled', E.D.purchases.find(x => x.id === pu.id).cancelled === true, mn2); ok('N2');
    // ========== M. all reports ==========
    const RS = E.RS, bad = [];
    for (const id of Object.keys(RS.R)) { try { const P = RS.params(id); P.from = '2000-01-01'; P.to = E.today(); P.asat = E.today(); P.preset = 'all'; P.date = E.today(); P.job = P.job || ''; RS.clear(); const m = RS.R[id].build(P, RS.R[id]); if (m && m.checks) m.checks.filter(c => !c[0]).forEach(c => bad.push(id + ': ' + c[1] + ' | ' + (c[2] || ''))); } catch (e) { bad.push(id + ' ERROR ' + e.message); } }
    T('M1 every report builds and every built-in check passes', bad.length === 0, bad.join(' || '));
    R.balances = balances();
    return R;
  });
  console.log(out.tests.join('\n')); console.log(JSON.stringify({ bal: out.balances }, null, 0)); console.log(errs.join('\n')); await b.close();
})();
