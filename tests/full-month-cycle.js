const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, S = [], F = [], X = {};
    { const od = EventTarget.prototype.dispatchEvent; EventTarget.prototype.dispatchEvent = function (ev) { if (ev.type === 'change' && ev.isTrusted === false && this instanceof HTMLSelectElement) od.call(this, new Event('input', { bubbles: true })); return od.call(this, ev); }; }
    const pad = n => String(n).padStart(2, '0');
    const today = E.today(), D = n => { const d = today.slice(0, 8) + pad(n); return d > today ? today : d; };
    const run = async fn => { window.toasts.length = 0; try { await fn(); } catch (e) { window.toasts.push('EXC: ' + e.message); } return window.toasts.join(' / '); };
    const prodTags = () => E.allocRows().filter(a => (E.allocProd ? E.allocProd(a) : a.kind !== 'bommisc'));
    const inv = () => {
      const bad = []; const t = tb(); if (t.diff) bad.push('TRIAL BALANCE out by ' + t.diff / 100);
      chk().filter(x => !/cash|overdrawn/i.test(x)).forEach(x => bad.push('HEALTH: ' + x));
      const issues = E.rows('issues').reduce((s, i) => s + (i.value || 0), 0);
      const wo = E.rows('journalEntries').filter(j => !j.reversedBy && j.source === 'release' && /Unused job material written off/.test(j.narr)).reduce((s, j) => s + j.lines.filter(l => l.acc === '5300').reduce((x, l) => x + l.dr, 0), 0);
      const isFG = id => ((E.D.items.find(i => i.id === id) || {}).cat === 'Finished Good');
      const fgAdj = E.rows('stockMoves').filter(m => ['loss', 'gain', 'opening'].includes(m.type) && isFG(m.itemId)).reduce((s, m) => s + m.value, 0);
      const jobOk = j => E.D.jobs.some(x => x.id === j.jobId && (x.status === 'In Progress' || x.status === 'Completed'));
      const tags = prodTags().filter(jobOk).reduce((s, a) => s + a.amount, 0) - (X.lateTags || 0);
      const dnCost = E.rows('deliveries').filter(d => d.status !== 'Cancelled').reduce((s, d) => s + (d.cogs || 0), 0);
      const retCost = E.rows('receipts').filter(r => r.kind === 'credit').reduce((s, r) => s + (r.cost || 0), 0);
      const var5390 = E.rows('journalEntries').flatMap(j => j.lines).filter(l => l.acc === '5390' && l.cat === 'Costing').reduce((x, l) => x + (l.dr || 0) - (l.cr || 0), 0);
      const exp = issues - wo + tags - dnCost + retCost + fgAdj - var5390, act = E.bal('1310') + E.bal('1320');
      if (Math.abs(exp - act) > 2) bad.push('INVENTORY EQUATION: WIP+FG in ledger ' + act / 100 + ' vs documents ' + exp / 100 + ' (issues ' + issues / 100 + ' - writeoff ' + wo / 100 + ' + tags ' + tags / 100 + ' - DN cost ' + dnCost / 100 + ' + return cost ' + retCost / 100 + ' + FG adj ' + fgAdj / 100 + ' - closing variance ' + var5390 / 100 + ')');
      return bad;
    };
    const step = async (name, fn, opt) => { const msg = await run(fn); const bad = inv(); const err = /error:|EXC:/.test(msg) && !(opt && opt.expectError); S.push((err || bad.length ? 'XX ' : 'ok ') + name + ' | ' + msg.slice(0, 150) + (bad.length ? ' || ' + bad.join(' ## ') : '')); if (err || bad.length) F.push({ step: name, msg: msg.slice(0, 500), bad }); return msg; };
    // ---------------------------------------------------------------- SETUP
    await E.setSetting({ wastage: 'loss' });
    await step('capital: cash 500k, bank 2,000k', async () => { await E.post({ date: D(1), ref: 'CAP', narr: 'Capital introduced', source: 'journal', lines: [{ acc: '1000', dr: 50000000 }, { acc: '1100', dr: 200000000 }, { acc: '3000', cr: 250000000 }] }); });
    const mkP = (name, type) => E.save('parties', { name, type, active: true, code: 'P' + Math.random().toString(36).slice(2, 6), limit: 0, days: 30 });
    const supA = await mkP('Sup A Materials', 'Supplier'), supB = await mkP('Sup B Consumables', 'Supplier'), cusA = await mkP('Cus A Colombo', 'Customer'), cusB = await mkP('Cus B Kandy', 'Customer');
    const mkI = (art, name, unit, price, cat, sub) => E.save('items', { art, name, cat: cat || 'Raw Material', unit, buyPrice: price, cost: 0, pack: 0, sizeRun: '', sub: sub || '', price: 0, min: 0, active: true, consumable: false });
    const fab = await mkI('FAB', 'Fabric', 'kg', 50000), sole = await mkI('SOLE', 'Sole', 'pair', 12000), glue = await mkI('GLUE', 'Glue', 'kg', 80000, 'Miscellaneous', 'Glue'), thr = await mkI('THR', 'Thread', 'cone', 30000, 'Miscellaneous', 'Thread');
    const mkFG = async (art, name, bom, price) => { const it = await E.save('items', { art, name, cat: 'Finished Good', unit: 'Pack', pack: 6, sizeRun: '6,7,7,8,8,9', sub: 'Flat', price, cost: 0, buyPrice: 0, active: true, bom }); return it; };
    const fgA = await mkFG('A100', 'Flat A100', [{ itemId: fab.id, variantId: '', qty: 0.1 }, { itemId: sole.id, variantId: '', qty: 1 }, { itemId: glue.id, variantId: '', qty: 0.02 }], 200000);
    const fgB = await mkFG('B200', 'Sandal B200', [{ itemId: fab.id, variantId: '', qty: 0.15 }, { itemId: sole.id, variantId: '', qty: 1 }, { itemId: thr.id, variantId: '', qty: 0.01 }], 250000);
    const mkV = (it, sku, color) => E.save('variants', { itemId: it.id, sku, color, size: '', barcode: '', active: true });
    const vBLK = await mkV(fgA, 'A100-BLK', 'Black'), vRED = await mkV(fgA, 'A100-RED', 'Red'), vBRN = await mkV(fgB, 'B200-BRN', 'Brown');
    const ops = []; for (const [i, [n, r]] of [['Cutting', 600], ['Sewing', 1400], ['Finishing', 500]].entries()) ops.push(await E.save('operations', { name: n, order: i + 1, rate: r, rateUnit: 'pair', piecesPerPair: 1, active: true }));
    for (const it of [fgA, fgB]) { const b0 = JSON.parse(JSON.stringify(it)); it.routing = ops.map(o => ({ opId: o.id, wait: false })); await E.save('items', it, b0); }
    const mkE = (code, name, payType, amt, allow) => E.save('employees', { code, name, nic: code + 'V', payType, amount: amt, allow: allow || 0, epf: payType !== 'Wage', piece: payType === 'Wage', target: 'OH', active: true, join: D(1) });
    const w1 = await mkE('W1', 'Piece Worker 1', 'Wage', 150000), w2 = await mkE('W2', 'Piece Worker 2', 'Wage', 150000), d1 = await mkE('D1', 'Daily Salaried 1', 'DailySalaried', 150000), m1 = await mkE('M1', 'Admin Manager', 'MonthlySalaried', 6000000, 500000), m2 = await mkE('M2', 'Factory Supervisor', 'MonthlySalaried', 4500000, 0);
    X.ids = { supA: supA.id, supB: supB.id, cusA: cusA.id, cusB: cusB.id, fab: fab.id, sole: sole.id, glue: glue.id, thr: thr.id, fgA: fgA.id, fgB: fgB.id, vBLK: vBLK.id, vRED: vRED.id, vBRN: vBRN.id };
    S.push('ok setup: parties, 4 materials (2 misc), 2 articles with BOM, 3 colours, 3 operations, 5 employees');
    // ---------------------------------------------------------------- PURCHASES
    const purchase = async (sup, rows, date, invno) => { E.A.newPur(); while (document.querySelectorAll('#plrows .pl').length < rows.length) E.A.addPl(); const rr = document.querySelectorAll('#plrows .pl'); rows.forEach((r, i) => { rr[i].children[0].value = r[0]; rr[i].children[1].value = r[1]; rr[i].children[2].value = r[2]; }); fill({ u_p: sup.id, u_d: date, u_i: invno }); document.getElementById('u_p').value = sup.id; await E.A.savePur(); };
    await step('purchase 1: fabric 300kg@500 + soles 1500@120 (Sup A, credit)', () => purchase(supA, [['FAB', 300, 500], ['SOLE', 1500, 120]], D(2), 'SA-101'));
    await step('purchase 2: glue 30kg@800 + thread 20@300 (Sup B, credit)', () => purchase(supB, [['GLUE', 30, 800], ['THR', 20, 300]], D(2), 'SB-55'));
    // ---------------------------------------------------------------- MISC RATE + JOBS (through the real screens)
    await step('misc per pair: default Rs 1.50 to 5240', async () => { E.go && E.go('#/miscrates'); fill({ mr_d: '1.5', mr_h: '5240' }); await E.A.mrSaveDef(); });
    const newJob = async (lines, custId, date) => { E.A.newJob(); const rows = () => document.querySelectorAll('#jxr .jx'); while (rows().length < lines.length) E.A.addJx(); lines.forEach((l, i) => { rows()[i].children[0].value = l[0]; rows()[i].children[1].value = l[1]; }); document.getElementById('j_p').value = custId; document.getElementById('j_d').value = date; await E.A.saveJob(); for (let k = 0; k < 40 && !document.querySelector('.cbq'); k++) await new Promise(r => setTimeout(r, 50)); await E.A.cbOk(); await new Promise(r => setTimeout(r, 250)); };
    await step('job J1: A100-BLK 240 pairs + A100-RED 120 pairs (BOM issued)', () => newJob([['A100-BLK', 240], ['A100-RED', 120]], cusA.id, D(3)));
    await step('job J2: B200-BRN 180 pairs (BOM issued)', () => newJob([['B200-BRN', 180]], cusB.id, D(3)));
    const J1 = E.D.jobs.find(j => j.no === 'JOB-00001'), J2 = E.D.jobs.find(j => j.no === 'JOB-00002');
    X.jobs = { J1: !!J1, J2: !!J2, wipAfterIssue: E.bal('1310') / 100, bommisc: E.allocRows().filter(a => a.kind === 'bommisc').map(a => a.jobId === (J1 || {}).id ? 'J1:' + a.amount / 100 : 'J2:' + a.amount / 100) };
    const L = {}; if (J1) E.D.jobLines.filter(l => l.jobId === J1.id).forEach(l => L[l.code] = l); if (J2) E.D.jobLines.filter(l => l.jobId === J2.id).forEach(l => L[l.code] = l);
    // ---------------------------------------------------------------- EXPENSES
    const addShares = (jobShares) => { document.querySelectorAll('.al-ex').forEach(e => e.remove()); const h = document.getElementById('__fill'); Object.entries(jobShares).forEach(([id, pc]) => { const i = document.createElement('input'); i.className = 'al-ex'; i.dataset.id = id; i.value = String(pc); h.appendChild(i); }); };
    const exp = async (head, rs, mode, date, note, shares, pay) => { fill({ ex_h: head, ex_a: String(rs), ex_t: mode, ex_pm: pay || '1100', ex_d: date, ex_p: '', ex_n: note, ex_r: '', ex_am: shares ? 'split' : (mode === 'job' ? 'all' : 'none') }); if (shares) addShares(shares); return E.A.exSave(); };
    await step('electricity Rs 12,000 (pool, bank)', () => exp('5210', 12000, 'pool', D(5), 'Nov electricity'));
    await step('factory rent Rs 30,000 (pool, bank)', () => exp('5220', 30000, 'pool', D(5), 'Nov factory rent'));
    await step('machine repair Rs 6,500 tagged to J1 only', () => exp('5230', 6500, 'job', D(8), 'repair J1', { [J1.id]: 100 }));
    await step('indirect materials Rs 3,000 tagged to ALL jobs', () => exp('5240', 3000, 'job', D(9), 'consumables all jobs'));
    await step('transport Rs 4,500 (selling, period)', () => exp('6020', 4500, 'pool', D(10), 'delivery transport'));
    await step('stationery Rs 2,000 (admin, period)', () => exp('6080', 2000, 'pool', D(10), 'stationery'));
    await step('tea Rs 1,200 paid from cash', () => exp('6030', 1200, 'pool', D(11), 'tea', null, '1000'));
    await step('bank charges Rs 500', () => exp('6140', 500, 'pool', D(12), 'bank charges'));
    await step('admin cost tagged to a job is refused (IAS 2)', () => exp('6080', 700, 'job', D(12), 'admin tagged', { [J1.id]: 100 }), { expectError: true });
    // ---------------------------------------------------------------- PIECE-RATE PRODUCTION (all 3 operations)
    const logPairs = async (job, line, op, pairs, empCode, rate, date) => { document.getElementById('prr')?.remove(); document.body.insertAdjacentHTML('beforeend', '<div id="prr"><div class="pr"><input><input><input><input><input><input><input></div></div>'); const c = document.querySelector('#prr .pr').children; c[0].value = empCode; c[1].value = job.id; c[2].value = line.id; c[3].value = op.id; c[4].value = ''; c[5].value = pairs; c[6].value = String(rate); fill({ pr_d: date }); return E.A.prSave(); };
    const rates = [6, 14, 5];
    for (const [code, line, pairs, jb] of [['A100-BLK', L['A100-BLK'], 240, J1], ['A100-RED', L['A100-RED'], 120, J1], ['B200-BRN', L['B200-BRN'], 180, J2]]) {
      for (const [i, op] of ops.entries()) await step('piece-rate ' + code + ' ' + op.name + ' ' + pairs + ' pairs @Rs' + rates[i], () => logPairs(jb, line, op, pairs, i === 1 ? 'W2' : 'W1', rates[i], D(10 + i)));
    }
    X.afterLogs = { pool5110: E.bal('5110') / 100, accrued2210: E.bal('2210') / 100, wip: E.bal('1310') / 100, abs5291: E.bal('5291') / 100 };
    // ---------------------------------------------------------------- PAYROLL, PETTY CASH, ASSETS, STAFF LOAN
    await step('staff loan Rs 10,000 to W1 (Rs 2,000 per run)', async () => { E.A.slNew && E.A.slNew(); fill({ sl_emp: w1.id, sl_amt: '10000', sl_bank: '1100', sl_date: D(4), sl_ded: '2000', sl_notes: 'test loan', sl_open: '' }); document.getElementById('sl_emp').value = w1.id; await E.A.slSave(); });
    await step('salary advance Rs 20,000 to M2 from bank', async () => { E.A.advM(m2.id); document.getElementById('v_e').value = m2.id; fill({ z_d: D(6), z_a: '20000', z_s: '1100', z_n: 'advance' }); document.getElementById('z_s').value = '1100'; await E.A.saveAdv(); });
    await step('daily salary D1: 20 days @ Rs 1,500 -> indirect labour 5270, tagged to ALL jobs', async () => { fill({ ds_e: d1.id, ds_d: '20', ds_adv: '', ds_loan: '', ds_f: D(1), ds_t: D(20), ds_pd: D(20), ds_s: '1100', ds_target: '5270', ds_n: '', ds_am: 'all' }); await E.A.saveDailySalary(); });
    const wageRun = async (names, monthly) => {
      monthly ? E.A.newMonthlyRun() : E.A.newWageRun();
      document.getElementById('w_f').value = D(1); document.getElementById('w_e').value = today; document.getElementById('w_d').value = today;
      monthly ? E.A.loadMonthlyRun() : E.A.loadWageSelect();
      document.querySelectorAll('.emp-row').forEach(tr => { const cb = tr.querySelector('.emp-cb'); if (cb) cb.checked = names.includes(tr.dataset.id); });
      if (!monthly) E.A.buildWageRun();
      document.querySelectorAll('#wr tr[data-id]').forEach(tr => { if (!names.includes(tr.dataset.id)) tr.remove(); });
      return tr0 => tr0;
    };
    await step('wage run: pay piece-rate workers W1 + W2 (loan recovery, EPF n/a)', async () => { await wageRun([w1.id, w2.id], false); await E.A.saveWageRun(); await E.A.confirmWagePost(); });
    const runs = () => E.D.wageRuns.filter(r => r.kind === 'run' && !r.cancelled);
    X.wageRun = runs().map(r => ({ no: r.no, gross: r.gross, net: r.net, epfEmp: r.epfEmp, loan: r.loanRec, lines: (r.lines || []).map(l => l.name + ':' + l.gross + '/' + l.net) }));
    await step('pay the wage run net from bank', async () => { const r = runs()[0]; if (!r) throw new Error('no run to pay'); E.A.payRun(r.id); fill({ z_a: String(r.net / 100), z_s: '1100', z_d: today }); document.getElementById('z_s').value = '1100'; await E.A.savePayRun(r.id); });
    await step('monthly salary run: M1 (admin) + M2 (factory, advance recovery)', async () => { await wageRun([m1.id, m2.id], true); document.querySelectorAll('#wr tr[data-id]').forEach(tr => { const t = tr.querySelector('[data-k="to"]'); if (t) t.value = tr.dataset.id === m1.id ? 'ADM' : 'OH'; }); await E.A.saveMonthlyRun(); await E.A.confirmWagePost(); });
    X.monthlyRun = runs().filter(r => r.type === 'Monthly').map(r => ({ no: r.no, gross: r.gross, net: r.net, epfEmp: r.epfEmp, epfCo: r.epfCo, etf: r.etf, adv: r.advRec }));
    await step('pay the monthly run', async () => { const r = runs().find(x => x.type === 'Monthly'); if (!r) throw new Error('no monthly run'); E.A.payRun(r.id); fill({ z_a: String(r.net / 100), z_s: '1100', z_d: today }); document.getElementById('z_s').value = '1100'; await E.A.savePayRun(r.id); });
    await step('remit EPF/ETF payable to bank', async () => { E.A.remitM(); fill({ z_a: String(E.bal('2100') / 100), z_s: '1100', z_d: today }); document.getElementById('z_s').value = '1100'; await E.A.saveRemit(); });
    await step('petty cash top-up Rs 5,000 from bank', async () => { E.A.topUp(); fill({ c_d: D(7), c_a: '5000', c_s: '1100', c_n: 'petty' }); document.getElementById('c_s').value = '1100'; await E.A.saveTop(); });
    await step('petty expense Rs 800 (tea) + Rs 1,500 factory repair tagged to J2', async () => { E.A.pcExp(); fill({ c_d: D(9), c_a: '800', c_p: '', c_n: 'tea', pc_am: 'none' }); document.getElementById('c_s').value = '6030'; await E.A.saveExp(); E.A.pcExp(); fill({ c_d: D(9), c_a: '1500', c_p: '', c_n: 'sewing machine repair', pc_am: 'split' }); document.getElementById('c_s').value = '5230'; addShares({ [J2.id]: 100 }); document.querySelectorAll('.al-ex').forEach(e => { e.className = 'al-pc'; }); await E.A.saveExp(); });
    await step('buy sewing machine Rs 240,000 (5 yrs) from bank', async () => { E.A.astM(); fill({ f_n: 'Sewing machine', f_c: 'Machinery', f_d: D(4), f_a: '240000', f_r: '0', f_l: '5', f_s: '1100' }); document.getElementById('f_s').value = '1100'; document.getElementById('f_c').value = 'Machinery'; await E.A.saveAst(); });
    await step('run depreciation for the month', async () => { E.A.depM(); fill({ g_m: today.slice(0, 7) }); await E.A.saveDep(); });
    X.afterPayroll = { b2210: E.bal('2210') / 100, b2200: E.bal('2200') / 100, b2100: E.bal('2100') / 100, b1250: E.bal('1250') / 100, b5110: E.bal('5110') / 100, b5130: E.bal('5130') / 100, b5140: E.bal('5140') / 100, b5260: E.bal('5260') / 100, b1010: E.bal('1010') / 100, b1400: E.bal('1400') / 100, b1410: E.bal('1410') / 100, b5270: E.bal('5270') / 100, b6050: E.bal('6050') / 100 };
    // ---------------------------------------------------------------- RELEASES, POOL SHARE, COMPLETION
    const release = async (job, pairsByIdx, date) => { E.A.relM(job.id); const q = document.querySelectorAll('.rq'); pairsByIdx.forEach((v, i) => { if (q[i]) q[i].value = v; }); fill({ r_d: date || today }); document.getElementById('r_d').value = date || today; return E.A.saveRel(job.id); };
    await step('release J1: A100-BLK 150 pairs (partial)', () => release(J1, [150, 0], D(15)));
    X.afterRel1 = { wip: E.bal('1310') / 100, fg: E.bal('1320') / 100, j1wip: E.jobWip(J1.id) / 100 };
    await step('release J1: BLK 90 + RED 120 (rest)', () => release(J1, [90, 120], D(18)));
    await step('release J2: B200-BRN 120 of 180 pairs', () => release(J2, [120], D(18)));
    // overhead pool: what does the system offer to share?
    location.hash = '#/expenses'; await new Promise(r => setTimeout(r, 150)); E.A.exTab('pool'); await new Promise(r => setTimeout(r, 200));
    X.poolDefaultShown = document.getElementById('ab_a') ? document.getElementById('ab_a').value : 'n/a';
    const ohAcc = E.D.coa.filter(a => a.type === 'expense' && a.nature === 'oh' && !['5290', '5291', '5295', '5390', '5260'].includes(a.code)).map(a => a.code);
    const ohBal = ohAcc.reduce((s, c) => s + E.bal(c), 0);
    const directOH = E.allocRows().filter(a => a.kind !== 'absorb' && a.kind !== 'bommisc' && ohAcc.includes(a.head)).reduce((s, a) => s + a.amount, 0);
    X.pool = { ohBalance: ohBal / 100, alreadyTaggedDirectly: directOH / 100, trulyUntagged: (ohBal - directOH) / 100, offeredByScreen: X.poolDefaultShown };
    await step('share the TRULY untagged overhead pool to jobs at month-end (basis packs released)', async () => { document.getElementById('ab_a').value = String((ohBal - directOH) / 100); document.getElementById('ab_b').value = 'packs'; document.getElementById('ab_d').value = today; await E.A.abSave(); });
    X.afterShare = { wip: E.bal('1310') / 100, abs5291: E.bal('5291') / 100 };
    await step('complete J1 (all pairs released)', async () => { await E.A.complete(J1.id); });
    X.afterComplete = { j1status: E.D.jobs.find(j => j.id === J1.id).status, wip: E.bal('1310') / 100, fg: E.bal('1320') / 100, j1wip: E.jobWip(J1.id) / 100, j1abs: E.jobAbsorbed(J1.id) / 100, j1pool: E.jobPool ? E.jobPool(J1.id) / 100 : null };
    await step('late cost: Rs 1,000 indirect material tagged to COMPLETED J1 (should stay a period cost)', async () => { const before = E.bal('1320') + E.bal('1310'); await exp('5240', 1000, 'job', today, 'late consumables', { [J1.id]: 100 }); X.lateInfo = { stockChange: (E.bal('1320') + E.bal('1310') - before) / 100, tagsOnJ1: E.allocRows(J1.id).filter(a => a.narr && /late/.test(a.narr)).length }; X.lateTags = X.lateInfo.tagsOnJ1 ? 100000 : 0; });
    // ---------------------------------------------------------------- SALES
    const dn = async (partyId, jobId, rows, date) => { E.A.newDN(); while (document.querySelectorAll('#dlr .dl').length < rows.length) E.A.addDl && E.A.addDl(); const rr = document.querySelectorAll('#dlr .dl'); rows.forEach((r, i) => { rr[i].children[0].value = r[0]; rr[i].children[1].value = r[1]; rr[i].children[5].value = String(r[2]); }); document.getElementById('d_p').value = partyId; if (document.getElementById('d_j')) document.getElementById('d_j').value = jobId || ''; if (document.getElementById('d_d')) document.getElementById('d_d').value = date; return E.A.saveDN(); };
    await step('delivery to Cus A: 30 BLK @Rs600/pair + 10 RED @Rs620/pair', () => dn(cusA.id, J1.id, [['A100-BLK', 30, 600], ['A100-RED', 10, 620]], D(20)));
    await step('delivery to Cus B: 15 BRN @Rs800/pair', () => dn(cusB.id, J2.id, [['B200-BRN', 15, 800]], D(21)));
    X.dn = E.D.deliveries.map(d => ({ no: d.no, total: d.total / 100, cogs: d.cogs / 100, status: d.status }));
    const mkInv = async (partyId, pc, date) => { E.A.newInv(); const sel = document.getElementById('n_p'); sel.value = partyId; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('n_pc').value = String(pc); if (document.getElementById('n_d')) document.getElementById('n_d').value = date; return E.A.saveInv(); };
    await step('invoice Cus A with 5% discount', () => mkInv(cusA.id, 5, D(22)));
    await step('invoice Cus B no discount', () => mkInv(cusB.id, 0, D(22)));
    X.inv = E.D.invoices.map(i => ({ no: i.no, gross: i.gross / 100, disc: i.disc / 100, total: i.total / 100 }));
    const recv = async (partyId, rs, method, extra) => { E.A.recv(); const sel = document.getElementById('st_p'); sel.value = partyId; sel.dispatchEvent(new Event('change', { bubbles: true })); if (method) { document.getElementById('st_m').value = method; document.getElementById('st_m').dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('st_m').dispatchEvent(new Event('change', { bubbles: true })); } document.getElementById('st_a').value = String(rs); document.getElementById('st_a').dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('st_d').value = today; if (document.getElementById('st_s')) document.getElementById('st_s').value = '1100'; if (extra) Object.entries(extra).forEach(([k, v]) => { const e = document.getElementById(k); if (e) e.value = v; }); return E.A.stRecv(); };
    await step('receipt Cus A Rs 60,000 bank', () => recv(cusA.id, 60000));
    await step('receipt Cus A by cheque Rs 77,940', () => recv(cusA.id, 77940, 'cheque', { st_cn: '100201', st_ck: 'BOC', st_cd: today }));
    await step('receipt Cus B Rs 80,000 bank (overpays by Rs 8,000 -> advance)', () => recv(cusB.id, 80000));
    await step('receipt Cus B cheque Rs 5,000 (will bounce)', () => recv(cusB.id, 5000, 'cheque', { st_cn: '300301', st_ck: 'HNB', st_cd: today }));
    X.cheques = E.D.cheques.map(c => ({ id: c.id, no: c.no, chq: c.chqNo, amt: c.amount / 100, st: c.status }));
    // ---------------------------------------------------------------- CHEQUES
    const chq = n => E.D.cheques.find(c => c.chqNo === n);
    await step('deposit + clear cheque 100201 (Cus A) into bank', async () => { const c = chq('100201'); if (!c) throw new Error('cheque 100201 missing'); E.A.cdDep(c.id); fill({ dp_a: '1100', dp_d: today }); document.getElementById('dp_a').value = '1100'; await E.A.cdDepSave(c.id); E.A.cdClr(c.id); fill({ cl_d: today, cl_s: '1100' }); document.getElementById('cl_s').value = '1100'; await E.A.cdClrSave(c.id); });
    await step('deposit cheque 300301 (Cus B) then it BOUNCES with Rs 500 bank charge', async () => { const c = chq('300301'); if (!c) throw new Error('cheque 300301 missing'); E.A.cdDep(c.id); document.getElementById('dp_a').value = '1100'; await E.A.cdDepSave(c.id); E.A.cdBnc(c.id); fill({ bn_d: today, bn_f: '500', bn_a: '1100', bn_r: 'insufficient funds' }); document.getElementById('bn_a').value = '1100'; await E.A.cdBncSave(c.id); });
    // ---------------------------------------------------------------- SALES RETURN
    await step('sales return: 3 packs A100-BLK from INV-00001', async () => { const iv = E.D.invoices.find(i => i.no === 'INV-00001'); E.A.newSR(); const sel = document.getElementById('rt_i'); sel.value = iv.id; sel.dispatchEvent(new Event('change', { bubbles: true })); const q = document.querySelector('.rtq'); if (!q) throw new Error('no return rows'); q.value = 3; document.getElementById('rt_d').value = today; document.getElementById('rt_s').value = '1100'; await E.A.saveSR(); });
    // ---------------------------------------------------------------- SUPPLIERS
    const paySup = async (sup, rs, method, extra) => { E.A.paySup(); const sel = document.getElementById('st_p'); sel.value = sup.id; sel.dispatchEvent(new Event('change', { bubbles: true })); if (method) { document.getElementById('st_m').value = method; document.getElementById('st_m').dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('st_m').dispatchEvent(new Event('change', { bubbles: true })); } document.getElementById('st_a').value = String(rs); document.getElementById('st_a').dispatchEvent(new Event('input', { bubbles: true })); if (document.getElementById('st_d')) document.getElementById('st_d').value = today; if (document.getElementById('st_s')) document.getElementById('st_s').value = '1100'; if (extra) Object.entries(extra).forEach(([k, v]) => { const e = document.getElementById(k); if (e) e.value = v; }); return E.A.stPay(); };
    await step('pay Sup A Rs 200,000 by bank transfer', () => paySup(supA, 200000));
    await step('purchase return: 20 kg fabric back to Sup A', async () => { const pu = E.D.purchases.find(p => p.no === 'PUR-00001'); E.A.newPR(); const sel = document.getElementById('rt_i'); sel.value = pu.id; sel.dispatchEvent(new Event('change', { bubbles: true })); const qs = [...document.querySelectorAll('.rtq')]; const q = qs.find(x => /FAB/.test((x.closest('tr') || {}).innerText || '')) || qs[0]; q.value = 20; document.getElementById('rt_d').value = today; document.getElementById('rt_s').value = ''; await E.A.savePR(); });
    await step('pay Sup B Rs 30,000 by OUR OWN CHEQUE', () => paySup(supB, 30000, 'own', { st_cn: '700001', st_cd: today }));
    X.cheques2 = E.D.cheques.map(c => ({ no: c.no, chq: c.chqNo, dir: c.dir, amt: c.amount / 100, st: c.status }));
    await step('clear our own cheque 700001', async () => { const c = chq('700001'); if (!c) throw new Error('own cheque missing'); E.A.cdClr(c.id); fill({ cl_d: today }); await E.A.cdClrSave(c.id); });
    // ---------------------------------------------------------------- STOCK ADJUSTMENTS
    const adj = (t, code, q, c) => { E.A.adjust(); fill({ a_t: t, a_d: today, a_i: code, a_q: String(q), a_c: String(c || ''), a_n: '' }); document.getElementById('a_t').value = t; return E.A.saveAdj(); };
    await step('stock loss: 2 kg fabric damaged', () => adj('loss', 'FAB', 2));
    await step('stock gain: +1 thread cone @ Rs 300', () => adj('gain', 'THR', 1, 300));
    await step('finished goods loss: 1 pack A100-RED damaged', () => adj('loss', 'A100-RED', 1));
    // ---------------------------------------------------------------- BANK LOAN
    await step('bank loan Rs 300,000 @12%, 12 instalments + first instalment paid', async () => { E.A.lnNew(); fill({ ln_l: 'Test Bank', ln_ref: 'LN-1', ln_p: '300000', ln_r: '12', ln_n: '12', ln_f: today, ln_d: D(1), ln_b: '1100' }); document.getElementById('ln_b').value = '1100'; document.getElementById('ln_m').value = 'reducing'; await E.A.lnSave(); const l = E.D.loans[0]; if (!l) throw new Error('loan not saved'); X.loan = { emi: l.emi / 100, firstRow: l.rows[0] }; E.A.lnPay(l.id + ':0'); const r0 = l.rows[0]; fill({ lp_d: today, lp_b: '1100', lp_i: String(r0.interest / 100), lp_r: '' }); document.getElementById('lp_b').value = '1100'; await E.A.lnPaySave(l.id + ':0'); });
    await step('accrued expense: audit fee Rs 8,000 (unpaid at month end)', () => exp('6130', 8000, 'pool', today, 'audit fee', null, 'ACCR'));
    // ---------------------------------------------------------------- COMPLETE J2 (provisional cost already sold -> true-up)
    await step('release J2 remaining 60 pairs', () => release(J2, [60], today));
    await step('complete J2 (15 packs already sold at provisional cost)', async () => { const v0 = E.bal('5390'), c0 = E.bal('5400'); await E.A.complete(J2.id); X.j2 = { status: E.D.jobs.find(j => j.id === J2.id).status, wip: E.jobWip(J2.id) / 100, d5390: (E.bal('5390') - v0) / 100, d5400: (E.bal('5400') - c0) / 100, fgB: E.stock(fgB.id, vBRN.id) }; });
    // ---------------------------------------------------------------- J3: write-off of unused material, cancellations
    await step('job J3: A100-BLK 60 pairs (BOM issued for 60, only 36 will be made)', async () => { try { await newJob([['A100-BLK', 60]], cusA.id, D(24)); } catch (e) { throw new Error('STACK ' + (e.stack || '').replace(/\n/g, ' | ').replace(/http:\/\/localhost:8765\/js\//g, '') + ' | modal=' + !!document.getElementById('j_p') + ' rows=' + document.querySelectorAll('#jxr .jx').length); } });
    const J3 = E.D.jobs.slice().sort((a, b) => a.no.localeCompare(b.no)).slice(-1)[0]; X.j3no = J3 && J3.no; if (J3.no === 'JOB-00002') { return { S, F, X, bal: {}, abort: S.filter(x => /job J3/.test(x)) }; } const L3 = E.D.jobLines.find(l => l.jobId === J3.id);
    await step('expense Rs 600 tagged to J3 (all open jobs)', () => exp('5240', 600, 'job', today, 'J3 consumables'));
    const wipBefore = E.jobWip(J3.id);
    await step('cancel that expense (absorption must reverse)', async () => { const v = E.D.expenses.filter(x => !x.cancelled).slice(-1)[0]; await E.A.exCancel(v.id); X.cancelExp = { wipBefore: wipBefore / 100, wipAfterCancel: E.jobWip(J3.id) / 100 }; });
    for (const [i, op] of ops.entries()) await step('piece-rate J3 ' + op.name + ' 36 pairs', () => logPairs(J3, L3, op, 36, i === 1 ? 'W2' : 'W1', rates[i], today));
    await step('piece-rate J3 extra 6 pairs sewing (will be cancelled)', () => logPairs(J3, L3, ops[1], 6, 'W2', 14, today));
    await step('cancel that extra wage log', async () => { const lg = E.D.prodLogs.filter(l => l.jobId === J3.id && l.status !== 'cancelled').slice(-1)[0]; await E.A.prCancel(lg.id); });
    await step('release J3: 36 pairs', () => release(J3, [36], today));
    await step('complete J3 (24 pairs of material never made -> factory loss)', async () => { const l0 = E.bal('5300'); await E.A.complete(J3.id); X.j3 = { status: E.D.jobs.find(j => j.id === J3.id).status, loss5300: (E.bal('5300') - l0) / 100, expectedLoss: 24 * 186 }; });
    // ---------------------------------------------------------------- cancellations of sales documents
    await step('delivery 2 packs A100-RED to Cus A then CANCEL it', async () => { await dn(cusA.id, J1.id, [['A100-RED', 2, 620]], today); const d = E.D.deliveries.filter(x => x.status === 'Delivered').slice(-1)[0]; await E.A.canDN(d.id); });
    await step('delivery 2 packs + invoice, then CANCEL the invoice and the delivery', async () => { await dn(cusA.id, J1.id, [['A100-RED', 2, 620]], today); await mkInv(cusA.id, 0, today); const iv = E.D.invoices.filter(i => !i.cancelled).slice(-1)[0]; await E.A.canInv(iv.id); const d = E.D.deliveries.filter(x => x.status === 'Delivered').slice(-1)[0]; await E.A.canDN(d.id); });
    await step('attempt to cancel an already-paid wage run (must be refused)', async () => { const r = E.D.wageRuns.find(x => x.kind === 'run' && x.paid); if (r) await E.A.canRun(r.id); }, { expectError: true });
    // ---------------------------------------------------------------- manual journals and stocktake
    await step('manual journal: bank charge Rs 250 (valid)', async () => { await E.post({ date: today, ref: 'JV-1', narr: 'manual bank charge', source: 'journal', lines: [{ acc: '6140', dr: 25000 }, { acc: '1100', cr: 25000 }] }); });
    X.jv = { jvTowardsStockControl: await run(async () => { await E.post({ date: today, ref: 'JV-2', narr: 'manual to stock control', source: 'journal', lines: [{ acc: '1300', dr: 1000000 }, { acc: '3000', cr: 1000000 }] }); }) };
    X.jv.healthAfter = chk();
    await step('reverse the manual stock-control journal', async () => { const je = E.D.journalEntries.find(j => j.ref === 'JV-2' && !j.reversedBy); if (je) await E.reverse(je.id); });
    await step('stocktake: count Raw Materials (fabric 1.5 kg short, thread +2)', async () => { E.A.newST(); fill({ st_d: today, st_s: 'Raw Material', st_n: 'month-end' }); document.getElementById('st_s').value = 'Raw Material'; await E.A.saveST(); await new Promise(r => setTimeout(r, 400)); const rows = [...document.querySelectorAll('#stb tr[data-i]')]; const st = E.D.stockTakes.slice(-1)[0]; rows.forEach(tr => { const l = st.lines[+tr.dataset.i]; const sysq = E.stock(l.itemId, l.variantId).qty; tr.querySelector('.sc').value = String(l.code === 'FAB' ? sysq - 1.5 : sysq); }); await E.A.postST(); X.stocktakeLines = st.lines.filter(l => l.diff).map(l => l.code + ':' + l.diff + '/' + l.val / 100); });
    // ---------------------------------------------------------------- COST ACCURACY OF FINISHED GOODS (provisional release vs final job cost)
    X.costVar = [];
    for (const [code, it, vr, jb] of [['A100-BLK', fgA, vBLK, J1], ['A100-RED', fgA, vRED, J1], ['B200-BRN', fgB, vBRN, J2]]) {
      const jl = E.D.jobLines.find(l => l.jobId === jb.id && l.code === code);
      let sPk = 0, sCost = 0; E.rows('deliveries').filter(d => d.status !== 'Cancelled').forEach(d => d.lines.filter(l => l.variantId === vr.id).forEach(l => { sPk += l.qty; sCost += l.cost; }));
      const ret = E.rows('receipts').filter(r => r.kind === 'credit').reduce((s, r) => s + (r.lines || []).filter(l => l.variantId === vr.id).reduce((x, l) => x + (l.qty || 0), 0), 0);
      const st = E.stock(it.id, vr.id);
      X.costVar.push({ sku: code, jobFinalCostPerPack: jl ? Math.round(jl.fgValue / (jl.target / 6)) / 100 : null, packsSold: sPk, soldCostPerPack: sPk ? Math.round(sCost / sPk) / 100 : null, stockPacks: st.qty, stockCostPerPack: st.qty ? Math.round(st.value / st.qty) / 100 : null, cogsUnderstatedIfFinalCostApplied: jl && sPk ? Math.round((sPk - ret) * (jl.fgValue / (jl.target / 6)) - (sCost - 0)) / 100 : null });
    }
    // ---------------------------------------------------------------- PERIOD LOCK
    await E.setSetting({ lockedUntil: D(20) });
    X.fixChecks = [ 'pool offered by screen = truly untagged: ' + (Math.abs(parseFloat(X.pool.offeredByScreen) - X.pool.trulyUntagged) < 0.01 ? 'PASS' : 'FAIL ' + X.pool.offeredByScreen + ' vs ' + X.pool.trulyUntagged), 'J2 unsold packs carried at final cost 2756.75: ' + (X.costVar[2].stockCostPerPack === 2756.75 ? 'PASS' : 'FAIL ' + X.costVar[2].stockCostPerPack), 'J2 variance for the 15 sold packs = 11906.25 in 5390: ' + (X.j2.d5390 === 11906.25 ? 'PASS' : 'FAIL ' + X.j2.d5390) ];
    X.lock = {};
    X.lock.backdated = await run(async () => { await exp('6080', 100, 'pool', D(10), 'backdated stationery'); });
    X.lock.currentOk = await run(async () => { await exp('6080', 100, 'pool', today, 'current stationery'); });
    X.lock.backdatedAdj = await run(async () => { E.A.adjust(); fill({ a_t: 'loss', a_d: D(10), a_i: 'FAB', a_q: '1', a_c: '', a_n: '' }); document.getElementById('a_t').value = 'loss'; await E.A.saveAdj(); });
    X.lock.cancelInvInLockedPeriod = await run(async () => { await dn(cusB.id, J2.id, [['B200-BRN', 1, 800]], D(15)); });
    await E.setSetting({ lockedUntil: '' });
    S.push('ok period lock tested: ' + JSON.stringify(X.lock).slice(0, 300));
    // ================================================================ MONTH-END: INDEPENDENT VERIFICATION
    const money = c => Math.round(c) / 100;
    const salesGross = E.rows('deliveries').filter(d => d.status !== 'Cancelled').reduce((s, d) => s + d.total, 0);
    const discounts = E.rows('invoices').filter(i => !i.cancelled).reduce((s, i) => s + (i.disc || 0), 0);
    const returnsNet = E.rows('receipts').filter(r => r.kind === 'credit' && !r.reversed).reduce((s, r) => s + r.amount, 0);
    const cogsDocs = E.rows('deliveries').filter(d => d.status !== 'Cancelled').reduce((s, d) => s + (d.cogs || 0), 0) - E.rows('receipts').filter(r => r.kind === 'credit').reduce((s, r) => s + (r.cost || 0), 0);
    const R_ = x => Math.round(x * 100);
    const typedExpenses = R_(12000 + 30000 + 6500 + 3000 + 4500 + 2000 + 1200 + 500 + 1000 + 8000) + R_(800 + 1500) + R_(13500) + R_(30000 + 3600 + 900) + R_(65000 + 9750 + 45000 + 6750) + R_(4000) + R_(3000) + R_(500) + R_(250) + R_(900) + R_(4464) + R_(100);
    const lossMoves = E.rows('stockMoves').filter(m => m.type === 'loss').reduce((s, m) => s + (-m.value), 0);
    const gainMoves = E.rows('stockMoves').filter(m => m.type === 'gain').reduce((s, m) => s + m.value, 0);
    const absorbedDocs = prodTags().filter(a => E.D.jobs.some(j => j.id === a.jobId && (j.status === 'In Progress' || j.status === 'Completed'))).reduce((s, a) => s + a.amount, 0) - (X.lateTags || 0);
    const var5390All = E.rows('journalEntries').flatMap(j => j.lines).filter(l => l.acc === '5390').reduce((x, l) => x + (l.dr || 0) - (l.cr || 0), 0);
    const npDocs = salesGross - discounts - returnsNet - cogsDocs - typedExpenses - lossMoves + gainMoves + absorbedDocs - var5390All;
    const tot = E.totals(); const sumT = t => Object.keys(tot).filter(k => (E.acct(k) || {}).type === t).reduce((s, k) => s + E.bal(k, tot), 0);
    const npLedger = sumT('income') - sumT('expense');
    X.profitCheck = { salesGross: money(salesGross), discounts: money(discounts), returnsNet: money(returnsNet), cogs: money(cogsDocs), typedExpenses: money(typedExpenses), losses: money(lossMoves), gains: money(gainMoves), absorbedIntoStock: money(absorbedDocs), netProfitFromDocuments: money(npDocs), netProfitInLedger: money(npLedger), difference: money(npDocs - npLedger) };
    if (Math.abs(npDocs - npLedger) > 5) F.push({ step: 'PROFIT RECOMPUTED FROM DOCUMENTS vs LEDGER', msg: JSON.stringify(X.profitCheck), bad: ['profit differs by ' + money(npDocs - npLedger)] });
    const jeIds = new Set(E.rows('journalEntries').map(j => j.id)), refd = new Set();
    const walk = o => { if (o && typeof o === 'object') { for (const k in o) { const v = o[k]; if (typeof v === 'string') { if (jeIds.has(v)) refd.add(v); } else walk(v); } } };
    Object.keys(E.D).filter(k => k !== 'journalEntries' && Array.isArray(E.D[k])).forEach(k => E.D[k].forEach(walk));
    const orphans = E.rows('journalEntries').filter(j => !refd.has(j.id) && !j.reversedBy && j.source !== 'reversal');
    const bySrc = {}; orphans.forEach(j => { bySrc[j.source] = (bySrc[j.source] || 0) + 1; });
    X.orphans = { bySource: bySrc, samples: orphans.filter(j => !['release', 'absorb', 'journal'].includes(j.source)).slice(0, 8).map(j => j.no + ' ' + j.source + ' ' + (j.narr || '').slice(0, 50)) };
    const ME = today.slice(0, 8) + '30', RS = E.RS, repBad = [], repOk = [];
    for (const id of Object.keys(RS.R)) { try { const P = RS.params(id); P.from = today.slice(0, 8) + '01'; P.to = ME; P.asat = ME; P.preset = 'all'; P.date = ME; P.job = P.job || J1.id; RS.clear(); const m = RS.R[id].build(P, RS.R[id]); if (!m) { repOk.push(id + '(needs selection)'); continue; } const bad = (m.checks || []).filter(c => !c[0]).map(c => c[1] + ' | ' + (c[2] || '')); if (bad.length) repBad.push(id + ': ' + bad.join(' ; ')); else repOk.push(id); } catch (e) { repBad.push(id + ' ERROR ' + e.message); } }
    X.reports = { built: repOk.length, failures: repBad };
    if (repBad.length) F.push({ step: 'REPORT SUITE', msg: '', bad: repBad });
    const pick = id => { const P = Object.assign(RS.params(id), { from: today.slice(0, 8) + '01', to: ME, asat: ME, preset: 'all', date: ME }); RS.clear(); const m = RS.R[id].build(P, RS.R[id]); return { kpis: (m.kpis || []).map(k => k[0] + ': ' + k[1]), checks: (m.checks || []).map(c => (c[0] ? 'OK ' : 'FAIL ') + c[1]) }; };
    for (const id of ['pl', 'bs', 'mfg', 'trading', 'stockval', 'wip']) { try { X[id] = pick(id); } catch (e) { X[id] = 'ERR ' + e.message; } }
    // day-by-day: every statement must balance and tie out AS AT each date in the month
    X.daily = [];
    for (const dd of [2, 5, 9, 12, 15, 18, 20, 22, 24, 26, 30]) { const dt = today.slice(0, 8) + pad(dd), bad = []; for (const id of ['tb', 'bs', 'stockval', 'wip', 'trading', 'mfg', 'pl']) { try { const P = Object.assign(RS.params(id), { from: today.slice(0, 8) + '01', to: dt, asat: dt, preset: 'all', date: dt }); RS.clear(); const m = RS.R[id].build(P, RS.R[id]); (m.checks || []).filter(c => !c[0]).forEach(c => bad.push(id + ': ' + c[1] + ' | ' + (c[2] || ''))); } catch (e) { bad.push(id + ' ERROR ' + e.message); } } X.daily.push(dt + ': ' + (bad.length ? bad.join(' ## ') : 'all statements balance')); if (bad.length) F.push({ step: 'AS-AT-DATE REPORTS ' + dt, msg: '', bad }); }
    X.final = { tbDiff: tb().diff / 100, health: chk(), cash1000: E.bal('1000') / 100, bank1100: E.bal('1100') / 100, ar1200: E.bal('1200') / 100, ap2000: E.bal('2000') / 100, stock1300: E.bal('1300') / 100, wip1310: E.bal('1310') / 100, fg1320: E.bal('1320') / 100, advCust2400: E.bal('2400') / 100 };
    return { S, F, X, bal: balances() };
  });
  console.log(out.S.filter(x => x.startsWith('XX')).join('\n')); console.log('STEPS', out.S.length, 'ok', out.S.filter(x => x.startsWith('ok')).length); console.log('FINDINGS', JSON.stringify(out.F, null, 1)); for (const k of ['fixChecks', 'costVar', 'lock', 'j2', 'j3', 'cancelExp', 'jv', 'stocktakeLines', 'daily', 'profitCheck', 'orphans', 'reports', 'final', 'pool', 'afterComplete', 'pl', 'bs', 'mfg', 'trading', 'stockval', 'wip']) console.log(k, JSON.stringify(out.X[k])); console.log(JSON.stringify(out.bal)); console.log(errs.join('\n')); await b.close();
})();
