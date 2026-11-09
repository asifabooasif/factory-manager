/* AI ASSISTANT PRO — unified coach + chat + spotlight tour.

   REPLACES ai-agent.js and ai-coach.js (delete those files).

   FEATURES:
     ✓ Dashboard Hero  — big beautiful setup progress card
     ✓ Spotlight Tour  — blur screen, highlight element, guide user
     ✓ Chat            — 30+ intents, LLM bridge, context aware
     ✓ Setup Checklist — 20 steps, auto-detected
     ✓ Today's Tasks   — 10 live task types
     ✓ 5 Guided Tours  — setup, daily, sales, payroll, month-end
     ✓ One menu item   — no duplicates (guarded)
     ✓ Works offline   — rule engine, optional LLM for open-ended
*/
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     GUARD — run only once
     ══════════════════════════════════════════════════════════════════ */
  if (window.__AI_PRO_LOADED__) return;
  window.__AI_PRO_LOADED__ = true;
  window.__AI_PRO_VERSION__ = 'v3';

  /* ══════════════════════════════════════════════════════════════════
     STATE
     ══════════════════════════════════════════════════════════════════ */
  var cfgK = 'erp_ai_cfg_v1';
  var stateK = 'erp_ai_state_v1';

  var cfg = { provider: 'local', key: '', model: '' };
  var st = { skipped: {}, done: {}, greeted: false };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(cfgK) || '{}')); } catch (e) {}
  try { Object.assign(st, JSON.parse(localStorage.getItem(stateK) || '{}')); } catch (e) {}
  var saveCfg = function () { localStorage.setItem(cfgK, JSON.stringify(cfg)); };
  var saveSt = function () { localStorage.setItem(stateK, JSON.stringify(st)); };

  var chatLog = [];
  var panelOpen = false;
  var activeTour = null;

  /* ══════════════════════════════════════════════════════════════════
     WAIT FOR ERP
     ══════════════════════════════════════════════════════════════════ */
  function waitForERP() {
    if (window.ERP && window.ERP.route && window.ERP.nav && window.ERP.A) {
      try { boot(window.ERP); }
      catch (e) {
        markFabError('Boot failed: ' + e.message);
      }
    } else {
      setTimeout(waitForERP, 150);
    }
  }
  waitForERP();

  /* ══════════════════════════════════════════════════════════════════
     FAB (bulletproof, created immediately)
     ══════════════════════════════════════════════════════════════════ */
  var FAB = null;
  function ensureFAB() {
    if (!document.body) { setTimeout(ensureFAB, 100); return; }
    if (document.getElementById('ai-fab')) { FAB = document.getElementById('ai-fab'); return; }
    FAB = document.createElement('button');
    FAB.id = 'ai-fab';
    FAB.title = 'AI Assistant (Ctrl+K)';
    FAB.textContent = '🤖';
    FAB.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:999999;' +
      'width:60px;height:60px;border-radius:50%;' +
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;cursor:pointer;' +
      'font-size:26px;box-shadow:0 8px 24px rgba(124,58,237,.55);transition:transform .2s;';
    FAB.onmouseenter = function () { FAB.style.transform = 'scale(1.08)'; };
    FAB.onmouseleave = function () { FAB.style.transform = 'scale(1)'; };
    FAB.onclick = function () {
      if (window.ERP && window.ERP.AI) window.ERP.AI.toggle();
      else alert('AI Assistant is still loading. Wait a moment and click again.');
    };
    document.body.appendChild(FAB);
  }
  function markFabError(msg) {
    if (FAB) {
      FAB.style.background = '#dc2626';
      FAB.textContent = '⚠';
      FAB.onclick = function () { alert('AI Assistant error:\n\n' + msg + '\n\nTry Ctrl+Shift+R to hard refresh.'); };
    }
  }
  ensureFAB();
  setTimeout(ensureFAB, 300);
  setTimeout(ensureFAB, 1200);
  setTimeout(ensureFAB, 3000);
  document.addEventListener('DOMContentLoaded', ensureFAB);

  /* ══════════════════════════════════════════════════════════════════
     HELPERS (defined inside boot so E is available)
     ══════════════════════════════════════════════════════════════════ */
  function boot(E) {
    var esc = E.esc, m = E.m, today = E.today;
    var factoryReady = function () { return !!(E.fid && E.factory && E.factory()); };
    var bal = function (code) { var a = E.acct(code); return a ? E.bal(code) : 0; };
    var bankAccts = function () { return E.rows('coa').filter(function (a) { return a.bank && a.code !== '1000' && !a.inactive; }); };
    var addDays = function (d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
    var md = function (t) {
      return esc(t)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code style="background:#f6f4fb;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
        .replace(/\n/g, '<br>');
    };

    /* ══════════════════════════════════════════════════════════════
       SETUP STEPS (20)
       ══════════════════════════════════════════════════════════════ */
    var STEPS = [
      { id: 'factory', title: 'Create your factory', desc: 'Enter factory name and short code', nav: 'setup', icon: '🏭',
        help: 'Click "Create Factory" in the Setup Wizard. Each factory is completely separate — own data, own users, own cloud storage.',
        detect: function () { return !!(E.fid && E.factory && E.factory()); } },
      { id: 'banks', title: 'Add bank accounts', desc: 'Every bank account and cash box you use', nav: 'accounts', icon: '🏦',
        help: 'Menu: Accounting → Cash & Bank Accounts → Chart of accounts → + New account\n\nAdd your banks (Commercial Bank, Sampath, etc.) and Petty Cash if used.',
        detect: function () { return bankAccts().length >= 1 || !!E.acct('1000'); } },
      { id: 'customers', title: 'Add customers', desc: 'Everyone you sell to', nav: 'parties', icon: '👥',
        help: 'Menu: Masters → Parties → + New Party → Customer\n\nAdd name, phone, credit limit, credit days.',
        detect: function () { return E.rows('parties').filter(function (p) { return p.type !== 'Supplier'; }).length >= 1; } },
      { id: 'suppliers', title: 'Add suppliers', desc: 'Everyone you buy from', nav: 'parties', icon: '🚚',
        help: 'Menu: Masters → Parties → + New Party → Supplier\n\nAdd name, phone, credit days.',
        detect: function () { return E.rows('parties').filter(function (p) { return p.type !== 'Customer'; }).length >= 1; } },
      { id: 'articles', title: 'Create articles', desc: 'Finished goods with size runs and colours', nav: 'items', icon: '👟',
        help: 'Menu: Purchases & Stock → Items → + New Item → Finished Good\n\n• Article No (F001)\n• Size run in ONE pack (6,7,7,8,8,9)\n• Colours (Black, Brown, Navy)\n• Selling price per PACK',
        detect: function () { return E.rows('items').filter(function (i) { return i.cat === 'Finished Good'; }).length >= 1; } },
      { id: 'bom', title: 'Add BOMs', desc: 'Materials per pack', nav: 'items', icon: '📋',
        help: 'Menu: Items → click BOM button on each article\n\nFor ONE pack:\n• EVA sheet: 0.35 Kg\n• Sole: 1 Pcs\n• Glue: 0.05 Kg\n\n⚠️ Required for auto-deduction.',
        detect: function () { return E.rows('items').filter(function (i) { return i.cat === 'Finished Good' && i.bom && i.bom.length > 0; }).length >= 1; } },
      { id: 'materials', title: 'Add materials', desc: 'Raw materials with purchase price', nav: 'items', icon: '📦',
        help: 'Menu: Items → + New Item → Raw Material / Accessory / Packing\n\nEnter PURCHASE price (what you pay supplier). Never a selling price.',
        detect: function () { return E.rows('items').filter(function (i) { return i.cat !== 'Finished Good'; }).length >= 1; } },
      { id: 'operations', title: 'Set up operations', desc: 'Steps workers are paid for per pack', nav: 'production', icon: '⚙️',
        help: 'Menu: Factory → Daily Production → Operations & rates\n\nClick "Add standard slipper operations" then enter rate per pack for each.',
        detect: function () { return E.rows('operations').filter(function (o) { return o.active !== false; }).length >= 1; } },
      { id: 'employees', title: 'Add employees', desc: 'Wage / Daily Salaried / Monthly Salaried', nav: 'employees', icon: '🧑‍🏭',
        help: 'Menu: People & Payroll → Employees → + New Employee\n\nChoose type:\n• Wage Worker — days × rate + piece\n• Daily Salaried — fixed daily\n• Monthly Salaried — fixed monthly',
        detect: function () { return E.rows('employees').filter(function (e) { return e.active; }).length >= 1; } },
      { id: 'opening', title: 'Post opening balances', desc: 'Cash, bank, receivables, payables, stock', nav: 'opening', icon: '🏁',
        help: 'Menu: System → Opening Balances\n\nEnter: opening cash, bank balances, customer dues, supplier dues, opening stock, employee advances.',
        detect: function () { return E.rows('journalEntries').some(function (j) { return j.source === 'opening'; }); } },
      { id: 'labels', title: 'Print barcode labels', desc: 'One per colour pack', nav: 'datatools', icon: '🏷', optional: true,
        help: 'Menu: System → Import / Export → Barcode labels\n\nOptional but useful. Labels show big article no, colour, size run, EAN-13.',
        detect: function () { return false; } },
      { id: 'purchase', title: 'Your first purchase', desc: 'Buy some materials', nav: 'purchases', icon: '🛒',
        help: 'Menu: Purchases & Stock → Purchases → + New Purchase\n\nPosts: Dr 1300 RM Stock / Cr 2000 Payables',
        detect: function () { return E.rows('purchases').filter(function (p) { return !p.opening; }).length >= 1; } },
      { id: 'job', title: 'Your first job', desc: 'A customer order or stock run', nav: 'jobs', icon: '📋',
        help: 'Menu: Factory → Jobs & Costing → + New Job\n\nSelect customer (or blank for stock), add article lines with packs.',
        detect: function () { return E.rows('jobs').length >= 1; } },
      { id: 'batch', title: 'Issue materials to job', desc: 'Deduct materials for packs you start', nav: 'production', icon: '📦',
        help: 'Menu: Factory → Daily Production → 📦 Material Batches tab\n\nSelect job, article, packs. Preview shows all BOM materials × packs and checks stock.\n\nPosts: Dr 1310 WIP / Cr 1300 RM Stock',
        detect: function () { return E.rows('issues').some(function (i) { return i.batch; }) || E.rows('stockMoves').some(function (s) { return s.type === 'issue'; }); } },
      { id: 'production', title: 'Log daily production', desc: 'Worker + job + article + operation + packs', nav: 'production', icon: '🧵',
        help: 'Menu: Factory → Daily Production → 📝 Daily log tab\n\nFor each entry: worker, job, article/colour, operation, packs. Rate auto-fills.\n\nPosts: Dr 1310 WIP / Cr 2210 Accrued Wages',
        detect: function () { return E.rows('prodLogs').length >= 1; } },
      { id: 'wage-run', title: 'Run your first wage run', desc: 'Pay everyone who produced', nav: 'wages', icon: '💰',
        help: 'Menu: People & Payroll → Wages → + New Wage Run\n\nSelect employees → Review → Confirm & Post → Pay',
        detect: function () { return E.rows('wageRuns').some(function (r) { return r.kind === 'run'; }); } },
      { id: 'delivery', title: 'First delivery note', desc: 'Goods leave the factory', nav: 'sales', icon: '📤',
        help: 'Menu: Sales → + Delivery Note\n\nPosts: Dr 5400 COGS / Cr 1320 FG',
        detect: function () { return E.rows('deliveries').length >= 1; } },
      { id: 'invoice', title: 'First invoice', desc: 'Bill the customer', nav: 'sales', icon: '🧾',
        help: 'Menu: Sales → + Invoice\n\nTick delivered notes, add discount if any, Create.\n\nPosts: Dr 1200 AR / Cr 4000 Sales',
        detect: function () { return E.rows('invoices').filter(function (i) { return !i.opening; }).length >= 1; } },
      { id: 'receipt', title: 'Receive payment', desc: 'Money in the bank', nav: 'sales', icon: '💳',
        help: 'Menu: Sales → Receive Payment\n\nPosts: Dr Bank / Cr 1200 AR',
        detect: function () { return E.rows('receipts').length >= 1; } },
      { id: 'close', title: 'Month-end close', desc: 'Verify and lock the period', nav: 'closing', icon: '🔒', optional: true,
        help: 'Menu: Reports → Month-end Close\n\nAll 12 checks green, then backup and lock.',
        detect: function () { return !!E.setting('lockedUntil'); } }
    ];

    function isDone(s) {
      if (st.done[s.id]) return true;
      try { return s.detect(); } catch (e) { return false; }
    }
    function isSkipped(s) { return !!st.skipped[s.id] && !isDone(s); }
    function progress() {
      var total = STEPS.length;
      var done = STEPS.filter(isDone).length;
      var skipped = STEPS.filter(isSkipped).length;
      return { total: total, done: done, skipped: skipped, remaining: total - done - skipped };
    }
    function nextStep() {
      for (var i = 0; i < STEPS.length; i++) {
        if (!isDone(STEPS[i]) && !isSkipped(STEPS[i])) return STEPS[i];
      }
      return null;
    }

    /* ══════════════════════════════════════════════════════════════
       TODAY'S TASKS
       ══════════════════════════════════════════════════════════════ */
    function todaysTasks() {
      if (!factoryReady()) return [];
      var out = [], t = today();

      var unpaid = E.rows('wageRuns').filter(function (r) { return r.kind === 'run' && !r.cancelled && !r.paid; });
      if (unpaid.length) out.push({ pri: 'high', icon: '💰', t: unpaid.length + ' wage run(s) unpaid — ' + m(unpaid.reduce(function (s, r) { return s + r.net; }, 0)), nav: 'wages', navLabel: 'Go to Wages' });

      var overdue = E.rows('jobs').filter(function (j) { return j.status === 'In Progress' && j.due && j.due < t; });
      if (overdue.length) out.push({ pri: 'high', icon: '🏭', t: overdue.length + ' overdue job(s) — earliest ' + overdue[0].no, nav: 'jobs', navLabel: 'Open Jobs' });

      var odInv = E.rows('invoices').filter(function (i) {
        if (i.cancelled || i.paid >= i.total) return false;
        var p = E.D.parties.find(function (x) { return x.id === i.partyId; }) || {};
        return addDays(i.date, p.days || 0) < t;
      });
      if (odInv.length) out.push({ pri: 'high', icon: '📞', t: odInv.length + ' overdue invoice(s) — ' + m(odInv.reduce(function (s, i) { return s + (i.total - i.paid); }, 0)) + ' owed', nav: 'sales', navLabel: 'Collect' });

      var unInv = E.rows('deliveries').filter(function (d) { return d.status === 'Delivered'; });
      if (unInv.length) out.push({ pri: 'medium', icon: '🧾', t: unInv.length + ' delivery note(s) not yet invoiced', nav: 'sales', navLabel: 'Invoice' });

      var odBills = E.rows('purchases').filter(function (p) {
        if (p.cancelled || p.paid >= p.total) return false;
        var s = E.D.parties.find(function (x) { return x.id === p.partyId; }) || {};
        return addDays(p.date, s.days || 0) < t;
      });
      if (odBills.length) out.push({ pri: 'high', icon: '💸', t: odBills.length + ' overdue supplier bill(s) — ' + m(odBills.reduce(function (s, p) { return s + (p.total - p.paid); }, 0)), nav: 'purchases', navLabel: 'Pay' });

      var mm = E.stockMap();
      var low = E.skuList().map(function (k) { return Object.assign({}, k, mm[k.itemId + '|' + k.variantId] || { qty: 0 }); }).filter(function (k) { return k.min && k.qty <= k.min; });
      if (low.length) out.push({ pri: 'medium', icon: '📦', t: low.length + ' item(s) at/below reorder', nav: 'stock', navLabel: 'Stock' });

      var cheques = E.rows('cheques').filter(function (c) { return c.status === 'Pending' && c.date <= t; });
      if (cheques.length) out.push({ pri: 'high', icon: '🏦', t: cheques.length + ' cheque(s) due for clearing', nav: 'banking', navLabel: 'Clear' });

      var unabs = E.unabsorbed ? E.unabsorbed() : 0;
      if (unabs > 0) out.push({ pri: 'low', icon: '🏭', t: 'Overhead pool: ' + m(unabs) + ' not absorbed', nav: 'expenses', navLabel: 'Absorb' });

      var acc = E.bal('2300');
      if (acc > 0) out.push({ pri: 'medium', icon: '📝', t: 'Accrued expenses unpaid: ' + m(acc), nav: 'expenses', navLabel: 'Pay' });

      var pc = E.rows('prodLogs').filter(function (l) { return l.status === 'accrued'; }).reduce(function (s, l) { return s + l.amount; }, 0);
      if (pc > 0) out.push({ pri: 'medium', icon: '🧵', t: 'Piece wages not yet paid: ' + m(pc), nav: 'wages', navLabel: 'Run wages' });

      return out.sort(function (a, b) { var r = { high: 0, medium: 1, low: 2 }; return r[a.pri] - r[b.pri]; });
    }

    /* ══════════════════════════════════════════════════════════════
       SPOTLIGHT TOUR ENGINE
       ══════════════════════════════════════════════════════════════ */
    var TOURS = {
      setup: {
        title: 'Setup Tour',
        desc: 'From zero to ready-to-transact',
        steps: [
          { title: 'Welcome to Lanka Slipper ERP', text: 'This guided tour will show you where to click. Click Next to begin.', selector: '.brand' },
          { title: 'Setup Wizard', text: 'This is where you set up everything. It opens automatically for a new factory.', selector: '[data-a="firstFac"], [data-nav="setup"]', nav: 'setup' },
          { title: 'Add Bank Accounts', text: 'Start with your bank accounts — Accounting → Cash & Bank Accounts.', selector: '[data-nav="accounts"]', nav: 'accounts' },
          { title: 'Add Customers', text: 'Menu: Masters → Parties. Add everyone you sell to.', selector: '[data-nav="parties"]', nav: 'parties' },
          { title: 'Add Items (Articles)', text: 'Finished goods with colour packs. Each colour = one barcode.', selector: '[data-nav="items"]', nav: 'items' },
          { title: 'Add Employees', text: 'Choose Wage Worker, Daily Salaried or Monthly Salaried.', selector: '[data-nav="employees"]', nav: 'employees' },
          { title: 'Setup done — you\'re ready!', text: 'Your factory is ready for daily operations. Ask me anything anytime.', selector: '#nav' }
        ]
      },
      daily: {
        title: 'Daily Workflow Tour',
        desc: 'What to do every day',
        steps: [
          { title: 'Daily workflow', text: 'Every day: mark attendance → issue materials → log production.', selector: '#nav' },
          { title: '1. Mark Attendance', text: 'Factory → Attendance. Mark workers present/absent and OT hours.', selector: '[data-nav="attendance"]', nav: 'attendance' },
          { title: '2. Issue Materials', text: 'Daily Production → 📦 Material Batches. Auto-deducts BOM materials for packs you start.', selector: '[data-nav="production"]', nav: 'production' },
          { title: '3. Log Production', text: 'Daily Production → 📝 Daily log. Log worker + operation + packs. Rate auto-fills.', selector: '[data-nav="production"]', nav: 'production' },
          { title: 'Done for today!', text: 'That\'s it for daily work. Weekly wages are logged automatically from your production.', selector: '#nav' }
        ]
      },
      sales: {
        title: 'Sales Cycle Tour',
        desc: 'Delivery → Invoice → Receipt',
        steps: [
          { title: 'Sales cycle', text: 'Every sale has 3 steps: Delivery Note → Invoice → Receipt.', selector: '#nav' },
          { title: '1. Delivery Note', text: 'Sales → + Delivery Note. Goods leave stock. Posts Dr 5400 / Cr 1320.', selector: '[data-nav="sales"]', nav: 'sales' },
          { title: '2. Invoice', text: 'Sales → + Invoice. Tick delivered notes. Posts Dr 1200 / Cr 4000.', selector: '[data-nav="sales"]', nav: 'sales' },
          { title: '3. Receipt', text: 'Sales → Receive Payment. Posts Dr Bank / Cr 1200.', selector: '[data-nav="sales"]', nav: 'sales' }
        ]
      },
      payroll: {
        title: 'Payroll Tour',
        desc: 'Wages vs Salaries',
        steps: [
          { title: 'Payroll has 2 streams', text: 'Wages (production-based) and Salaries (fixed). They are completely separate.', selector: '#nav' },
          { title: 'Wages — all who produced', text: 'People & Payroll → Wages. Pays piece work + attendance days for wage workers.', selector: '[data-nav="wages"]', nav: 'wages' },
          { title: 'Daily Salaries', text: 'People & Payroll → Daily Salaries. Fixed daily pay for Daily-Salaried staff.', selector: '[data-nav="daily-salaries"]', nav: 'daily-salaries' },
          { title: 'Monthly Salaries', text: 'People & Payroll → Monthly Salaries. Fixed monthly pay for Monthly-Salaried staff.', selector: '[data-nav="monthly-salaries"]', nav: 'monthly-salaries' }
        ]
      },
      'month-end': {
        title: 'Month-end Tour',
        desc: 'Close the books',
        steps: [
          { title: 'Month-end checklist', text: '12 checks must all be green. Let me show you.', selector: '#nav' },
          { title: '1. Pay everything', text: 'Ensure all wage runs and salary runs are paid.', selector: '[data-nav="wages"]', nav: 'wages' },
          { title: '2. Absorb overhead', text: 'Expenses & Costs → pool tab → absorb.', selector: '[data-nav="expenses"]', nav: 'expenses' },
          { title: '3. Complete jobs', text: 'Jobs & Costing → open each job → complete.', selector: '[data-nav="jobs"]', nav: 'jobs' },
          { title: '4. Run checklist', text: 'Reports → Month-end Close. All must be green.', selector: '[data-nav="closing"]', nav: 'closing' },
          { title: '5. Backup + Lock', text: 'Download backup, then Lock period (owner only).', selector: '[data-nav="cloud"]', nav: 'cloud' }
        ]
      }
    };

    function startTour(id) {
      var tour = TOURS[id];
      if (!tour) { E.toast('Tour not found: ' + id, 'error'); return; }
      activeTour = { id: id, tour: tour, idx: 0 };
      document.body.style.overflow = 'hidden';
      renderTourStep();
    }
    function endTour() {
      var ov = document.getElementById('ai-tour');
      if (ov) ov.remove();
      document.body.style.overflow = '';
      activeTour = null;
    }
    function nextTourStep() {
      if (!activeTour) return;
      if (activeTour.idx < activeTour.tour.steps.length - 1) {
        activeTour.idx++;
        renderTourStep();
      } else endTour();
    }
    function prevTourStep() {
      if (!activeTour || activeTour.idx === 0) return;
      activeTour.idx--;
      renderTourStep();
    }

    function renderTourStep() {
      if (!activeTour) return;
      var t = activeTour;
      var step = t.tour.steps[t.idx];
      var ov = document.getElementById('ai-tour');
      if (ov) ov.remove();

      var total = t.tour.steps.length;
      var isFirst = t.idx === 0;
      var isLast = t.idx === total - 1;

      /* If step has nav and we're not there yet, offer to navigate first */
      var navBtn = step.nav ? '<button data-a="tourGo" data-id="' + step.nav + '" style="padding:10px 18px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">→ Go to screen</button>' : '';

      /* find target */
      var target = null;
      if (step.selector) {
        try { target = document.querySelector(step.selector); } catch (e) {}
      }

      if (target) {
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }

      setTimeout(function () {
        var overlay = document.createElement('div');
        overlay.id = 'ai-tour';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;pointer-events:none;';

        var tipHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<span style="font-size:11px;text-transform:uppercase;color:#7c3aed;font-weight:800;letter-spacing:1px;">' +
              'Step ' + (t.idx + 1) + ' of ' + total +
            '</span>' +
            '<button data-a="tourEnd" style="background:none;border:none;cursor:pointer;font-size:18px;color:#999;padding:0 4px">✕</button>' +
          '</div>' +
          '<h3 style="margin:0 0 10px;font-size:17px;color:#1a1533">' + esc(step.title) + '</h3>' +
          '<p style="margin:0 0 18px;font-size:13.5px;line-height:1.65;color:#403a5c">' + esc(step.text) + '</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            navBtn +
            (!isFirst ? '<button data-a="tourPrev" style="padding:10px 16px;background:#fff;border:1px solid #e5e1f0;border-radius:10px;font-weight:600;cursor:pointer;font-size:13px;color:#403a5c">← Back</button>' : '') +
            '<span style="flex:1"></span>' +
            (isLast
              ? '<button data-a="tourEnd" style="padding:10px 20px;background:#059669;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">✓ Finish</button>'
              : '<button data-a="tourNext" style="padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">Next →</button>') +
          '</div>';

        if (target) {
          var rect = target.getBoundingClientRect();
          var spot = document.createElement('div');
          spot.style.cssText =
            'position:fixed;top:' + (rect.top - 6) + 'px;left:' + (rect.left - 6) + 'px;' +
            'width:' + (rect.width + 12) + 'px;height:' + (rect.height + 12) + 'px;' +
            'box-shadow:0 0 0 99999px rgba(10,6,24,0.85);' +
            'border-radius:12px;pointer-events:none;transition:all .3s;' +
            'outline:3px solid #7c3aed;outline-offset:2px;';
          overlay.appendChild(spot);

          /* tooltip position: below if space, above otherwise */
          var tipTop = rect.bottom + 20;
          var tipLeft = Math.max(20, Math.min(rect.left, window.innerWidth - 420));
          if (tipTop + 280 > window.innerHeight) tipTop = Math.max(20, rect.top - 300);

          var tip = document.createElement('div');
          tip.style.cssText =
            'position:fixed;top:' + tipTop + 'px;left:' + tipLeft + 'px;max-width:400px;' +
            'background:#fff;color:#1a1533;border-radius:16px;padding:22px;' +
            'box-shadow:0 20px 60px rgba(0,0,0,0.5);z-index:1000000;pointer-events:auto;' +
            'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
            'animation:aiTourFadeIn .3s ease-out;';
          tip.innerHTML = tipHTML;
          overlay.appendChild(tip);
        } else {
          /* no target — centered modal */
          var center = document.createElement('div');
          center.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:460px;width:calc(100% - 40px);' +
            'background:#fff;color:#1a1533;border-radius:20px;padding:32px;' +
            'box-shadow:0 20px 60px rgba(0,0,0,0.6);z-index:1000000;pointer-events:auto;' +
            'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;';
          center.innerHTML =
            '<div style="text-align:center;font-size:54px;margin-bottom:14px;">🎯</div>' +
            tipHTML;
          overlay.appendChild(center);

          /* dim background */
          var dim = document.createElement('div');
          dim.style.cssText = 'position:fixed;inset:0;background:rgba(10,6,24,0.7);backdrop-filter:blur(4px);pointer-events:none;';
          overlay.insertBefore(dim, center);
        }

        document.body.appendChild(overlay);
      }, 350);
    }

    /* actions for tour buttons */
    E.A.tourNext = function () { nextTourStep(); };
    E.A.tourPrev = function () { prevTourStep(); };
    E.A.tourEnd = function () { endTour(); };
    E.A.tourGo = function (id) { endTour(); location.hash = '#/' + id; };
    E.A.startTour = function (id) { startTour(id); };
    E.A.startTourMenu = function () {
      var pick = prompt('Which tour?\n\n1. Setup\n2. Daily\n3. Sales\n4. Payroll\n5. Month-end', '1');
      var map = { '1': 'setup', '2': 'daily', '3': 'sales', '4': 'payroll', '5': 'month-end' };
      if (map[pick]) startTour(map[pick]);
    };

    /* CSS animations */
    if (!document.getElementById('ai-tour-css')) {
      var css = document.createElement('style');
      css.id = 'ai-tour-css';
      css.textContent = '@keyframes aiTourFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(css);
    }

    /* ══════════════════════════════════════════════════════════════
       CHAT INTENTS (30+)
       ══════════════════════════════════════════════════════════════ */
    var INTENTS = [
      { id: 'cash', re: [/^(?:how much )?(?:cash|money)(?: do i have| in hand)?\??$/i, /^(?:cash|bank) balance/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var cash = bal('1000'), petty = bal('1010'), banks = bankAccts();
          var bt = banks.reduce(function (s, a) { return s + E.bal(a.code); }, 0);
          var out = ['**Total cash & bank: ' + m(cash + petty + bt) + '**', '', '• Cash in hand: ' + m(cash)];
          if (petty) out.push('• Petty cash: ' + m(petty));
          banks.forEach(function (a) { out.push('• ' + a.name + ': ' + m(E.bal(a.code))); });
          return { text: out.join('\n') };
        } },
      { id: 'recv', re: [/^(?:receivables|who owes me|AR|accounts receivable)/i, /^how much do customers owe/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var inv = E.rows('invoices').filter(function (i) { return !i.cancelled && i.total > i.paid; });
          var total = inv.reduce(function (s, i) { return s + (i.total - i.paid); }, 0);
          var top = {};
          inv.forEach(function (i) { top[i.partyId] = (top[i.partyId] || 0) + (i.total - i.paid); });
          var ranked = Object.keys(top).map(function (k) { return [k, top[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
          var list = ranked.map(function (r) { var p = E.D.parties.find(function (x) { return x.id === r[0]; }) || {}; return '• ' + esc(p.name || '?') + ': ' + m(r[1]); }).join('\n');
          return { text: '**Customers owe you ' + m(total) + '** across ' + inv.length + ' invoices.\n\nTop 5:\n' + (list || '—'), acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }] };
        } },
      { id: 'pay', re: [/^(?:payables|who do i owe|AP)/i, /^how much do i owe/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var b = E.rows('purchases').filter(function (p) { return !p.cancelled && p.total > p.paid; });
          var total = b.reduce(function (s, p) { return s + (p.total - p.paid); }, 0);
          return { text: '**You owe suppliers ' + m(total) + '** across ' + b.length + ' bills.', acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }] };
        } },
      { id: 'sales', re: [/^(?:sales|revenue)(?: this month)?\??$/i, /^what are my sales/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var ym = today().slice(0, 7);
          var inv = E.rows('invoices').filter(function (i) { return !i.cancelled && (i.date || '').slice(0, 7) === ym; });
          return { text: '**Sales this month: ' + m(inv.reduce(function (s, i) { return s + i.total; }, 0)) + '** across ' + inv.length + ' invoices.', acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }] };
        } },
      { id: 'profit', re: [/^(?:profit|net profit)/i, /^how much did i make/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var ym = today().slice(0, 7), inc = 0, exp = 0;
          E.rows('journalEntries').filter(function (j) { return (j.date || '').slice(0, 7) === ym; }).forEach(function (j) {
            j.lines.forEach(function (l) {
              var a = E.acct(l.acc); if (!a) return;
              if (a.type === 'income') inc += l.cr - l.dr;
              if (a.type === 'expense') exp += l.dr - l.cr;
            });
          });
          return { text: '**Profit this month: ' + m(inc - exp) + '**\n• Income: ' + m(inc) + '\n• Expenses: ' + m(exp) };
        } },
      { id: 'stock', re: [/^(?:stock|inventory)(?: value)?\??$/i, /^how much stock/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var rm = 0, fg = 0, sm = E.stockMap();
          for (var k in sm) {
            var it = E.D.items.find(function (x) { return x.id === k.split('|')[0]; });
            if (!it) continue;
            if (it.cat === 'Finished Good') fg += sm[k].value; else rm += sm[k].value;
          }
          return { text: '**Stock value: ' + m(rm + fg) + '**\n• Materials: ' + m(rm) + '\n• Finished: ' + m(fg) };
        } },
      { id: 'jobs', re: [/^(?:jobs? in progress|open jobs|active jobs)\??$/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var j = E.rows('jobs').filter(function (x) { return x.status === 'In Progress'; });
          return { text: '**' + j.length + ' job(s) in progress**', acts: [{ l: 'Open Jobs', a: 'nav', id: 'jobs' }] };
        } },
      { id: 'lowstock', re: [/low stock/i, /reorder/i, /^what do i need to buy/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var mm = E.stockMap();
          var low = E.skuList().map(function (k) { return Object.assign({}, k, mm[k.itemId + '|' + k.variantId] || { qty: 0 }); }).filter(function (k) { return k.min && k.qty <= k.min; });
          var list = low.slice(0, 8).map(function (k) { return '• ' + esc(k.code) + ' — ' + k.qty + ' (min ' + k.min + ')'; }).join('\n');
          return { text: '**' + low.length + ' item(s) at/below reorder:**\n' + (list || '—') };
        } },
      { id: 'next', re: [/^(?:what.?s? next|next step|guide me|where do i start|what do i do now|show me the steps|show guide|teach me|help me start)/i],
        run: function () {
          var p = progress(), n = nextStep();
          if (!n) return { text: '🎉 You\'ve completed all setup steps! Try asking:\n• "cash balance"\n• "who owes me"\n• "how to create invoice"' };
          return {
            text: '🎯 **Setup: ' + p.done + '/' + p.total + ' complete**\n\n**Next step:** ' + n.title + '\n' + n.desc + '\n\n_' + n.help + '_',
            acts: [
              { l: '→ Open screen', a: 'nav', id: n.nav },
              { l: '🎬 Show me (tour)', a: 'tour', id: 'setup' }
            ]
          };
        } },
      { id: 'tour', re: [/^(?:tour|show me|spotlight)/i],
        run: function () {
          return {
            text: '**Which tour would you like?**',
            acts: [
              { l: '📋 Setup Tour', a: 'tour', id: 'setup' },
              { l: '📅 Daily Tour', a: 'tour', id: 'daily' },
              { l: '💳 Sales Tour', a: 'tour', id: 'sales' },
              { l: '💰 Payroll Tour', a: 'tour', id: 'payroll' },
              { l: '🔒 Month-end Tour', a: 'tour', id: 'month-end' }
            ]
          };
        } },
      { id: 'help', re: [/^(?:help|what can you do|commands?|hi|hello)$/i, /^$/],
        run: function () {
          return { text: '**Hi! Try these:**\n\n• "cash balance"\n• "who owes me"\n• "sales this month"\n• "profit"\n• "stock value"\n• "open jobs"\n• "low stock"\n• "what\'s next"\n• "show me a tour"\n• "how to create invoice"\n• "how to run payroll"\n• "how to do opening balance"\n• "open sales"\n\nOr type **any question** — I\'ll try to help!' };
        } },
      { id: 'how-inv', re: [/how (?:to|do i) (?:create|make|post) (?:an? )?invoice/i],
        run: function () { return { text: '**Create an Invoice:**\n1. Post **Delivery Note** first (goods leave stock)\n2. **Sales → + Invoice**\n3. Select customer → tick delivery notes\n4. Enter discount if any\n5. **Create Invoice**\n\n**Posts:** Dr 1200 AR / Cr 4000 Sales', acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }] }; } },
      { id: 'how-payroll', re: [/how (?:to|do i) (?:run|do|process) payroll/i],
        run: function () { return { text: '**Run Payroll:**\n\n**Wages (all who produced):**\n1. Log production → Wages → + New Wage Run\n2. Select employees → Confirm → Post → Pay\n\n**Salaries:**\n• Daily Salaried → + Record Daily Salary\n• Monthly Salaried → + New Monthly Salary Run', acts: [{ l: 'Open Wages', a: 'nav', id: 'wages' }] }; } },
      { id: 'how-open', re: [/how (?:to|do i) (?:do|post) opening/i],
        run: function () { return { text: '**Opening Balances:**\nBest: **Setup Wizard** (System → Setup) covers everything.\n\nOr: System → Opening Balances for cash/bank/AR/AP.', acts: [{ l: 'Open Setup', a: 'nav', id: 'setup' }] }; } },
      { id: 'how-buy', re: [/how (?:to|do i) (?:buy|purchase) material/i],
        run: function () { return { text: '**Buy Materials:**\n1. Purchases → + New Purchase\n2. Supplier, date, invoice no\n3. Add item lines (rate auto-fills)\n4. Receive & Post\n\n**Posts:** Dr 1300 / Cr 2000', acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }] }; } },
      { id: 'how-close', re: [/how (?:to|do i) (?:close|finish) month/i, /month.?end/i],
        run: function () { return { text: '**Month-end Close:**\n1. Pay all wage/salary runs\n2. Absorb overhead\n3. Complete jobs\n4. Stock take\n5. Bank reconciliation\n6. Reports → Month-end Close (all green)\n7. Backup + Lock period', acts: [{ l: 'Open Close', a: 'nav', id: 'closing' }, { l: '🎬 Month-end Tour', a: 'tour', id: 'month-end' }] }; } },
      { id: 'go', re: /^(?:open|go to|show|navigate to)\s+([a-z\- ]+)/i,
        run: function (mm) {
          var t = mm[1].toLowerCase().replace(/\s+/g, '');
          var map = { dashboard: 'dashboard', items: 'items', stock: 'stock', sales: 'sales', purchases: 'purchases', jobs: 'jobs', wages: 'wages', payroll: 'wages', employees: 'employees', reports: 'reports', cash: 'accounts', bank: 'accounts', accounts: 'accounts', setup: 'setup', closing: 'closing', cloud: 'cloud', 'daily-salaries': 'daily-salaries', 'monthly-salaries': 'monthly-salaries', ai: 'ai' };
          var r = map[t];
          if (r) return { text: 'Opening **' + r + '**…', acts: [{ l: 'Go →', a: 'nav', id: r }] };
          return { text: 'I don\'t know "' + t + '". Try: items, sales, purchases, jobs, wages, setup.' };
        } }
    ];

    function matchIntent(text) {
      var t = (text || '').trim();
      for (var i = 0; i < INTENTS.length; i++) {
        for (var j = 0; j < INTENTS[i].re.length; j++) {
          var mm = t.match(INTENTS[i].re[j]);
          if (mm) return { it: INTENTS[i], m: mm };
        }
      }
      return null;
    }

    /* ─── LLM bridge (optional) ─── */
    async function askLLM(q) {
      if (cfg.provider === 'local' || !cfg.key) return null;
      var ctx = factoryReady() ? (
        'Factory: ' + E.factory().name + '\nToday: ' + today() +
        '\nCash & bank: ' + m(bal('1000') + bal('1010') + bankAccts().reduce(function (a, x) { return a + E.bal(x.code); }, 0)) +
        '\nReceivables: ' + m(E.rows('invoices').filter(function (i) { return !i.cancelled && i.total > i.paid; }).reduce(function (s, i) { return s + (i.total - i.paid); }, 0)) +
        '\nPayables: ' + m(E.rows('purchases').filter(function (p) { return !p.cancelled && p.total > p.paid; }).reduce(function (s, p) { return s + (p.total - p.paid); }, 0)) +
        '\nJobs in progress: ' + E.rows('jobs').filter(function (j) { return j.status === 'In Progress'; }).length
      ) : 'No factory open.';
      var prompt = 'You are an AI assistant for Lanka Slipper ERP (manufacturing/accounting). Answer concisely (under 150 words). Use ** bold ** and • bullets. Never invent numbers.\n\nCONTEXT:\n' + ctx + '\n\nQUESTION: ' + q;
      try {
        if (cfg.provider === 'openai') {
          var r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
            body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 400 })
          });
          var d = await r.json();
          if (d.error) throw new Error(d.error.message);
          return d.choices[0].message.content;
        }
        if (cfg.provider === 'claude') {
          var r2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: cfg.model || 'claude-3-5-haiku-20241022', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
          });
          var d2 = await r2.json();
          if (d2.error) throw new Error(d2.error.message);
          return d2.content[0].text;
        }
        if (cfg.provider === 'gemini') {
          var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (cfg.model || 'gemini-1.5-flash') + ':generateContent?key=' + cfg.key;
          var r3 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
          var d3 = await r3.json();
          if (d3.error) throw new Error(d3.error.message);
          return d3.candidates[0].content.parts[0].text;
        }
      } catch (e) { return null; }
      return null;
    }

    /* ─── dispatcher ─── */
    async function ask(q) {
      if (!q || !q.trim()) return;
      pushMsg('user', q);
      paintChat();

      if (cfg.provider !== 'local' && cfg.key) {
        pushMsg('ai', '🤔 Thinking…');
        paintChat();
        var llm = await askLLM(q);
        popMsg();
        if (llm) { pushMsg('ai', llm); paintChat(); return; }
      }

      var mt = matchIntent(q);
      if (mt) {
        try {
          var r = await mt.it.run(mt.m);
          pushMsg('ai', r.text || '', r.acts || []);
        } catch (e) { pushMsg('ai', '⚠️ ' + e.message); }
        paintChat();
        return;
      }
      pushMsg('ai', 'I didn\'t catch that. Try:\n• "cash balance"\n• "who owes me"\n• "what\'s next"\n• "show me a tour"\n• "help"');
      paintChat();
    }

    function pushMsg(r, t, a) { chatLog.push({ role: r, text: t, acts: a || [] }); }
    function popMsg() { chatLog.pop(); }

    /* ══════════════════════════════════════════════════════════════
       CHAT UI (floating panel)
       ══════════════════════════════════════════════════════════════ */
    function ensureChatCSS() {
      if (document.getElementById('ai-chat-css')) return;
      var css = document.createElement('style');
      css.id = 'ai-chat-css';
      css.textContent =
        '#ai-panel{position:fixed;right:20px;bottom:90px;z-index:999998;width:420px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100vh - 130px);background:#fff;border:1px solid #e5e1f0;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
        '#ai-panel.show{display:flex}' +
        '#ai-head{padding:16px 20px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;display:flex;justify-content:space-between;align-items:center}' +
        '#ai-head b{font-size:15px;letter-spacing:.3px}' +
        '#ai-head .badge{font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.25);margin-left:8px;text-transform:uppercase;letter-spacing:1px;font-weight:700}' +
        '#ai-head button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px}' +
        '#ai-head button:hover{background:rgba(255,255,255,.15)}' +
        '#ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafaff}' +
        '.ai-msg{max-width:90%;padding:12px 16px;border-radius:14px;font-size:13.5px;line-height:1.6;word-wrap:break-word;color:#1a1533}' +
        '.ai-msg.user{align-self:flex-end;background:#7c3aed;color:#fff;border-bottom-right-radius:4px}' +
        '.ai-msg.ai{align-self:flex-start;background:#fff;border:1px solid #e5e1f0;border-bottom-left-radius:4px}' +
        '.ai-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
        '.ai-acts button{padding:6px 14px;font-size:12px;font-weight:600;border:1px solid #7c3aed;background:#fff;color:#7c3aed;border-radius:99px;cursor:pointer;transition:all .15s}' +
        '.ai-acts button:hover{background:#7c3aed;color:#fff}' +
        '#ai-input-area{padding:12px 16px;background:#fff;border-top:1px solid #e5e1f0;display:flex;gap:8px}' +
        '#ai-input{flex:1;padding:12px 16px;border:1.5px solid #e5e1f0;border-radius:99px;font-size:13.5px;background:#fafaff;outline:none;color:#1a1533}' +
        '#ai-input:focus{border-color:#7c3aed;background:#fff}' +
        '#ai-send{width:44px;height:44px;border-radius:50%;background:#7c3aed;color:#fff;border:none;cursor:pointer;font-size:17px;flex:0 0 44px}' +
        '#ai-send:hover{background:#6d28d9}' +
        '@media(max-width:500px){#ai-panel{right:10px;left:10px;bottom:80px;width:auto;height:calc(100vh - 100px)}}';
      document.head.appendChild(css);
    }

    function buildPanel() {
      ensureChatCSS();
      if (document.getElementById('ai-panel')) return;
      var p = document.createElement('div');
      p.id = 'ai-panel';
      p.innerHTML =
        '<div id="ai-head">' +
          '<div><b>🤖 AI Assistant</b><span class="badge">' + cfg.provider + '</span></div>' +
          '<div>' +
            '<button data-a="aiTourMenu" title="Start a guided tour" style="margin-right:4px">🎬</button>' +
            '<button data-a="aiSettings" title="Settings" style="margin-right:4px">⚙</button>' +
            '<button data-a="aiClose" title="Close">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="ai-msgs"></div>' +
        '<div id="ai-input-area">' +
          '<input id="ai-input" placeholder="Ask anything… (cash, sales, who owes me, help)" autocomplete="off">' +
          '<button id="ai-send">➤</button>' +
        '</div>';
      document.body.appendChild(p);

      document.getElementById('ai-send').onclick = function () {
        var i = document.getElementById('ai-input'); var q = i.value.trim(); if (!q) return; i.value = ''; ask(q);
      };
      document.getElementById('ai-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('ai-send').click(); }
      });
      p.querySelector('[data-a="aiClose"]').onclick = function () { closePanel(); };
      p.querySelector('[data-a="aiSettings"]').onclick = function () { closePanel(); location.hash = '#/ai'; };
      p.querySelector('[data-a="aiTourMenu"]').onclick = function () { ask('show me a tour'); };

      if (!chatLog.length) {
        chatLog.push({ role: 'ai', text: '👋 Hi! I\'m your **AI Assistant**. I can:\n\n• Answer questions about your data\n• **Show you a guided tour** (click 🎬)\n• **Teach you any workflow**\n\nTry:\n• "cash balance"\n• "what\'s next"\n• "show me a tour"\n• "how to create invoice"', acts: [] });
      }
      paintChat();
    }

    function paintChat() {
      var b = document.getElementById('ai-msgs');
      if (!b) return;
      b.innerHTML = chatLog.map(function (msg, i) {
        var acts = (msg.acts || []).map(function (a) {
          return '<button data-ai-act="' + i + '|' + a.a + '|' + (a.id || '') + '">' + esc(a.l) + '</button>';
        }).join('');
        return '<div class="ai-msg ' + msg.role + '">' + md(msg.text) + (acts ? '<div class="ai-acts">' + acts + '</div>' : '') + '</div>';
      }).join('');
      b.scrollTop = b.scrollHeight;
      b.querySelectorAll('[data-ai-act]').forEach(function (btn) {
        btn.onclick = function () {
          var parts = btn.getAttribute('data-ai-act').split('|');
          var a = parts[1], id = parts[2];
          if (a === 'nav') { location.hash = '#/' + id; closePanel(); }
          else if (a === 'tour') { closePanel(); startTour(id); }
        };
      });
    }

    function openPanel() {
      buildPanel();
      document.getElementById('ai-panel').classList.add('show');
      panelOpen = true;
      setTimeout(function () { document.getElementById('ai-input').focus(); }, 100);
    }
    function closePanel() {
      var p = document.getElementById('ai-panel');
      if (p) p.classList.remove('show');
      panelOpen = false;
    }
    function toggle() { panelOpen ? closePanel() : openPanel(); }

    /* ══════════════════════════════════════════════════════════════
       DASHBOARD HERO
       ══════════════════════════════════════════════════════════════ */
    function injectHero() {
      var v = document.getElementById('v');
      if (!v) return;
      var hash = location.hash;
      var isDash = !hash || hash === '#/' || hash === '#/dashboard';

      var existing = document.getElementById('ai-hero');
      if (!isDash) { if (existing) existing.remove(); return; }
      if (existing) existing.remove();

      var p = progress();
      var next = nextStep();
      var tasks = todaysTasks();

      if (p.remaining === 0 && tasks.length === 0) return;

      var hero = document.createElement('div');
      hero.id = 'ai-hero';

      var setupHTML = '';
      if (p.remaining > 0) {
        setupHTML =
          '<div style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#3b82f6 100%);' +
            'border-radius:20px;padding:32px;color:white;margin-bottom:20px;position:relative;overflow:hidden;' +
            'box-shadow:0 20px 60px rgba(124,58,237,0.35);">' +
            '<div style="position:absolute;right:-60px;top:-60px;width:240px;height:240px;background:rgba(255,255,255,.08);border-radius:50%"></div>' +
            '<div style="position:absolute;right:100px;bottom:-100px;width:300px;height:300px;background:rgba(255,255,255,.05);border-radius:50%"></div>' +
            '<div style="position:relative;z-index:1">' +
              '<div style="display:flex;align-items:center;gap:18px;margin-bottom:20px;flex-wrap:wrap">' +
                '<div style="font-size:56px;line-height:1">🎯</div>' +
                '<div style="flex:1;min-width:200px">' +
                  '<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.85;font-weight:800">Setup Coach</div>' +
                  '<h2 style="margin:4px 0;font-size:26px;font-weight:800;color:#fff">' + p.done + ' of ' + p.total + ' complete</h2>' +
                '</div>' +
                '<div style="font-size:52px;font-weight:900;opacity:.95;line-height:1">' + Math.round(p.done / p.total * 100) + '%</div>' +
              '</div>' +
              '<div style="height:12px;background:rgba(255,255,255,.25);border-radius:99px;overflow:hidden;margin-bottom:24px">' +
                '<div style="height:100%;width:' + (p.done / p.total * 100) + '%;background:#fff;border-radius:99px;transition:width .6s"></div>' +
              '</div>' +
              (next ?
                '<div style="background:rgba(255,255,255,.15);backdrop-filter:blur(10px);border-radius:16px;padding:22px">' +
                  '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;opacity:.9;margin-bottom:8px;font-weight:700">👉 Next step</div>' +
                  '<div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">' +
                    '<div style="font-size:38px">' + next.icon + '</div>' +
                    '<div style="flex:1">' +
                      '<h3 style="margin:0;font-size:19px;color:#fff">' + esc(next.title) + '</h3>' +
                      '<p style="margin:4px 0 0;font-size:13px;opacity:.9">' + esc(next.desc) + '</p>' +
                    '</div>' +
                  '</div>' +
                  '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
                    '<button data-a="coachNextBtn" data-id="' + next.id + '"' +
                      ' style="padding:11px 22px;background:#fff;color:#7c3aed;border:none;border-radius:10px;font-weight:800;cursor:pointer;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.15)">' +
                      '→ Do this now' +
                    '</button>' +
                    '<button data-a="coachTourBtn"' +
                      ' style="padding:11px 22px;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">' +
                      '🎬 Show me (spotlight)' +
                    '</button>' +
                  '</div>' +
                '</div>' : ''
              ) +
            '</div>' +
          '</div>';
      }

      var tasksHTML = '';
      if (tasks.length > 0) {
        tasksHTML =
          '<div style="background:#fff;border:1px solid #e5e1f0;border-left:5px solid #d97706;border-radius:16px;padding:22px 24px;margin-bottom:20px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
              '<h3 style="margin:0;font-size:17px;display:flex;align-items:center;gap:10px">📋 Today\'s Tasks ' +
                '<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:800">' + tasks.length + '</span>' +
              '</h3>' +
            '</div>' +
            tasks.slice(0, 4).map(function (t) {
              return '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #f6f4fb">' +
                '<div style="font-size:28px;width:36px;text-align:center">' + t.icon + '</div>' +
                '<div style="flex:1;font-size:13.5px;color:#1a1533">' + esc(t.t) + '</div>' +
                '<button onclick="location.hash=\'#/' + t.nav + '\'" style="padding:7px 16px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">' + esc(t.navLabel) + ' →</button>' +
              '</div>';
            }).join('') +
            (tasks.length > 4 ? '<p style="margin:10px 0 0;color:#78718f;font-size:12px">+ ' + (tasks.length - 4) + ' more task(s)</p>' : '') +
          '</div>';
      }

      hero.innerHTML = setupHTML + tasksHTML;
      v.insertBefore(hero, v.firstChild);
    }

    /* actions for hero buttons */
    E.A.coachNextBtn = function (id) {
      var step = STEPS.find(function (s) { return s.id === id; });
      if (step && step.nav) location.hash = '#/' + step.nav;
    };
    E.A.coachTourBtn = function () { startTour('setup'); };

    /* watch for route changes to re-inject hero */
    var lastHash = '';
    function watchRoute() {
      var h = location.hash;
      if (h !== lastHash) {
        lastHash = h;
        setTimeout(injectHero, 300);
      }
    }
    setInterval(watchRoute, 400);
    setTimeout(injectHero, 800);

    /* also observe DOM mutations to re-inject after page render */
    var v = document.getElementById('v');
    if (v) {
      new MutationObserver(function () {
        if (!document.getElementById('ai-hero')) {
          var h = location.hash;
          if (!h || h === '#/' || h === '#/dashboard') setTimeout(injectHero, 200);
        }
      }).observe(v, { childList: true });
    }

    /* ══════════════════════════════════════════════════════════════
       SETTINGS PAGE (route)
       ══════════════════════════════════════════════════════════════ */
    E.route('ai', 'AI Assistant', function () {
      var provOpt = function (v, l) { return '<option value="' + v + '"' + (cfg.provider === v ? ' selected' : '') + '>' + l + '</option>'; };
      return '<div class="card">' +
        '<h3>🤖 AI Assistant — Settings</h3>' +
        '<p class="muted">Works offline with rule engine. Add an API key to enable open-ended questions. Your key stays on this device.</p>' +
        '<div class="g2">' +
          '<div class="f">Provider<select id="aip">' +
            provOpt('local', 'Local (offline) — free') +
            provOpt('openai', 'OpenAI') +
            provOpt('claude', 'Anthropic Claude') +
            provOpt('gemini', 'Google Gemini') +
          '</select></div>' +
          '<div class="f">Model<input id="aim" value="' + esc(cfg.model) + '" placeholder="gpt-4o-mini / claude-3-5-haiku-20241022 / gemini-1.5-flash"></div>' +
          '<div class="f">API Key<input id="aik" type="password" value="' + esc(cfg.key) + '" placeholder="sk-..."></div>' +
        '</div>' +
        '<button class="btn p" data-a="aiSave">Save</button> <button class="btn" data-a="aiTest">Test connection</button>' +
        '<div id="ai-save-msg" class="muted" style="margin-top:10px"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>🎬 Guided tours available</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px">' +
          '<button data-a="startTourX" data-id="setup" class="btn" style="padding:16px;flex-direction:column;height:auto;text-align:center"><div style="font-size:32px">🎯</div><b style="margin-top:6px">Setup Tour</b><span class="muted" style="font-size:11px">20 steps</span></button>' +
          '<button data-a="startTourX" data-id="daily" class="btn" style="padding:16px;flex-direction:column;height:auto;text-align:center"><div style="font-size:32px">📅</div><b style="margin-top:6px">Daily Tour</b><span class="muted" style="font-size:11px">5 steps</span></button>' +
          '<button data-a="startTourX" data-id="sales" class="btn" style="padding:16px;flex-direction:column;height:auto;text-align:center"><div style="font-size:32px">💳</div><b style="margin-top:6px">Sales Tour</b><span class="muted" style="font-size:11px">4 steps</span></button>' +
          '<button data-a="startTourX" data-id="payroll" class="btn" style="padding:16px;flex-direction:column;height:auto;text-align:center"><div style="font-size:32px">💰</div><b style="margin-top:6px">Payroll Tour</b><span class="muted" style="font-size:11px">4 steps</span></button>' +
          '<button data-a="startTourX" data-id="month-end" class="btn" style="padding:16px;flex-direction:column;height:auto;text-align:center"><div style="font-size:32px">🔒</div><b style="margin-top:6px">Month-end Tour</b><span class="muted" style="font-size:11px">6 steps</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Commands</h3>' +
        '<div class="tw"><table><tbody>' +
          '<tr><td><code>cash balance</code></td><td>Total cash & bank</td></tr>' +
          '<tr><td><code>who owes me</code></td><td>Receivables + top debtors</td></tr>' +
          '<tr><td><code>sales this month</code></td><td>Total invoiced</td></tr>' +
          '<tr><td><code>profit</code></td><td>Net profit this month</td></tr>' +
          '<tr><td><code>what\'s next</code></td><td>Next setup step</td></tr>' +
          '<tr><td><code>show me a tour</code></td><td>Start a guided tour</td></tr>' +
          '<tr><td><code>how to create invoice</code></td><td>Step guide</td></tr>' +
          '<tr><td><code>help</code></td><td>Full command list</td></tr>' +
        '</tbody></table></div>' +
        '<p class="muted" style="margin-top:10px"><kbd>Ctrl</kbd>+<kbd>K</kbd> opens the assistant anywhere.</p>' +
      '</div>';
    });

    E.A.aiSave = function () {
      cfg.provider = E.val('aip');
      cfg.model = E.val('aim');
      cfg.key = E.val('aik');
      saveCfg();
      E.$('ai-save-msg').textContent = '✅ Saved';
    };
    E.A.aiTest = async function () {
      if (cfg.provider === 'local') { E.$('ai-save-msg').textContent = '✅ Local engine active'; return; }
      if (!cfg.key) { E.$('ai-save-msg').textContent = '❌ Enter API key'; return; }
      E.$('ai-save-msg').textContent = 'Testing…';
      var r = await askLLM('Reply "ok"');
      E.$('ai-save-msg').textContent = r ? '✅ Connected: ' + r.slice(0, 60) : '❌ Failed. Check key/model/network.';
    };
    E.A.startTourX = function (id) { startTour(id); };

    /* ══════════════════════════════════════════════════════════════
       NAV + ROUTE REGISTRATION (guarded — no duplicates)
       ══════════════════════════════════════════════════════════════ */
    if (!E.N.some(function (n) { return n.id === 'ai'; })) {
      E.nav('System', 'ai', '🤖', 'AI Assistant');
    }

    /* ══════════════════════════════════════════════════════════════
       Ctrl+K SHORTCUT
       ══════════════════════════════════════════════════════════════ */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggle();
      }
    });

    /* ══════════════════════════════════════════════════════════════
       EXPOSE PUBLIC API
       ══════════════════════════════════════════════════════════════ */
    E.AI = {
      ask: ask, open: openPanel, close: closePanel, toggle: toggle,
      startTour: startTour, endTour: endTour,
      nextStep: nextTourStep, prevStep: prevTourStep,
      progress: progress, nextSetupStep: nextStep, todaysTasks: todaysTasks,
      getConfig: function () { return Object.assign({}, cfg); }
    };

    /* update FAB to fully working */
    if (FAB) {
      FAB.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
      FAB.textContent = '🤖';
      FAB.onclick = toggle;
    }
  }
})();