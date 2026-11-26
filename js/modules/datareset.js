/* Data Reset & Restore - customizable purge. Tick exactly the categories you want erased. Always downloads a backup first, then asks you to type ERASE.
   Items, colours/sizes and their purchase prices live in "Items list & prices" and are kept unless you tick them. */
(E=>{
const G=[
 {k:'ledger',  t:'Journal entries & ledger (all accounts, transactions)', d:'Every journal entry. All account balances return to zero. The chart of accounts itself is kept.', c:['journalEntries']},
 {k:'stock',   t:'Stock movements & opening stock', d:'All stock in/out history, so every item shows zero quantity. Item prices are NOT touched.', c:['stockMoves','stockTakes']},
 {k:'buy',     t:'Purchases, purchase orders & supplier payments', d:'PUR bills (including cancelled), POs and payments to suppliers.', c:['purchases','purchaseOrders','payments']},
 {k:'sell',    t:'Sales: delivery notes, invoices, quotations, receipts', d:'Everything sold or quoted, including cancelled documents.', c:['deliveries','invoices','quotes','receipts']},
 {k:'exp',     t:'Expenses, petty cash & vouchers', d:'Expense records, vouchers and cash counts.', c:['expenses','vouchers','cashCounts']},
 {k:'pay',     t:'Wages, payroll, attendance, advances & staff loans', d:'Wage runs, daily allocations, attendance, working days, salary history, loans.', c:['wageRuns','dailyAllocations','dailyProduction','attendance','workingDays','salaryHistory','staffLoans','loans']},
 {k:'jobs',    t:'Jobs, production, issues & job costing', d:'Jobs, job lines, material issues, production logs, absorption runs, quality checks, cost allocations.', c:['jobs','jobLines','issues','prodLogs','costRuns','qc','costAllocations','closedJobVariances']},
 {k:'bank',    t:'Cheques & bank reconciliation', d:'Cheque register and reconciliation records.', c:['cheques','recon']},
 {k:'seq',     t:'Document numbering (PUR-00001, INV-00001, JV-00001...)', d:'Next numbers restart from 1.', c:['sequences']},
 {k:'audit',   t:'Audit log', d:'Frees space. Does not change any figures.', c:['auditLog']}
];
const M=[
 {k:'items',   t:'Items list & purchase prices (items, colours/sizes)', d:'KEPT by default. Tick only if you want to retype every item.', c:['items','variants']},
 {k:'parties', t:'Customers & suppliers', d:'', c:['parties']},
 {k:'emp',     t:'Employees', d:'', c:['employees']},
 {k:'assets',  t:'Fixed assets', d:'', c:['assets']},
 {k:'setup',   t:'Rate cards, operations, budgets, fixed-expense rates, recurring templates', d:'', c:['rateCards','operations','budgets','fixedExpenses','recurring']}
];
const ALL=G.concat(M);
const N=c=>E.rows(c).length,cnt=g=>g.c.reduce((s,c)=>s+N(c),0);
const PRESETS={
 itemsOnly:{l:'Keep only items & prices (erase all transactions)',on:G.map(g=>g.k)},
 allMasters:{l:'Full fresh start (also erase items, parties, employees)',on:ALL.map(g=>g.k)},
 none:{l:'Clear all ticks',on:[]}};
const row=(g,warn)=>`<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;cursor:pointer"><input type="checkbox" class="rs_k" data-f="rs.k" value="${g.k}" style="margin-top:4px"><span><b>${g.t}</b> <span class="muted">(${cnt(g)} records)</span>${g.d?`<br><span class="muted">${g.d}</span>`:''}</span></label>`;
function summary(){const on=[...document.querySelectorAll('.rs_k:checked')].map(x=>x.value),gs=ALL.filter(g=>on.includes(g.k));
 const n=gs.reduce((s,g)=>s+cnt(g),0);let w='';
 if(on.includes('ledger')&&['buy','sell','exp','pay','jobs','stock'].some(k=>!on.includes(k)))w+='<div class="bad" style="margin-top:6px">Journal entries are ticked but some document categories are not. Those documents would remain without ledger entries and the reconciliation screens will show differences. Tick them too unless you know what you are doing.</div>';
 if(on.includes('stock')&&!on.includes('ledger'))w+='<div class="bad" style="margin-top:6px">Stock is ticked but the ledger is not: stock value in the ledger will no longer match the stock records.</div>';
 if(on.includes('items'))w+='<div class="bad" style="margin-top:6px">Items list & purchase prices will be ERASED.</div>';
 return `<b>${gs.length}</b> categories ticked, <b>${n.toLocaleString()}</b> records will be erased.${w}`}
E.nav('System','datareset','🧹','Data Reset & Restore');
E.route('datareset','Data Reset & Restore',()=>`<div class="kp">${E.kpi('Transaction records',G.reduce((s,g)=>s+cnt(g),0),'journals, stock, documents, wages…')}${E.kpi('Items & prices',cnt(M[0]),'kept unless you tick them')}${E.kpi('Other master records',M.slice(1).reduce((s,g)=>s+cnt(g),0),'customers, suppliers, employees…')}</div>
<div class="card"><h3>1 · Backup first</h3><p class="muted">Every erase downloads a backup file automatically before deleting anything. You can also download one now.</p><button class="btn p" data-a="backup">⬇ Download backup now</button> <button class="btn" data-nav="cloud">⬆ Restore from a backup file</button></div>
<div class="card"><h3>2 · Quick presets</h3><p class="muted">A preset only ticks the boxes below. You can still adjust them before erasing.</p>${Object.keys(PRESETS).map(k=>`<button class="btn" data-a="rsPreset" data-id="${k}" style="margin:3px 6px 3px 0">${PRESETS[k].l}</button>`).join('')}</div>
<div class="card"><h3>3 · Transactions and history (tick what to erase)</h3>${G.map(g=>row(g)).join('')}</div>
<div class="card"><h3>4 · Master data (normally kept)</h3>${M.map(g=>row(g)).join('')}</div>
<div class="card"><h3>5 · Confirm</h3><div id="rs_sum" class="muted" style="margin-bottom:10px">0 categories ticked.</div><div class="f" style="max-width:300px">Type <b>ERASE</b> to confirm<input id="rs_c" placeholder="ERASE"></div><button class="btn d" data-a="doReset">Erase ticked categories</button><p class="muted" style="margin-top:8px">Chart of accounts, settings and users are never erased here. This device and the cloud are both cleared, so all devices stay in step.</p></div>
<div class="card"><h3>After erasing</h3><ol class="muted"><li>Check Settings (factory name, pack size, EPF/ETF rates).</li><li>Enter opening balances and opening stock in <b>Opening balances</b>. Items keep their purchase prices.</li><li>Start posting purchases, jobs, production and sales.</li></ol><button class="btn p" data-nav="opening">Go to opening balances</button></div>`);
E.hooks.push(e=>{if(e.target.dataset&&e.target.dataset.f==='rs.k'){const s=document.getElementById('rs_sum');if(s)s.innerHTML=summary()}});
E.A.rsPreset=id=>{const on=PRESETS[id].on;document.querySelectorAll('.rs_k').forEach(x=>{x.checked=on.includes(x.value)});const s=document.getElementById('rs_sum');if(s)s.innerHTML=summary()};
E.A.doReset=async()=>{const on=[...document.querySelectorAll('.rs_k:checked')].map(x=>x.value);
 if(!on.length)return E.toast('Tick at least one category','error');
 if((E.val('rs_c')||'').trim()!=='ERASE')return E.toast('Type ERASE to confirm','error');
 const cols=[...new Set(ALL.filter(g=>on.includes(g.k)).flatMap(g=>g.c))];
 if(!(E.sync.granted&&E.sync.user&&navigator.onLine))return E.toast('This device is not connected to the cloud. Erasing now would clear only this device and your other devices would keep the data. Sign in and get online first (see System > Sync & Devices).','error');
 try{if(!(on.length===1&&on[0]==='audit'))E.A.backup();
  for(const c of cols)for(const r of E.rows(c).slice())await E.del(c,r.id);
  try{await firebase.firestore().waitForPendingWrites()}catch(x){}
  E.toast('Erased '+on.length+' categories on this device and in the cloud. A backup file was downloaded first.','success');E.go()}catch(e){E.toast(e.message,'error')}};
})(window.ERP);
