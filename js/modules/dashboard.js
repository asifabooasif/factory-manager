(E=>{E.nav('Overview','dashboard','▦','Dashboard');
const g=[['Masters',[['items','📦','Items'],['parties','👥','Parties'],['employees','🧑‍🏭','Employees']]],['Factory',[['jobs','🏭','Jobs & Costing'],['stock','📊','Inventory'],['purchases','🛒','Purchases'],['sales','🧮','Sales'],['payroll','💰','Payroll']]]];
g.forEach(([n,l])=>l.forEach(([id,i,t])=>E.nav(n,id,i,t,1)));
E.nav('Accounting','journal','🧾','Journal');E.nav('Accounting','tb','⚖️','Trial Balance');E.nav('Accounting','petty','💵','Petty Cash',1);E.nav('Accounting','banking','🏦','Banking & Cheques',1);E.nav('System','settings','⚙️','Settings');
E.route('dashboard','Dashboard',()=>{const t=E.totals(),rows=E.rows('coa');
 const cash=rows.filter(a=>a.bank).reduce((s,a)=>s+E.bal(a.code,t),0),sum=ty=>rows.filter(a=>a.type===ty).reduce((s,a)=>s+E.bal(a.code,t),0);
 const dr=Object.values(t).reduce((s,x)=>s+x.dr,0),cr=Object.values(t).reduce((s,x)=>s+x.cr,0),l=E.setting('lockedUntil');
 return `<div class="kp">${E.kpi('Factory',E.esc(E.factory().name),'Code '+E.esc(E.factory().code))}${E.kpi('Cash & Bank',E.m(cash),'Cash in hand + bank')}${E.kpi('Net Profit',E.m(sum('income')-sum('expense')),'Income − expenses')}${E.kpi('Books',dr===cr?'<span class="ok">Balanced</span>':'<span class="bad">Out of balance</span>',E.rows('journalEntries').length+' entries')}${E.kpi('Period lock',l||'None','Entries up to this date are closed')}</div>
 <div class="card"><h3>Foundation is running</h3><p class="muted">Amounts are stored in whole cents, entries are locked once posted (correct them with a reversal), every change is in the audit log, and each factory keeps separate books. Next parts add Items, Inventory, Purchases and Jobs on top of this.</p></div>`});})(window.ERP);
