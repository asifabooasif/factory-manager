/* ai-coach.js — Guided Setup Coach + Today's Tasks + AI integration.

   THREE things:
     A) Setup Coach — 20 steps from "create factory" to "first invoice",
        auto-detected by looking at your data
     B) Today's Tasks — live checklist of what needs doing today
        (unpaid wages, overdue jobs, overdue invoices, low stock, etc.)
     C) AI integration — asking "what's next" / "guide me" in the chat
        navigates to the coach

   Everything persists in localStorage (only the checklist, never data).
*/
(E => {
  const K = 'erp_coach_v1';
  let state = { skipped: {}, done: {} };
  try { Object.assign(state, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
  const save = () => localStorage.setItem(K, JSON.stringify(state));

  const rowCount = (coll, fn) => E.rows(coll).filter(fn || (() => true)).length;
  const bankAccts = () => E.rows('coa').filter(a => a.bank && a.code !== '1000' && !a.inactive);
  const fgItems = () => E.rows('items').filter(i => i.cat === 'Finished Good');
  const rmItems = () => E.rows('items').filter(i => i.cat !== 'Finished Good');
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  /* ══════════════════════════════════════════════════════════════════
     PART A — Setup Steps
     ══════════════════════════════════════════════════════════════════ */
  const STEPS = [
    {
      id: 'factory', title: 'Create your factory',
      desc: 'Enter factory name and short code',
      help: 'Each factory has completely separate data, users, and cloud storage.\n\nClick "Open this screen" — the Setup Wizard will guide you through EVERYTHING (banks, customers, suppliers, articles, materials, employees) in one flow.',
      nav: 'setup',
      detect: () => !!(E.fid && E.factory && E.factory())
    },
    {
      id: 'banks', title: 'Add bank accounts and cash',
      desc: 'Every bank account and cash box you use',
      help: 'Menu: Accounting → Cash & Bank Accounts → Chart of accounts → + New account\n\nAdd your banks (e.g., "Commercial Bank - Current A/C"), enter account number and branch. Also add Petty Cash if you use a cash box.\n\nOpening balances are entered separately in the Opening Balances step.',
      nav: 'accounts',
      detect: () => bankAccts().length >= 1 || !!E.acct('1000')
    },
    {
      id: 'customers', title: 'Add customers',
      desc: 'Everyone you sell to',
      help: 'Menu: Masters → Parties → + New Party → Type: Customer\n\nAdd name, phone, credit limit, credit days. If a customer already owes you money from before using this system, you\'ll enter that in Opening Balances later.',
      nav: 'parties',
      detect: () => rowCount('parties', p => p.type !== 'Supplier') >= 1
    },
    {
      id: 'suppliers', title: 'Add suppliers',
      desc: 'Everyone you buy materials from',
      help: 'Menu: Masters → Parties → + New Party → Type: Supplier\n\nAdd name, phone, credit days. If you already owe them money, you\'ll enter that in Opening Balances.',
      nav: 'parties',
      detect: () => rowCount('parties', p => p.type !== 'Customer') >= 1
    },
    {
      id: 'articles', title: 'Create articles (finished goods)',
      desc: 'Article number, size run, colours, selling price',
      help: 'Menu: Purchases & Stock → Items → + New Item → Category: Finished Good\n\nFor each article:\n• Article No (e.g., F001) — printed BIG on labels\n• Size run in ONE pack (e.g., 6,7,7,8,8,9) — number of sizes = pairs per pack\n• Colours (Black, Brown, Navy) — each colour becomes a separate barcode\n• Selling price per PACK',
      nav: 'items',
      detect: () => fgItems().length >= 1
    },
    {
      id: 'bom', title: 'Add BOMs to articles',
      desc: 'How much of each material goes into ONE pack',
      help: 'Menu: Purchases & Stock → Items → click BOM button on each article\n\nFor each article, add the materials needed for ONE pack:\n• EVA sheet: 0.35 Kg\n• Sole: 1 Pcs\n• Glue: 0.05 Kg\n• Box: 1 Pcs\n\n⚠️ REQUIRED for automatic material deduction in production.',
      nav: 'items',
      detect: () => fgItems().filter(i => i.bom && i.bom.length > 0).length >= 1
    },
    {
      id: 'materials', title: 'Add raw materials, accessories, packing',
      desc: 'Every material you buy, with PURCHASE price',
      help: 'Menu: Purchases & Stock → Items → + New Item → Category: Raw Material / Accessory / Packing\n\nMaterials are BOUGHT (never sold), so they have a PURCHASE price — what you pay the supplier. Never a selling price.\n\nEnter: code, name, unit (Kg/Meter/Pcs/Sheet), purchase price, preferred supplier, reorder level.',
      nav: 'items',
      detect: () => rmItems().length >= 1
    },
    {
      id: 'operations', title: 'Set up production operations',
      desc: 'Each step a worker is paid for per pack',
      help: 'Menu: Factory → Daily Production → ⚙️ Operations & rates\n\nClick "Add standard slipper operations" for a shortcut (cutting, top making, sole fixing, buckle fitting, finishing, packing).\n\nThen enter the RATE PER PACK for each one (e.g., top making = Rs 80/pack).',
      nav: 'production',
      detect: () => rowCount('operations', o => o.active !== false) >= 1
    },
    {
      id: 'employees', title: 'Add your employees',
      desc: 'Wage workers, Daily Salaried, Monthly Salaried',
      help: 'Menu: People & Payroll → Employees → + New Employee\n\nChoose the right type:\n• Wage Worker — paid by days worked + piece work\n• Daily Salaried — fixed daily amount\n• Monthly Salaried — fixed monthly salary\n\nIf they already owe you an advance, note it (posted in Opening Balances).',
      nav: 'employees',
      detect: () => rowCount('employees', e => e.active) >= 1
    },
    {
      id: 'opening', title: 'Post opening balances',
      desc: 'Opening cash, bank, receivables, payables, stock',
      help: 'Menu: System → Opening Balances\n\nEnter:\n• Opening cash in hand\n• Each bank account\'s current balance\n• What customers already owe you (opening invoices)\n• What you already owe suppliers (opening bills)\n• Opening stock (do this per item in Inventory)\n• Employee advances owed',
      nav: 'opening',
      detect: () => E.rows('journalEntries').some(j => j.source === 'opening')
    },
    {
      id: 'labels', title: 'Print barcode labels',
      desc: 'One label per article + colour pack',
      help: 'Menu: System → Import / Export → Barcode labels\n\nChoose category and copies per pack. Each label shows the BIG article number, colour, size run, and an EAN-13 barcode.\n\nOptional but very useful — stick these on finished goods and receipts.',
      nav: 'datatools', optional: true,
      detect: () => false
    },
    {
      id: 'purchase', title: 'Your first purchase',
      desc: 'Buy some materials to get started',
      help: 'Menu: Purchases & Stock → Purchases → + New Purchase\n\nSelect supplier, date, invoice number, then add material lines with quantity and rate (rate auto-fills from last paid). Click Receive & Post.\n\nPosts: Dr 1300 Raw Material Stock / Cr 2000 Trade Payables',
      nav: 'purchases',
      detect: () => rowCount('purchases', p => !p.opening) >= 1
    },
    {
      id: 'job', title: 'Create your first job',
      desc: 'A customer order (or stock production)',
      help: 'Menu: Factory → Jobs & Costing → + New Job\n\nChoose customer (or leave blank for stock production), due date, and add article lines with packs you\'re making.\n\nA job collects ALL costs: materials, wages, direct expenses, overheads.',
      nav: 'jobs',
      detect: () => rowCount('jobs') >= 1
    },
    {
      id: 'batch', title: 'Issue materials to the job',
      desc: 'Deduct materials for the packs you\'re starting',
      help: 'Menu: Factory → Daily Production → 📦 Material Batches tab\n\nSelect job, article, and how many packs you\'re starting. The system shows a live preview of ALL BOM materials needed and checks stock.\n\nClick "Deduct Materials & Start Batch" to post.\n\nPosts: Dr 1310 WIP (Material) / Cr 1300 Raw Material Stock',
      nav: 'production',
      detect: () => E.rows('issues').some(i => i.batch) || E.rows('stockMoves').some(m => m.type === 'issue')
    },
    {
      id: 'production', title: 'Log daily production',
      desc: 'Record who made how many packs of what',
      help: 'Menu: Factory → Daily Production → 📝 Daily log tab\n\nFor each worker + operation completed today:\n• Worker (searchable list)\n• Job\n• Article / colour\n• Operation\n• Packs made\n\nThe rate auto-fills. Click Save production.\n\nPosts: Dr 1310 WIP (Labour) / Cr 2210 Accrued Piece Wages',
      nav: 'production',
      detect: () => rowCount('prodLogs') >= 1
    },
    {
      id: 'wage-run', title: 'Run your first wage run',
      desc: 'Pay everyone who produced work',
      help: 'Menu: People & Payroll → Wages → + New Wage Run\n\n1. Choose run type (Weekly/Fortnightly)\n2. Enter period\n3. Click "Select employees with production"\n4. Review calculations\n5. Confirm & Post\n6. Click "Pay" to pay out\n\nWage runs pay: piece work + attendance days for wage workers. Salaried staff base salary comes from Daily/Monthly Salaries separately.',
      nav: 'wages',
      detect: () => E.rows('wageRuns').some(r => r.kind === 'run')
    },
    {
      id: 'delivery', title: 'Your first delivery note',
      desc: 'Goods leave the factory',
      help: 'Menu: Factory → Sales → + Delivery Note\n\nChoose customer, articles, packs, price. Profit % shows live vs stock cost.\n\nPosts: Dr 5400 Cost of Goods Sold / Cr 1320 Finished Goods Stock\n\nRevenue is NOT recognized yet — that comes at invoicing.',
      nav: 'sales',
      detect: () => rowCount('deliveries') >= 1
    },
    {
      id: 'invoice', title: 'Your first invoice',
      desc: 'Bill the customer',
      help: 'Menu: Factory → Sales → + Invoice\n\nSelect customer, tick delivered notes to invoice, enter discount if any. Click Create Invoice.\n\nPosts: Dr 1200 Trade Receivables / Cr 4000 Sales Revenue',
      nav: 'sales',
      detect: () => rowCount('invoices', i => !i.opening) >= 1
    },
    {
      id: 'receipt', title: 'Receive payment',
      desc: 'Money in the bank',
      help: 'Menu: Factory → Sales → Receive Payment\n\nChoose customer, tick invoices to pay, choose bank account, enter amount.\n\nPosts: Dr Bank / Cr 1200 Trade Receivables',
      nav: 'sales',
      detect: () => rowCount('receipts') >= 1
    },
    {
      id: 'close', title: 'Month-end close',
      desc: 'Verify everything and lock the period',
      help: 'Menu: Reports → Month-end Close\n\nAll 12 checks must be green:\n• Trial balance balanced\n• Stock = ledger\n• WIP explained by jobs\n• All wage/salary runs paid\n• Advances agree\n• Overhead absorbed\n• Suppliers agree\n• No negative stock\n\nThen backup and lock the period.',
      nav: 'closing', optional: true,
      detect: () => !!E.setting('lockedUntil')
    }
  ];

  function isDone(step) {
    if (state.done[step.id]) return true;
    try { return step.detect(); } catch (e) { return false; }
  }
  function isSkipped(step) { return !!state.skipped[step.id] && !isDone(step); }
  function progress() {
    const total = STEPS.length;
    const done = STEPS.filter(s => isDone(s)).length;
    const skipped = STEPS.filter(s => isSkipped(s)).length;
    return { total, done, skipped, remaining: total - done - skipped };
  }
  function nextStep() {
    for (const s of STEPS) {
      if (!isDone(s) && !isSkipped(s)) return s;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     PART B — Today's Tasks (live, based on current data)
     ══════════════════════════════════════════════════════════════════ */
  function todaysTasks() {
    if (!E.fid || !E.factory || !E.factory()) return [];
    const tasks = [];
    const today = E.today();

    /* 1. Unpaid wage runs */
    const unpaidRuns = E.rows('wageRuns').filter(r => r.kind === 'run' && !r.cancelled && !r.paid);
    if (unpaidRuns.length) {
      const total = unpaidRuns.reduce((s, r) => s + r.net, 0);
      tasks.push({
        pri: 'high', icon: '💰',
        t: unpaidRuns.length + ' wage run(s) unpaid — ' + E.m(total),
        nav: 'wages', navLabel: 'Go to Wages'
      });
    }

    /* 2. Overdue jobs */
    const overdueJobs = E.rows('jobs').filter(j => j.status === 'In Progress' && j.due && j.due < today);
    if (overdueJobs.length) {
      tasks.push({
        pri: 'high', icon: '🏭',
        t: overdueJobs.length + ' overdue job(s) — earliest: ' + overdueJobs[0].no,
        nav: 'jobs', navLabel: 'Go to Jobs'
      });
    }

    /* 3. Overdue customer invoices */
    const overdueInv = E.rows('invoices').filter(i => {
      if (i.cancelled || i.paid >= i.total) return false;
      const party = E.D.parties.find(p => p.id === i.partyId) || {};
      const due = addDays(i.date, party.days || 0);
      return due < today;
    });
    if (overdueInv.length) {
      const total = overdueInv.reduce((s, i) => s + (i.total - i.paid), 0);
      tasks.push({
        pri: 'high', icon: '📞',
        t: overdueInv.length + ' overdue invoice(s) — ' + E.m(total) + ' owed',
        nav: 'sales', navLabel: 'Go to Sales'
      });
    }

    /* 4. Delivered but not invoiced */
    const unInvoiced = E.rows('deliveries').filter(d => d.status === 'Delivered');
    if (unInvoiced.length) {
      tasks.push({
        pri: 'medium', icon: '🧾',
        t: unInvoiced.length + ' delivery note(s) not yet invoiced',
        nav: 'sales', navLabel: 'Invoice them'
      });
    }

    /* 5. Overdue supplier bills */
    const overdueBills = E.rows('purchases').filter(p => {
      if (p.cancelled || p.paid >= p.total) return false;
      const party = E.D.parties.find(p2 => p2.id === p.partyId) || {};
      const due = addDays(p.date, party.days || 0);
      return due < today;
    });
    if (overdueBills.length) {
      const total = overdueBills.reduce((s, p) => s + (p.total - p.paid), 0);
      tasks.push({
        pri: 'high', icon: '💸',
        t: overdueBills.length + ' overdue supplier bill(s) — ' + E.m(total),
        nav: 'purchases', navLabel: 'Pay suppliers'
      });
    }

    /* 6. Low stock */
    const m = E.stockMap();
    const low = E.skuList().map(k => Object.assign({}, k, m[k.itemId + '|' + k.variantId] || { qty: 0 }))
      .filter(k => k.min && k.qty <= k.min);
    if (low.length) {
      tasks.push({
        pri: 'medium', icon: '📦',
        t: low.length + ' item(s) at/below reorder level',
        nav: 'stock', navLabel: 'Check stock'
      });
    }

    /* 7. Cheques due for clearing */
    const pendingCheques = E.rows('cheques').filter(c => c.status === 'Pending' && c.date <= today);
    if (pendingCheques.length) {
      tasks.push({
        pri: 'high', icon: '🏦',
        t: pendingCheques.length + ' cheque(s) due for clearing',
        nav: 'banking', navLabel: 'Clear cheques'
      });
    }

    /* 8. Overhead pool not absorbed */
    const unabs = E.unabsorbed ? E.unabsorbed() : 0;
    if (unabs > 0) {
      tasks.push({
        pri: 'low', icon: '🏭',
        t: 'Overhead pool: ' + E.m(unabs) + ' not yet absorbed',
        nav: 'expenses', navLabel: 'Absorb'
      });
    }

    /* 9. Accrued expenses unpaid */
    const accBal = E.bal('2300');
    if (accBal > 0) {
      tasks.push({
        pri: 'medium', icon: '📝',
        t: 'Accrued expenses unpaid: ' + E.m(accBal),
        nav: 'expenses', navLabel: 'Pay accrued'
      });
    }

    /* 10. Piece wages unpaid */
    const pieceUnpaid = E.rows('prodLogs').filter(l => l.status === 'accrued').reduce((s, l) => s + l.amount, 0);
    if (pieceUnpaid > 0) {
      tasks.push({
        pri: 'medium', icon: '🧵',
        t: 'Piece wages accrued (not yet run): ' + E.m(pieceUnpaid),
        nav: 'wages', navLabel: 'Run wages'
      });
    }

    return tasks.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.pri] - rank[b.pri];
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     PART C — Actions
     ══════════════════════════════════════════════════════════════════ */
  E.A.coachOpen = id => {
    const step = STEPS.find(s => s.id === id);
    if (step && step.nav) location.hash = '#/' + step.nav;
  };
  E.A.coachDone = id => { state.done[id] = true; save(); E.go(); E.toast('Step marked done ✓', 'success'); };
  E.A.coachSkip = id => { state.skipped[id] = true; save(); E.go(); E.toast('Step skipped', 'success'); };
  E.A.coachUnskip = id => { delete state.skipped[id]; save(); E.go(); };
  E.A.coachReset = () => {
    if (!confirm('Reset coach progress? Your data is safe — only the checklist resets.')) return;
    state = { skipped: {}, done: {} };
    save();
    E.go();
    E.toast('Coach progress reset', 'success');
  };
  E.A.coachNext = () => {
    const s = nextStep();
    if (s) E.A.coachOpen(s.id);
    else E.toast('🎉 All setup steps complete!', 'success');
  };
  E.A.coachRefresh = () => { E.go(); E.toast('Tasks refreshed', 'success'); };

  /* ══════════════════════════════════════════════════════════════════
     PART D — Coach page route
     ══════════════════════════════════════════════════════════════════ */
  E.route('coach', 'Setup Coach', () => {
    const p = progress();
    const next = nextStep();
    const tasks = todaysTasks();
    const factoryReady = !!(E.fid && E.factory && E.factory());

    return `
      ${!factoryReady ? `<div class="card" style="border-left:4px solid #dc2626;">
        <h3 style="margin:0 0 8px;">⚠️ No factory open</h3>
        <p class="muted" style="margin:0 0 12px;">Create a factory first before continuing.</p>
        <button class="btn p" data-a="firstFac">Create factory</button>
      </div>` : ''}

      ${p.remaining > 0 ? `
        <div class="card" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:1px;">Setup Coach</div>
              <h2 style="margin:4px 0;color:#fff;">${p.done} of ${p.total} steps complete</h2>
              <p style="margin:0;opacity:.95;">${p.remaining} step${p.remaining > 1 ? 's' : ''} remaining</p>
            </div>
            <div style="font-size:52px;font-weight:900;opacity:.9;">${Math.round(p.done / p.total * 100)}%</div>
          </div>
          <div style="height:10px;background:rgba(255,255,255,.3);border-radius:99px;overflow:hidden;margin-top:16px;">
            <div style="height:100%;width:${(p.done / p.total * 100)}%;background:#fff;border-radius:99px;transition:width .5s;"></div>
          </div>
        </div>
      ` : `<div class="card" style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;text-align:center;">
        <h2 style="margin:0;color:#fff;">🎉 Setup Complete!</h2>
        <p style="margin:8px 0 0;opacity:.95;">Your factory is fully set up and ready for daily operations.</p>
      </div>`}

      ${next ? `
        <div class="card" style="border-left:4px solid #7c3aed;">
          <div style="font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;font-weight:700;">🎯 Next setup step</div>
          <h3 style="margin:6px 0;">${E.esc(next.title)}</h3>
          <p class="muted" style="margin:8px 0 16px;">${E.esc(next.desc)}</p>
          <div style="white-space:pre-line;line-height:1.7;background:var(--s2);padding:14px;border-radius:8px;margin-bottom:16px;font-size:13px;">${E.esc(next.help)}</div>
          <button class="btn p" data-a="coachOpen" data-id="${next.id}">→ Open this screen</button>
          <button class="btn" data-a="coachDone" data-id="${next.id}">✓ I've done this</button>
          ${next.optional ? `<button class="btn" data-a="coachSkip" data-id="${next.id}">⏭ Skip</button>` : ''}
        </div>
      ` : ''}

      ${tasks.length > 0 ? `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="margin:0;">📋 Today's Tasks</h3>
            <button class="btn sm" data-a="coachRefresh">🔄 Refresh</button>
          </div>
          <div class="tw"><table>
            <thead><tr><th></th><th>Task</th><th></th></tr></thead>
            <tbody>${tasks.map(t => `
              <tr>
                <td style="font-size:20px;">${t.icon}</td>
                <td>
                  ${E.esc(t.t)}
                  <span class="tag" style="margin-left:6px;background:${t.pri === 'high' ? '#fee2e2;color:#b91c1c' : t.pri === 'medium' ? '#fef3c7;color:#92400e' : 'var(--s2);color:var(--t3)'};">${t.pri.toUpperCase()}</span>
                </td>
                <td class="r"><button class="btn sm" onclick="location.hash='#/${t.nav}'">${E.esc(t.navLabel)} →</button></td>
              </tr>
            `).join('')}</tbody>
          </table></div>
        </div>
      ` : (factoryReady ? `<div class="card" style="border-left:4px solid #059669;">
        <h3 style="margin:0 0 6px;">✅ All clear for today</h3>
        <p class="muted" style="margin:0;">No urgent tasks. Everything is up to date.</p>
      </div>` : '')}

      <div class="card">
        <h3>All setup steps</h3>
        <div class="tw"><table>
          <thead><tr><th style="width:40px;">#</th><th>Step</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${STEPS.map((s, i) => {
              const done = isDone(s);
              const skip = isSkipped(s);
              const isNext = next && next.id === s.id;
              let status = '<span class="tag" style="background:var(--s2);color:var(--t3);">Not started</span>';
              if (done) status = '<span class="tag" style="background:#d1fae5;color:#065f46;">✅ Done</span>';
              else if (skip) status = '<span class="tag" style="background:#fef3c7;color:#92400e;">⏭ Skipped</span>';
              else if (isNext) status = '<span class="tag" style="background:#ede9fe;color:#5b21b6;">→ Next</span>';
              return `<tr style="${isNext ? 'background:#faf5ff;' : ''}">
                <td class="muted">${i + 1}</td>
                <td>
                  <b>${E.esc(s.title)}</b>
                  <div class="muted" style="font-size:12px;">${E.esc(s.desc)}</div>
                </td>
                <td>${status}</td>
                <td class="r" style="white-space:nowrap;">
                  ${!done ? `<button class="btn sm" data-a="coachOpen" data-id="${s.id}">Open</button>` : ''}
                  ${!done && !skip ? `<button class="btn sm" data-a="coachDone" data-id="${s.id}">✓</button>` : ''}
                  ${skip ? `<button class="btn sm" data-a="coachUnskip" data-id="${s.id}">Undo</button>` : ''}
                  ${!done && !skip && s.optional ? `<button class="btn sm" data-a="coachSkip" data-id="${s.id}">⏭</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="bar">
        <span class="gap"></span>
        <button class="btn" data-a="coachReset">🔄 Reset progress</button>
      </div>
    `;
  });

  /* ══════════════════════════════════════════════════════════════════
     PART E — Dashboard widgets (auto-injected)
     ══════════════════════════════════════════════════════════════════ */
  function createCoachWidget() {
    const p = progress();
    if (p.remaining === 0) return null;
    const next = nextStep();
    if (!next) return null;
    const w = document.createElement('div');
    w.id = 'coach-widget';
    w.className = 'card';
    w.style.cssText = 'background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;';
    w.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:240px;">' +
          '<div style="font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:1px;">🎯 Setup Coach</div>' +
          '<div style="font-size:20px;font-weight:800;margin:4px 0;">' + p.done + ' of ' + p.total + ' steps done</div>' +
          '<div style="height:6px;background:rgba(255,255,255,.3);border-radius:99px;overflow:hidden;margin:8px 0;">' +
            '<div style="height:100%;width:' + (p.done / p.total * 100) + '%;background:#fff;border-radius:99px;"></div>' +
          '</div>' +
          '<div style="font-size:13px;margin-top:6px;"><b>Next:</b> ' + E.esc(next.title) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn" data-a="coachNext" style="background:#fff;color:#7c3aed;font-weight:600;">🎯 Do next step</button>' +
          '<button class="btn" onclick="location.hash=\'#/coach\'" style="background:rgba(255,255,255,.2);color:#fff;">📋 Full guide</button>' +
        '</div>' +
      '</div>';
    return w;
  }

  function createTasksWidget() {
    const tasks = todaysTasks();
    if (!tasks.length) return null;
    const w = document.createElement('div');
    w.id = 'tasks-widget';
    w.className = 'card';
    w.style.cssText = 'border-left:4px solid #d97706;';
    w.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<h3 style="margin:0;">📋 Today\'s Tasks <span class="tag" style="background:#fef3c7;color:#92400e;">' + tasks.length + '</span></h3>' +
        '<button class="btn sm" onclick="location.hash=\'#/coach\'">View all →</button>' +
      '</div>' +
      '<div>' + tasks.slice(0, 5).map(t =>
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd);gap:12px;">' +
          '<div style="flex:1;">' +
            '<span style="font-size:16px;margin-right:8px;">' + t.icon + '</span>' +
            '<span style="font-size:13px;">' + E.esc(t.t) + '</span>' +
            '<span class="tag" style="margin-left:6px;background:' +
              (t.pri === 'high' ? '#fee2e2;color:#b91c1c' : t.pri === 'medium' ? '#fef3c7;color:#92400e' : 'var(--s2);color:var(--t3)') +
            ';">' + t.pri + '</span>' +
          '</div>' +
          '<button class="btn sm" onclick="location.hash=\'#/' + t.nav + '\'">' + E.esc(t.navLabel) + ' →</button>' +
        '</div>'
      ).join('') +
      (tasks.length > 5 ? '<p class="muted" style="margin-top:8px;font-size:12px;">+ ' + (tasks.length - 5) + ' more task(s)</p>' : '') +
      '</div>';
    return w;
  }

  function injectWidgets() {
    const v = document.getElementById('v');
    if (!v) return;
    const hash = location.hash || '';
    const isDash = hash === '' || hash === '#/' || hash === '#/dashboard';

    if (!isDash) {
      const cw = document.getElementById('coach-widget');
      const tw = document.getElementById('tasks-widget');
      if (cw) cw.remove();
      if (tw) tw.remove();
      return;
    }

    const coachW = document.getElementById('coach-widget');
    const tasksW = document.getElementById('tasks-widget');

    if (!coachW) {
      const w = createCoachWidget();
      if (w) v.insertBefore(w, v.firstChild);
    }

    if (!tasksW) {
      const w = createTasksWidget();
      if (w) {
        const after = document.getElementById('coach-widget');
        if (after && after.nextSibling) v.insertBefore(w, after.nextSibling);
        else if (after) v.appendChild(w);
        else v.insertBefore(w, v.firstChild);
      }
    }
  }

  function watch() {
    const v = document.getElementById('v');
    if (!v) { setTimeout(watch, 500); return; }
    const obs = new MutationObserver(() => { injectWidgets(); });
    obs.observe(v, { childList: true });
    injectWidgets();
  }

  /* ══════════════════════════════════════════════════════════════════
     PART F — AI integration
     ══════════════════════════════════════════════════════════════════ */
  function patchAI() {
    if (!E.AI || !E.AI.ask || E.AI._coachPatched) { setTimeout(patchAI, 500); return; }
    E.AI._coachPatched = true;
    const orig = E.AI.ask;
    E.AI.ask = function (q) {
      const lower = (q || '').toLowerCase().trim();
      const isCoachQ =
        /^(?:what(?:s| should i do)? next|next step|guide me|coach|where do i start|what do i do now|show me the steps|show guide|show me setup|setup guide|guided setup|setup steps|setup wizard|teach me|help me start|how to start|first step|step one|step 1)/i.test(lower);
      if (isCoachQ) {
        const p = progress();
        const next = nextStep();
        const tasks = todaysTasks();
        E.toast(`Coach: ${p.done}/${p.total} setup done · ${tasks.length} task(s) today`, 'success');
        location.hash = '#/coach';
        return Promise.resolve();
      }
      return orig(q);
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     PART G — Nav + first-visit toast
     ══════════════════════════════════════════════════════════════════ */
  E.nav('System', 'coach', '🎯', 'Setup Coach');

  watch();
  patchAI();

  if (!localStorage.getItem('erp_coach_greeted')) {
    localStorage.setItem('erp_coach_greeted', '1');
    setTimeout(() => {
      if (progress().remaining > 0) {
        E.toast('🎯 Open System → Setup Coach for a step-by-step guide', 'success');
      }
    }, 3000);
  }

  /* ══════════════════════════════════════════════════════════════════
     PART H — Public API
     ══════════════════════════════════════════════════════════════════ */
  E.Coach = {
    steps: STEPS,
    progress,
    nextStep,
    todaysTasks,
    isDone,
    isSkipped,
    complete: id => { state.done[id] = true; save(); },
    skip: id => { state.skipped[id] = true; save(); },
    reset: () => { state = { skipped: {}, done: {} }; save(); }
  };
})(window.ERP);