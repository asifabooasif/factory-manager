/* Settlement Desk: Receive payment and Pay supplier, connected to the Cheque Desk, with overpayments held as advances.
   RECEIVE  : cash/bank, or a cheque that goes straight to Cheques in Hand (1110). Any amount above the invoices selected is held as a CUSTOMER ADVANCE (2400).
   PAY      : cash/bank, your own cheque (Cheques Issued 2150), or one or more CUSTOMER CHEQUES IN HAND (endorsed). Any amount above the bills selected is a SUPPLIER ADVANCE (1260).
   ADVANCES : Accounting > Advances & Credits lists every advance, lets you apply it to invoices/bills, refund it, or undo it. */
(E => {
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  const pty = id => E.D.parties.find(x => x.id === id) || {};
  const pn = id => pty(id).name || '?';
  const canDo = () => E.role === 'owner' || E.role === 'accountant';
  const docCol = dir => dir === 'in' ? 'invoices' : 'purchases';
  const docs = (dir, pid) => E.rows(docCol(dir)).filter(i => i.partyId === pid && !i.cancelled && i.total - i.paid > 0).sort((a, b) => a.date.localeCompare(b.date));
  const bump = async (col, id, a) => { const r = E.D[col].find(q => q.id === id); if (!r) return; const b = clone(r); r.paid = Math.max(0, r.paid + a); await E.save(col, r, b); };
  const ensure = async () => { if (!E.acct('2150') || !E.acct('2400') || !E.acct('1260') || !E.acct('1110')) await E.ensureCoa(); };
  const logIt = (c, ev, note) => { (c.log = c.log || []).push({ date: E.today(), at: new Date().toISOString(), ev, note: note || '', user: (E.user && (E.user.email || E.user)) || '' }); };
  const norm = s => String(s || '').trim().toUpperCase();
  const VOID = ['Bounced', 'Cancelled'];
  const BANKS = ['HNB', 'NDB', 'Sampath Bank', 'Commercial Bank', 'Bank of Ceylon', "People's Bank", 'Seylan Bank', 'NTB', 'DFCC', 'Pan Asia Bank', 'Union Bank', 'Cargills Bank'];
  const live = a => (a || []).filter(x => !x.reversed);

  /* ---------- advances held, from every source ---------- */
  function advList() {
    const out = [];
    const left = (orig, applied) => Math.max(0, orig - sum(live(applied), x => x.a));
    E.rows('receipts').filter(r => r.kind !== 'credit' && !r.reversed && r.advance > 0).forEach(r => out.push({ side: 'cust', col: 'receipts', id: r.id, pid: r.partyId, date: r.date, src: 'Receipt ' + r.no, orig: r.advance, applied: sum(live(r.advApplied), x => x.a), left: left(r.advance, r.advApplied) }));
    E.rows('payments').filter(p => p.kind !== 'debit' && !p.reversed && p.advance > 0).forEach(p => out.push({ side: 'supp', col: 'payments', id: p.id, pid: p.partyId, date: p.date, src: 'Payment ' + p.no, orig: p.advance, applied: sum(live(p.advApplied), x => x.a), left: left(p.advance, p.advApplied) }));
    E.rows('cheques').forEach(c => {
      if (VOID.includes(c.status)) return;
      const adv = E.chqAdvLeft ? E.chqAdvLeft(c) : 0, orig = c.amount - sum(c.allocs || [], x => x.a);
      if (orig > 0) out.push({ side: c.dir === 'in' ? 'cust' : 'supp', col: 'cheques', id: c.id, pid: c.partyId, date: c.recvDate || c.date, src: 'Cheque ' + c.chqNo + ' (' + (c.dir === 'in' ? 'received' : 'issued') + ')', orig, applied: orig - adv, left: adv });
      if (c.status === 'Endorsed' && c.endorse && !c.endorse.reversed && c.endorse.adv > 0) out.push({ side: 'supp', col: 'endorse', id: c.id, pid: c.endorse.partyId, date: c.endorse.date, src: 'Endorsed cheque ' + c.chqNo, orig: c.endorse.adv, applied: sum(live(c.endorse.applied), x => x.a), left: left(c.endorse.adv, c.endorse.applied) });
    });
    return out.filter(x => x.orig > 0).sort((a, b) => a.date.localeCompare(b.date));
  }
  E.advList = advList;
  E.advHeld = (side, pid) => sum(advList().filter(x => x.side === side && x.pid === pid), x => x.left);

  /* ---------- shared form helpers ---------- */
  const inp = 'style="width:110px;padding:6px;border:1px solid var(--bd);border-radius:8px"';
  const allocTable = (dir, pid, cls) => { const L = docs(dir, pid); return L.length ? `<div class="tw"><table><thead><tr><th>${dir === 'in' ? 'Invoice' : 'Bill'}</th><th>Date</th><th class="r">Balance</th><th class="r">Allocate (Rs)</th></tr></thead><tbody>${L.map(i => `<tr><td>${E.esc(i.no)}${i.invNo ? ' · ' + E.esc(i.invNo) : ''}</td><td>${i.date}</td><td class="r">${E.m(i.total - i.paid)}</td><td><input class="${cls}" type="number" step="0.01" data-id="${i.id}" ${inp}></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">No unpaid ${dir === 'in' ? 'invoices' : 'bills'}. The whole amount will be held as an advance.</p>`; };
  const fifo = (dir, cls, total) => { let left = total; document.querySelectorAll('.' + cls).forEach(i => { const x = E.D[docCol(dir)].find(q => q.id === i.dataset.id), a = x ? Math.min(left, x.total - x.paid) : 0; left -= a; i.value = a ? (a / 100).toFixed(2) : ''; }); };
  const allocs = cls => [...document.querySelectorAll('.' + cls)].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0);
  const checkAllocs = (dir, al, amt) => {
    if (sum(al, x => x.a) > amt) throw new Error('The allocated amounts are more than the payment amount');
    for (const x of al) { const d = E.D[docCol(dir)].find(q => q.id === x.id); if (!d || d.cancelled) throw new Error('A selected ' + (dir === 'in' ? 'invoice' : 'bill') + ' is not available'); if (x.a > d.total - d.paid) throw new Error(d.no + ': allocation is more than its balance'); }
  };
  const summary = (dir, cls, amt, el) => { const al = sum(allocs(cls), x => x.a), adv = amt - al, e = E.$(el); if (!e) return; e.innerHTML = `<span>Matched to ${dir === 'in' ? 'invoices' : 'bills'} <b>${E.m(al)}</b> · ${adv < 0 ? '<b class="bad">Over-allocated by ' + E.m(-adv) + '</b>' : adv > 0 ? '<b style="color:#d97706">Extra ' + E.m(adv) + ' will be held as ' + (dir === 'in' ? 'a customer' : 'a supplier') + ' advance</b>' : '<b class="ok">Fully matched</b>'}</span>`; };
  const heldNote = (side, pid) => { const h = E.advHeld(side, pid); return h ? `<div class="muted" style="margin-top:4px">Advance already held for this ${side === 'cust' ? 'customer' : 'supplier'}: <b>${E.m(h)}</b> (apply it in Accounting › Advances & Credits)</div>` : ''; };

  /* ================= RECEIVE PAYMENT ================= */
  const rcvMethod = m => m === 'cheque'
    ? `<div class="g2"><div class="f">Cheque number *<input id="st_cn"></div><div class="f">Drawn on (bank) *<input id="st_ck" list="st_bl" placeholder="e.g. HNB"><datalist id="st_bl">${BANKS.map(b => `<option value="${b}">`).join('')}</datalist></div><div class="f">Cheque date (post-dated if in the future) *<input id="st_cd" type="date" value="${E.today()}"></div></div><p class="muted">The cheque goes to <b>Cheques in Hand</b>. Money reaches the bank when you deposit and clear it in the Cheque Desk.</p>`
    : `<div class="f">Received into *<select id="st_s"><option value="">— select cash / bank account —</option>${E.opts(a => a.bank)}</select></div>`;
  function rcvBills() { const p = E.val('st_p'); E.$('st_b').innerHTML = allocTable('in', p, 'stal') + heldNote('cust', p); rcvFifo(); }
  function rcvFifo() { fifo('in', 'stal', E.c(E.val('st_a'))); summary('in', 'stal', E.c(E.val('st_a')), 'st_sum'); }
  E.A.recv = () => {
    const ps = E.rows('parties').filter(p => p.active !== false && p.type !== 'Supplier').sort((a, b) => a.name.localeCompare(b.name));
    if (!ps.length) return E.toast('Add a customer first', 'error');
    E.modal('Receive payment', `<div class="g2"><div class="f">Customer *<select id="st_p">${ps.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
      <div class="f">Date<input id="st_d" type="date" value="${E.today()}"></div>
      <div class="f">Paid by<select id="st_m"><option value="bank">Cash / bank transfer</option><option value="cheque">Cheque (goes to Cheques in Hand)</option></select></div>
      <div class="f">Amount (Rs) *<input id="st_a" type="number" step="0.01"></div></div>
      <div id="st_x">${rcvMethod('bank')}</div><div id="st_b"></div><div class="tot" id="st_sum"></div><div class="f">Notes<input id="st_n"></div>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="stRecv">Post receipt</button>`, 1);
    rcvBills();
  };
  E.A.stRecv = async () => {
    try {
      await ensure();
      const m = E.val('st_m'), pid = E.val('st_p'), d = E.val('st_d') || E.today(), amt = E.c(E.val('st_a')), al = allocs('stal');
      if (amt <= 0) throw new Error('Enter the amount');
      checkAllocs('in', al, amt);
      const alT = sum(al, x => x.a), adv = amt - alT, note = E.val('st_n');
      if (adv > 0 && !confirm(E.m(adv) + ' is more than the invoices selected. It will be held as an advance for ' + pn(pid) + '. Continue?')) return;
      if (m === 'cheque') {
        const cn = E.val('st_cn').trim(), bank = E.val('st_ck').trim(), dt = E.val('st_cd');
        if (!cn || !bank || !dt) throw new Error('Fill the cheque number, bank and cheque date');
        if (E.rows('cheques').some(c => c.dir === 'in' && norm(c.chqNo) === norm(cn) && norm(c.bank) === norm(bank) && !VOID.includes(c.status))) throw new Error('Cheque ' + cn + ' on ' + bank + ' is already recorded');
        const bn = E.rows('cheques').filter(c => c.partyId === pid && c.status === 'Bounced').length;
        if (bn && !confirm(pn(pid) + ' has ' + bn + ' returned cheque(s) on record. Accept this cheque anyway?')) return;
        const no = await E.next('CHQ'), je = await E.post({ date: d, ref: no, narr: 'Cheque received ' + cn + ' · ' + pn(pid) + (adv ? ' (advance ' + E.m(adv) + ')' : ''), source: 'cheque', lines: [{ acc: '1110', dr: amt }, alT ? { acc: '1200', cr: alT } : null, adv ? { acc: '2400', cr: adv } : null].filter(Boolean) });
        for (const x of al) await bump('invoices', x.id, x.a);
        const c = { no, dir: 'in', chqNo: cn, bank, bankAcc: '', partyId: pid, date: dt, origDate: dt, recvDate: d, amount: amt, allocs: al, applied: [], status: 'Pending', jeId: je.id, note, postponed: 0 };
        logIt(c, 'Received', adv ? 'Advance ' + E.m(adv) : ''); await E.save('cheques', c);
        E.closeM(); E.go(); return E.toast(no + ' saved in Cheques in Hand' + (adv ? ' · advance ' + E.m(adv) : ''), 'success');
      }
      const s = E.val('st_s'); if (!s) throw new Error('Select the account the money was received into');
      const no = await E.next('RCT'), je = await E.post({ date: d, ref: no, narr: (note || 'Receipt') + ' · ' + pn(pid) + (adv ? ' (advance ' + E.m(adv) + ')' : ''), source: 'receipt', lines: [{ acc: s, dr: amt }, alT ? { acc: '1200', cr: alT } : null, adv ? { acc: '2400', cr: adv } : null].filter(Boolean) });
      for (const x of al) await bump('invoices', x.id, x.a);
      await E.save('receipts', { no, date: d, partyId: pid, acc: s, amount: amt, allocs: al, jeId: je.id, advance: adv, advApplied: [] });
      E.closeM(); E.go(); E.toast(no + ' posted' + (adv ? ' · advance ' + E.m(adv) + ' held' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ================= PAY SUPPLIER ================= */
  const inHand = () => E.rows('cheques').filter(c => c.dir === 'in' && c.status === 'Pending' && !c.deposit).sort((a, b) => a.date.localeCompare(b.date));
  const payMethod = m => {
    if (m === 'own') return `<div class="g2"><div class="f">Issued from bank account *<select id="st_s"><option value="">— select —</option>${E.opts(a => a.bank && a.code !== '1000')}</select></div><div class="f">Cheque number *<input id="st_cn"></div><div class="f">Cheque date (post-dated if in the future) *<input id="st_cd" type="date" value="${E.today()}"></div></div><p class="muted">Recorded in the Cheque Desk as an <b>issued cheque</b>. The bank is reduced when it clears.</p>`;
    if (m === 'endorse') { const L = inHand(); return L.length ? `<div class="tw"><table><thead><tr><th></th><th>Cheque</th><th>Customer</th><th>Bank</th><th>Cheque date</th><th class="r">Amount</th></tr></thead><tbody>${L.map(c => `<tr><td><input type="checkbox" class="st-ch" data-id="${c.id}"></td><td>${E.esc(c.chqNo)}</td><td>${E.esc(pn(c.partyId))}</td><td>${E.esc(c.bank)}</td><td>${c.date}</td><td class="r">${E.m(c.amount)}</td></tr>`).join('')}</tbody></table></div><div class="muted" id="st_cs"></div><p class="muted">Customer cheques you still hold (not deposited). A cheque cannot be split, so any value above the bills selected becomes a supplier advance.</p>` : '<p class="bad">There are no cheques in hand to endorse.</p>'; }
    return `<div class="f">Paid from *<select id="st_s"><option value="">— select cash / bank account —</option>${E.opts(a => a.bank)}</select></div>`;
  };
  const chosen = () => [...document.querySelectorAll('.st-ch')].filter(c => c.checked).map(c => E.D.cheques.find(x => x.id === c.dataset.id)).filter(Boolean);
  function payBills() { const p = E.val('st_p'); E.$('st_b').innerHTML = allocTable('out', p, 'stal') + heldNote('supp', p); payFifo(); }
  function payFifo() { const m = E.val('st_m'); if (m === 'endorse') { const t = sum(chosen(), c => c.amount); E.$('st_a').value = t ? (t / 100).toFixed(2) : ''; const cs = E.$('st_cs'); if (cs) cs.textContent = chosen().length + ' cheque(s) selected · total ' + E.m(t); } fifo('out', 'stal', E.c(E.val('st_a'))); summary('out', 'stal', E.c(E.val('st_a')), 'st_sum'); }
  E.A.paySup = () => {
    const ps = E.rows('parties').filter(p => p.active !== false && p.type !== 'Customer').sort((a, b) => a.name.localeCompare(b.name));
    if (!ps.length) return E.toast('Add a supplier first', 'error');
    E.modal('Pay supplier', `<div class="g2"><div class="f">Supplier *<select id="st_p">${ps.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
      <div class="f">Date<input id="st_d" type="date" value="${E.today()}"></div>
      <div class="f">Pay by<select id="st_m"><option value="bank">Cash / bank transfer</option><option value="own">My own cheque</option><option value="endorse">Customer cheque(s) in hand (endorse)</option></select></div>
      <div class="f">Amount (Rs) *<input id="st_a" type="number" step="0.01"></div></div>
      <div id="st_x">${payMethod('bank')}</div><div id="st_b"></div><div class="tot" id="st_sum"></div><div class="f">Notes<input id="st_n"></div>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="stPay">Post payment</button>`, 1);
    payBills();
  };
  E.A.stPay = async () => {
    try {
      await ensure();
      const m = E.val('st_m'), pid = E.val('st_p'), d = E.val('st_d') || E.today(), note = E.val('st_n'), al = allocs('stal');
      if (m === 'endorse') {
        const cs = chosen(); if (!cs.length) throw new Error('Tick the cheque(s) you are giving to the supplier');
        for (const c of cs) if (c.status !== 'Pending' || c.deposit) throw new Error('Cheque ' + c.chqNo + ' is no longer in hand');
        const T = sum(cs, c => c.amount); checkAllocs('out', al, T);
        const alT = sum(al, x => x.a);
        if (T - alT > 0 && !confirm(E.m(T - alT) + ' of the cheque value is more than the bills selected. It will be held as a supplier advance with ' + pn(pid) + '. Continue?')) return;
        const queue = clone(al); let jeIds = [];
        for (const c of cs) {
          let room = c.amount; const part = [];
          while (room > 0 && queue.length) { const q = queue[0], t = Math.min(room, q.a); part.push({ id: q.id, a: t }); q.a -= t; room -= t; if (q.a <= 0) queue.shift(); }
          const pa = sum(part, x => x.a), adv = c.amount - pa, no = await E.next('END');
          const je = await E.post({ date: d, ref: no, narr: 'Cheque ' + c.chqNo + ' endorsed to ' + pn(pid) + (note ? ' · ' + note : '') + (adv ? ' (advance ' + E.m(adv) + ')' : ''), source: 'cheque', lines: [pa ? { acc: '2000', dr: pa } : null, adv ? { acc: '1260', dr: adv } : null, { acc: '1110', cr: c.amount }].filter(Boolean) });
          for (const x of part) await bump('purchases', x.id, x.a);
          const b = clone(c); c.status = 'Endorsed'; c.endorse = { partyId: pid, allocs: part, adv, applied: [], date: d, jeId: je.id }; logIt(c, 'Endorsed', pn(pid) + (adv ? ' · advance ' + E.m(adv) : '')); await E.save('cheques', c, b);
        }
        E.closeM(); E.go(); return E.toast(cs.length + ' cheque(s) endorsed to ' + pn(pid), 'success');
      }
      const amt = E.c(E.val('st_a')); if (amt <= 0) throw new Error('Enter the amount');
      checkAllocs('out', al, amt);
      const alT = sum(al, x => x.a), adv = amt - alT;
      if (adv > 0 && !confirm(E.m(adv) + ' is more than the bills selected. It will be held as an advance with ' + pn(pid) + '. Continue?')) return;
      const s = E.val('st_s'); if (!s) throw new Error(m === 'own' ? 'Select the bank account the cheque is drawn on' : 'Select the account the money is paid from');
      if (m === 'own') {
        const cn = E.val('st_cn').trim(), dt = E.val('st_cd'); if (!cn || !dt) throw new Error('Fill the cheque number and cheque date');
        const bank = (E.acct(s) || {}).name || s;
        if (E.rows('cheques').some(c => c.dir === 'out' && norm(c.chqNo) === norm(cn) && norm(c.bank) === norm(bank) && !VOID.includes(c.status))) throw new Error('Cheque ' + cn + ' on ' + bank + ' is already recorded');
        const no = await E.next('CHQ'), je = await E.post({ date: d, ref: no, narr: 'Cheque issued ' + cn + ' · ' + pn(pid) + (adv ? ' (advance ' + E.m(adv) + ')' : ''), source: 'cheque', lines: [alT ? { acc: '2000', dr: alT } : null, adv ? { acc: '1260', dr: adv } : null, { acc: '2150', cr: amt }].filter(Boolean) });
        for (const x of al) await bump('purchases', x.id, x.a);
        const c = { no, dir: 'out', chqNo: cn, bank, bankAcc: s, partyId: pid, date: dt, origDate: dt, recvDate: d, amount: amt, allocs: al, applied: [], status: 'Pending', jeId: je.id, note, postponed: 0 };
        logIt(c, 'Issued', adv ? 'Advance ' + E.m(adv) : ''); await E.save('cheques', c);
        E.closeM(); E.go(); return E.toast(no + ' recorded in the Cheque Desk' + (adv ? ' · advance ' + E.m(adv) : ''), 'success');
      }
      if (E.bal(s) < amt && !confirm('The selected account balance (' + E.m(E.bal(s)) + ') is lower than this payment. Continue?')) return;
      const no = await E.next('PAY'), je = await E.post({ date: d, ref: no, narr: (note || 'Payment') + ' · ' + pn(pid) + (adv ? ' (advance ' + E.m(adv) + ')' : ''), source: 'payment', lines: [alT ? { acc: '2000', dr: alT } : null, adv ? { acc: '1260', dr: adv } : null, { acc: s, cr: amt }].filter(Boolean) });
      for (const x of al) await bump('purchases', x.id, x.a);
      await E.save('payments', { no, date: d, partyId: pid, acc: s, amount: amt, allocs: al, jeId: je.id, advance: adv, advApplied: [] });
      E.closeM(); E.go(); E.toast(no + ' posted' + (adv ? ' · advance ' + E.m(adv) + ' held' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  const isPay = () => !!(E.$('st_m') && E.$('st_m').querySelector('[value="own"]'));
  E.hooks.push(e => {
    const t = e.target; if (!t || !E.$('st_m')) return;
    if (t.id === 'st_p') (isPay() ? payBills : rcvBills)();
    else if (t.id === 'st_m') { const pay = isPay(); E.$('st_x').innerHTML = pay ? payMethod(t.value) : rcvMethod(t.value); E.$('st_a').readOnly = pay && t.value === 'endorse'; (pay ? payFifo : rcvFifo)(); }
    else if (t.id === 'st_a') (isPay() ? payFifo : rcvFifo)();
    else if (t.classList && t.classList.contains('st-ch')) payFifo();
    else if (t.classList && t.classList.contains('stal')) summary(isPay() ? 'out' : 'in', 'stal', E.c(E.val('st_a')), 'st_sum');
  });

  /* ================= ADVANCES & CREDITS ================= */
  const ni = E.N.findIndex(n => n.id === 'chqdesk');
  { const n = { g: 'Accounting', id: 'advances', ico: '🧾', label: 'Advances & Credits' }; E.N.splice(ni < 0 ? E.N.length : ni + 1, 0, n); }
  const gl = c => { const a = E.acct(c); if (!a) return 0; let v = 0; E.rows('journalEntries').forEach(j => j.lines.forEach(l => { if (l.acc === c) v += l.cr - l.dr; })); return v; };
  E.route('advances', 'Advances & Credits', () => {
    const L = advList().filter(x => x.left > 0 || x.applied > 0).sort((a, b) => a.side.localeCompare(b.side) || pn(a.pid).localeCompare(pn(b.pid)));
    const cust = sum(L.filter(x => x.side === 'cust'), x => x.left), supp = sum(L.filter(x => x.side === 'supp'), x => x.left);
    const g2400 = gl('2400'), g1260 = -gl('1260');
    const chk = (a, b) => a === b ? '<span class="ok">✓ agrees with the ledger</span>' : `<span class="bad">Differs from the ledger by ${E.m(Math.abs(a - b))}</span>`;
    const table = side => { const R = L.filter(x => x.side === side && (x.left > 0 || x.applied > 0)); return `<div class="tw"><table><thead><tr><th>${side === 'cust' ? 'Customer' : 'Supplier'}</th><th>Source</th><th>Date</th><th class="r">Original</th><th class="r">Used</th><th class="r">Left</th><th></th></tr></thead><tbody>${R.map(x => `<tr><td><b>${E.esc(pn(x.pid))}</b></td><td>${E.esc(x.src)}</td><td>${x.date}</td><td class="r">${E.m(x.orig)}</td><td class="r">${E.m(x.applied)}</td><td class="r"><b>${E.m(x.left)}</b></td><td class="r">${canDo() ? `${x.left > 0 ? `<button class="btn sm p" data-a="advApply" data-id="${x.col}|${x.id}">Apply to ${side === 'cust' ? 'invoices' : 'bills'}</button> ${x.col !== 'cheques' && x.col !== 'endorse' ? `<button class="btn sm" data-a="advRefund" data-id="${x.col}|${x.id}">Refund</button>` : ''}` : ''}${x.col !== 'cheques' ? ` <button class="btn sm" data-a="advHist" data-id="${x.col}|${x.id}">History</button>` : ''}` : ''}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">No advances</td></tr>`}</tbody></table></div>`; };
    return `<div class="card"><h3>🧾 Advances & Credits</h3><p class="muted">Money received from a customer, or paid to a supplier, that is <b>more than the invoices or bills it was matched to</b>. It stays on the customer's or supplier's account until you apply it to later invoices or bills, or refund it.</p>
      <div class="kp">${E.kpi('Customer advances (we owe)', E.m(cust), chk(cust, g2400))}${E.kpi('Supplier advances (they owe us)', E.m(supp), chk(supp, g1260))}</div></div>
      <div class="card"><h3>Customer advances</h3>${table('cust')}</div><div class="card"><h3>Supplier advances</h3>${table('supp')}</div>
      <div class="card muted"><b>Where do advances come from?</b> Receive payment or Pay supplier with an amount above the invoices or bills selected, or a cheque larger than the documents it was matched to. Cheque advances are applied from here or from the Cheque Desk.</div>`;
  });
  const srcOf = key => { const [col, id] = key.split('|'); const rec = col === 'endorse' ? E.D.cheques.find(c => c.id === id) : E.D[col].find(r => r.id === id); return { col, id, rec }; };
  E.A.advApply = key => {
    const { col, id, rec } = srcOf(key); if (!rec) return; if (col === 'cheques') return E.A.cdApp(id);
    const a = advList().find(x => x.col === col && x.id === id); if (!a) return; const dir = a.side === 'cust' ? 'in' : 'out';
    if (!docs(dir, a.pid).length) return E.toast('No unpaid ' + (dir === 'in' ? 'invoices' : 'bills') + ' for ' + pn(a.pid) + '. The advance stays on account.', 'error');
    E.modal('Apply advance · ' + pn(a.pid), `<p>${E.esc(a.src)} · advance left <b>${E.m(a.left)}</b></p><div class="f" style="max-width:220px">Date<input id="ad_d" type="date" value="${E.today()}"></div>${allocTable(dir, a.pid, 'adal')}<div class="tot" id="ad_s"></div>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="advApplySave" data-id="${key}">Apply</button>`, 1);
    fifo(dir, 'adal', a.left); adSum(a.left);
  };
  const adSum = left => { const t = sum(allocs('adal'), x => x.a), e = E.$('ad_s'); if (e) e.innerHTML = `Applying ${E.m(t)} of ${E.m(left)} · <b class="${t > left ? 'bad' : ''}">${t > left ? 'More than the advance left' : 'Left on account ' + E.m(left - t)}</b>`; };
  E.hooks.push(e => { if (e.target && e.target.classList && e.target.classList.contains('adal')) { const k = document.querySelector('[data-a="advApplySave"]'); if (k) { const a = advList().find(x => k.dataset.id === x.col + '|' + x.id); adSum(a ? a.left : 0); } } });
  E.A.advApplySave = async key => {
    try {
      const { col, id, rec } = srcOf(key), a = advList().find(x => x.col === col && x.id === id); if (!a) throw new Error('Advance not found'); const dir = a.side === 'cust' ? 'in' : 'out';
      const al = allocs('adal'), tot = sum(al, x => x.a), d = E.val('ad_d') || E.today();
      if (tot <= 0) throw new Error('Enter the amounts to apply'); if (tot > a.left) throw new Error('More than the advance left (' + E.m(a.left) + ')'); checkAllocs(dir, al, tot);
      const no = await E.next('ADV'), je = await E.post({ date: d, ref: no, narr: 'Advance applied · ' + pn(a.pid) + ' · ' + a.src, source: 'advance', lines: dir === 'in' ? [{ acc: '2400', dr: tot }, { acc: '1200', cr: tot }] : [{ acc: '2000', dr: tot }, { acc: '1260', cr: tot }] });
      for (const x of al) await bump(docCol(dir), x.id, x.a);
      const list = al.map(x => Object.assign({ date: d, jeId: je.id }, x)), b = clone(rec);
      if (col === 'endorse') { rec.endorse.applied = (rec.endorse.applied || []).concat(list); logIt(rec, 'Advance applied', E.m(tot)); await E.save('cheques', rec, b); }
      else { rec.advApplied = (rec.advApplied || []).concat(list); await E.save(col, rec, b); }
      E.closeM(); E.go(); E.toast('Advance of ' + E.m(tot) + ' applied', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.advRefund = key => {
    const { col, id, rec } = srcOf(key), a = advList().find(x => x.col === col && x.id === id); if (!rec || !a) return;
    E.modal('Refund advance · ' + pn(a.pid), `<p>${E.esc(a.src)} · advance left <b>${E.m(a.left)}</b></p><div class="g2"><div class="f">Date<input id="rf_d" type="date" value="${E.today()}"></div><div class="f">Amount (Rs)<input id="rf_a" type="number" step="0.01" value="${(a.left / 100).toFixed(2)}"></div><div class="f">${a.side === 'cust' ? 'Paid out from' : 'Received into'} *<select id="rf_s"><option value="">— select —</option>${E.opts(x => x.bank)}</select></div></div><p class="muted">${a.side === 'cust' ? 'Posts Dr Customer Advances / Cr bank: you give the money back to the customer.' : 'Posts Dr bank / Cr Supplier Advances: the supplier gives the money back to you.'}</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="advRefundSave" data-id="${key}">Post refund</button>`);
  };
  E.A.advRefundSave = async key => {
    try {
      const { col, id, rec } = srcOf(key), a = advList().find(x => x.col === col && x.id === id); if (!a) throw new Error('Advance not found');
      const amt = E.c(E.val('rf_a')), s = E.val('rf_s'), d = E.val('rf_d') || E.today(); if (amt <= 0) throw new Error('Enter the amount'); if (amt > a.left) throw new Error('More than the advance left'); if (!s) throw new Error('Select the account');
      if (a.side === 'cust' && E.bal(s) < amt && !confirm('The selected account balance is lower than this refund. Continue?')) return;
      const no = await E.next('RFD'), je = await E.post({ date: d, ref: no, narr: 'Advance refund · ' + pn(a.pid) + ' · ' + a.src, source: 'advance', lines: a.side === 'cust' ? [{ acc: '2400', dr: amt }, { acc: s, cr: amt }] : [{ acc: s, dr: amt }, { acc: '1260', cr: amt }] });
      const b = clone(rec); rec.advApplied = (rec.advApplied || []).concat([{ refund: true, a: amt, date: d, jeId: je.id, acc: s }]); await E.save(col, rec, b);
      E.closeM(); E.go(); E.toast('Refund of ' + E.m(amt) + ' posted', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.advHist = key => {
    const { col, rec } = srcOf(key); if (!rec) return;
    const L = (col === 'endorse' ? rec.endorse.applied : rec.advApplied) || [];
    E.modal('History', `<div class="tw"><table><thead><tr><th>Date</th><th>What</th><th class="r">Amount</th><th></th></tr></thead><tbody>${L.map((x, i) => `<tr style="${x.reversed ? 'opacity:.5' : ''}"><td>${x.date}</td><td>${x.refund ? 'Refund' : 'Applied to ' + E.esc(((E.D.invoices.find(q => q.id === x.id) || E.D.purchases.find(q => q.id === x.id) || {}).no) || '?')}</td><td class="r">${E.m(x.a)}</td><td class="r">${x.reversed ? '<span class="tag">Undone</span>' : (canDo() ? `<button class="btn sm d" data-a="advUndo" data-id="${key}|${i}">Undo</button>` : '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing used yet</td></tr>'}</tbody></table></div>`, `<button class="btn" data-a="close">Close</button>`);
  };
  E.A.advUndo = async k => {
    try {
      const p = k.split('|'), idx = +p.pop(), key = p.join('|'), { col, rec } = srcOf(key); const L = (col === 'endorse' ? rec.endorse.applied : rec.advApplied), x = L[idx];
      if (!x || x.reversed) return; if (!confirm('Undo this? The opposite entry is posted today.')) return;
      await E.reverse(x.jeId);
      if (!x.refund) { const dir = (col === 'receipts') ? 'in' : (col === 'payments' || col === 'endorse') ? 'out' : ''; await bump(docCol(dir), x.id, -x.a); }
      const b = clone(rec); x.reversed = true; await E.save(col === 'endorse' ? 'cheques' : col, rec, b); E.closeM(); E.go(); E.toast('Undone', 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ---- guards: a receipt/payment that holds an advance already used cannot simply be reversed ---- */
  const wrap = (name, col) => { const f = E.A[name]; if (!f) return; E.A[name] = id => { const r = E.D[col].find(x => x.id === id); if (r && live(r.advApplied).length) return E.toast('Part of the advance on ' + r.no + ' was already applied or refunded. Undo that first in Accounting › Advances & Credits.', 'error'); return f(id); }; };
  wrap('revRecv', 'receipts'); wrap('revPay', 'payments');
})(window.ERP);
