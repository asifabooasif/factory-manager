const { start } = require('./lib.js');
(async () => {
  const { b, p, errs, ev } = await start();
  const out = await ev(async () => {
    const E = window.ERP, R = [], T = (n, ok, i) => R.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' | ' + i : ''));
    const d = E.today(), old = '2020-01-15';
    await E.post({ date: old, ref: 'O1', narr: 'old capital', source: 'journal', lines: [{ acc: '1010', dr: 100000 }, { acc: '3000', cr: 100000 }] });
    await E.post({ date: d, ref: 'E1', narr: 'wage', source: 'journal', lines: [{ acc: '5120', dr: 30000 }, { acc: '1010', cr: 30000 }] });
    await E.post({ date: d, ref: 'E2', narr: 'glue', source: 'journal', lines: [{ acc: '5120', dr: 5000 }, { acc: '1010', cr: 5000 }] });
    location.hash = '#/txn'; await new Promise(r => setTimeout(r, 300));
    const inp = () => document.getElementById('txac'), rowsTxt = () => document.getElementById('txb').innerText;
    T('E1 account search box exists with every account in its list', !!inp() && document.querySelectorAll('#txacl option').length === E.rows('coa').length, document.querySelectorAll('#txacl option').length + ' options');
    const type = v => { inp().value = v; inp().dispatchEvent(new Event('input', { bubbles: true })); };
    type('wage');
    T('E2 typing part of a name filters to matching ledgers only', /5120/.test(rowsTxt()) && !/1010/.test(rowsTxt()) && !/3000/.test(rowsTxt()), rowsTxt().slice(0, 60).replace(/\n/g, ' '));
    type('1010');
    const t1 = rowsTxt();
    T('E3 exact code opens that account as a LEDGER with opening, running and closing balance', /Opening balance/.test(t1) && /Closing balance/.test(t1) && /Balance/.test(document.getElementById('txb').innerHTML), t1.slice(0, 80).replace(/\n/g, ' '));
    // petty cash: 1000 opening (2020, before 1 Jan this year) -> 65000 after two payments? opening 1000.00, closing 650.00
    T('E4 balances are right (opening Rs 1,000.00, closing Rs 650.00)', /1,000\.00/.test(t1) && /650\.00/.test(t1) && E.bal('1010') === 65000, 'ledger ' + E.bal('1010'));
    document.querySelector('#txb [data-a="txAcc"]').click();
    T('E5 clicking an account name in any row opens its ledger', /Opening balance/.test(rowsTxt()) && inp().value.length > 0, inp().value);
    E.A.txClr();
    T('E6 clear shows all accounts again', /5120/.test(rowsTxt()) && /1010/.test(rowsTxt()) && inp().value === '', rowsTxt().slice(0, 80).replace(/\n/g, ' '));
    location.hash = '#/dashboard'; await new Promise(r => setTimeout(r, 300));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', key: 'l', altKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    T('E7 Alt+L from any screen opens the explorer with the search box focused', location.hash === '#/txn' && document.activeElement && document.activeElement.id === 'txac', location.hash + ' active=' + (document.activeElement && document.activeElement.id));
    return R;
  });
  console.log(out.join('\n')); console.log(errs.join('\n')); await b.close();
})();
