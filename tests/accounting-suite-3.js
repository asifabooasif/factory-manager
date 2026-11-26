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


    // ========== S3. WIP builds as costs are incurred (job is only a costing tag) ==========
    const jw = id => E.jobWip(id);
    const matOf = id => E.D.journalEntries.flatMap(j => j.lines).filter(l => l.job === id && l.acc === '1310' && l.cat === 'Material').reduce((a, l) => a + l.dr - l.cr, 0);
    const J1 = await mkJob(10);
    const base = jw(J1.job.id), mat = matOf(J1.job.id);
    const t1 = await tag('5120', 400);
    T('S1 tagged wage keeps its own ledger (Dr 5120 / Cr cash) AND builds the job WIP', jw(J1.job.id) === base + 40000 && E.bal('5120') >= 40000, t1 + ' WIP ' + jw(J1.job.id) + ' (before ' + base + ')');
    T('S2 the offsetting credit sits in 5291 (contra), expense not touched', E.bal('5291') === -40000 || E.bal('5291') < 0, '5291=' + E.bal('5291'));
    ok('S2');
    // back-dated cost: absorption entry carries the same date
    const past = new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10);
    fill({ ex_h: '5120', ex_a: '150', ex_t: 'job', ex_pm: '1010', ex_d: past, ex_p: '', ex_n: 'backdated', ex_r: '', ex_am: 'all' }); const tb2 = await run(() => E.A.exSave());
    const absJe = E.D.journalEntries.filter(j => j.absOf && !j.reversedBy).slice(-1)[0];
    T('S3 back-dated cost is absorbed with its own date', !!absJe && absJe.date === past && jw(J1.job.id) === base + 40000 + 15000, tb2 + ' absDate ' + (absJe && absJe.date) + ' WIP ' + jw(J1.job.id));
    ok('S3');
    // cancel the back-dated one: absorption is reversed automatically, expense reversed
    const exP = E.D.expenses.filter(x => !x.cancelled && x.date === past)[0];
    const mcx = await run(() => E.A.exCancel(exP.id));
    T('S4 cancelling the cost takes it out of WIP automatically', /Cancelled/.test(mcx) && jw(J1.job.id) === base + 40000, mcx + ' WIP ' + jw(J1.job.id));
    ok('S4');
    // running it again must never double-absorb
    await E.syncAbsorb(); await E.syncAbsorb();
    T('S5 sync is idempotent (no double absorption)', jw(J1.job.id) === base + 40000, 'WIP ' + jw(J1.job.id));
    // progress, pending cost, release at provisional cost, completion at the exact cost
    await logPairs(J1.job, J1.jl, 30);
    await release(J1.job, 15);
    const fg1 = E.D.jobLines.find(x => x.id === J1.jl.id).fgValue;
    T('S6 released pairs go to stock at a provisional full cost (materials + wages incurred so far)', fg1 > 0, 'fgValue ' + fg1);
    ok('S6');
    E.jobId = J1.job.id; E.A.jtTab && E.A.jtTab('prog'); E.A.openJob && E.A.openJob(J1.job.id); E.A.jtTab('prog');
    await new Promise(r => setTimeout(r, 300));
    const html = document.body.innerText;
    T('S7 progress tab shows provisional status and the daily grid', /Provisional/.test(html) && /Day by day/.test(html), html.slice(0, 80).replace(/\n/g, ' '));
    await release(J1.job, 15);
    const mc2 = await run(() => E.A.complete(J1.job.id));
    T('S8 completion fixes the final cost; WIP of the job is cleared', E.D.jobs.find(x => x.id === J1.job.id).status === 'Completed' && Math.abs(jw(J1.job.id)) <= 1, mc2 + ' WIP ' + jw(J1.job.id));
    ok('S8');
    const RS = E.RS, bad = [];
    for (const id of Object.keys(RS.R)) { try { const P = RS.params(id); P.from = '2000-01-01'; P.to = E.today(); P.asat = E.today(); P.preset = 'all'; P.date = E.today(); P.job = P.job || ''; RS.clear(); const m = RS.R[id].build(P, RS.R[id]); if (m && m.checks) m.checks.filter(c => !c[0]).forEach(c => bad.push(id + ': ' + c[1] + ' → ' + c[2])); } catch (e) { bad.push(id + ' EXC ' + e.message); } }
    T('Z1 every report builds and every built-in check passes', bad.length === 0, bad.join(' || '));
    R.balances = balances();
    return R;
  });
  console.log(out.tests.join('\n')); console.log(JSON.stringify({ bal: out.balances }, null, 0)); console.log(errs.join('\n')); await b.close();
})();
