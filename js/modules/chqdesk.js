/* Cheque Desk — advance / post-dated cheque handling with pro-level analytics.
   Life-cycle of a cheque RECEIVED from a customer:
     Received (Pending) -> Deposited -> Cleared        or  -> Bounced (returned)   or  -> Endorsed to a supplier
   Life-cycle of a cheque ISSUED to a supplier:
     Issued (Pending) -> Cleared                        or  -> Cancelled
   ADVANCE cheques: the part of a cheque that is not matched to an invoice/bill is kept as a customer advance
   (account 2400) or supplier advance (account 1260) and can be applied to later invoices/bills.
   Nothing new is stored outside the existing "cheques" collection, so cloud sync and backups keep working. */
(E => {
  const bi = E.N.findIndex(n => n.id === 'banking');
  E.N.splice(bi < 0 ? E.N.length : bi + 1, 0, { g: 'Accounting', id: 'chqdesk', ico: '📬', label: 'Cheque Desk' });

  const F = { tab: 'dash', dir: '', st: 'open', q: '', from: '', to: '' };
  const cq = () => E.rows('cheques');
  const pty = id => E.D.parties.find(x => x.id === id) || {};
  const pn = id => pty(id).name || '?';
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const dayN = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const norm = s => String(s || '').trim().toUpperCase();
  const recvOn = c => c.recvDate || (c.createdAt || '').slice(0, 10) || c.date;
  const canRev = () => E.role === 'owner' || E.role === 'accountant';
  const VOID = ['Bounced', 'Cancelled'];
  const BANKS = ['HNB', 'NDB', 'Sampath Bank', 'Commercial Bank', 'Bank of Ceylon', "People's Bank", 'Seylan Bank', 'NTB', 'DFCC', 'Pan Asia Bank', 'Union Bank', 'Cargills Bank'];

  /* advance still unapplied on a cheque (money held on account for the party) */
  const advLeft = c => {
    if (!c || VOID.includes(c.status)) return 0;
    const u = sum(c.allocs || [], x => x.a) + sum((c.applied || []).filter(x => !x.reversed), x => x.a);
    return Math.max(0, c.amount - u);
  };
  E.chqAdvLeft = advLeft;
  const advTotal = dir => sum(cq().filter(c => c.dir === dir), advLeft);
  E.chqAdvTotal = advTotal;

  /* ══════════════════ ANALYTICS ENGINE (pure: rows + options in, numbers out) ══════════════════ */
  E.chqAnalyse = (rows, o) => {
    const T = o.today, A = {};
    const open = rows.filter(c => c.status === 'Pending');
    const inO = open.filter(c => c.dir === 'in'), outO = open.filter(c => c.dir === 'out');
    const dd = c => dayN(T, c.date);
    const BK = [['Due / overdue', d => d <= 0], ['1–7 days', d => d >= 1 && d <= 7], ['8–30 days', d => d >= 8 && d <= 30], ['31–60 days', d => d >= 31 && d <= 60], ['61–90 days', d => d >= 61 && d <= 90], ['91–180 days', d => d >= 91 && d <= 180], ['Over 180 days', d => d > 180]];
    const bucket = L => BK.map(([l, f]) => { const x = L.filter(c => f(dd(c))); return { l, n: x.length, v: sum(x, c => c.amount) }; });
    const wtd = L => { const v = sum(L, c => c.amount); return v ? sum(L, c => c.amount * Math.max(0, dd(c))) / v : 0; };
    A.inOpen = { n: inO.length, v: sum(inO, c => c.amount), wtd: wtd(inO), buckets: bucket(inO) };
    A.outOpen = { n: outO.length, v: sum(outO, c => c.amount), wtd: wtd(outO), buckets: bucket(outO) };
    A.net = A.inOpen.v - A.outOpen.v;
    const in7 = inO.filter(c => dd(c) <= 7), out7 = outO.filter(c => dd(c) <= 7);
    A.due7 = { inN: in7.length, inV: sum(in7, c => c.amount), outN: out7.length, outV: sum(out7, c => c.amount) };

    /* weekly cash calendar from cheques alone, starting from today's bank balance */
    const W = o.weeks || 12, wk = Array.from({ length: W + 1 }, (_, i) => ({ i, from: addD(T, i === 0 ? 0 : (i - 1) * 7 + 1), in: 0, out: 0 }));
    const widx = c => { const d = dd(c); return d <= 0 ? 0 : Math.min(W, Math.floor((d - 1) / 7) + 1); };
    inO.forEach(c => { if (dd(c) <= (W * 7)) wk[widx(c)].in += c.amount; });
    outO.forEach(c => { if (dd(c) <= (W * 7)) wk[widx(c)].out += c.amount; });
    let run = o.bankTotal || 0, low = { v: run, i: 0 }, firstNeg = -1;
    wk.forEach(w => { w.open = run; run += w.in - w.out; w.close = run; if (run < low.v) low = { v: run, i: w.i }; if (run < 0 && firstNeg < 0) firstNeg = w.i; });
    A.weeks = wk; A.low = low; A.firstNeg = firstNeg;

    /* funding cover of issued cheques per bank account */
    const accs = o.banks || [];
    A.funding = accs.map(a => {
      const mine = outO.filter(c => c.bankAcc === a.code), d3 = sum(mine.filter(c => dd(c) <= 3), c => c.amount), d7 = sum(mine.filter(c => dd(c) <= 7), c => c.amount), d30 = sum(mine.filter(c => dd(c) <= 30), c => c.amount);
      return { code: a.code, name: a.name, bal: a.bal, n: mine.length, total: sum(mine, c => c.amount), d3, d7, d30, gap7: a.bal - d7, gap30: a.bal - d30 };
    }).filter(x => x.n || x.bal);

    /* concentration of cheques in hand */
    const grp = (L, key, name) => { const m = {}; L.forEach(c => { const k = key(c); (m[k] = m[k] || { k, name: name(c), n: 0, v: 0 }); m[k].n++; m[k].v += c.amount; }); return Object.values(m).sort((a, b) => b.v - a.v).map(x => Object.assign(x, { pct: A.inOpen.v ? x.v / A.inOpen.v * 100 : 0 })); };
    A.byBank = grp(inO, c => norm(c.bank) || '?', c => (c.bank || '?'));
    A.byParty = grp(inO, c => c.partyId, c => o.pn(c.partyId));

    /* customer scorecards from the full history */
    const sc = {};
    rows.filter(c => c.dir === 'in').forEach(c => {
      const s = sc[c.partyId] || (sc[c.partyId] = { id: c.partyId, name: o.pn(c.partyId), n: 0, v: 0, cl: 0, clV: 0, bn: 0, bnV: 0, open: 0, openV: 0, ten: [], late: [], pp: 0 });
      if (c.status === 'Bounced') { s.bn++; s.bnV += c.amount; s.n++; s.v += c.amount; }
      else if (c.status === 'Cleared' || c.status === 'Endorsed') { s.cl++; s.clV += c.amount; s.n++; s.v += c.amount; }
      else if (c.status === 'Pending') { s.open++; s.openV += c.amount; s.n++; s.v += c.amount; }
      if (c.status !== 'Cancelled') { s.ten.push(Math.max(0, dayN(c.recvDate || c.date, c.date))); s.pp += c.postponed || 0; }
      if (c.status === 'Cleared' && c.clearDate) s.late.push(dayN(c.date, c.clearDate));
    });
    A.score = Object.values(sc).map(s => {
      const res = s.cl + s.bn, rate = res ? s.bn / res * 100 : 0, rateV = (s.clV + s.bnV) ? s.bnV / (s.clV + s.bnV) * 100 : 0;
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      const risk = s.bn >= 2 || rateV >= 20 ? 'High' : (s.bn >= 1 || s.pp >= 2) ? 'Watch' : res ? 'Good' : 'New';
      return Object.assign(s, { rate, rateV, tenor: avg(s.ten), delay: avg(s.late), risk });
    }).sort((a, b) => b.openV - a.openV || b.v - a.v);

    /* dishonour statistics + monthly trend (last 6 months) */
    const resolved = rows.filter(c => c.dir === 'in' && (c.status === 'Cleared' || c.status === 'Bounced' || c.status === 'Endorsed'));
    const bn = resolved.filter(c => c.status === 'Bounced');
    A.dish = { n: bn.length, v: sum(bn, c => c.amount), rateN: resolved.length ? bn.length / resolved.length * 100 : 0, rateV: sum(resolved, c => c.amount) ? sum(bn, c => c.amount) / sum(resolved, c => c.amount) * 100 : 0, fees: sum(bn, c => c.bounceFee || 0) };
    const ym = T.slice(0, 7), months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(Date.parse(ym + '-01T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    A.trend = months.map(m => ({
      m,
      recv: sum(rows.filter(c => c.dir === 'in' && c.status !== 'Cancelled' && recvOn(c).slice(0, 7) === m), c => c.amount),
      clr: sum(rows.filter(c => c.dir === 'in' && c.status === 'Cleared' && (c.clearDate || '').slice(0, 7) === m), c => c.amount),
      bnc: sum(rows.filter(c => c.dir === 'in' && c.status === 'Bounced' && (c.bounceDate || '').slice(0, 7) === m), c => c.amount),
      iss: sum(rows.filter(c => c.dir === 'out' && c.status !== 'Cancelled' && recvOn(c).slice(0, 7) === m), c => c.amount)
    }));

    /* behaviour numbers */
    const ten = rows.filter(c => c.status !== 'Cancelled').map(c => Math.max(0, dayN(c.recvDate || c.date, c.date)));
    A.avgTenor = ten.length ? ten.reduce((x, y) => x + y, 0) / ten.length : 0;
    A.postponed = rows.filter(c => c.postponed).length;
    A.advIn = sum(rows.filter(c => c.dir === 'in'), advLeft);
    A.advOut = sum(rows.filter(c => c.dir === 'out'), advLeft);

    /* alerts */
    const AL = [], al = (sev, t, ids) => AL.push({ sev, t, ids: ids || [] });
    const dueDep = inO.filter(c => dd(c) <= 0 && !c.deposit);
    if (dueDep.length) al('high', dueDep.length + ' cheque(s) in hand are due — deposit them: ' + o.m(sum(dueDep, c => c.amount)), dueDep.map(c => c.id));
    const slow = inO.filter(c => c.deposit && dayN(c.deposit.date, T) > 5);
    if (slow.length) al('high', slow.length + ' deposited cheque(s) not cleared after 5+ days — check with the bank: ' + o.m(sum(slow, c => c.amount)), slow.map(c => c.id));
    const dueOut = outO.filter(c => dd(c) <= 0);
    if (dueOut.length) al('high', dueOut.length + ' issued cheque(s) are due or overdue for clearing: ' + o.m(sum(dueOut, c => c.amount)), dueOut.map(c => c.id));
    A.funding.forEach(f => { if (f.d3 > 0 && f.d3 > f.bal) al('high', f.name + ': cheques of ' + o.m(f.d3) + ' fall due within 3 days but the balance is ' + o.m(f.bal) + ' — fund this account', []); else if (f.d7 > 0 && f.d7 > f.bal) al('med', f.name + ': ' + o.m(f.d7) + ' falls due within 7 days against a balance of ' + o.m(f.bal), []); });
    const stale = open.filter(c => dd(c) < -150);
    if (stale.length) al('med', stale.length + ' cheque(s) are dated more than 5 months ago — cheques go stale after 6 months', stale.map(c => c.id));
    const seen = {}, dup = [];
    rows.filter(c => !VOID.includes(c.status)).forEach(c => { const k = c.dir + '|' + norm(c.chqNo) + '|' + norm(c.bank); if (seen[k]) dup.push(c.id); seen[k] = 1; });
    if (dup.length) al('high', dup.length + ' possible duplicate cheque number(s) recorded', dup);
    const risky = A.score.filter(s => s.risk === 'High' && s.openV > 0);
    if (risky.length) al('high', 'Cheques in hand from high-risk drawers: ' + risky.map(s => s.name + ' (' + o.m(s.openV) + ')').join(', '), []);
    const topP = A.byParty[0];
    if (topP && A.inOpen.n >= 3 && topP.pct > 40) al('med', 'Concentration: ' + topP.name + ' holds ' + topP.pct.toFixed(0) + '% of all cheques in hand', []);
    const oldAdv = rows.filter(c => advLeft(c) > 0 && dayN(recvOn(c), T) > 30);
    if (oldAdv.length) al('med', oldAdv.length + ' advance(s) unapplied for over 30 days: ' + o.m(sum(oldAdv, advLeft)), oldAdv.map(c => c.id));
    const mp = rows.filter(c => (c.postponed || 0) >= 2 && c.status === 'Pending');
    if (mp.length) al('med', mp.length + ' cheque(s) postponed twice or more', mp.map(c => c.id));
    if (A.firstNeg >= 0 && (o.bankTotal || 0) >= 0) al('high', 'Cheques alone push the bank balance below zero ' + (A.firstNeg ? 'in week ' + A.firstNeg : 'now') + ' — lowest point ' + o.m(A.low.v), []);
    A.alerts = AL;
    return A;
  };

  const ctx = () => {
    const banks = E.rows('coa').filter(a => a.bank).map(a => ({ code: a.code, name: a.name, bal: E.bal(a.code) }));
    return { today: E.today(), banks, bankTotal: sum(banks, b => b.bal), pn, m: E.m, weeks: 12 };
  };
  const analyse = () => E.chqAnalyse(cq(), ctx());

  /* ══════════════════ SCREEN ══════════════════ */
  const TABS = [['dash', '📊 Analytics'], ['reg', '📋 Register'], ['sch', '🗓 Schedule'], ['adv', '💼 Advances'], ['risk', '🛡 Party scorecards']];
  const bar = (v, max, col) => `<div style="background:var(--s2);border-radius:6px;height:9px;min-width:90px"><div style="height:9px;border-radius:6px;background:${col || 'var(--ac)'};width:${max ? Math.max(1, Math.min(100, v / max * 100)) : 0}%"></div></div>`;
  const stTag = c => { const x = c.status === 'Pending' && c.deposit ? 'Deposited' : c.status === 'Pending' ? (c.dir === 'in' ? 'In hand' : 'Issued') : c.status; const cl = c.status === 'Bounced' ? 'bad' : c.status === 'Cleared' ? 'ok' : ''; return `<span class="tag ${cl}">${x}</span>`; };
  const dueTag = c => { if (c.status !== 'Pending') return ''; const d = dayN(E.today(), c.date); return d < 0 ? ` <span class="bad">${-d}d overdue</span>` : d === 0 ? ' <span class="bad">today</span>' : d <= 7 ? ` <span class="muted">in ${d}d</span>` : ''; };

  const dash = () => {
    const A = analyse(), mx = Math.max(1, ...A.inOpen.buckets.map(b => b.v), ...A.outOpen.buckets.map(b => b.v));
    const wmx = Math.max(1, ...A.weeks.map(w => Math.max(w.in, w.out)));
    const tmx = Math.max(1, ...A.trend.map(t => Math.max(t.recv, t.clr, t.bnc, t.iss)));
    const sev = { high: '🔴', med: '🟠' };
    return `<div class="kp">
      ${E.kpi('Cheques in hand', E.m(A.inOpen.v), A.inOpen.n + ' cheques · avg ' + A.inOpen.wtd.toFixed(0) + ' days to maturity')}
      ${E.kpi('Cheques issued, pending', E.m(A.outOpen.v), A.outOpen.n + ' cheques · avg ' + A.outOpen.wtd.toFixed(0) + ' days')}
      ${E.kpi('Net cheque position', `<span class="${A.net < 0 ? 'bad' : 'ok'}">${E.m(A.net)}</span>`, 'In hand − issued')}
      ${E.kpi('Due within 7 days', E.m(A.due7.inV - A.due7.outV), 'In ' + E.m(A.due7.inV) + ' · Out ' + E.m(A.due7.outV))}
      ${E.kpi('Dishonour rate', A.dish.rateV.toFixed(1) + '%', A.dish.n + ' bounced · ' + E.m(A.dish.v))}
      ${E.kpi('Advances on account', E.m(A.advIn), 'Customers · Paid to suppliers ' + E.m(A.advOut))}
    </div>
    <div class="card"><h3>Alerts &amp; controls</h3>${A.alerts.length ? A.alerts.map(a => `<p style="margin:5px 0">${sev[a.sev] || '•'} ${E.esc(a.t)}</p>`).join('') : '<p class="ok">✅ Nothing needs attention.</p>'}</div>
    <div class="g2" style="align-items:start">
      <div class="card"><h3>Maturity ladder — cheques in hand</h3>${ladder(A.inOpen.buckets, mx, 'var(--g)')}</div>
      <div class="card"><h3>Maturity ladder — cheques issued</h3>${ladder(A.outOpen.buckets, mx, 'var(--r2)')}</div>
    </div>
    <div class="card"><h3>12-week cash calendar from cheques</h3><div class="tw"><table><thead><tr><th>Week</th><th class="r">Cheques in</th><th class="r">Cheques out</th><th class="r">Net</th><th class="r">Projected bank</th><th style="width:140px"></th></tr></thead><tbody>
      ${A.weeks.map(w => `<tr><td>${w.i === 0 ? '<b>Due / overdue now</b>' : 'Wk ' + w.i + ' <span class="muted">' + w.from.slice(5) + '</span>'}</td><td class="r ok">${w.in ? E.m(w.in) : '-'}</td><td class="r bad">${w.out ? E.m(w.out) : '-'}</td><td class="r">${E.m(w.in - w.out)}</td><td class="r ${w.close < 0 ? 'bad' : ''}"><b>${E.m(w.close)}</b></td><td>${bar(Math.max(w.in, w.out), wmx, w.in >= w.out ? 'var(--g)' : 'var(--r2)')}</td></tr>`).join('')}
    </tbody></table></div><p class="muted">Starts from today's bank + cash balance (${E.m(ctx().bankTotal)}) and counts only cheques — see Cash Forecast for invoices and bills as well. Lowest point: <b class="${A.low.v < 0 ? 'bad' : ''}">${E.m(A.low.v)}</b>${A.low.i ? ' in week ' + A.low.i : ' now'}.</p></div>
    <div class="card"><h3>Funding cover of issued cheques</h3><div class="tw"><table><thead><tr><th>Bank account</th><th class="r">Balance</th><th class="r">Pending cheques</th><th class="r">Due ≤ 3 days</th><th class="r">Due ≤ 7 days</th><th class="r">Cover after 7 days</th><th class="r">Due ≤ 30 days</th><th class="r">Cover after 30 days</th></tr></thead><tbody>
      ${A.funding.map(f => `<tr><td><b>${E.esc(f.name)}</b></td><td class="r">${E.m(f.bal)}</td><td class="r">${E.m(f.total)} <span class="muted">(${f.n})</span></td><td class="r">${f.d3 ? E.m(f.d3) : '-'}</td><td class="r">${f.d7 ? E.m(f.d7) : '-'}</td><td class="r ${f.gap7 < 0 ? 'bad' : 'ok'}">${E.m(f.gap7)}</td><td class="r">${f.d30 ? E.m(f.d30) : '-'}</td><td class="r ${f.gap30 < 0 ? 'bad' : 'ok'}">${E.m(f.gap30)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No bank accounts</td></tr>'}
    </tbody></table></div><p class="muted">Cover = balance minus issued cheques falling due in that window (customer cheques that may clear meanwhile are not counted — a cautious view).</p></div>
    <div class="g2" style="align-items:start">
      <div class="card"><h3>Cheques in hand by drawer</h3>${conc(A.byParty)}</div>
      <div class="card"><h3>Cheques in hand by bank</h3>${conc(A.byBank)}</div>
    </div>
    <div class="card"><h3>Last 6 months</h3><div class="tw"><table><thead><tr><th>Month</th><th class="r">Received</th><th class="r">Cleared</th><th class="r">Bounced</th><th class="r">Issued</th><th style="width:140px"></th></tr></thead><tbody>
      ${A.trend.map(t => `<tr><td>${t.m}</td><td class="r">${t.recv ? E.m(t.recv) : '-'}</td><td class="r ok">${t.clr ? E.m(t.clr) : '-'}</td><td class="r bad">${t.bnc ? E.m(t.bnc) : '-'}</td><td class="r">${t.iss ? E.m(t.iss) : '-'}</td><td>${bar(t.recv, tmx)}</td></tr>`).join('')}
    </tbody></table></div><p class="muted">Average post-dating period ${A.avgTenor.toFixed(0)} days (received date to cheque date) · ${A.postponed} cheque(s) postponed · bounce charges paid ${E.m(A.dish.fees)}.</p></div>`;
  };
  const ladder = (B, mx, col) => `<table><tbody>${B.map(b => `<tr><td style="width:110px">${b.l}</td><td>${bar(b.v, mx, col)}</td><td class="r" style="width:150px">${b.n ? E.m(b.v) + ' <span class="muted">(' + b.n + ')</span>' : '-'}</td></tr>`).join('')}</tbody></table>`;
  const conc = L => L.length ? `<table><tbody>${L.slice(0, 8).map(x => `<tr><td>${E.esc(x.name)}</td><td style="width:34%">${bar(x.pct, 100, x.pct > 40 ? 'var(--r2)' : 'var(--ac)')}</td><td class="r">${E.m(x.v)} <span class="muted">${x.pct.toFixed(0)}%</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No cheques in hand</p>';

  /* ── register ── */
  const filtered = () => {
    const s = F.q.toLowerCase();
    return cq().filter(c => (!F.dir || c.dir === F.dir) &&
      (F.st === '' || (F.st === 'open' ? c.status === 'Pending' : F.st === 'deposited' ? c.status === 'Pending' && c.deposit : F.st === 'due' ? c.status === 'Pending' && c.date <= E.today() : c.status === F.st)) &&
      (!F.from || c.date >= F.from) && (!F.to || c.date <= F.to) &&
      (!s || [c.no, c.chqNo, pn(c.partyId), c.bank].join(' ').toLowerCase().includes(s))).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
  };
  const acts = c => {
    const b = (a, l, cls) => `<button class="btn sm ${cls || ''}" data-a="${a}" data-id="${c.id}">${l}</button> `;
    let h = '';
    if (c.status === 'Pending') {
      if (c.dir === 'in') { if (!c.deposit) h += b('cdDep', 'Deposit', 'p'); h += b('cdClr', 'Clear', c.deposit ? 'p' : ''); if (!c.deposit) h += b('cdEnd', 'Endorse'); h += b('cdPost', 'Postpone') + (canRev() ? b('cdBnc', 'Bounced', 'd') : ''); }
      else { h += b('cdClr', 'Clear', 'p') + b('cdPost', 'Postpone') + (canRev() ? b('cdCan', 'Cancel', 'd') : ''); }
    } else if ((c.status === 'Cleared' || c.status === 'Endorsed') && c.dir === 'in' && canRev()) h += b('cdBnc', 'Returned', 'd');
    if (advLeft(c) > 0) h += b('cdApp', 'Apply advance');
    return h + b('cdLog', 'History');
  };
  const regBody = () => {
    const L = filtered();
    return `<div class="tw"><table><thead><tr><th>Ref</th><th>Type</th><th>Cheque no</th><th>Party</th><th>Bank</th><th>Received</th><th>Cheque date</th><th class="r">Amount</th><th class="r">Advance</th><th>Status</th><th></th></tr></thead><tbody>${L.map(c => `<tr style="${c.status === 'Pending' ? '' : 'opacity:.62'}"><td>${E.esc(c.no)}</td><td>${c.dir === 'in' ? 'Received' : 'Issued'}</td><td>${E.esc(c.chqNo)}</td><td>${E.esc(pn(c.partyId))}</td><td>${E.esc(c.bank)}</td><td>${recvOn(c)}</td><td>${c.date}${c.postponed ? ' <span class="muted" title="Originally ' + c.origDate + '">↻' + c.postponed + '</span>' : ''}${dueTag(c)}</td><td class="r">${E.m(c.amount)}</td><td class="r">${advLeft(c) ? '<b>' + E.m(advLeft(c)) + '</b>' : ''}</td><td>${stTag(c)}</td><td class="r" style="white-space:normal;min-width:230px">${acts(c)}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">No cheques match</td></tr>'}</tbody></table></div><p class="muted">${L.length} cheque(s) · ${E.m(sum(L, c => c.amount))}</p>`;
  };
  const reg = () => `<div class="bar"><input class="fs" style="max-width:230px" placeholder="Search cheque no, party, bank" data-f="cd.q" value="${E.esc(F.q)}"><select class="fs" data-f="cd.dir"><option value="">Received &amp; issued</option><option value="in" ${F.dir === 'in' ? 'selected' : ''}>Received</option><option value="out" ${F.dir === 'out' ? 'selected' : ''}>Issued</option></select><select class="fs" data-f="cd.st">${[['open', 'Open (not cleared)'], ['due', 'Due / overdue'], ['deposited', 'Deposited, awaiting clearing'], ['Cleared', 'Cleared'], ['Bounced', 'Bounced'], ['Endorsed', 'Endorsed to supplier'], ['Cancelled', 'Cancelled'], ['', 'All']].map(x => `<option value="${x[0]}" ${F.st === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select><label class="muted">Cheque date <input class="fs" type="date" data-f="cd.from" value="${F.from}"> to <input class="fs" type="date" data-f="cd.to" value="${F.to}"></label><span class="gap"></span><button class="btn" data-a="cdCsv">⬇ Export CSV</button></div><div id="cdt">${regBody()}</div>`;

  /* ── schedule: what to deposit / what will be presented, by date ── */
  const sch = () => {
    const T = E.today(), L = cq().filter(c => c.status === 'Pending' && dayN(T, c.date) <= 30).sort((a, b) => a.date.localeCompare(b.date)), by = {};
    L.forEach(c => { const k = c.date < T ? 'Overdue' : c.date; (by[k] = by[k] || []).push(c); });
    const keys = Object.keys(by).sort((a, b) => a === 'Overdue' ? -1 : b === 'Overdue' ? 1 : a.localeCompare(b));
    return `<p class="muted" style="margin-bottom:10px">Everything falling due in the next 30 days, day by day: customer cheques to deposit and our cheques the bank will present.</p>` + (keys.map(k => {
      const g = by[k], i = sum(g.filter(c => c.dir === 'in'), c => c.amount), o = sum(g.filter(c => c.dir === 'out'), c => c.amount);
      return `<div class="card"><h3>${k === 'Overdue' ? '⚠️ Overdue' : k + ' · ' + new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) + (k === T ? ' · today' : '')} <span class="muted" style="font-weight:400">In ${E.m(i)} · Out ${E.m(o)} · Net ${E.m(i - o)}</span></h3><div class="tw"><table><tbody>${g.map(c => `<tr><td>${c.dir === 'in' ? '⬇ Receive' : '⬆ Pay'}</td><td>${E.esc(c.chqNo)}</td><td>${E.esc(pn(c.partyId))}</td><td>${E.esc(c.bank)}</td><td class="r">${E.m(c.amount)}</td><td>${stTag(c)}</td><td class="r" style="white-space:normal">${acts(c)}</td></tr>`).join('')}</tbody></table></div></div>`;
    }).join('') || '<div class="card"><p class="ok">Nothing falls due in the next 30 days.</p></div>');
  };

  /* ── advances ── */
  const advTab = () => {
    const L = cq().filter(c => advLeft(c) > 0).sort((a, b) => recvOn(a).localeCompare(recvOn(b))), T = E.today();
    const led = c => E.acct(c) ? E.bal(c) : 0;
    const blk = (dir, tt, ac) => { const R = L.filter(c => c.dir === dir), tot = sum(R, advLeft); return `<div class="card"><h3>${tt} <span class="muted" style="font-weight:400">cheques ${E.m(tot)} · ledger ${ac} ${E.m(led(ac))} ${tot === led(ac) ? '<span class="ok">✓ agrees</span>' : '<span class="bad">differs</span>'}</span></h3><div class="tw"><table><thead><tr><th>${dir === 'in' ? 'Customer' : 'Supplier'}</th><th>Cheque</th><th>Received</th><th>Cheque date</th><th>Status</th><th class="r">Age</th><th class="r">Advance left</th><th></th></tr></thead><tbody>${R.map(c => `<tr><td>${E.esc(pn(c.partyId))}</td><td>${E.esc(c.chqNo)} <span class="muted">${E.esc(c.bank)}</span></td><td>${recvOn(c)}</td><td>${c.date}</td><td>${stTag(c)}</td><td class="r">${dayN(recvOn(c), T)}d</td><td class="r"><b>${E.m(advLeft(c))}</b></td><td class="r"><button class="btn sm p" data-a="cdApp" data-id="${c.id}">Apply to ${dir === 'in' ? 'invoices' : 'bills'}</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">None</td></tr>'}</tbody></table></div></div>`; };
    return `<p class="muted" style="margin-bottom:10px">An <b>advance cheque</b> is a cheque taken (or given) before there is an invoice (or bill) to match it. The unmatched part is held on account here and applied when the invoice or bill arrives.</p>` + blk('in', 'Customer advances (we owe goods)', '2400') + blk('out', 'Supplier advances (they owe us goods)', '1260');
  };

  /* ── scorecards ── */
  const riskTab = () => {
    const A = analyse(), cl = { High: 'bad', Watch: '', Good: 'ok', New: 'muted' };
    return `<div class="card"><h3>Customer cheque scorecard</h3><div class="tw"><table><thead><tr><th>Customer</th><th class="r">Cheques</th><th class="r">Cleared</th><th class="r">Bounced</th><th class="r">Bounce rate (value)</th><th class="r">In hand</th><th class="r">Avg post-dating</th><th class="r">Avg days to clear after date</th><th class="r">Postponed</th><th>Risk</th></tr></thead><tbody>${A.score.map(s => `<tr><td><b>${E.esc(s.name)}</b></td><td class="r">${s.n}</td><td class="r">${s.cl}</td><td class="r ${s.bn ? 'bad' : ''}">${s.bn}</td><td class="r">${s.rateV.toFixed(1)}%</td><td class="r">${s.openV ? E.m(s.openV) : '-'}</td><td class="r">${s.tenor.toFixed(0)}d</td><td class="r">${s.late.length ? s.delay.toFixed(1) + 'd' : '-'}</td><td class="r">${s.pp}</td><td><span class="tag ${cl[s.risk]}">${s.risk}</span></td></tr>`).join('') || '<tr><td colspan="10" class="muted">No cheques received yet</td></tr>'}</tbody></table></div><p class="muted"><b>High</b>: two or more bounced cheques, or 20%+ of cheque value returned. <b>Watch</b>: one bounce or repeated postponements. <b>Good</b>: cleared history with no bounce. <b>New</b>: nothing cleared yet.</p></div>`;
  };

  E.route('chqdesk', 'Cheque Desk', () => {
    const A = analyse();
    return `<div class="bar">${TABS.map(t => `<button class="btn ${F.tab === t[0] ? 'p' : ''}" data-a="cdTab" data-id="${t[0]}">${t[1]}${t[0] === 'dash' && A.alerts.some(a => a.sev === 'high') ? ' 🔴' : ''}</button>`).join('')}<span class="gap"></span><button class="btn" data-a="cdNew" data-id="out">+ Issue cheque</button><button class="btn p" data-a="cdNew" data-id="in">+ Receive cheque</button></div>${F.tab === 'dash' ? dash() : F.tab === 'reg' ? reg() : F.tab === 'sch' ? sch() : F.tab === 'adv' ? advTab() : riskTab()}`;
  });
  E.A.cdTab = t => { F.tab = t; E.go(); };
  E.hooks.push(e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f && f.startsWith('cd.')) { F[f.slice(3)] = e.target.value; const t = E.$('cdt'); if (t) t.innerHTML = regBody(); return; }
    if (e.target.id === 'cq_p' || e.target.id === 'cq_a') { if (e.target.id === 'cq_p') cqBills(); else cqFifo(); }
    if (e.target.id === 'ap_d') return;
    if (e.target.classList && (e.target.classList.contains('cqal') || e.target.id === 'cq_a' || e.target.id === 'cq_dt')) cqSum();
    if (e.target.classList && e.target.classList.contains('apal')) apSum();
  });
  E.A.cdCsv = () => {
    const L = filtered(), H = ['Ref', 'Direction', 'Cheque no', 'Party', 'Bank', 'Received', 'Cheque date', 'Amount', 'Advance left', 'Status', 'Deposit date', 'Clear date', 'Postponed', 'Bounce reason'];
    E.download('cheques-' + E.today() + '.csv', [H].concat(L.map(c => [c.no, c.dir === 'in' ? 'Received' : 'Issued', c.chqNo, pn(c.partyId), c.bank, recvOn(c), c.date, c.amount / 100, advLeft(c) / 100, c.status, c.deposit ? c.deposit.date : '', c.clearDate || '', c.postponed || 0, c.bounceReason || ''])).map(r => r.map(E.csvCell).join(',')).join('\n'), 'text/csv');
  };

  /* ══════════════════ POSTING HELPERS ══════════════════ */
  const ensure = async () => { if (!E.acct('2150') || !E.acct('2400') || !E.acct('1260') || !E.acct('6140')) await E.ensureCoa(); };
  const logIt = (c, ev, note) => { (c.log = c.log || []).push({ date: E.today(), at: new Date().toISOString(), ev, note: note || '', user: E.user }); };
  const upd = async (c, fn) => { const b = clone(c); fn(c); await E.save('cheques', c, b); };
  const docCol = dir => dir === 'in' ? 'invoices' : 'purchases';
  const docs = (dir, pid) => E.rows(docCol(dir)).filter(i => i.partyId === pid && !i.cancelled && i.total - i.paid > 0).sort((a, b) => a.date.localeCompare(b.date));
  const bump = async (col, id, a) => { const r = E.D[col].find(q => q.id === id); if (!r) return; const b = clone(r); r.paid = Math.max(0, r.paid + a); await E.save(col, r, b); };
  const rvJe = async id => { const j = E.D.journalEntries.find(x => x.id === id); if (j && !j.reversedBy) await E.reverse(id); };
  const bankOpts = (sel) => E.opts(a => a.bank && a.code !== '1000', sel);

  /* ── receive / issue form ── */
  const allocTable = (dir, pid, cls) => { const L = docs(dir, pid); return L.length ? `<div class="tw"><table><thead><tr><th>${dir === 'in' ? 'Invoice' : 'Bill'}</th><th>Date</th><th class="r">Balance</th><th class="r">Allocate (Rs)</th></tr></thead><tbody>${L.map(i => `<tr><td>${E.esc(i.no)}</td><td>${i.date}</td><td class="r">${E.m(i.total - i.paid)}</td><td><input class="${cls}" type="number" step="0.01" data-id="${i.id}" style="width:110px;padding:6px;border:1px solid var(--bd);border-radius:8px"></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">No unpaid ${dir === 'in' ? 'invoices' : 'bills'} — the full amount will be held as an advance.</p>`; };
  const fifoFill = (dir, cls, total) => { let left = total; document.querySelectorAll('.' + cls).forEach(i => { const x = E.D[docCol(dir)].find(q => q.id === i.dataset.id), a = x ? Math.min(left, x.total - x.paid) : 0; left -= a; i.value = a ? (a / 100).toFixed(2) : ''; }); };
  const dirOf = () => E.$('cq_p').dataset.d;
  function cqBills() { E.$('cq_b').innerHTML = allocTable(dirOf(), E.val('cq_p'), 'cqal'); cqFifo(); }
  function cqFifo() { fifoFill(dirOf(), 'cqal', E.c(E.val('cq_a'))); cqSum(); }
  function cqSum() {
    const amt = E.c(E.val('cq_a')), al = sum([...document.querySelectorAll('.cqal')], i => E.c(i.value)), adv = amt - al, d = dirOf(), T = E.today(), dt = E.val('cq_dt'), e = E.$('cq_s'), w = [];
    if (dt && dt < addD(T, -180)) w.push('⚠️ This cheque date is over 6 months old — the cheque may be stale.');
    if (dt && dt > addD(T, 365)) w.push('⚠️ This cheque date is more than a year ahead.');
    if (d === 'in') { const s = analyse().score.find(x => x.id === E.val('cq_p')); if (s && s.bn) w.push('⚠️ This customer has ' + s.bn + ' bounced cheque(s) on record (risk: ' + s.risk + ').'); }
    if (e) e.innerHTML = `<span>Matched to ${d === 'in' ? 'invoices' : 'bills'} ${E.m(al)} · <b class="${adv < 0 ? 'bad' : ''}">${adv < 0 ? 'Over-allocated by ' + E.m(-adv) : 'Advance held on account ' + E.m(adv)}</b></span><span class="bad" style="font-weight:400">${w.join('<br>')}</span>`;
  }
  E.A.cdNew = dir => {
    const ps = E.rows('parties').filter(p => p.active !== false && (dir === 'in' ? p.type !== 'Supplier' : p.type !== 'Customer')).sort((a, b) => a.name.localeCompare(b.name));
    if (!ps.length) return E.toast(dir === 'in' ? 'Add a customer first' : 'Add a supplier first', 'error');
    const seen = [...new Set(cq().filter(c => c.dir === 'in').map(c => c.bank).filter(Boolean).concat(BANKS))];
    E.modal(dir === 'in' ? 'Receive cheque from customer' : 'Issue cheque to supplier',
      `<div class="g2"><div class="f">${dir === 'in' ? 'Customer' : 'Supplier'} *<select id="cq_p" data-d="${dir}">${ps.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div>
      <div class="f">Cheque number *<input id="cq_n"></div>
      ${dir === 'in' ? `<div class="f">Drawn on (bank) *<input id="cq_k" list="cq_bl" placeholder="e.g. HNB"><datalist id="cq_bl">${seen.map(b => `<option value="${E.esc(b)}">`).join('')}</datalist></div>` : `<div class="f">Issued from bank account *<select id="cq_k"><option value="">— select —</option>${bankOpts()}</select></div>`}
      <div class="f">${dir === 'in' ? 'Received on' : 'Issued on'}<input id="cq_r" type="date" value="${E.today()}"></div>
      <div class="f">Cheque date (post-dated if in the future) *<input id="cq_dt" type="date" value="${E.today()}"></div>
      <div class="f">Amount (Rs) *<input id="cq_a" type="number" step="0.01"></div></div>
      <div class="f">Note<input id="cq_note" placeholder="Optional"></div>
      <div id="cq_b"></div><div class="tot" id="cq_s"></div>
      <p class="muted">${dir === 'in' ? 'Posts Dr Post-Dated Cheques Received / Cr Receivables (matched part) and Cr Customer Advances (unmatched part). Money reaches the bank when you deposit and clear the cheque.' : 'Posts Dr Payables (matched part) and Dr Supplier Advances (unmatched part) / Cr Post-Dated Cheques Issued. The bank is reduced when the cheque clears.'}</p>`,
      `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdSave" data-id="${dir}">Save cheque</button>`, 1);
    cqBills();
  };
  E.A.cdSave = async dir => {
    try {
      await ensure();
      const amt = E.c(E.val('cq_a')), pid = E.val('cq_p'), cn = E.val('cq_n'), k = E.val('cq_k'), rd = E.val('cq_r') || E.today(), dt = E.val('cq_dt'), T = E.today();
      if (amt <= 0 || !cn || !k || !dt) throw new Error('Fill cheque number, bank, cheque date and amount');
      const bank = dir === 'in' ? k : (E.acct(k) ? E.acct(k).name : k);
      if (cq().some(c => c.dir === dir && norm(c.chqNo) === norm(cn) && norm(c.bank) === norm(bank) && !VOID.includes(c.status))) throw new Error('Cheque ' + cn + ' on ' + bank + ' is already recorded');
      const al = [...document.querySelectorAll('.cqal')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0), alT = sum(al, x => x.a);
      if (alT > amt) throw new Error('Allocated amounts are more than the cheque amount');
      for (const x of al) { const d = E.D[docCol(dir)].find(q => q.id === x.id); if (!d || d.cancelled) throw new Error('A selected ' + (dir === 'in' ? 'invoice' : 'bill') + ' is not available'); if (x.a > d.total - d.paid) throw new Error(d.no + ': allocation is more than its balance'); }
      if (dt < addD(T, -180) && !confirm('The cheque date is more than 6 months old, so the bank may refuse it. Continue?')) return;
      if (dt > addD(T, 365) && !confirm('The cheque date is more than a year ahead. Continue?')) return;
      if (dir === 'in') { const s = analyse().score.find(x => x.id === pid); if (s && s.bn && !confirm(pn(pid) + ' has ' + s.bn + ' bounced cheque(s) on record. Accept this cheque anyway?')) return; }
      const adv = amt - alT, no = await E.next('CHQ'), n = (dir === 'in' ? 'Cheque received ' : 'Cheque issued ') + cn + ' · ' + pn(pid) + (adv ? ' (advance ' + E.m(adv) + ')' : '');
      const lines = dir === 'in' ? [{ acc: '1110', dr: amt }, alT ? { acc: '1200', cr: alT } : null, adv ? { acc: '2400', cr: adv } : null] : [alT ? { acc: '2000', dr: alT } : null, adv ? { acc: '1260', dr: adv } : null, { acc: '2150', cr: amt }];
      const je = await E.post({ date: rd, ref: no, narr: n, source: 'cheque', lines: lines.filter(Boolean) });
      for (const x of al) await bump(docCol(dir), x.id, x.a);
      const c = { no, dir, chqNo: cn, bank, bankAcc: dir === 'out' ? k : '', partyId: pid, date: dt, origDate: dt, recvDate: rd, amount: amt, allocs: al, applied: [], status: 'Pending', jeId: je.id, note: E.val('cq_note'), postponed: 0 };
      logIt(c, dir === 'in' ? 'Received' : 'Issued', adv ? 'Advance ' + E.m(adv) : '');
      await E.save('cheques', c);
      E.closeM(); E.go(); E.toast(no + ' saved' + (adv ? ' — advance ' + E.m(adv) + ' held on account' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── deposit ── */
  E.A.cdDep = id => {
    const c = E.D.cheques.find(x => x.id === id);
    E.modal('Deposit cheque ' + c.chqNo, `<div class="g2"><div class="f">Deposit into *<select id="dp_a"><option value="">— select bank account —</option>${bankOpts()}</select></div><div class="f">Deposit date<input id="dp_d" type="date" value="${E.today()}"></div></div><p>${E.esc(pn(c.partyId))} · ${E.esc(c.bank)} · <b>${E.m(c.amount)}</b></p><p class="muted">No accounting entry yet: the cheque stays in "Post-Dated Cheques Received" until the bank clears it.</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdDepSave" data-id="${id}">Mark deposited</button>`);
  };
  E.A.cdDepSave = async id => {
    try { const c = E.D.cheques.find(x => x.id === id), a = E.val('dp_a'); if (!a) throw new Error('Select the bank account'); const d = E.val('dp_d') || E.today();
      await upd(c, x => { x.deposit = { acc: a, date: d }; logIt(x, 'Deposited', (E.acct(a) || {}).name); }); E.closeM(); E.go(); E.toast('Marked deposited', 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── clear ── */
  E.A.cdClr = id => {
    const c = E.D.cheques.find(x => x.id === id);
    E.modal('Clear cheque ' + c.chqNo, `<div class="g2"><div class="f">Clearing date<input id="cl_d" type="date" value="${E.today()}"></div>${c.dir === 'in' ? `<div class="f">Credited to *<select id="cl_s"><option value="">— select bank account —</option>${bankOpts(c.deposit ? c.deposit.acc : '')}</select></div>` : `<p class="muted">Paid from ${E.esc(c.bank)}</p>`}</div><p>${E.esc(pn(c.partyId))} · <b>${E.m(c.amount)}</b></p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdClrSave" data-id="${id}">Mark cleared</button>`);
  };
  E.A.cdClrSave = async id => {
    try { const c = E.D.cheques.find(x => x.id === id), s = c.dir === 'in' ? E.val('cl_s') : c.bankAcc, d = E.val('cl_d') || E.today(); if (!s) throw new Error('Select the bank account');
      if (c.status !== 'Pending') throw new Error('This cheque is not pending');
      const no = await E.next('CLR'), je = await E.post({ date: d, ref: no, narr: 'Cheque ' + c.chqNo + ' cleared · ' + pn(c.partyId), source: 'cheque', lines: c.dir === 'in' ? [{ acc: s, dr: c.amount }, { acc: '1110', cr: c.amount }] : [{ acc: '2150', dr: c.amount }, { acc: s, cr: c.amount }] });
      await upd(c, x => { Object.assign(x, { status: 'Cleared', clearDate: d, clearJe: je.id, clearAcc: s }); logIt(x, 'Cleared', (E.acct(s) || {}).name); }); E.closeM(); E.go(); E.toast('Cheque cleared', 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── postpone ── */
  E.A.cdPost = id => {
    const c = E.D.cheques.find(x => x.id === id);
    E.modal('Postpone cheque ' + c.chqNo, `<p>${E.esc(pn(c.partyId))} · ${E.m(c.amount)} · now dated <b>${c.date}</b>${c.postponed ? ' (postponed ' + c.postponed + '× already)' : ''}</p><div class="g2"><div class="f">New cheque date *<input id="po_d" type="date" value="${addD(c.date, 7)}"></div><div class="f">Reason<input id="po_r" placeholder="e.g. customer asked for 1 more week"></div></div><p class="muted">Use this when the ${c.dir === 'in' ? 'customer asks you to hold the cheque' : 'supplier agrees to present it later'}. The change is recorded and counted in the party scorecard.</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdPostSave" data-id="${id}">Postpone</button>`);
  };
  E.A.cdPostSave = async id => {
    try { const c = E.D.cheques.find(x => x.id === id), d = E.val('po_d'); if (!d) throw new Error('Choose the new date'); if (d <= c.date) throw new Error('The new date must be later than ' + c.date);
      await upd(c, x => { x.origDate = x.origDate || x.date; x.postponed = (x.postponed || 0) + 1; logIt(x, 'Postponed', x.date + ' → ' + d + (E.val('po_r') ? ' · ' + E.val('po_r') : '')); x.date = d; if (x.deposit) delete x.deposit; }); E.closeM(); E.go(); E.toast('Cheque postponed to ' + d, 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── unwind (shared by bounce and cancel): every posting of this cheque is reversed, invoices/bills reopened ── */
  async function unwind(c) {
    if (E.locked(E.today())) throw new Error('Period is locked up to ' + E.setting('lockedUntil') + ' — reversals are posted today');
    if (c.status === 'Cleared' && c.clearJe) await rvJe(c.clearJe);
    if (c.endorse && !c.endorse.reversed) { await rvJe(c.endorse.jeId); for (const x of c.endorse.allocs) await bump('purchases', x.id, -x.a); c.endorse.reversed = true; }
    for (const ap of (c.applied || [])) if (!ap.reversed) { await rvJe(ap.jeId); await bump(docCol(c.dir), ap.id, -ap.a); ap.reversed = true; }
    await rvJe(c.jeId); for (const x of (c.allocs || [])) await bump(docCol(c.dir), x.id, -x.a);
  }

  /* ── bounce / returned ── */
  E.A.cdBnc = id => {
    const c = E.D.cheques.find(x => x.id === id), acc = c.clearAcc || (c.deposit && c.deposit.acc) || '';
    E.modal('Cheque returned: ' + c.chqNo, `<p>${E.esc(pn(c.partyId))} · ${E.esc(c.bank)} · <b>${E.m(c.amount)}</b> · now <b>${c.deposit && c.status === 'Pending' ? 'Deposited' : c.status}</b></p><div class="g2"><div class="f">Returned on<input id="bn_d" type="date" value="${E.today()}"></div><div class="f">Reason<select id="bn_r">${['Insufficient funds', 'Payment stopped', 'Account closed', 'Signature differs', 'Stale / post-dated', 'Other'].map(r => `<option>${r}</option>`).join('')}</select></div><div class="f">Bank return charge (Rs)<input id="bn_f" type="number" step="0.01" placeholder="0.00"></div><div class="f">Charge paid from<select id="bn_a"><option value="">— none —</option>${bankOpts(acc)}</select></div></div><p class="muted">Posts the opposite entries, reopens the invoices${c.status === 'Endorsed' ? ' and the supplier bills it paid' : ''}, and records the return against the customer's scorecard. Any advance applied from this cheque is also taken back.</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn d" data-a="cdBncSave" data-id="${id}">Mark returned</button>`);
  };
  E.A.cdBncSave = async id => {
    try { if (!canRev()) throw new Error('Only an Owner or Accountant can mark a cheque returned'); await ensure();
      const c = E.D.cheques.find(x => x.id === id), d = E.val('bn_d') || E.today(), fee = E.c(E.val('bn_f')), fa = E.val('bn_a'), why = E.val('bn_r');
      if (VOID.includes(c.status)) throw new Error('Already ' + c.status.toLowerCase());
      if (fee > 0 && !fa) throw new Error('Choose the bank account the return charge was paid from');
      const b = clone(c); await unwind(c);
      if (fee > 0) await E.post({ date: d, ref: c.no, narr: 'Cheque return charge · ' + c.chqNo + ' · ' + pn(c.partyId), source: 'cheque', lines: [{ acc: '6140', dr: fee }, { acc: fa, cr: fee }] });
      Object.assign(c, { status: 'Bounced', bounceDate: d, bounceReason: why, bounceFee: fee }); delete c.deposit; logIt(c, 'Returned', why + (fee ? ' · charge ' + E.m(fee) : ''));
      await E.save('cheques', c, b); E.closeM(); E.go(); E.toast('Cheque marked returned — invoices reopened', 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.cdCan = async id => {
    try { if (!canRev()) throw new Error('Only an Owner or Accountant can cancel a cheque'); const c = E.D.cheques.find(x => x.id === id); if (c.status !== 'Pending') throw new Error('Only a pending cheque can be cancelled');
      if (!confirm('Cancel issued cheque ' + c.chqNo + '? The bills are reopened.')) return; const b = clone(c); await unwind(c); c.status = 'Cancelled'; logIt(c, 'Cancelled', ''); await E.save('cheques', c, b); E.go(); E.toast('Cheque cancelled', 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── endorse a customer cheque to a supplier ── */
  const enSum = () => { const c = E.D.cheques.find(x => x.id === E.$('en_p').dataset.id), al = sum([...document.querySelectorAll('.enal')], i => E.c(i.value)), e = E.$('en_s'); if (e) e.innerHTML = `Allocated ${E.m(al)} of ${E.m(c.amount)} · <b class="${al === c.amount ? 'ok' : 'bad'}">${al === c.amount ? 'Complete' : 'Must equal the cheque amount'}</b>`; };
  const enBills = () => { const c = E.D.cheques.find(x => x.id === E.$('en_p').dataset.id); E.$('en_b').innerHTML = allocTable('out', E.val('en_p'), 'enal'); fifoFill('out', 'enal', c.amount); enSum(); };
  E.hooks.push(e => { if (e.target.id === 'en_p') enBills(); if (e.target.classList && e.target.classList.contains('enal')) enSum(); });
  E.A.cdEnd = id => {
    const c = E.D.cheques.find(x => x.id === id), ps = E.rows('parties').filter(p => p.active !== false && p.type !== 'Customer' && docs('out', p.id).length);
    if (!ps.length) return E.toast('No supplier has unpaid bills to settle with this cheque', 'error');
    E.modal('Endorse cheque ' + c.chqNo + ' to a supplier', `<p>${E.esc(pn(c.partyId))} · ${E.esc(c.bank)} · dated ${c.date} · <b>${E.m(c.amount)}</b></p><div class="g2"><div class="f">Supplier *<select id="en_p" data-id="${id}">${ps.map(p => `<option value="${p.id}">${E.esc(p.name)}</option>`).join('')}</select></div><div class="f">Endorsed on<input id="en_d" type="date" value="${E.today()}"></div></div><div id="en_b"></div><div class="tot" id="en_s"></div><p class="muted">Pays the supplier's bills with this customer cheque (Dr Payables / Cr Post-Dated Cheques Received). If the supplier later returns it, mark the cheque "Returned" and everything reverses.</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdEndSave" data-id="${id}">Endorse</button>`, 1);
    enBills();
  };
  E.A.cdEndSave = async id => {
    try { const c = E.D.cheques.find(x => x.id === id), pid = E.val('en_p'), d = E.val('en_d') || E.today(), al = [...document.querySelectorAll('.enal')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0);
      if (c.status !== 'Pending' || c.deposit) throw new Error('Only a cheque still in hand can be endorsed'); if (sum(al, x => x.a) !== c.amount) throw new Error('Allocated bills must equal the cheque amount');
      for (const x of al) { const p = E.D.purchases.find(q => q.id === x.id); if (!p || p.cancelled || x.a > p.total - p.paid) throw new Error('A bill allocation is more than its balance'); }
      const no = await E.next('END'), je = await E.post({ date: d, ref: no, narr: 'Cheque ' + c.chqNo + ' endorsed to ' + pn(pid), source: 'cheque', lines: [{ acc: '2000', dr: c.amount }, { acc: '1110', cr: c.amount }] });
      for (const x of al) await bump('purchases', x.id, x.a);
      await upd(c, x => { x.status = 'Endorsed'; x.endorse = { partyId: pid, allocs: al, date: d, jeId: je.id }; logIt(x, 'Endorsed', pn(pid)); }); E.closeM(); E.go(); E.toast('Endorsed to ' + pn(pid), 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── apply an advance to invoices / bills ── */
  const apSum = () => { const c = E.D.cheques.find(x => x.id === E.$('ap_c').dataset.id), al = sum([...document.querySelectorAll('.apal')], i => E.c(i.value)), e = E.$('ap_s'); if (e) e.innerHTML = `Applying ${E.m(al)} of ${E.m(advLeft(c))} · <b class="${al > advLeft(c) ? 'bad' : ''}">${al > advLeft(c) ? 'More than the advance left' : 'Left on account ' + E.m(advLeft(c) - al)}</b>`; };
  E.A.cdApp = id => {
    const c = E.D.cheques.find(x => x.id === id), L = docs(c.dir, c.partyId);
    if (!L.length) return E.toast('No unpaid ' + (c.dir === 'in' ? 'invoices' : 'bills') + ' for ' + pn(c.partyId) + ' yet — the advance stays on account', 'error');
    E.modal('Apply advance · ' + pn(c.partyId), `<p>Cheque ${E.esc(c.chqNo)} · advance left <b>${E.m(advLeft(c))}</b></p><div class="f" style="max-width:220px">Date<input id="ap_d" type="date" value="${E.today()}"></div><span id="ap_c" data-id="${id}"></span>${allocTable(c.dir, c.partyId, 'apal')}<div class="tot" id="ap_s"></div><p class="muted">${c.dir === 'in' ? 'Dr Customer Advances / Cr Receivables' : 'Dr Payables / Cr Supplier Advances'}. The invoice or bill shows as paid by this cheque.</p>`, `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="cdAppSave" data-id="${id}">Apply</button>`, 1);
    fifoFill(c.dir, 'apal', advLeft(c)); apSum();
  };
  E.A.cdAppSave = async id => {
    try { const c = E.D.cheques.find(x => x.id === id), d = E.val('ap_d') || E.today(), al = [...document.querySelectorAll('.apal')].map(i => ({ id: i.dataset.id, a: E.c(i.value) })).filter(x => x.a > 0), tot = sum(al, x => x.a);
      if (tot <= 0) throw new Error('Enter the amounts to apply'); if (tot > advLeft(c)) throw new Error('More than the advance left (' + E.m(advLeft(c)) + ')');
      for (const x of al) { const q = E.D[docCol(c.dir)].find(r => r.id === x.id); if (!q || q.cancelled || x.a > q.total - q.paid) throw new Error('An allocation is more than the balance'); }
      const no = await E.next('ADV'), je = await E.post({ date: d, ref: no, narr: 'Advance from cheque ' + c.chqNo + ' applied · ' + pn(c.partyId), source: 'cheque', lines: c.dir === 'in' ? [{ acc: '2400', dr: tot }, { acc: '1200', cr: tot }] : [{ acc: '2000', dr: tot }, { acc: '1260', cr: tot }] });
      for (const x of al) { await bump(docCol(c.dir), x.id, x.a); }
      const list = al.map(x => Object.assign({ date: d, jeId: je.id }, x));
      await upd(c, x => { x.applied = (x.applied || []).concat(list); logIt(x, 'Advance applied', E.m(tot)); }); E.closeM(); E.go(); E.toast('Advance of ' + E.m(tot) + ' applied', 'success'); } catch (e) { E.toast(e.message, 'error'); }
  };

  /* ── history ── */
  E.A.cdLog = id => {
    const c = E.D.cheques.find(x => x.id === id), L = (c.log || []).slice().reverse();
    E.modal('History · cheque ' + c.chqNo, `<p>${E.esc(pn(c.partyId))} · ${E.esc(c.bank)} · ${E.m(c.amount)} · ${stTag(c)}</p><div class="tw"><table><thead><tr><th>Date</th><th>Event</th><th>Details</th><th>By</th></tr></thead><tbody>${L.map(l => `<tr><td>${l.date}</td><td>${E.esc(l.ev)}</td><td>${E.esc(l.note)}</td><td class="muted">${E.esc(l.user || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No history recorded for this older cheque</td></tr>'}</tbody></table></div>${c.note ? '<p class="muted">Note: ' + E.esc(c.note) + '</p>' : ''}`, `<button class="btn" data-a="close">Close</button>`);
  };
})(window.ERP);
