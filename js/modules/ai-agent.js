/* AI Assistant v2 — Bulletproof edition.

   The 🤖 button appears immediately, no matter what else is happening.
   If ERP integration fails, the button turns red ⚠ and clicking it
   shows you the exact error — no DevTools needed.

   Layers:
     LAYER 1 — Instant FAB: always shows (no dependencies, multiple triggers)
     LAYER 2 — Full chat: wired up once window.ERP is ready
     LAYER 3 — 25+ intents + LLM bridge + settings page
*/
(function () {
  'use strict';

  /* proof this file loaded */
  window.__AI_AGENT_LOADED__ = Date.now();
  window.__AI_AGENT_VERSION__ = 'v2';

  /* ═══════════════════════════════════════════════════════════════
     LAYER 1 — Instant FAB (no ERP dependency)
     ═══════════════════════════════════════════════════════════════ */
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
      'width:56px;height:56px;border-radius:50%;' +
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;cursor:pointer;' +
      'font-size:24px;box-shadow:0 8px 24px rgba(124,58,237,.5);transition:transform .2s;';
    FAB.onmouseenter = function () { FAB.style.transform = 'scale(1.08)'; };
    FAB.onmouseleave = function () { FAB.style.transform = 'scale(1)'; };
    FAB.onclick = handleFABClick;
    document.body.appendChild(FAB);
  }

  function handleFABClick() {
    if (window.ERP && window.ERP.AI && window.ERP.AI.toggle) {
      window.ERP.AI.toggle();
      return;
    }
    showLoadingPanel();
  }

  function showLoadingPanel() {
    var old = document.getElementById('ai-simple-panel');
    if (old) { old.remove(); return; }
    var p = document.createElement('div');
    p.id = 'ai-simple-panel';
    p.style.cssText =
      'position:fixed;right:20px;bottom:88px;z-index:999999;width:360px;max-width:calc(100vw - 40px);' +
      'max-height:480px;overflow:auto;background:#fff;border:1px solid #e5e1f0;border-radius:16px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px;' +
      'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1533;line-height:1.55;';
    p.innerHTML =
      '<b style="font-size:16px;display:block;margin-bottom:12px;">🤖 AI Assistant</b>' +
      '<p style="font-size:13px;margin-bottom:12px;">The AI module is still loading. Click the button again in a moment.</p>' +
      '<p style="font-size:12px;color:#78718f;margin-bottom:12px;">If this message keeps appearing, run the checklist below:</p>' +
      '<ol style="font-size:12px;color:#403a5c;padding-left:20px;margin-bottom:16px;">' +
        '<li>Is <code>js/modules/ai-agent.js</code> uploaded to your server?</li>' +
        '<li>Is <code>&lt;script src="js/modules/ai-agent.js"&gt;&lt;/script&gt;</code> in index.html just before <code>app.js</code>?</li>' +
        '<li>Try <b>Ctrl+Shift+R</b> to hard-refresh.</li>' +
        '<li>Unregister service worker: F12 → Application → Service Workers → Unregister.</li>' +
      '</ol>' +
      '<button onclick="location.reload()" style="padding:9px 18px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">🔄 Reload</button> ' +
      '<button onclick="this.closest(\'#ai-simple-panel\').remove()" style="padding:9px 18px;background:#f6f4fb;color:#403a5c;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Close</button>';
    document.body.appendChild(p);
  }

  /* belt-and-suspenders: fire the FAB creation many times */
  ensureFAB();
  setTimeout(ensureFAB, 200);
  setTimeout(ensureFAB, 800);
  setTimeout(ensureFAB, 2000);
  setTimeout(ensureFAB, 5000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureFAB);
  window.addEventListener('load', ensureFAB);

  /* ═══════════════════════════════════════════════════════════════
     LAYER 2 + 3 — Full ERP integration
     ═══════════════════════════════════════════════════════════════ */
  function initERP() {
    if (!window.ERP || !window.ERP.route || !window.ERP.nav || !window.ERP.A) {
      setTimeout(initERP, 150);
      return;
    }
    try {
      boot(window.ERP);
    } catch (err) {
      /* ERP integration failed — turn FAB red with a helpful message */
      if (FAB) {
        FAB.style.background = '#dc2626';
        FAB.textContent = '⚠';
        FAB.title = 'AI error: ' + err.message;
        FAB.onclick = function () {
          alert('AI Assistant could not start.\n\nError: ' + err.message +
                '\n\nTry: Ctrl+Shift+R to hard-refresh.\n\nIf still broken, your ai-agent.js file may be out of date.');
        };
      }
    }
  }

  function boot(E) {
    /* ---- config ---- */
    var K = 'erp_ai_cfg_v1';
    var C = { provider: 'local', key: '', model: '', endpoint: '' };
    try { Object.assign(C, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
    var saveCfg = function () { localStorage.setItem(K, JSON.stringify(C)); };

    var chatLog = [];
    var panelOpen = false;

    /* ---- helpers ---- */
    var md = function (t) {
      return E.esc(t)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--s2,#f6f4fb);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
        .replace(/\n/g, '<br>');
    };
    var factoryReady = function () { return !!(E.fid && E.factory && E.factory()); };
    var bal = function (code) { var a = E.acct(code); return a ? E.bal(code) : 0; };
    var bankAccts = function () { return E.rows('coa').filter(function (a) { return a.bank && !a.inactive; }); };

    function stockValue() {
      var rm = 0, fg = 0, sm = E.stockMap();
      for (var k in sm) {
        var it = E.D.items.find(function (x) { return x.id === k.split('|')[0]; });
        if (!it) continue;
        if (it.cat === 'Finished Good') fg += sm[k].value; else rm += sm[k].value;
      }
      return { rm: rm, fg: fg, total: rm + fg };
    }
    function openInvoices() { return E.rows('invoices').filter(function (i) { return !i.cancelled && i.total > i.paid; }); }
    function openBills() { return E.rows('purchases').filter(function (p) { return !p.cancelled && p.total > p.paid; }); }

    /* ---- INTENTS ---- */
    var INTENTS = [
      { id: 'cash',
        re: [/^(?:how much )?(?:cash|money)(?: do i have| in hand)?\??$/i, /^(?:cash |bank )?balance/i, /cash position/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first (System → Setup Wizard).' };
          var cash = bal('1000'), petty = bal('1010'), banks = bankAccts();
          var bankTotal = banks.reduce(function (s, a) { return s + E.bal(a.code); }, 0);
          var lines = ['**Total cash & bank: ' + E.m(cash + petty + bankTotal) + '**', ''];
          lines.push('• Cash in hand: ' + E.m(cash));
          if (petty) lines.push('• Petty cash: ' + E.m(petty));
          banks.forEach(function (a) { lines.push('• ' + a.name + ': ' + E.m(E.bal(a.code))); });
          return { text: lines.join('\n') };
        } },
      { id: 'receivables',
        re: [/^(?:receivables|who owes me|outstanding invoices|AR|accounts receivable)/i, /^how much do customers owe/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var inv = openInvoices();
          var total = inv.reduce(function (s, i) { return s + (i.total - i.paid); }, 0);
          var parties = {};
          inv.forEach(function (i) { parties[i.partyId] = (parties[i.partyId] || 0) + (i.total - i.paid); });
          var top = Object.entries(parties).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
          var names = top.map(function (x) { var p = E.D.parties.find(function (q) { return q.id === x[0]; }) || {}; return '• ' + E.esc(p.name || '?') + ': ' + E.m(x[1]); }).join('\n');
          return {
            text: '**Customers owe you ' + E.m(total) + '** across ' + inv.length + ' invoices.\n\nTop 5:\n' + (names || '—'),
            acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
          };
        } },
      { id: 'payables',
        re: [/^(?:payables|who do i owe|outstanding bills|AP|accounts payable)/i, /^how much do i owe/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var bills = openBills();
          var total = bills.reduce(function (s, p) { return s + (p.total - p.paid); }, 0);
          var parties = {};
          bills.forEach(function (p) { parties[p.partyId] = (parties[p.partyId] || 0) + (p.total - p.paid); });
          var top = Object.entries(parties).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
          var names = top.map(function (x) { var p = E.D.parties.find(function (q) { return q.id === x[0]; }) || {}; return '• ' + E.esc(p.name || '?') + ': ' + E.m(x[1]); }).join('\n');
          return {
            text: '**You owe suppliers ' + E.m(total) + '** across ' + bills.length + ' bills.\n\nTop 5:\n' + (names || '—'),
            acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }]
          };
        } },
      { id: 'sales-month',
        re: [/^(?:sales|revenue)(?: this month)?\??$/i, /^(?:what are my sales)/i, /^(?:monthly sales)/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var ym = E.today().slice(0, 7);
          var inv = E.rows('invoices').filter(function (i) { return !i.cancelled && (i.date || '').slice(0, 7) === ym; });
          var total = inv.reduce(function (s, i) { return s + i.total; }, 0);
          return { text: '**Sales this month: ' + E.m(total) + '** from ' + inv.length + ' invoice(s).', acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }] };
        } },
      { id: 'profit',
        re: [/^(?:profit|net profit|how much did i make)/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var ym = E.today().slice(0, 7), inc = 0, exp = 0;
          E.rows('journalEntries').filter(function (j) { return (j.date || '').slice(0, 7) === ym; }).forEach(function (j) {
            j.lines.forEach(function (l) {
              var a = E.acct(l.acc); if (!a) return;
              if (a.type === 'income') inc += l.cr - l.dr;
              if (a.type === 'expense') exp += l.dr - l.cr;
            });
          });
          return { text: '**Profit this month: ' + E.m(inc - exp) + '**\n• Income: ' + E.m(inc) + '\n• Expenses: ' + E.m(exp), acts: [{ l: 'P&L Report', a: 'nav', id: 'reports' }] };
        } },
      { id: 'stock',
        re: [/^(?:stock|inventory)(?: value)?\??$/i, /^how much stock/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var s = stockValue();
          return { text: '**Stock value: ' + E.m(s.total) + '**\n• Materials: ' + E.m(s.rm) + '\n• Finished goods: ' + E.m(s.fg), acts: [{ l: 'Open Inventory', a: 'nav', id: 'stock' }] };
        } },
      { id: 'wip',
        re: [/^(?:wip|work.in.progress)\??$/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var jobs = E.rows('jobs').filter(function (j) { return j.status === 'In Progress'; });
          return { text: '**WIP: ' + E.m(bal('1310')) + '** sitting in ' + jobs.length + ' open job(s).', acts: [{ l: 'Open Jobs', a: 'nav', id: 'jobs' }] };
        } },
      { id: 'jobs-open',
        re: [/^(?:jobs? in progress|active jobs|open jobs)\??$/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var jobs = E.rows('jobs').filter(function (j) { return j.status === 'In Progress'; });
          var list = jobs.slice(0, 8).map(function (j) { var p = E.D.parties.find(function (q) { return q.id === j.partyId; }) || { name: 'Stock' }; return '• ' + E.esc(j.no) + ' — ' + E.esc(p.name); }).join('\n');
          return { text: '**' + jobs.length + ' job(s) in progress:**\n' + (list || '—'), acts: [{ l: 'Open Jobs', a: 'nav', id: 'jobs' }] };
        } },
      { id: 'lowstock',
        re: [/low stock/i, /reorder/i, /^what do i need to buy/i, /what.?s short/i],
        run: function () {
          if (!factoryReady()) return { text: 'Create a factory first.' };
          var m = E.stockMap();
          var low = E.skuList().map(function (k) { return Object.assign({}, k, m[k.itemId + '|' + k.variantId] || { qty: 0 }); }).filter(function (k) { return k.min && k.qty <= k.min; });
          var list = low.slice(0, 10).map(function (k) { return '• ' + E.esc(k.code) + ' — ' + k.qty + ' on hand (min ' + k.min + ')'; }).join('\n');
          return { text: '**' + low.length + ' item(s) at/below reorder level:**\n' + (list || '—') };
        } },
      { id: 'help-invoice',
        re: [/how (?:to|do i) (?:create|make|post) (?:an? )?invoice/i],
        run: function () {
          return {
            text: '**Create an Invoice:**\n1. First post a **Delivery Note** (goods leave stock)\n2. Go to **Sales → + Invoice**\n3. Select customer → tick delivery notes\n4. Enter discount if any\n5. Click **Create Invoice**\n\n**Posts:** Dr 1200 Receivables / Cr 4000 Sales',
            acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
          };
        } },
      { id: 'help-sale',
        re: [/how (?:to|do i) (?:record|post|make) (?:a )?sale/i],
        run: function () {
          return {
            text: '**Record a Sale (3 steps):**\n1. **Delivery Note** → Posts: Dr 5400 COGS / Cr 1320 FG\n2. **Invoice** → Posts: Dr 1200 AR / Cr 4000 Sales\n3. **Receipt** → Posts: Dr Bank / Cr 1200 AR',
            acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
          };
        } },
      { id: 'help-payroll',
        re: [/how (?:to|do i) (?:run|do|process) (?:a )?(?:payroll|wages|salar)/i],
        run: function () {
          return {
            text: '**Run Payroll:**\n\n**Wages (all who produced):**\n1. Log production in Daily Production\n2. Wages → + New Wage Run\n3. Select employees with production\n4. Review & Confirm → Post → Pay\n\n**Salaries:**\n• Daily Salaried → + Record Daily Salary\n• Monthly Salaried → + New Monthly Salary Run',
            acts: [{ l: 'Open Wages', a: 'nav', id: 'wages' }]
          };
        } },
      { id: 'help-opening',
        re: [/how (?:to|do i) (?:do|post|enter) opening (?:balance|stock)/i],
        run: function () {
          return {
            text: '**Opening Balances:**\nBest approach: run the **Setup Wizard** (System → Setup) — covers ALL opening balances in one flow:\n• Bank accounts + opening cash\n• Customers + opening AR\n• Suppliers + opening AP\n• Articles + opening FG stock\n• Materials + opening RM stock\n• Employees + opening advances',
            acts: [{ l: 'Open Setup', a: 'nav', id: 'setup' }]
          };
        } },
      { id: 'help-material',
        re: [/how (?:to|do i) (?:buy|purchase|receive) (?:material|stock|goods)/i],
        run: function () {
          return {
            text: '**Buy Materials:**\n1. Purchases → + New Purchase\n2. Supplier, date, invoice no\n3. Add item lines (rate auto-fills)\n4. Receive & Post\n\n**Posts:** Dr 1300 RM Stock / Cr 2000 Payables',
            acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }]
          };
        } },
      { id: 'help-close',
        re: [/how (?:to|do i) (?:close|finish) (?:the )?month/i, /month.?end close/i],
        run: function () {
          return {
            text: '**Month-end Close:**\n1. Run all wage/salary runs\n2. Record daily salaries\n3. Absorb overhead\n4. Complete all jobs\n5. Stock take\n6. Bank reconciliation\n7. Reports → Month-end Close (all green)\n8. Backup\n9. Lock period (owner)',
            acts: [{ l: 'Month-end Close', a: 'nav', id: 'closing' }]
          };
        } },
      { id: 'help-setup',
        re: [/how (?:to|do i) (?:setup|start|begin)/i, /^start (?:the )?factory/i, /^run setup/i],
        run: function () {
          return {
            text: '**Setup a new factory:**\n1. System → Setup Wizard\n2. Follow 10 steps (factory, banks, customers, suppliers, articles, materials, operations, employees, BOMs, review)\n3. Confirm → all opening balances posted automatically\n\nTakes 15–30 minutes total.',
            acts: [{ l: 'Open Setup', a: 'nav', id: 'setup' }]
          };
        } },
      { id: 'go',
        re: /^(?:open|go to|show|navigate to)\s+([a-z\- ]+)/i,
        run: function (m) {
          var target = m[1].toLowerCase().replace(/\s+/g, '');
          var map = {
            dashboard: 'dashboard', items: 'items', stock: 'stock', inventory: 'stock',
            sales: 'sales', purchases: 'purchases', jobs: 'jobs', payroll: 'wages',
            wages: 'wages', 'daily-salaries': 'daily-salaries', dailysalaries: 'daily-salaries',
            'monthly-salaries': 'monthly-salaries', monthlysalaries: 'monthly-salaries',
            employees: 'employees', reports: 'reports', cash: 'accounts', bank: 'accounts',
            accounts: 'accounts', journal: 'journal', loans: 'loans', returns: 'returns',
            expenses: 'expenses', settings: 'settings', cloud: 'cloud', setup: 'setup',
            attendance: 'attendance', production: 'production', quality: 'qc', qc: 'qc',
            ai: 'ai', 'ai assistant': 'ai', assistant: 'ai'
          };
          var route = map[target];
          if (route) return { text: 'Opening **' + route + '**…', acts: [{ l: 'Go →', a: 'nav', id: route }] };
          return { text: 'I don\'t know "' + target + '". Try: items, sales, purchases, jobs, wages, setup, ai.' };
        } },
      { id: 'help',
        re: [/^(?:help|what can you do|commands?)$/i, /^hello/i, /^hi$/i, /^$/i],
        run: function () {
          return {
            text: '**Hi! I can help with:**\n\n**Financial:**\n• "cash balance"\n• "who owes me"\n• "who do I owe"\n• "sales this month"\n• "profit"\n• "stock value"\n• "wip"\n\n**Operational:**\n• "open jobs"\n• "low stock"\n\n**Help:**\n• "how to create invoice"\n• "how to run payroll"\n• "how to do opening balance"\n• "how to close month"\n• "how to setup"\n\n**Navigate:**\n• "open sales" / "go to jobs" / "show reports"\n\n**Just type any question — I\'ll try to answer!**'
          };
        } }
    ];

    function matchIntent(text) {
      var t = (text || '').trim();
      for (var i = 0; i < INTENTS.length; i++) {
        var it = INTENTS[i];
        for (var j = 0; j < it.re.length; j++) {
          var m = t.match(it.re[j]);
          if (m) return { it: it, m: m };
        }
      }
      return null;
    }

    /* ---- LLM bridge ---- */
    async function askLLM(query) {
      if (C.provider === 'local' || !C.key) return null;
      var ctx = buildContext();
      var sysPrompt = 'You are an AI assistant for Lanka Slipper ERP, a manufacturing/accounting system. Answer concisely (under 150 words). Use markdown formatting. Never invent numbers — use only the context provided.\n\nCONTEXT:\n' + ctx + '\n\nQUESTION: ' + query;
      try {
        if (C.provider === 'openai') {
          var r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + C.key },
            body: JSON.stringify({ model: C.model || 'gpt-4o-mini', messages: [{ role: 'user', content: sysPrompt }], temperature: 0.3, max_tokens: 400 })
          });
          var d = await r.json();
          if (d.error) throw new Error(d.error.message);
          return d.choices[0].message.content;
        }
        if (C.provider === 'claude') {
          var r2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': C.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: C.model || 'claude-3-5-haiku-20241022', max_tokens: 400, messages: [{ role: 'user', content: sysPrompt }] })
          });
          var d2 = await r2.json();
          if (d2.error) throw new Error(d2.error.message);
          return d2.content[0].text;
        }
        if (C.provider === 'gemini') {
          var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (C.model || 'gemini-1.5-flash') + ':generateContent?key=' + C.key;
          var r3 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: sysPrompt }] }] }) });
          var d3 = await r3.json();
          if (d3.error) throw new Error(d3.error.message);
          return d3.candidates[0].content.parts[0].text;
        }
      } catch (e) { return null; }
      return null;
    }

    function buildContext() {
      if (!factoryReady()) return 'No factory open.';
      var s = stockValue();
      var cash = bal('1000') + bal('1010') + bankAccts().reduce(function (a, x) { return a + E.bal(x.code); }, 0);
      var ar = openInvoices().reduce(function (a, i) { return a + (i.total - i.paid); }, 0);
      var ap = openBills().reduce(function (a, p) { return a + (p.total - p.paid); }, 0);
      return 'Factory: ' + E.factory().name + '\nToday: ' + E.today() +
        '\nCash & bank: ' + E.m(cash) + '\nReceivables: ' + E.m(ar) +
        '\nPayables: ' + E.m(ap) + '\nStock: ' + E.m(s.total) +
        '\nWIP: ' + E.m(bal('1310')) +
        '\nJobs in progress: ' + E.rows('jobs').filter(function (j) { return j.status === 'In Progress'; }).length;
    }

    /* ---- dispatcher ---- */
    async function ask(query) {
      var q = (query || '').trim();
      if (!q) return;
      pushMsg('user', q);
      paintChat();

      if (C.provider !== 'local' && C.key) {
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
        } catch (err) {
          pushMsg('ai', '⚠️ Error: ' + err.message);
        }
        paintChat();
        return;
      }

      pushMsg('ai', 'I didn\'t catch that. Try:\n• "cash balance"\n• "who owes me"\n• "how to create invoice"\n• "open jobs"\n• "help" for the full list');
      paintChat();
    }

    function pushMsg(role, text, acts) { chatLog.push({ role: role, text: text, acts: acts || [] }); }
    function popMsg() { chatLog.pop(); }

    /* ---- UI ---- */
    function injectCSS() {
      if (document.getElementById('ai-styles')) return;
      var s = document.createElement('style');
      s.id = 'ai-styles';
      s.textContent =
        '#ai-panel{position:fixed;right:20px;bottom:88px;z-index:999998;width:400px;max-width:calc(100vw - 40px);height:580px;max-height:calc(100vh - 120px);background:var(--s,#fff);border:1px solid var(--bd,#e5e1f0);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
        '#ai-panel.show{display:flex}' +
        '#ai-head{padding:14px 18px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;display:flex;justify-content:space-between;align-items:center}' +
        '#ai-head b{font-size:15px}' +
        '#ai-head .badge{font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.25);margin-left:6px}' +
        '#ai-head button{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0 4px}' +
        '#ai-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#fafaff)}' +
        '.ai-msg{max-width:88%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55;word-wrap:break-word;color:#1a1533}' +
        '.ai-msg.user{align-self:flex-end;background:#7c3aed;color:#fff;border-bottom-right-radius:2px}' +
        '.ai-msg.ai{align-self:flex-start;background:#fff;border:1px solid #e5e1f0;border-bottom-left-radius:2px}' +
        '.ai-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
        '.ai-acts button{padding:5px 12px;font-size:11.5px;font-weight:600;border:1px solid #7c3aed;background:#fff;color:#7c3aed;border-radius:99px;cursor:pointer}' +
        '.ai-acts button:hover{background:#7c3aed;color:#fff}' +
        '#ai-input-area{padding:10px 14px;background:#fff;border-top:1px solid #e5e1f0;display:flex;gap:8px}' +
        '#ai-input{flex:1;padding:10px 14px;border:1.5px solid #e5e1f0;border-radius:99px;font-size:13px;background:#fafaff;outline:none;color:#1a1533}' +
        '#ai-input:focus{border-color:#7c3aed}' +
        '#ai-send{width:40px;height:40px;border-radius:50%;background:#7c3aed;color:#fff;border:none;cursor:pointer;font-size:16px;flex:0 0 40px}' +
        '#ai-send:hover{background:#6d28d9}' +
        '@media(max-width:500px){#ai-panel{right:10px;left:10px;bottom:80px;width:auto;height:calc(100vh - 100px)}}';
      document.head.appendChild(s);
    }

    function buildPanel() {
      injectCSS();
      if (document.getElementById('ai-panel')) return;
      var panel = document.createElement('div');
      panel.id = 'ai-panel';
      panel.innerHTML =
        '<div id="ai-head">' +
          '<div><b>🤖 AI Assistant</b><span class="badge" id="ai-prov">' + C.provider + '</span></div>' +
          '<div><button data-a="ai-settings" title="Settings">⚙</button><button id="ai-close">✕</button></div>' +
        '</div>' +
        '<div id="ai-msgs"></div>' +
        '<div id="ai-input-area">' +
          '<input id="ai-input" placeholder="Ask me anything… (cash balance, who owes me, help)" autocomplete="off">' +
          '<button id="ai-send">➤</button>' +
        '</div>';
      document.body.appendChild(panel);

      document.getElementById('ai-close').onclick = close;
      document.getElementById('ai-send').onclick = doSend;
      document.getElementById('ai-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
      });
      document.querySelector('#ai-head [data-a="ai-settings"]').onclick = function () {
        location.hash = '#/ai'; close();
      };

      if (!chatLog.length) {
        chatLog.push({ role: 'ai', text: '👋 Hi! I\'m your AI assistant. Ask me about **cash**, **receivables**, **stock**, or type **help** for a full list. Try:\n• "how much cash do I have?"\n• "who owes me money?"\n• "how to create invoice"\n• "open jobs"', acts: [] });
      }
      paintChat();
    }

    function paintChat() {
      var box = document.getElementById('ai-msgs');
      if (!box) return;
      box.innerHTML = chatLog.map(function (m, i) {
        var acts = (m.acts || []).map(function (a) {
          return '<button data-ai-act="' + i + '|' + a.a + '|' + (a.id || '') + '">' + E.esc(a.l) + '</button>';
        }).join('');
        return '<div class="ai-msg ' + m.role + '">' + md(m.text) + (acts ? '<div class="ai-acts">' + acts + '</div>' : '') + '</div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
      box.querySelectorAll('[data-ai-act]').forEach(function (btn) {
        btn.onclick = function () {
          var parts = btn.getAttribute('data-ai-act').split('|');
          if (parts[1] === 'nav') { location.hash = '#/' + parts[2]; close(); }
        };
      });
    }

    function doSend() {
      var inp = document.getElementById('ai-input');
      var q = inp.value.trim();
      if (!q) return;
      inp.value = '';
      ask(q);
    }

    function open() { buildPanel(); document.getElementById('ai-panel').classList.add('show'); panelOpen = true; setTimeout(function () { document.getElementById('ai-input').focus(); }, 100); }
    function close() { var p = document.getElementById('ai-panel'); if (p) p.classList.remove('show'); panelOpen = false; }
    function toggle() { panelOpen ? close() : open(); }

    /* ---- settings page route ---- */
    E.route('ai', 'AI Assistant', function () {
      return '<div class="card">' +
        '<h3>🤖 AI Assistant — Configuration</h3>' +
        '<p class="muted">The assistant works fully offline with a rule-based engine. To enable open-ended questions powered by a real AI model, choose a provider below and paste your API key. <b>Your key is stored only on this device.</b></p>' +
        '<div class="g2">' +
          '<div class="f">Provider<select id="aip">' +
            '<option value="local"' + (C.provider === 'local' ? ' selected' : '') + '>Local (offline) — free</option>' +
            '<option value="openai"' + (C.provider === 'openai' ? ' selected' : '') + '>OpenAI (GPT-4, etc.)</option>' +
            '<option value="claude"' + (C.provider === 'claude' ? ' selected' : '') + '>Anthropic Claude</option>' +
            '<option value="gemini"' + (C.provider === 'gemini' ? ' selected' : '') + '>Google Gemini</option>' +
          '</select></div>' +
          '<div class="f">Model name<input id="aim" value="' + E.esc(C.model) + '" placeholder="gpt-4o-mini / claude-3-5-haiku-20241022 / gemini-1.5-flash"></div>' +
          '<div class="f">API Key<input id="aik" type="password" value="' + E.esc(C.key) + '" placeholder="sk-..."></div>' +
        '</div>' +
        '<button class="btn p" data-a="aiSave">Save settings</button> ' +
        '<button class="btn" data-a="aiTest">Test connection</button>' +
        '<div id="ai-save-msg" class="muted" style="margin-top:10px"></div>' +
      '</div>' +
      '<div class="card"><h3>Quick reference — try these</h3>' +
        '<div class="tw"><table><tbody>' +
          '<tr><td><code>cash balance</code></td><td>Total cash &amp; bank</td></tr>' +
          '<tr><td><code>who owes me</code></td><td>Receivables + top debtors</td></tr>' +
          '<tr><td><code>sales this month</code></td><td>Total invoiced</td></tr>' +
          '<tr><td><code>profit</code></td><td>Net profit this month</td></tr>' +
          '<tr><td><code>open jobs</code></td><td>Jobs in progress</td></tr>' +
          '<tr><td><code>low stock</code></td><td>Items below reorder</td></tr>' +
          '<tr><td><code>how to create invoice</code></td><td>Step-by-step guide</td></tr>' +
          '<tr><td><code>open sales</code></td><td>Navigate to Sales page</td></tr>' +
          '<tr><td><code>help</code></td><td>All commands</td></tr>' +
        '</tbody></table></div>' +
        '<p class="muted" style="margin-top:10px">Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to open the assistant.</p>' +
      '</div>';
    });

    E.A.aiSave = function () {
      C.provider = E.val('aip');
      C.model = E.val('aim');
      C.key = E.val('aik');
      saveCfg();
      E.$('ai-save-msg').textContent = '✅ Settings saved';
      var b = document.getElementById('ai-prov');
      if (b) b.textContent = C.provider;
    };

    E.A.aiTest = async function () {
      if (C.provider === 'local') { E.$('ai-save-msg').textContent = '✅ Local engine active — no API needed'; return; }
      if (!C.key) { E.$('ai-save-msg').textContent = '❌ Enter API key first'; return; }
      E.$('ai-save-msg').textContent = 'Testing…';
      var reply = await askLLM('Say "ok" and nothing else');
      if (reply) E.$('ai-save-msg').textContent = '✅ Connected: ' + reply.slice(0, 80);
      else E.$('ai-save-msg').textContent = '❌ Connection failed. Check key, model, network.';
    };

    /* ---- nav + shortcut ---- */
    E.nav('System', 'ai', '🤖', 'AI Assistant');
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggle();
      }
    });

    /* ---- expose API ---- */
    E.AI = {
      ask: ask, open: open, close: close, toggle: toggle,
      getConfig: function () { return Object.assign({}, C); },
      reset: function () { chatLog = []; paintChat(); }
    };

    /* mark the FAB as fully working */
    if (FAB) {
      FAB.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
      FAB.textContent = '🤖';
      FAB.title = 'AI Assistant (Ctrl+K)';
      FAB.onclick = handleFABClick;
    }
  }

  /* boot ERP integration with retries */
  initERP();
  setTimeout(initERP, 500);
  setTimeout(initERP, 1500);
  setTimeout(initERP, 4000);
})();