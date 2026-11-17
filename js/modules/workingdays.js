/* Working Days Calendar (advanced).
   - Weekly pattern per factory (for example Mon-Fri full, Saturday half, Sunday off)
   - Every date can be: working (1), half day (0.5) or holiday (0), with a reason and a name
   - Month and year views, bulk ranges, fixed Sri Lanka holidays, printable month sheet
   - Data check against production and attendance, and a cost reconciliation for the month
   Other modules use: E.workingDaysIn(month) (can be fractional), E.dayWeight(date), E.isWorkingDate(date), E.dayInfo(date). */
(E => {
  E.nav('System', 'workingdays', '📅', 'Working Days');
  const TYPES = { public: 'Public holiday', mercantile: 'Mercantile holiday', poya: 'Poya day', shutdown: 'Factory shutdown / leave', power: 'Power cut / breakdown', strike: 'Strike / disruption', maint: 'Maintenance', weather: 'Weather / flood', other: 'Other' };
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let CM = E.today().slice(0, 7), TAB = 'cal', YR = E.today().slice(0, 4);
  const pad = d => String(d).padStart(2, '0');
  const rec = month => E.rows('workingDays').find(w => w.month === month);
  const dim = month => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dow = (month, day) => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, day).getDay(); };
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const fmt = n => String(+(+n).toFixed(2));

  /* weekly pattern: 7 characters, Sunday first. 1 = working, h = half day, 0 = off */
  const pattern = () => { const p = String(E.setting('wd_pattern') || '0111111'); return /^[01h]{7}$/.test(p) ? p : '0111111'; };
  const patW = (p, d) => p[d] === '1' ? 1 : p[d] === 'h' ? 0.5 : 0;
  const norm = v => typeof v === 'string' ? { s: v } : (v || {});
  const wOf = s => s === 'working' ? 1 : s === 'half' ? 0.5 : 0;
  const sOf = w => w === 1 ? 'working' : w === 0.5 ? 'half' : 'holiday';

  function info(month, day) {
    const w = rec(month), raw = w && w.days && w.days[pad(day)];
    if (raw != null) { const o = norm(raw), wt = wOf(o.s); return { weight: wt, status: sOf(wt), name: o.n || '', type: o.t || '', custom: true }; }
    const wt = patW(pattern(), dow(month, day));
    return { weight: wt, status: sOf(wt), name: '', type: '', custom: false };
  }
  const dateInfo = date => info(date.slice(0, 7), parseInt(date.slice(8, 10), 10));
  function stats(month) {
    const n = dim(month); const s = { weight: 0, full: 0, half: 0, off: 0, custom: 0, saved: 0 };
    for (let d = 1; d <= n; d++) { const i = info(month, d); s.weight += i.weight; if (i.weight === 1) s.full++; else if (i.weight) s.half++; else s.off++; if (i.custom) s.custom++; }
    const w = rec(month); s.saved = w ? Object.keys(w.days || {}).length : 0; return s;
  }

  E.workingDaysIn = month => stats(month).weight;
  E.dayWeight = date => date ? dateInfo(date).weight : 0;
  E.isWorkingDate = date => !!date && dateInfo(date).weight > 0;
  E.dayInfo = dateInfo;
  E.customHolidays = () => { const out = []; E.rows('workingDays').forEach(w => Object.keys(w.days || {}).forEach(d => { if (wOf(norm(w.days[d]).s) === 0 && dow(w.month, +d) !== 0) out.push(w.month + '-' + d); })); return out; };

  async function putMonth(w) { if (!w.id) { w.id = 'WD-' + E.fid + '-' + w.month; w.factoryId = E.fid; } await E.put('workingDays', w); }
  async function freezeMonth(month) { /* write every day of the month with today's pattern so later pattern changes cannot alter it */
    const w = rec(month) || { month, days: {} };
    for (let d = 1; d <= dim(month); d++) { const k = pad(d); if (w.days[k] === undefined) w.days[k] = { s: sOf(info(month, d).weight) }; }
    await putMonth(w);
  }
  const recompute = async months => { if (!E.dailyAllocation) return 0; let n = 0; for (const m of months) if (m <= E.today().slice(0, 7)) n += await E.dailyAllocation.recomputeMonth(m); return n; };
  const workLogged = date => E.rows('prodLogs').some(l => l.date === date && l.status !== 'cancelled') || E.rows('attendance').some(a => a.date === date && a.status && !/absent|leave/i.test(a.status));

  /* ---------- month reconciliation: fixed costs vs what was charged to jobs ---------- */
  function recon(month) {
    const total = E.totalFixedForMonth ? E.totalFixedForMonth(month) : 0, rate = E.dailyFixedRate ? E.dailyFixedRate(month) : 0, st = stats(month), t = E.today();
    let toDate = 0, jobs = 0, idle = 0, nIdle = 0; const n = dim(month);
    for (let d = 1; d <= n; d++) { const date = month + '-' + pad(d); if (date > t) break; toDate += rate * info(month, d).weight; }
    E.rows('dailyAllocations').filter(a => a.date.slice(0, 7) === month && a.date <= t && a.isWorkingDay).forEach(a => { if (a.isIdle) { idle += a.dailyFixedTotal || 0; nIdle++; } else jobs += a.dailyFixedTotal || 0; });
    return { total, rate, weight: st.weight, toDate: Math.round(toDate), jobs, idle, nIdle, gap: Math.round(toDate) - jobs - idle };
  }

  /* ---------- screen ---------- */
  const tabs = [['cal', 'Calendar'], ['year', 'Year overview'], ['pat', 'Weekly pattern'], ['chk', 'Data check']];
  E.route('workingdays', 'Working Days', () => {
    const bar = `<div class="bar">${tabs.map(t => `<button class="btn ${TAB === t[0] ? 'p' : ''}" data-a="wdTab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div>`;
    return bar + (TAB === 'year' ? yearView() : TAB === 'pat' ? patView() : TAB === 'chk' ? chkView() : calView());
  });
  const monthBar = () => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn sm" data-a="wdPrev">◀</button><input type="month" class="fs" value="${CM}" data-f="wd.m"><button class="btn sm" data-a="wdNext">▶</button><button class="btn sm" data-a="wdToday">This month</button></div>`;

  function calView() {
    const month = CM, n = dim(month), st = stats(month), r = recon(month), startCol = (dow(month, 1) + 6) % 7, cells = [];
    for (let i = 0; i < startCol; i++) cells.push(null);
    for (let d = 1; d <= n; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const t = E.today();
    const status = st.saved >= n ? '<span class="ok">✓ Saved</span>' : st.saved ? '<span style="color:#d97706">🟡 Partly saved</span>' : '<span class="muted">Using weekly pattern</span>';
    const list = []; for (let d = 1; d <= n; d++) { const i = info(month, d); if (i.custom || i.name) list.push({ d, i }); }
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><h3 style="margin:0">📅 Working Days · ${month}</h3><p class="muted" style="margin:4px 0 0;font-size:12px">Click a day to change it. Weekly pattern: <b>${patText()}</b> (change it in the Weekly pattern tab).</p></div>${monthBar()}</div>
    <div class="kp">${E.kpi('Working days', fmt(st.weight), st.half ? st.full + ' full + ' + st.half + ' half' : 'full days')}${E.kpi('Days off', st.off, 'holidays and weekly off')}${E.kpi('Custom marks', st.custom, 'changed from the pattern')}${E.kpi('Rate per working day', E.m(r.rate), 'fixed costs ÷ working days')}${E.kpi('Month status', status)}</div>
    <div class="tw"><table style="table-layout:fixed"><thead><tr>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${weeks.map(w => `<tr>${w.map(d => {
      if (!d) return '<td style="padding:3px"></td>';
      const i = info(month, d), date = month + '-' + pad(d), col = i.weight === 1 ? '#059669' : i.weight ? '#d97706' : '#dc2626', bg = i.weight === 1 ? '#f0fdf4' : i.weight ? '#fffbeb' : '#fef2f2';
      const warn = i.weight === 0 && workLogged(date), today = date === t;
      return `<td style="padding:3px"><button data-a="wdDay" data-id="${date}" style="width:100%;min-height:74px;padding:6px 3px;border:${today ? '3px' : '1px'} solid ${col};background:${bg};border-radius:8px;cursor:pointer;text-align:center"><div style="font-size:16px;font-weight:700;color:${col}">${d}</div><div style="font-size:11px;color:${col}">${i.weight === 1 ? 'Working' : i.weight ? 'Half day' : 'Off'}</div>${i.name ? `<div style="font-size:9.5px;color:#5b5670;margin-top:2px;line-height:1.1">${E.esc(i.name.slice(0, 16))}</div>` : i.custom ? '<div style="font-size:9px;color:#78718f">custom</div>' : ''}${warn ? '<div style="font-size:10px;color:#b91c1c;font-weight:700">⚠ work logged</div>' : ''}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="bar" style="margin-top:14px"><button class="btn p" data-a="wdSave">💾 Save month</button><button class="btn" data-a="wdReset">↩ Reset month to weekly pattern</button><button class="btn" data-a="wdRecompute">🔄 Recompute job allocations</button><span class="gap"></span><button class="btn" data-a="wdPrint">🖨 Print month sheet</button></div>
    <div style="margin-top:12px;padding:12px;background:var(--s2);border-radius:8px;font-size:12px;color:var(--t3)"><b>How it is used:</b> monthly fixed expenses and salaries ÷ working days = the rate for one full day. A half day carries half the rate. Each day's cost is shared across the active jobs. <b>Save month</b> fixes every day of the month, so later changes to the weekly pattern cannot alter it.</div></div>
    ${list.length ? `<div class="card"><h3>Marked days in ${month}</h3><div class="tw"><table><thead><tr><th>Date</th><th>Day</th><th>Status</th><th>Reason</th><th>Note</th><th></th></tr></thead><tbody>${list.map(x => { const date = month + '-' + pad(x.d); return `<tr><td>${date}</td><td>${DN[dow(month, x.d)]}</td><td>${x.i.weight === 1 ? 'Working' : x.i.weight ? 'Half day' : 'Off'}</td><td>${E.esc(TYPES[x.i.type] || '')}</td><td>${E.esc(x.i.name)}</td><td class="r"><button class="btn sm" data-a="wdDay" data-id="${date}">Edit</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><h3>Cost reconciliation · ${month}</h3><div class="kp">${E.kpi('Fixed costs this month', E.m(r.total), 'expenses + salaries')}${E.kpi('Expected to date', E.m(r.toDate), 'rate × working days so far')}${E.kpi('Charged to jobs', E.m(r.jobs))}${E.kpi('Idle (no active job)', E.m(r.idle), r.nIdle + ' day(s)')}${E.kpi('Difference', Math.abs(r.gap) <= 100 ? '<span class="ok">OK</span>' : '<span class="bad">' + E.m(r.gap) + '</span>', Math.abs(r.gap) <= 100 ? 'matches' : 'press Recompute')}</div></div>`;
  }
  const patText = () => { const p = pattern(); return [1, 2, 3, 4, 5, 6, 0].map(d => DN[d] + ' ' + (p[d] === '1' ? '✓' : p[d] === 'h' ? '½' : '✗')).join(' · '); };

  function yearView() {
    const rows = []; let w = 0, c = 0;
    for (let m = 1; m <= 12; m++) { const mo = YR + '-' + pad(m), s = stats(mo); w += s.weight; c += s.custom; rows.push(`<tr style="cursor:pointer" data-a="wdOpen" data-id="${mo}"><td><b>${mo}</b></td><td class="r">${fmt(s.weight)}</td><td class="r">${s.full}</td><td class="r">${s.half}</td><td class="r">${s.off}</td><td class="r">${s.custom}</td><td>${s.saved >= dim(mo) ? '<span class="ok">✓ saved</span>' : s.saved ? '🟡 partly' : '<span class="muted">pattern</span>'}</td><td class="r">${E.m(E.dailyFixedRate ? E.dailyFixedRate(mo) : 0)}</td></tr>`); }
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><h3 style="margin:0">Year overview · ${YR}</h3><div style="display:flex;gap:8px"><button class="btn sm" data-a="wdYr" data-id="-1">◀</button><input class="fs" style="width:90px" value="${YR}" data-f="wd.y"><button class="btn sm" data-a="wdYr" data-id="1">▶</button></div></div>
    <div class="kp">${E.kpi('Working days in year', fmt(w))}${E.kpi('Custom marks', c)}</div>
    <div class="tw"><table><thead><tr><th>Month</th><th class="r">Working days</th><th class="r">Full</th><th class="r">Half</th><th class="r">Off</th><th class="r">Custom</th><th>State</th><th class="r">Rate / working day</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="bar" style="margin-top:12px"><button class="btn" data-a="wdFixedHol">➕ Add fixed Sri Lanka holidays for ${YR}</button><button class="btn" data-a="wdSaveYear">💾 Save all 12 months of ${YR}</button></div>
    <p class="muted" style="margin-top:8px">Fixed holidays added: Independence Day (4 Feb), Sinhala &amp; Tamil New Year (13 and 14 Apr), May Day (1 May), Christmas (25 Dec). Poya days, Vesak, Thai Pongal, Eid, Deepavali, Good Friday and other movable days change every year, so enter those from the official calendar by clicking the day.</p></div>`;
  }
  function patView() {
    const p = pattern();
    return `<div class="card"><h3>Weekly pattern</h3><p class="muted">The normal working week of the factory. Every day that has no custom mark follows this. Example: Monday to Friday Full, Saturday Half day, Sunday Off.</p>
    <div class="g2">${[1, 2, 3, 4, 5, 6, 0].map(d => `<div class="f">${DL[d]}<select id="wp_${d}"><option value="1" ${p[d] === '1' ? 'selected' : ''}>Working (full day)</option><option value="h" ${p[d] === 'h' ? 'selected' : ''}>Half day (counts 0.5)</option><option value="0" ${p[d] === '0' ? 'selected' : ''}>Off</option></select></div>`).join('')}</div>
    <div class="bar"><button class="btn p" data-a="wdPatSave">💾 Save pattern</button></div>
    <p class="muted" style="margin-top:8px">Before the pattern changes, the app saves every past and current month that has production or allocations, so old costs do not move. Future months follow the new pattern.</p></div>`;
  }
  function chkView() {
    const month = CM, n = dim(month), t = E.today(), offWork = [], noWork = [], hasJobs = E.rows('jobs').length > 0;
    for (let d = 1; d <= n; d++) { const date = month + '-' + pad(d); if (date > t) break; const i = info(month, d), w = workLogged(date);
      if (i.weight === 0 && w) offWork.push(date); else if (i.weight > 0 && !w && hasJobs) noWork.push(date); }
    const r = recon(month);
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><h3 style="margin:0">Data check · ${month}</h3><p class="muted" style="margin:4px 0 0">Compares the calendar with the production and attendance you recorded, up to today.</p></div>${monthBar()}</div>
    <h4 style="margin:14px 0 6px">Work recorded on a day marked off (${offWork.length})</h4>${offWork.length ? `<div class="tw"><table><tbody>${offWork.map(d => `<tr><td>${d}</td><td>${DN[dow(month, +d.slice(8))]}</td><td class="muted">Production or attendance exists</td><td class="r"><button class="btn sm p" data-a="wdQuick" data-id="${d}|working">Mark working</button> <button class="btn sm" data-a="wdQuick" data-id="${d}|half">Half day</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="ok">None.</p>'}
    <h4 style="margin:14px 0 6px">Working days with no production or attendance (${noWork.length})</h4>${noWork.length ? `<div class="tw"><table><tbody>${noWork.map(d => `<tr><td>${d}</td><td>${DN[dow(month, +d.slice(8))]}</td><td class="muted">Nothing recorded. A stoppage, or not entered yet?</td><td class="r"><button class="btn sm" data-a="wdQuick" data-id="${d}|power">Power cut</button> <button class="btn sm" data-a="wdQuick" data-id="${d}|shutdown">Shutdown</button> <button class="btn sm d" data-a="wdQuick" data-id="${d}|holiday">Holiday</button></td></tr>`).join('')}</tbody></table></div><p class="muted">If the day was a real working day and just not entered, leave it. These days still carry fixed costs.</p>` : '<p class="ok">None.</p>'}
    <h4 style="margin:14px 0 6px">Fixed costs on idle days</h4><p>${r.nIdle ? `<b>${r.nIdle}</b> working day(s) had no active job, so <b>${E.m(r.idle)}</b> of fixed cost was not charged to any job.` : 'Every working day so far had an active job.'}</p></div>`;
  }

  /* ---------- actions ---------- */
  const setM = m => { if (/^\d{4}-\d{2}$/.test(m)) { CM = m; E.go(); } };
  E.A.wdTab = t => { TAB = t; E.go(); };
  E.A.wdMonth = setM;
  E.A.wdPrev = () => { const [y, m] = CM.split('-').map(Number); setM(m === 1 ? (y - 1) + '-12' : y + '-' + pad(m - 1)); };
  E.A.wdNext = () => { const [y, m] = CM.split('-').map(Number); setM(m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1)); };
  E.A.wdToday = () => setM(E.today().slice(0, 7));
  E.A.wdYr = i => { YR = String(+YR + +i); E.go(); };
  E.A.wdOpen = m => { CM = m; TAB = 'cal'; E.go(); };
  E.hooks.push(e => { const f = e.target.dataset && e.target.dataset.f; if (!f) return; if (f === 'wd.m') setM(e.target.value); else if (f === 'wd.y' && /^\d{4}$/.test(e.target.value)) { YR = e.target.value; E.go(); } });

  E.A.wdDay = date => {
    const i = dateInfo(date), d = new Date(date + 'T00:00:00Z');
    E.modal(date + ' · ' + DL[d.getUTCDay()], `<div class="f">Status<select id="wd_s"><option value="working" ${i.weight === 1 ? 'selected' : ''}>Working day (full)</option><option value="half" ${i.weight === 0.5 ? 'selected' : ''}>Half day (counts 0.5)</option><option value="holiday" ${i.weight === 0 ? 'selected' : ''}>Holiday / no work</option></select></div>
      <div class="f">Reason<select id="wd_t"><option value="">—</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${i.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="f">Note or holiday name<input id="wd_n" value="${E.esc(i.name)}" placeholder="e.g. Vesak Poya"></div>
      <div class="f">Apply the same to every day up to (optional)<input type="date" id="wd_e" min="${date}"></div>`,
      `<button class="btn" data-a="close">Cancel</button>${i.custom ? `<button class="btn" data-a="wdClearDay" data-id="${date}">Back to pattern</button>` : ''}<button class="btn p" data-a="wdApply" data-id="${date}">Save</button>`);
  };
  async function applyDays(dates, st, type, name) {
    const aff = new Set(), prod = dates.filter(d => workLogged(d) && d <= E.today()), past = dates.filter(d => d <= E.today());
    if (st === 'holiday' && prod.length && !confirm(prod.length + ' of these day(s) have production or attendance recorded. Mark them off anyway?')) return false;
    if (past.length && !confirm('This changes the cost rate for past or current days. Job cost allocations for those months will be recomputed. Continue?')) return false;
    for (const date of dates) {
      const month = date.slice(0, 7), key = date.slice(8, 10), w = rec(month) || { month, days: {} };
      const def = patW(pattern(), dow(month, +key)), wt = wOf(st);
      if (wt === def && !type && !name && !(rec(month) && rec(month).id && Object.keys(w.days).length >= dim(month))) delete w.days[key]; else w.days[key] = { s: st, t: type || '', n: name || '' };
      if (w.id || Object.keys(w.days).length) { await putMonth(w); aff.add(month); }
    }
    const n = await recompute([...aff]); return { aff: [...aff], n };
  }
  E.A.wdApply = async date => {
    try {
      const st = E.val('wd_s'), type = E.val('wd_t'), name = E.val('wd_n').trim(), end = E.val('wd_e') || date; if (end < date) throw new Error('The end date is before the start date');
      const dates = []; for (let d = date; d <= end && dates.length < 93; d = addDays(d, 1)) dates.push(d);
      const r = await applyDays(dates, st, type, name); if (!r) return; E.closeM(); E.go(); E.toast(dates.length + ' day(s) updated' + (r.n ? ' · ' + r.n + ' allocation day(s) recomputed' : ''), 'success');
    } catch (e) { E.toast(e.message, 'error'); }
  };
  E.A.wdClearDay = async date => {
    const month = date.slice(0, 7), w = rec(month); if (!w) return E.closeM(); delete w.days[date.slice(8, 10)];
    await putMonth(w); const n = await recompute([month]); E.closeM(); E.go(); E.toast('Back to the weekly pattern' + (n ? ' · allocations recomputed' : ''), 'success');
  };
  E.A.wdQuick = async id => {
    const [date, k] = id.split('|'), map = { working: ['working', '', ''], half: ['half', '', ''], power: ['holiday', 'power', 'Power cut'], shutdown: ['holiday', 'shutdown', 'Factory shutdown'], holiday: ['holiday', 'other', ''] }[k];
    const r = await applyDays([date], map[0], map[1], map[2]); if (r) { E.go(); E.toast(date + ' updated', 'success'); }
  };
  E.A.wdSave = async () => { await freezeMonth(CM); E.go(); E.toast('Saved ' + CM + ' · ' + fmt(stats(CM).weight) + ' working days', 'success'); };
  E.A.wdReset = async () => {
    const w = rec(CM); if (!w) return E.toast('Already using the weekly pattern', 'success');
    if (!confirm('Remove all custom marks and saved days for ' + CM + ' and use the weekly pattern?')) return;
    await E.del('workingDays', w.id); const n = await recompute([CM]); E.go(); E.toast('Month reset' + (n ? ' · allocations recomputed' : ''), 'success');
  };
  E.A.wdRecompute = async () => { if (!E.dailyAllocation) return E.toast('Allocation engine not loaded', 'error'); try { const n = await E.dailyAllocation.recomputeMonth(CM); E.go(); E.toast('Recomputed ' + n + ' day(s) of allocation', 'success'); } catch (e) { E.toast(e.message, 'error'); } };
  E.A.wdPatSave = async () => {
    const old = pattern(), np = [0, 1, 2, 3, 4, 5, 6].map(d => E.val('wp_' + d) || '0').join('');
    if (np === old) return E.toast('No change', 'success');
    if (!/^[01h]{7}$/.test(np)) return E.toast('Invalid pattern', 'error');
    const cur = E.today().slice(0, 7), months = new Set();
    E.rows('prodLogs').forEach(l => { if (l.date) months.add(l.date.slice(0, 7)); }); E.rows('dailyAllocations').forEach(a => months.add(a.date.slice(0, 7))); months.add(cur);
    const todo = [...months].filter(m => m <= cur && !(rec(m) && Object.keys(rec(m).days).length >= dim(m)));
    if (!confirm('Change the weekly pattern?\n' + todo.length + ' past or current month(s) will be saved with the old pattern first so their costs do not move.')) return;
    for (const m of todo) await freezeMonth(m);
    await E.setSetting({ wd_pattern: np }); E.go(); E.toast('Weekly pattern saved', 'success');
  };
  E.A.wdFixedHol = async () => {
    const fx = [['02-04', 'Independence Day', 'public'], ['04-13', 'Sinhala & Tamil New Year Eve', 'public'], ['04-14', 'Sinhala & Tamil New Year', 'public'], ['05-01', 'May Day', 'mercantile'], ['12-25', 'Christmas Day', 'public']];
    if (!confirm('Add ' + fx.length + ' fixed holidays to ' + YR + '? Days you already marked are not changed.')) return;
    let n = 0;
    for (const [md, name, type] of fx) { const date = YR + '-' + md, month = date.slice(0, 7), key = date.slice(8, 10), w = rec(month) || { month, days: {} }; if (w.days[key] !== undefined) continue; w.days[key] = { s: 'holiday', t: type, n: name }; await putMonth(w); n++; }
    await recompute([...new Set(fx.map(f => YR + '-' + f[0].slice(0, 2)))]); E.go(); E.toast(n + ' holiday(s) added', 'success');
  };
  E.A.wdSaveYear = async () => { if (!confirm('Save all 12 months of ' + YR + ' with the current weekly pattern and marks?')) return; for (let m = 1; m <= 12; m++) await freezeMonth(YR + '-' + pad(m)); E.go(); E.toast(YR + ' saved', 'success'); };
  E.A.wdPrint = () => {
    if (!E.prPage) return E.toast('Printing is not loaded', 'error');
    const n = dim(CM), st = stats(CM), r = recon(CM); let rows = '';
    for (let d = 1; d <= n; d++) { const i = info(CM, d); rows += `<tr><td>${CM}-${pad(d)}</td><td>${DN[dow(CM, d)]}</td><td>${i.weight === 1 ? 'Working' : i.weight ? 'Half day' : 'Off'}</td><td class="r">${i.weight}</td><td>${E.esc(TYPES[i.type] || '')}</td><td>${E.esc(i.name)}</td></tr>`; }
    E.prOut(E.prPage('WORKING DAYS', [['Month', CM], ['Working days', fmt(st.weight)], ['Printed', E.today()]], `<div class="cards"><div class="card"><h4>Weekly pattern</h4>${E.esc(patText())}</div><div class="card"><h4>Cost rate</h4>Fixed costs ${E.m(r.total)} ÷ ${fmt(st.weight)} days = <strong>${E.m(r.rate)}</strong> per working day</div></div><table class="it cmp"><thead><tr><th>Date</th><th>Day</th><th>Status</th><th class="r">Weight</th><th>Reason</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`, { nosign: true }));
  };

  /* month prompt used by the Daily Hub */
  E.A.wdCheckMonth = () => {
    const thisMonth = E.today().slice(0, 7), [y, m] = thisMonth.split('-').map(Number), nextMonth = (m === 12 ? y + 1 : y) + '-' + pad(m === 12 ? 1 : m + 1);
    const cur = rec(thisMonth);
    if (!cur || Object.keys(cur.days || {}).length < 20) return { prompt: true, month: thisMonth, reason: 'Current month not fully marked' };
    if (parseInt(E.today().slice(8, 10), 10) >= 25) { const nx = rec(nextMonth); if (!nx || Object.keys(nx.days || {}).length < 20) return { prompt: true, month: nextMonth, reason: 'Next month is coming soon — set up working days' }; }
    return { prompt: false };
  };
})(window.ERP);
