/* Data Reset & Restore — start fresh safely. Always downloads a backup first, then asks you to type ERASE. */
(E=>{
const TX=['journalEntries','stockMoves','purchases','issues','expenses','wageRuns','invoices','receipts','cheques','payments','deliveries','recon','attendance','qc','quotes','vouchers','cashCounts','prodLogs','costRuns','purchaseOrders','stockTakes','loans','jobs','jobLines','sequences'],
 MS=['items','variants','parties','employees','assets','rateCards','operations','budgets'],
 N=c=>E.rows(c).length,T=l=>l.reduce((s,c)=>s+N(c),0);
E.nav('System','datareset','🧹','Data Reset & Restore');
E.route('datareset','Data Reset & Restore',()=>`<div class="kp">${E.kpi('Transaction records',T(TX),'invoices, stock moves, wages, journals…')}${E.kpi('Master records',T(MS),'items, customers, suppliers, employees…')}${E.kpi('Audit log entries',N('auditLog'),'')}</div>
<div class="card"><h3>1 · Backup first</h3><p class="muted">Every erase option below downloads a backup file automatically before deleting anything. You can also download one now.</p><button class="btn p" data-a="backup">⬇ Download backup now</button> <button class="btn" data-nav="cloud">⬆ Restore from a backup file</button></div>
<div class="card"><h3>2 · Choose what to erase (this factory only)</h3>
<label style="display:block;margin:8px 0"><input type="radio" name="rs_m" value="tx" checked> <b>Clear transactions only</b> — deletes sales, purchases, stock movements, jobs, wages, advances, journals, cheques and numbering. <u>Keeps</u> items, colours/sizes, customers, suppliers, employees, accounts and settings. Best for starting fresh with the same setup, then entering opening stock.</label>
<label style="display:block;margin:8px 0"><input type="radio" name="rs_m" value="all"> <b>Clear everything (full fresh start)</b> — also deletes items, customers, suppliers, employees, assets, rate cards, operations and budgets. Keeps only the chart of accounts, settings and users.</label>
<label style="display:block;margin:8px 0"><input type="radio" name="rs_m" value="audit"> <b>Clear audit log only</b> — frees space, nothing else changes.</label>
<div class="f" style="max-width:300px">Type <b>ERASE</b> to confirm<input id="rs_c" placeholder="ERASE"></div>
<button class="btn d" data-a="doReset">Erase selected data</button></div>
<div class="card"><h3>3 · After erasing</h3><ol class="muted"><li>Check Settings (factory name, pack size, EPF/ETF rates).</li><li>Add items, colours and sizes, customers, suppliers and employees (or use Data Tools → import).</li><li>Enter opening balances and opening stock in <b>Opening balances</b>.</li><li>Start posting purchases, jobs, production and sales.</li></ol><button class="btn p" data-nav="opening">Go to opening balances</button></div>`);
E.A.doReset=async()=>{const m=(document.querySelector('input[name=rs_m]:checked')||{}).value;
 if((E.val('rs_c')||'').trim()!=='ERASE')return E.toast('Type ERASE to confirm','error');
 const cols=m==='audit'?['auditLog']:m==='all'?TX.concat(MS,['auditLog']):TX.concat(['auditLog']);
 try{if(m!=='audit')E.A.backup();
  for(const c of cols)for(const r of E.rows(c).slice())await E.del(c,r.id);
  E.toast('Data erased. A backup file was downloaded first.','success');location.hash=m==='audit'?'#/datareset':'#/opening';E.go()}catch(e){E.toast(e.message,'error')}};
})(window.ERP);
