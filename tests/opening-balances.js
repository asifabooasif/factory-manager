const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, S = [];
    const run = async fn => { window.toasts.length = 0; try { await fn(); } catch (e) { window.toasts.push('EXC: ' + e.message); } return window.toasts.join(' / '); };
    const cus = await E.save('parties', { name: 'Cus', type: 'Customer', active: true, code: 'P9', limit: 0, days: 30 });
    const fab = await E.save('items', { art: 'FAB', name: 'Fabric', cat: 'Raw Material', unit: 'kg', buyPrice: 50000, cost: 0, pack: 0, sizeRun: '', sub: '', price: 0, min: 0, active: true });
    const fg = await E.save('items', { art: 'A1', name: 'Flat', cat: 'Finished Good', unit: 'Pack', pack: 6, sizeRun: '6,7,7,8,8,9', sub: 'Flat', price: 200000, cost: 0, buyPrice: 0, active: true, bom: [{ itemId: fab.id, variantId: '', qty: 0.1 }] });
    await E.save('variants', { itemId: fg.id, sku: 'A1-BLK', color: 'Black', size: '', barcode: '', active: true });
    const T = (n, ok, i) => S.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' | ' + i : ''));
    let m = await run(async () => { fill({ ost_i: 'FAB', ost_q: '100', ost_c: '500', ost_d: E.today() }); await E.A.obStock(); }); T('opening raw stock', /added/.test(m), m);
    m = await run(async () => { fill({ ost_i: 'A1-BLK', ost_q: '10', ost_c: '2000', ost_d: E.today() }); await E.A.obStock(); }); T('opening finished goods 10 packs @2000', /added/.test(m), m);
    T('opening: stock = ledger', chk().length === 0, chk().join(';')); T('opening: TB balanced', tb().diff === 0);
    T('1300=50,000 and 1320=20,000 vs opening equity 3200', E.bal('1300') === 5000000 && E.bal('1320') === 2000000 && E.bal('3200') === 7000000, JSON.stringify(balances()));
    m = await run(async () => { E.A.newDN(); const rr = document.querySelectorAll('#dlr .dl'); rr[0].children[0].value = 'A1-BLK'; rr[0].children[1].value = 5; rr[0].children[5].value = '500'; document.getElementById('d_p').value = cus.id; await E.A.saveDN(); }); T('deliver 5 opening packs', /posted|saved|DN/i.test(m), m);
    T('COGS = 5 x 2000 = 10,000', E.bal('5400') === 1000000, 'cogs ' + E.bal('5400') / 100); T('health after sale', chk().length === 0, chk().join(';'));
    return S;
  });
  console.log(out.join('\n')); console.log(errs.join('\n')); await b.close();
})();
