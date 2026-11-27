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

    const sellPacks = async (job, packs, rate) => { E.A.newDN(); const rows = document.querySelectorAll('#dlr .dl'); rows[0].children[0].value = 'A100-BLK'; rows[0].children[1].value = packs; rows[0].children[5].value = String(rate); document.getElementById('d_p').value = cus.id; document.getElementById('d_j').value = job.id; return run(() => E.A.saveDN()); };
    const matOf = id => E.D.journalEntries.flatMap(j => j.lines).filter(l => l.job === id && l.acc === '1310' && l.cat === 'Material').reduce((a, l) => a + l.dr - l.cr, 0);
    await E.ensureCoa();

    // ========== F2. true-up after part of the job was already SOLD ==========
    const J2 = await mkJob(10);
    await logPairs(J2.job, J2.jl, 60);
    await tag('5120', 600);
    const r1 = await release(J2.job, 30);
    const d1 = await sellPacks(J2.job, 5, 2500);
    T('F2a 5 packs released at provisional cost and sold', E.D.deliveries.length === 1 && E.stock(fg.id, v.id).qty === 0, r1 + ' / ' + d1 + ' stockQty ' + E.stock(fg.id, v.id).qty);
    await tag('5120', 900);
    await release(J2.job, 30);
    await tag('5120', 300);   // cost that arrives AFTER the last release: pure true-up at completion
    const mat2 = matOf(J2.job.id), FULL = mat2 + 120000 + 150000 + 30000;   // materials + piece wages (60 pairs x Rs 20) + tagged wages
    const mc = await run(() => E.A.complete(J2.job.id));
    T('F2b job completed', E.D.jobs.find(x => x.id === J2.job.id).status === 'Completed', mc);
    const fin = E.D.journalEntries.find(j => j.narr === 'Final costing' && j.lines.some(l => l.job === J2.job.id));
    const cos = fin ? fin.lines.filter(l => l.acc === '5390').reduce((a, l) => a + l.dr - l.cr, 0) : -1;
    T('F2c the 5 sold packs carry their share of the final cost (charged to 5390), not left in stock', Math.abs(cos - (FULL / 2 - 252000)) <= 1, '5390 ' + cos + ' expected ' + (FULL / 2 - 252000));
    T('F2d the 5 packs still in stock are valued at the final cost per pack', Math.abs(E.bal('1320') - FULL / 2) <= 1 && Math.abs(E.stock(fg.id, v.id).value - FULL / 2) <= 1, '1320 ' + E.bal('1320') + ' expected ' + FULL / 2);
    T('F2e stock + cost of sales + closing variance = full job cost, nothing overstated', Math.abs(E.bal('1320') + E.bal('5400') + E.bal('5390') - FULL) <= 1, '1320 ' + E.bal('1320') + ' 5400 ' + E.bal('5400') + ' 5390 ' + E.bal('5390') + ' vs ' + FULL);
    ok('F2');

    // ========== F1. overhead pool must not offer cost that is already tagged to a job ==========
    const J1 = await mkJob(10);
    await tag('5210', 440);
    fill({ ex_h: '5210', ex_a: '100', ex_t: 'pool', ex_pm: '1010', ex_d: E.today(), ex_p: '', ex_n: 'pool oh', ex_r: '', ex_am: 'none' }); const mp = await run(() => E.A.exSave());
    T('F1a only the untagged overhead (Rs 100) is offered for sharing', E.unabsorbed() === 10000, mp + ' unabsorbed ' + E.unabsorbed());
    const w0 = E.jobWip(J1.job.id);
    fill({ ab_a: '440', ab_b: 'equal', ab_d: E.today() }); const mx = await run(() => E.A.abSave());
    T('F1b sharing more than the real pool is refused', /more than the overhead pool/.test(mx) && E.jobWip(J1.job.id) === w0, mx);
    fill({ ab_a: '100', ab_b: 'equal', ab_d: E.today() }); const mo = await run(() => E.A.abSave());
    T('F1c sharing the real pool works and adds exactly Rs 100 to WIP', /saved/.test(mo) && E.jobWip(J1.job.id) === w0 + 10000 && E.unabsorbed() === 0, mo + ' WIP ' + E.jobWip(J1.job.id) + ' before ' + w0);
    ok('F1');

    // ========== F3. screens that post AND save are one unit ==========
    const sA = snap();
    failOn('save', c => c === 'assets'); fill({ f_n: 'Press', f_c: 'Machinery', f_d: E.today(), f_a: '50000', f_r: '0', f_l: '5', f_s: '1010' });
    const ma = await run(() => E.A.saveAst());
    T('F3a asset purchase failing on save leaves no ledger entry', !eqs({ b: sA.b }) && E.D.assets.length === 0, eqs({ b: sA.b }) + ' ' + ma);
    ok('F3a');
    const ma2 = await run(() => E.A.saveAst()); T('F3a2 asset purchase works afterwards (Dr 1400)', E.D.assets.length === 1 && E.bal('1400') === 5000000, ma2);
    const coaN = E.D.coa.length, sL = snap();
    failOn('save', c => c === 'loans'); fill({ ln_x: '', ln_l: 'Bank X', ln_d: E.today(), ln_b: '1100', ln_p: '100000', ln_r: '12', ln_n: '12', ln_f: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), ln_m: 'flat', ln_t: 'Bank loan', ln_ref: '', ln_nt: '', ln_pd: '0', ln_od: E.today() });
    const ml = await run(() => E.A.lnSave());
    T('F3b loan creation failing on save leaves no ledger entry and NO orphan loan account', !eqs({ b: sL.b }) && E.D.loans.length === 0 && E.D.coa.length === coaN, eqs({ b: sL.b }) + ' loans ' + E.D.loans.length + ' coa ' + E.D.coa.length + '/' + coaN + ' ' + ml);
    const ml2 = await run(() => E.A.lnSave()); T('F3b2 loan creation works afterwards', E.D.loans.length === 1 && E.bal(E.D.loans[0].loanAcc) === 10000000, ml2);
    ok('F3b');
    const L = E.D.loans[0], sI = snap();
    failOn('save', c => c === 'loans'); fill({ lp_d: E.today(), lp_b: '1100', lp_i: '1000', lp_r: 'CHQ1' });
    const mi = await run(() => E.A.lnPaySave(L.id + ':0'));
    T('F3c loan instalment failing on save leaves no ledger entry and the instalment still due', !eqs({ b: sI.b }) && !E.D.loans[0].rows[0].paid, eqs({ b: sI.b }) + ' paid=' + E.D.loans[0].rows[0].paid + ' ' + mi);
    const mi2 = await run(() => E.A.lnPaySave(L.id + ':0')); T('F3c2 loan instalment works afterwards', E.D.loans[0].rows[0].paid === true, mi2);
    ok('F3c');
    await E.post({ date: E.today(), ref: 'EPFX', narr: 'epf payable', source: 'journal', lines: [{ acc: '5120', dr: 10000 }, { acc: '2100', cr: 10000 }] });
    const sR = snap(); failOn('save', c => c === 'wageRuns'); fill({ z_d: E.today(), z_a: '50', z_s: '1100' });
    const mr = await run(() => E.A.saveRemit());
    T('F3d EPF/ETF remittance failing on save leaves no ledger entry', !eqs({ b: sR.b }) && !E.D.wageRuns.some(x => x.kind === 'remit'), eqs({ b: sR.b }) + ' ' + mr);
    const mr2 = await run(() => E.A.saveRemit()); T('F3d2 remittance works afterwards and is linked to its entry', E.D.wageRuns.filter(x => x.kind === 'remit' && x.jeId).length === 1 && E.bal('2100') === 5000, mr2);
    ok('F3d');

    // ========== F4. manual journals cannot touch the stock-controlled accounts ==========
    for (const acc of ['1300', '1310', '1320']) {
      let msg = ''; try { await E.post({ date: E.today(), ref: 'X', narr: 'manual stock', source: 'manual', lines: [{ acc, dr: 100 }, { acc: '3000', cr: 100 }] }); } catch (e) { msg = e.message; }
      T('F4 manual journal on ' + acc + ' is refused', /controlled by the stock and job records/.test(msg), msg.slice(0, 60));
    }
    let okMsg = ''; try { await E.post({ date: E.today(), ref: 'Y', narr: 'manual ok', source: 'manual', lines: [{ acc: '1010', dr: 100 }, { acc: '3000', cr: 100 }] }); } catch (e) { okMsg = e.message; }
    T('F4b a normal manual journal still posts', okMsg === '', okMsg);
    ok('F4');

    // ========== F5. loan undo / cancel are one unit; Guardian and AI know the rules ==========
    const sU = snap(); failOn('reverse', () => true);
    const mu = await run(() => E.A.lnUndo(L.id + ':0'));
    T('F5a undoing an instalment when the reversal fails leaves record and ledger as they were', !eqs({ b: sU.b }) && E.D.loans[0].rows[0].paid === true && !!E.D.loans[0].rows[0].jeId, eqs({ b: sU.b }) + ' paid=' + E.D.loans[0].rows[0].paid + ' ' + mu);
    const mu2 = await run(() => E.A.lnUndo(L.id + ':0')); T('F5b undo works afterwards', E.D.loans[0].rows[0].paid === false, mu2);
    ok('F5');
    const G0 = E.guardian.scan(); const ids = () => E.guardian.findings().map(f => f.id);
    T('F5c Guardian: clean books raise no orphan / pool-overshoot finding', !ids().includes('orphans') && !ids().includes('poolover'), ids().join(','));
    await E.post({ date: E.today(), ref: 'ORPH', narr: 'Asset purchase · ghost', source: 'asset', lines: [{ acc: '1400', dr: 1000 }, { acc: '1010', cr: 1000 }] });
    E.guardian.scan(); T('F5d Guardian spots a ledger entry with no record', ids().includes('orphans'), ids().join(','));
    const ghost = E.D.journalEntries.find(j => j.ref === 'ORPH'); await E.reverse(ghost.id); E.guardian.scan();
    T('F5e ...and clears once it is reversed', !ids().includes('orphans'), ids().join(','));
    let aiTxt = ''; try { E.AI.open(); await E.AI.ask('explain the true-up rule'); await new Promise(r => setTimeout(r, 300)); aiTxt = (document.getElementById('ai-msgs') || document.body).innerText; } catch (e) { aiTxt = 'ERR ' + e.message; }
    T('F5f AI assistant explains the v98 rules with live figures', /Completion true-up/.test(aiTxt) && /5390/.test(aiTxt) && /Unabsorbed now/.test(aiTxt), aiTxt.slice(-120).replace(/\n/g, ' '));

    const RS = E.RS, bad = [];
    for (const id of Object.keys(RS.R)) { try { const P = RS.params(id); P.from = '2000-01-01'; P.to = E.today(); P.asat = E.today(); P.preset = 'all'; P.date = E.today(); P.job = P.job || ''; RS.clear(); const m = RS.R[id].build(P, RS.R[id]); if (m && m.checks) m.checks.filter(c => !c[0]).forEach(c => bad.push(id + ': ' + c[1] + ' → ' + c[2])); } catch (e) { bad.push(id + ' EXC ' + e.message); } }
    T('Z1 every report builds and every built-in check passes', bad.length === 0, bad.join(' || '));
    R.balances = balances();
    return R;
  });
  console.log(out.tests.join('\n')); console.log(JSON.stringify({ bal: out.balances }, null, 0)); console.log(errs.join('\n')); await b.close();
})();
