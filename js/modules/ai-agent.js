/* AI Copilot — floating chat widget + rule engine + optional LLM.
   Provides 25+ data queries, task guidance, navigation, and help.
   Optional LLM integration (OpenAI, Claude, Gemini, or custom).
   All settings stored locally — API key never leaves the browser
   except when calling the user's chosen LLM endpoint directly. */
(E => {
  /* ─── Config ─── */
  const K = 'erp_ai_cfg_v1';
  let C = { provider: 'local', key: '', model: '', endpoint: '' };
  try { Object.assign(C, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
  const saveCfg = () => localStorage.setItem(K, JSON.stringify(C));

  let chatLog = [];  // [{role:'user'|'ai', text, acts}]
  let panelOpen = false;

  /* ─── tiny markdown ─── */
  const md = t => E.esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--s2);padding:1px 5px;border-radius:4px">$1</code>')
    .replace(/^• /gm, '• ')
    .replace(/\n/g, '<br>');

  /* ─── helpers ─── */
  const factoryReady = () => !!(E.fid && E.factory && E.factory());
  const bal = code => { const a = E.acct(code); return a ? E.bal(code) : 0; };
  const bankAccts = () => E.rows('coa').filter(a => a.bank && !a.inactive);

  function stockValue() {
    let rm = 0, fg = 0;
    const sm = E.stockMap();
    for (const k in sm) {
      const i = E.D.items.find(x => x.id === k.split('|')[0]);
      if (!i) continue;
      if (i.cat === 'Finished Good') fg += sm[k].value; else rm += sm[k].value;
    }
    return { rm, fg, total: rm + fg };
  }

  function openInvoices() { return E.rows('invoices').filter(i => !i.cancelled && i.total > i.paid); }
  function openBills() { return E.rows('purchases').filter(p => !p.cancelled && p.total > p.paid); }
  function monthlyTotal(coll, field, ym) {
    return E.rows(coll).filter(r => !r.cancelled && r.date && r.date.slice(0, 7) === ym)
      .reduce((s, r) => s + (r[field] || 0), 0);
  }

  /* ─── INTENTS (25+ high-value) ─── */
  const INTENTS = [
    /* ---- Financial queries ---- */
    {
      id: 'cash',
      re: [/^(?:how much )?(?:cash|money)(?: do i have| in hand)?\??$/i, /^(?:cash |bank )?balance/i, /cash position/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const cash = bal('1000'), petty = bal('1010'), banks = bankAccts();
        const bankTotal = banks.reduce((s, a) => s + E.bal(a.code), 0);
        const lines = [`**Total cash & bank: ${E.m(cash + petty + bankTotal)}**`, ''];
        lines.push(`• Cash in hand: ${E.m(cash)}`);
        if (petty) lines.push(`• Petty cash: ${E.m(petty)}`);
        banks.forEach(a => lines.push(`• ${a.name}: ${E.m(E.bal(a.code))}`));
        return { text: lines.join('\n') };
      }
    },
    {
      id: 'receivables',
      re: [/^(?:receivables|who owes me|outstanding invoices|AR|accounts receivable)/i, /^(?:how much do customers owe)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const inv = openInvoices();
        const total = inv.reduce((s, i) => s + (i.total - i.paid), 0);
        const parties = {};
        inv.forEach(i => { parties[i.partyId] = (parties[i.partyId] || 0) + (i.total - i.paid); });
        const top = Object.entries(parties).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const names = top.map(([pid, amt]) => `• ${E.esc((E.D.parties.find(p => p.id === pid) || {}).name || '?')}: ${E.m(amt)}`).join('\n');
        return {
          text: `**Customers owe you ${E.m(total)}** across ${inv.length} invoices.\n\nTop 5:\n${names || '—'}`,
          acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
        };
      }
    },
    {
      id: 'payables',
      re: [/^(?:payables|who do i owe|outstanding bills|AP|accounts payable)/i, /^(?:how much do i owe)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const bills = openBills();
        const total = bills.reduce((s, p) => s + (p.total - p.paid), 0);
        const parties = {};
        bills.forEach(p => { parties[p.partyId] = (parties[p.partyId] || 0) + (p.total - p.paid); });
        const top = Object.entries(parties).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const names = top.map(([pid, amt]) => `• ${E.esc((E.D.parties.find(p => p.id === pid) || {}).name || '?')}: ${E.m(amt)}`).join('\n');
        return {
          text: `**You owe suppliers ${E.m(total)}** across ${bills.length} bills.\n\nTop 5:\n${names || '—'}`,
          acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }]
        };
      }
    },
    {
      id: 'sales-month',
      re: [/^(?:sales|revenue)(?: this month)?\??$/i, /^(?:what are my sales)/i, /^(?:monthly sales)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const ym = E.today().slice(0, 7);
        const inv = E.rows('invoices').filter(i => !i.cancelled && (i.date || '').slice(0, 7) === ym);
        const total = inv.reduce((s, i) => s + i.total, 0);
        return {
          text: `**Sales this month: ${E.m(total)}** from ${inv.length} invoice(s).`,
          acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
        };
      }
    },
    {
      id: 'sales-today',
      re: [/^sales today/i, /^(?:today.?s sales)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const today = E.today();
        const inv = E.rows('invoices').filter(i => !i.cancelled && i.date === today);
        const total = inv.reduce((s, i) => s + i.total, 0);
        return { text: `**Sales today: ${E.m(total)}** from ${inv.length} invoice(s).` };
      }
    },
    {
      id: 'profit',
      re: [/^(?:profit|net profit|how much did i make)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const ym = E.today().slice(0, 7);
        let inc = 0, exp = 0;
        E.rows('journalEntries').filter(j => (j.date || '').slice(0, 7) === ym).forEach(j => {
          j.lines.forEach(l => {
            const a = E.acct(l.acc);
            if (!a) return;
            if (a.type === 'income') inc += l.cr - l.dr;
            if (a.type === 'expense') exp += l.dr - l.cr;
          });
        });
        const np = inc - exp;
        return {
          text: `**Profit this month: ${E.m(np)}**\n• Income: ${E.m(inc)}\n• Expenses: ${E.m(exp)}`,
          acts: [{ l: 'P&L Report', a: 'nav', id: 'reports' }]
        };
      }
    },
    {
      id: 'expenses',
      re: [/^expenses(?: this month)?\??$/i, /^(?:what did i spend)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const ym = E.today().slice(0, 7);
        let total = 0;
        const byHead = {};
        E.rows('journalEntries').filter(j => (j.date || '').slice(0, 7) === ym).forEach(j => {
          j.lines.forEach(l => {
            const a = E.acct(l.acc);
            if (!a || a.type !== 'expense') return;
            const amt = l.dr - l.cr;
            if (amt > 0) { total += amt; byHead[a.name] = (byHead[a.name] || 0) + amt; }
          });
        });
        const top = Object.entries(byHead).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const list = top.map(([n, v]) => `• ${E.esc(n)}: ${E.m(v)}`).join('\n');
        return { text: `**Expenses this month: ${E.m(total)}**\n\nTop heads:\n${list || '—'}` };
      }
    },
    {
      id: 'stock',
      re: [/^(?:stock|inventory)(?: value)?\??$/i, /^(?:how much stock)/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const s = stockValue();
        return {
          text: `**Stock value: ${E.m(s.total)}**\n• Materials: ${E.m(s.rm)}\n• Finished goods: ${E.m(s.fg)}`,
          acts: [{ l: 'Open Inventory', a: 'nav', id: 'stock' }]
        };
      }
    },
    {
      id: 'wip',
      re: [/^(?:wip|work.in.progress)\??$/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const wip = bal('1310');
        const jobs = E.rows('jobs').filter(j => j.status === 'In Progress');
        return {
          text: `**WIP: ${E.m(wip)}** sitting in ${jobs.length} open job(s).`,
          acts: [{ l: 'Open Jobs', a: 'nav', id: 'jobs' }]
        };
      }
    },
    {
      id: 'loans',
      re: [/^loans?\??$/i, /outstanding loans/i, /^(?:how much do i owe (?:the bank|in loans))/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const loans = E.rows('loans').filter(l => !l.cancelled && !l.settled);
        const total = loans.reduce((s, l) => s + l.rows.filter(r => !r.paid && !r.waived).reduce((a, r) => a + r.principal, 0), 0);
        return {
          text: `**Loans outstanding: ${E.m(total)}** across ${loans.length} loan(s).`,
          acts: [{ l: 'Loan Register', a: 'nav', id: 'loans' }]
        };
      }
    },
    {
      id: 'advances',
      re: [/^advances?\??$/i, /staff advances/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const total = E.rows('employees').reduce((s, e) => s + (E.advBal ? E.advBal(e.id) : 0), 0);
        return {
          text: `**Advances outstanding from staff: ${E.m(total)}**`,
          acts: [{ l: 'Employee Ledger', a: 'nav', id: 'empledger' }]
        };
      }
    },

    /* ---- Operational ---- */
    {
      id: 'jobs-open',
      re: [/^(?:jobs? in progress|active jobs|open jobs)\??$/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const jobs = E.rows('jobs').filter(j => j.status === 'In Progress');
        const list = jobs.slice(0, 8).map(j => `• ${E.esc(j.no)} — ${E.esc((E.D.parties.find(p => p.id === j.partyId) || { name: 'Stock' }).name)}`).join('\n');
        return {
          text: `**${jobs.length} job(s) in progress:**\n${list || '—'}`,
          acts: [{ l: 'Open Jobs', a: 'nav', id: 'jobs' }]
        };
      }
    },
    {
      id: 'jobs-overdue',
      re: [/overdue jobs/i, /late jobs/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const today = E.today();
        const jobs = E.rows('jobs').filter(j => j.status === 'In Progress' && j.due && j.due < today);
        const list = jobs.slice(0, 8).map(j => `• ${E.esc(j.no)} — due ${j.due}`).join('\n');
        return { text: `**${jobs.length} overdue job(s):**\n${list || '—'}` };
      }
    },
    {
      id: 'lowstock',
      re: [/low stock/i, /reorder/i, /^(?:what do i need to buy)/i, /what.?s short/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const m = E.stockMap();
        const low = E.skuList().map(k => Object.assign({}, k, m[k.itemId + '|' + k.variantId] || { qty: 0 }))
          .filter(k => k.min && k.qty <= k.min);
        const list = low.slice(0, 10).map(k => `• ${E.esc(k.code)} — ${k.qty} on hand (min ${k.min})`).join('\n');
        return { text: `**${low.length} item(s) at or below reorder level:**\n${list || '—'}` };
      }
    },
    {
      id: 'cheques',
      re: [/cheques?/i, /pending cheques/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const cheques = E.rows('cheques').filter(c => c.status === 'Pending');
        const inn = cheques.filter(c => c.dir === 'in').reduce((s, c) => s + c.amount, 0);
        const out = cheques.filter(c => c.dir === 'out').reduce((s, c) => s + c.amount, 0);
        return {
          text: `**${cheques.length} pending cheque(s)**\n• Received: ${E.m(inn)}\n• Issued: ${E.m(out)}`,
          acts: [{ l: 'Banking', a: 'nav', id: 'banking' }]
        };
      }
    },
    {
      id: 'top-customers',
      re: [/top customers/i, /best customers/i],
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const by = {};
        E.rows('invoices').filter(i => !i.cancelled).forEach(i => {
          by[i.partyId] = (by[i.partyId] || 0) + i.total;
        });
        const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const list = top.map(([pid, amt], i) => `${i + 1}. ${E.esc((E.D.parties.find(p => p.id === pid) || {}).name || '?')}: ${E.m(amt)}`).join('\n');
        return { text: `**Top 5 customers by total invoiced:**\n${list || '—'}` };
      }
    },

    /* ---- Navigation ---- */
    {
      id: 'go',
      re: /^(?:open|go to|show|navigate to)\s+([a-z\- ]+)/i,
      run: m => {
        const target = m[1].toLowerCase().replace(/\s+/g, '');
        const map = {
          dashboard: 'dashboard', items: 'items', stock: 'stock', inventory: 'stock',
          sales: 'sales', purchases: 'purchases', jobs: 'jobs', payroll: 'wages',
          wages: 'wages', 'daily-salaries': 'daily-salaries', dailysalaries: 'daily-salaries',
          'monthly-salaries': 'monthly-salaries', monthlysalaries: 'monthly-salaries',
          employees: 'employees', reports: 'reports', cash: 'accounts', bank: 'accounts',
          accounts: 'accounts', journal: 'journal', loans: 'loans', returns: 'returns',
          expenses: 'expenses', settings: 'settings', cloud: 'cloud', setup: 'setup',
          attendance: 'attendance', production: 'production', quality: 'qc', qc: 'qc'
        };
        const route = map[target];
        if (route) return { text: `Opening **${route}**…`, acts: [{ l: `Go →`, a: 'nav', id: route }] };
        return { text: `I don't know "${target}". Try: items, sales, purchases, jobs, payroll, reports, settings, setup` };
      }
    },

    /* ---- Help / How-to ---- */
    {
      id: 'help-invoice',
      re: /how (?:to|do i) (?:create|make|post) (?:an? )?invoice/i,
      run: () => ({
        text: `**Create an Invoice:**\n1. First post a **Delivery Note** (goods leave stock)\n2. Go to **Sales → + Invoice**\n3. Select customer → tick delivery notes\n4. Enter discount if any\n5. Click **Create Invoice**\n\n**Posts:** Dr 1200 Receivables / Cr 4000 Sales`,
        acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
      })
    },
    {
      id: 'help-sale',
      re: /how (?:to|do i) (?:record|post|make) (?:a )?sale/i,
      run: () => ({
        text: `**Record a Sale (2 steps):**\n\n**Step 1 — Delivery Note:**\n• Sales → + Delivery Note\n• Customer, articles, packs, price\n• Posts: Dr 5400 COGS / Cr 1320 FG\n\n**Step 2 — Invoice:**\n• Sales → + Invoice\n• Posts: Dr 1200 / Cr 4000\n\n**Step 3 — Receipt:**\n• Sales → Receive Payment\n• Posts: Dr Bank / Cr 1200`,
        acts: [{ l: 'Open Sales', a: 'nav', id: 'sales' }]
      })
    },
    {
      id: 'help-payroll',
      re: /how (?:to|do i) (?:run|do|process) (?:a )?(?:payroll|wages|salar)/i,
      run: () => ({
        text: `**Run Payroll:**\n\n**Wages (all workers who produced):**\n1. Log production first (Daily Production)\n2. Wages → + New Wage Run\n3. Select employees with production\n4. Review & Confirm → Post\n5. Pay\n\n**Salaries:**\n• Daily Salaried → + Record Daily Salary\n• Monthly Salaried → + New Monthly Salary Run`,
        acts: [{ l: 'Open Wages', a: 'nav', id: 'wages' }]
      })
    },
    {
      id: 'help-opening',
      re: /how (?:to|do i) (?:do|post|enter) opening (?:balance|stock)/i,
      run: () => ({
        text: `**Opening Balances:**\n\nBest approach: run the **Setup Wizard** (System → Setup) — it covers ALL opening balances in one flow:\n• Bank accounts + opening cash\n• Customers + opening AR\n• Suppliers + opening AP\n• Articles + opening FG stock\n• Materials + opening RM stock\n• Employees + opening advances\n\nOr post individually:\n• System → Opening Balances (cash, bank, AR, AP)\n• Inventory → + Opening stock / Adjustment`,
        acts: [{ l: 'Open Setup', a: 'nav', id: 'setup' }]
      })
    },
    {
      id: 'help-material',
      re: /how (?:to|do i) (?:buy|purchase|receive) (?:material|stock|goods)/i,
      run: () => ({
        text: `**Buy Materials:**\n1. Purchases & Stock → Purchases → + New Purchase\n2. Supplier, date, invoice no\n3. Add item lines (rate auto-fills from last paid)\n4. Receive & Post\n\n**Posts:** Dr 1300 Raw Material Stock / Cr 2000 Payables\n\n**Pay supplier:**\nPurchases → Pay Supplier`,
        acts: [{ l: 'Open Purchases', a: 'nav', id: 'purchases' }]
      })
    },
    {
      id: 'help-stocktake',
      re: /how (?:to|do i) (?:do|run) (?:a )?stock ?take/i,
      run: () => ({
        text: `**Stock Take:**\n1. Purchases & Stock → Stock Take → + New Stock Take\n2. Choose scope (all / category)\n3. Print blind count sheet\n4. Count physically\n5. Enter counts → Save\n6. Review & post adjustments\n\n**Posts:** Dr/Cr 1300 or 1320 · Dr/Cr 5300 (loss/gain)`,
        acts: [{ l: 'Stock Take', a: 'nav', id: 'stocktake' }]
      })
    },
    {
      id: 'help-bankrec',
      re: /how (?:to|do i) (?:do|reconcile) bank/i,
      run: () => ({
        text: `**Bank Reconciliation:**\n1. Accounting → Banking & Cheques → Bank reconciliation\n2. Select account\n3. Enter closing balance from bank statement\n4. Tick entries that appear on the statement\n5. When **Difference = 0**, reconciled ✓`,
        acts: [{ l: 'Banking', a: 'nav', id: 'banking' }]
      })
    },
    {
      id: 'help-close',
      re: /how (?:to|do i) (?:close|finish) (?:the )?month/i, /month.?end close/i,
      run: () => ({
        text: `**Month-end Close:**\n1. Run all open wage/salary runs\n2. Record daily salaries\n3. Absorb overhead (Expenses → pool tab)\n4. Complete all jobs\n5. Do stock take\n6. Bank reconciliation\n7. Reports → Month-end Close (all checks green)\n8. Backup\n9. **Lock the period** (owner)`,
        acts: [{ l: 'Month-end Close', a: 'nav', id: 'closing' }]
      })
    },
    {
      id: 'help-backup',
      re: /how (?:to|do i) (?:backup|back up)/i, /backup/i,
      run: () => ({
        text: `**Backup:**\n• System → Cloud & Backup → Download backup\n• Saves a JSON file with all data\n• Restore on another device via same page\n\n**Cloud:** Data also syncs automatically via Firebase when signed in.`,
        acts: [{ l: 'Cloud & Backup', a: 'nav', id: 'cloud' }]
      })
    },
    {
      id: 'help-setup',
      re: /how (?:to|do i) (?:setup|start|begin)/i, /^(?:start|begin) (?:the )?(?:factory|company)/i, /^(?:run|open) setup/i],
      run: () => ({
        text: `**Setup a new factory:**\n1. System → Setup Wizard\n2. Follow 10 steps:\n • Factory basics\n • Bank accounts + opening cash\n • Customers + opening AR\n • Suppliers + opening AP\n • Articles + opening stock\n • Materials + opening stock\n • Operations + rates\n • Employees + advances\n • BOMs (optional)\n • Review & Confirm\n\nTakes 15–30 minutes but covers EVERYTHING.`,
        acts: [{ l: 'Open Setup', a: 'nav', id: 'setup' }]
      })
    },

    /* ---- Meta ---- */
    {
      id: 'health',
      re: /health/i, /what.?s wrong/i, /problems/i, /diagnos/i,
      run: () => {
        if (!factoryReady()) return { text: 'Create a factory first.' };
        const t = E.totals();
        const dr = Object.values(t).reduce((s, x) => s + x.dr, 0);
        const cr = Object.values(t).reduce((s, x) => s + x.cr, 0);
        const balOk = dr === cr;
        const sm = E.stockMap();
        const neg = Object.values(sm).filter(v => v.qty < 0).length;
        return {
          text: `**Quick health check:**\n${balOk ? '✅' : '❌'} Trial balance ${balOk ? 'balanced' : 'OUT OF BALANCE'}\n${neg === 0 ? '✅' : '❌'} ${neg} negative stock item(s)\n\nFor 12 detailed checks: Reports → Health Check`,
          acts: [{ l: 'Full Health Check', a: 'nav', id: 'health' }]
        };
      }
    },
    {
      id: 'whoami',
      re: /^(?:who am i|what.?s my role|current user)/i,
      run: () => ({
        text: `You are **${E.esc(E.profile ? (E.profile.name || E.profile.email) : (E.user || 'unknown'))}** with role **${E.role.toUpperCase()}** in factory **${E.esc((E.factory() || {}).name || 'unknown')}**.`
      })
    },
    {
      id: 'help',
      re: /^(?:help|what can you do|commands?)$/i, /^hello/i, /^hi$/i,
      run: () => ({
        text: `**Hi! I can help with:**\n\n**Financial:**\n• "cash balance" / "how much cash"\n• "who owes me" / "who do I owe"\n• "sales this month" / "profit"\n• "stock value" / "WIP"\n\n**Operational:**\n• "open jobs" / "overdue jobs"\n• "low stock" / "pending cheques"\n• "top customers" / "loans"\n\n**Help:**\n• "how to create invoice"\n• "how to run payroll"\n• "how to do opening balance"\n• "how to backup"\n\n**Navigation:**\n• "open items" / "go to sales" / "show reports"\n\nOr type any question — I'll try to answer!`
      })
    }
  ];

  function matchIntent(text) {
    const t = (text || '').trim();
    for (const it of INTENTS) {
      for (const re of it.re) {
        const m = t.match(re);
        if (m) return { it, m };
      }
    }
    return null;
  }

  /* ─── LLM bridge ─── */
  async function askLLM(query) {
    if (C.provider === 'local' || !C.key) return null;

    const ctx = buildContext();
    const systemPrompt = `You are an AI assistant for Lanka Slipper ERP, a manufacturing/accounting system. Answer concisely (under 150 words). Use markdown formatting with ** bold ** and • bullets. Never invent numbers — use only the context provided. If you don't know, say so and suggest which menu to check.

CONTEXT:
${ctx}

USER QUESTION: ${query}`;

    try {
      if (C.provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + C.key },
          body: JSON.stringify({
            model: C.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.3,
            max_tokens: 400
          })
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        return d.choices[0].message.content;
      }
      if (C.provider === 'claude') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': C.key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: C.model || 'claude-3-5-haiku-20241022',
            max_tokens: 400,
            messages: [{ role: 'user', content: systemPrompt }]
          })
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        return d.content[0].text;
      }
      if (C.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${C.model || 'gemini-1.5-flash'}:generateContent?key=${C.key}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        return d.candidates[0].content.parts[0].text;
      }
      if (C.provider === 'custom' && C.endpoint) {
        const r = await fetch(C.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + C.key },
          body: JSON.stringify({
            model: C.model, messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.3, max_tokens: 400
          })
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
        return d.choices ? d.choices[0].message.content : (d.message || 'No response');
      }
    } catch (e) {
      return null; // Fall back to local engine
    }
    return null;
  }

  function buildContext() {
    if (!factoryReady()) return 'No factory open.';
    const s = stockValue();
    const cash = bal('1000') + bal('1010') + bankAccts().reduce((a, x) => a + E.bal(x.code), 0);
    const ar = openInvoices().reduce((a, i) => a + (i.total - i.paid), 0);
    const ap = openBills().reduce((a, p) => a + (p.total - p.paid), 0);
    const jIn = E.rows('jobs').filter(j => j.status === 'In Progress').length;
    return `Factory: ${E.factory().name} (${E.factory().code})
Today: ${E.today()}
Cash & bank: ${E.m(cash)}
Receivables: ${E.m(ar)}
Payables: ${E.m(ap)}
Stock: ${E.m(s.total)}
WIP: ${E.m(bal('1310'))}
Jobs in progress: ${jIn}
Employees: ${E.rows('employees').filter(e => e.active).length}
Items: ${E.rows('items').filter(i => i.active).length}
Recent invoices (last 5): ${E.rows('invoices').slice(-5).map(i => i.no + ' ' + E.m(i.total)).join(', ') || 'none'}`;
  }

  /* ─── Dispatcher ─── */
  async function ask(query) {
    const q = (query || '').trim();
    if (!q) return;
    pushMsg('user', q);
    paintChat();

    /* Try LLM first if configured */
    if (C.provider !== 'local' && C.key) {
      pushMsg('ai', '🤔 Thinking…');
      paintChat();
      const llm = await askLLM(q);
      popMsg();
      if (llm) { pushMsg('ai', llm); paintChat(); return; }
    }

    /* Local engine */
    const mt = matchIntent(q);
    if (mt) {
      try {
        const r = await mt.it.run(mt.m);
        pushMsg('ai', r.text || '', r.acts || []);
      } catch (e) {
        pushMsg('ai', '⚠️ Error: ' + e.message);
      }
      paintChat();
      return;
    }

    pushMsg('ai', `I didn't catch that. Try:\n• "cash balance"\n• "who owes me"\n• "how to create invoice"\n• "open jobs"\n• "help" for the full list\n\n${C.provider === 'local' ? '_(Tip: configure an AI provider under AI Settings for open-ended questions.)_' : ''}`);
    paintChat();
  }

  function pushMsg(role, text, acts) { chatLog.push({ role, text, acts: acts || [] }); }
  function popMsg() { chatLog.pop(); }

  /* ─── UI ─── */
  function injectCSS() {
    if (document.getElementById('ai-styles')) return;
    const s = document.createElement('style');
    s.id = 'ai-styles';
    s.textContent = `
      #ai-fab{position:fixed;right:20px;bottom:20px;z-index:8000;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 8px 24px rgba(124,58,237,.5);transition:all .2s}
      #ai-fab:hover{transform:scale(1.08)}
      #ai-panel{position:fixed;right:20px;bottom:88px;z-index:8001;width:400px;max-width:calc(100vw - 40px);height:580px;max-height:calc(100vh - 120px);background:var(--s);border:1px solid var(--bd);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}
      #ai-panel.show{display:flex}
      #ai-head{padding:14px 18px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;display:flex;justify-content:space-between;align-items:center}
      #ai-head b{font-size:15px}
      #ai-head .badge{font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.25)}
      #ai-head button{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0 4px}
      #ai-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg)}
      .ai-msg{max-width:88%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55;word-wrap:break-word}
      .ai-msg.user{align-self:flex-end;background:var(--ac);color:#fff;border-bottom-right-radius:2px}
      .ai-msg.ai{align-self:flex-start;background:var(--s);border:1px solid var(--bd);border-bottom-left-radius:2px}
      .ai-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .ai-acts button{padding:5px 12px;font-size:11.5px;font-weight:600;border:1px solid var(--ac);background:var(--s);color:var(--ac);border-radius:99px;cursor:pointer}
      .ai-acts button:hover{background:var(--ac);color:#fff}
      #ai-input-area{padding:10px 14px;background:var(--s);border-top:1px solid var(--bd);display:flex;gap:8px}
      #ai-input{flex:1;padding:10px 14px;border:1.5px solid var(--bd);border-radius:99px;font-size:13px;background:var(--bg);outline:none}
      #ai-input:focus{border-color:var(--ac)}
      #ai-send{width:40px;height:40px;border-radius:50%;background:var(--ac);color:#fff;border:none;cursor:pointer;font-size:16px;flex:0 0 40px}
      #ai-send:hover{background:#6d28d9}
      @media(max-width:500px){#ai-panel{right:10px;left:10px;bottom:80px;width:auto;height:calc(100vh - 100px)}}
    `;
    document.head.appendChild(s);
  }

  function buildUI() {
    injectCSS();
    if (document.getElementById('ai-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = 'AI Assistant (Ctrl+K)';
    fab.textContent = '🤖';
    fab.onclick = toggle;
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.innerHTML = `
      <div id="ai-head">
        <div><b>🤖 AI Assistant</b> <span class="badge" id="ai-prov">${C.provider}</span></div>
        <div><button data-a="ai-settings" title="Settings">⚙</button><button id="ai-close">✕</button></div>
      </div>
      <div id="ai-msgs"></div>
      <div id="ai-input-area">
        <input id="ai-input" placeholder="Ask me anything… (cash balance, who owes me, help)" autocomplete="off">
        <button id="ai-send">➤</button>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('ai-close').onclick = close;
    document.getElementById('ai-send').onclick = doSend;
    document.getElementById('ai-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    document.querySelector('#ai-head [data-a="ai-settings"]').onclick = () => { location.hash = '#/ai'; close(); };

    if (!chatLog.length) {
      chatLog.push({ role: 'ai', text: '👋 Hi! I\'m your AI assistant. Ask me about **cash**, **receivables**, **stock**, or type **help** for a full list. Try:\n• "how much cash do I have?"\n• "who owes me money?"\n• "how to create invoice"\n• "open jobs"', acts: [] });
    }
    paintChat();
  }

  function paintChat() {
    const box = document.getElementById('ai-msgs');
    if (!box) return;
    box.innerHTML = chatLog.map((m, i) => {
      const acts = (m.acts || []).map(a => `<button data-ai-act="${i}|${a.a}|${a.id || ''}">${E.esc(a.l)}</button>`).join('');
      return `<div class="ai-msg ${m.role}">${md(m.text)}${acts ? `<div class="ai-acts">${acts}</div>` : ''}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
    // bind actions
    box.querySelectorAll('[data-ai-act]').forEach(btn => {
      btn.onclick = () => {
        const [i, a, id] = btn.dataset.aiAct.split('|');
        if (a === 'nav') { location.hash = '#/' + id; close(); }
      };
    });
  }

  function doSend() {
    const inp = document.getElementById('ai-input');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    ask(q);
  }

  function toggle() { panelOpen ? close() : open(); }
  function open() { buildUI(); document.getElementById('ai-panel').classList.add('show'); panelOpen = true; setTimeout(() => document.getElementById('ai-input').focus(), 100); }
  function close() { const p = document.getElementById('ai-panel'); if (p) p.classList.remove('show'); panelOpen = false; }

  /* ─── Settings page ─── */
  E.route('ai', 'AI Assistant', () => `
    <div class="card">
      <h3>🤖 AI Assistant — Configuration</h3>
      <p class="muted">The assistant works fully offline with a rule-based engine. To enable open-ended questions powered by a real AI model, choose a provider below and paste your API key. <b>Your key is stored only on this device.</b></p>
      <div class="g2">
        <div class="f">Provider
          <select id="aip">
            <option value="local" ${C.provider === 'local' ? 'selected' : ''}>Local (offline rule engine) — free</option>
            <option value="openai" ${C.provider === 'openai' ? 'selected' : ''}>OpenAI (GPT-4, etc.)</option>
            <option value="claude" ${C.provider === 'claude' ? 'selected' : ''}>Anthropic Claude</option>
            <option value="gemini" ${C.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
            <option value="custom" ${C.provider === 'custom' ? 'selected' : ''}>Custom (OpenAI-compatible)</option>
          </select>
        </div>
        <div class="f">Model name
          <input id="aim" value="${E.esc(C.model)}" placeholder="gpt-4o-mini / claude-3-5-haiku-20241022 / gemini-1.5-flash">
        </div>
        <div class="f">API Key
          <input id="aik" type="password" value="${E.esc(C.key)}" placeholder="sk-...">
        </div>
        <div class="f">Custom endpoint (only if provider = custom)
          <input id="aie" value="${E.esc(C.endpoint)}" placeholder="https://your-server/v1/chat/completions">
        </div>
      </div>
      <button class="btn p" data-a="aiSave">Save settings</button>
      <button class="btn" data-a="aiTest">Test connection</button>
      <div id="ai-save-msg" class="muted" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h3>Quick reference — try these</h3>
      <div class="tw"><table><tbody>
        <tr><td><code>cash balance</code></td><td>Show total cash & bank</td></tr>
        <tr><td><code>who owes me</code></td><td>Receivables summary + top debtors</td></tr>
        <tr><td><code>sales this month</code></td><td>Total invoiced this month</td></tr>
        <tr><td><code>profit</code></td><td>Net profit this month</td></tr>
        <tr><td><code>open jobs</code></td><td>Jobs in progress</td></tr>
        <tr><td><code>low stock</code></td><td>Items below reorder level</td></tr>
        <tr><td><code>how to create invoice</code></td><td>Step-by-step guide</td></tr>
        <tr><td><code>open sales</code></td><td>Navigate to the Sales page</td></tr>
        <tr><td><code>help</code></td><td>Show all commands</td></tr>
      </tbody></table></div>
      <p class="muted" style="margin-top:10px">Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to open the assistant.</p>
    </div>
  `);

  E.A.aiSave = () => {
    C.provider = E.val('aip');
    C.model = E.val('aim');
    C.key = E.val('aik');
    C.endpoint = E.val('aie');
    saveCfg();
    E.$('ai-save-msg').textContent = '✅ Settings saved';
    const b = document.getElementById('ai-prov');
    if (b) b.textContent = C.provider;
  };

  E.A.aiTest = async () => {
    if (C.provider === 'local') { E.$('ai-save-msg').textContent = '✅ Local engine active — no API needed'; return; }
    if (!C.key) { E.$('ai-save-msg').textContent = '❌ Enter API key first'; return; }
    E.$('ai-save-msg').textContent = 'Testing…';
    const reply = await askLLM('Say "ok" and nothing else');
    if (reply) E.$('ai-save-msg').textContent = '✅ Connected: ' + reply.slice(0, 80);
    else E.$('ai-save-msg').textContent = '❌ Connection failed. Check key, model, and network.';
  };

  /* ─── Nav + shortcut ─── */
  E.nav('System', 'ai', '🤖', 'AI Assistant');
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggle();
    }
  });

  /* ─── Init on DOM ready ─── */
  const init = () => { buildUI(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

  /* ─── Expose API ─── */
  E.AI = { ask, open, close, toggle, getConfig: () => ({ ...C }), reset: () => { chatLog = []; paintChat(); } };
})(window.ERP);