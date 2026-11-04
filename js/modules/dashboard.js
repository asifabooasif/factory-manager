(E=>{E.nav('Overview','dashboard','▦','Dashboard');
const g=[['Masters',[['items','📦','Items'],['parties','👥','Parties'],['employees','🧑‍🏭','Employees']]],['Factory',[['jobs','🏭','Jobs & Costing'],['stock','📊','Inventory'],['purchases','🛒','Purchases'],['sales','🧮','Sales'],['payroll','💰','Payroll']]]];
g.forEach(([n,l])=>l.forEach(([id,i,t])=>E.nav(n,id,i,t,1)));
E.nav('Accounting','journal','🧾','Journal');E.nav('Accounting','tb','⚖️','Trial Balance');E.nav('Accounting','petty','💵','Petty Cash',1);E.nav('Accounting','banking','🏦','Banking & Cheques',1);E.nav('System','settings','⚙️','Settings');
E.route('dashboard','Dashboard',()=>{
 const t=E.totals(),rows=E.rows('coa'),R=n=>E.rows(n),today=E.today(),ym=today.slice(0,7);
 const cash=rows.filter(a=>a.bank).reduce((s,a)=>s+E.bal(a.code,t),0),sum=ty=>rows.filter(a=>a.type===ty).reduce((s,a)=>s+E.bal(a.code,t),0);
 const dr=Object.values(t).reduce((s,x)=>s+x.dr,0),cr=Object.values(t).reduce((s,x)=>s+x.cr,0),l=E.setting('lockedUntil');
 const inv=R('invoices').filter(i=>!i.cancelled),pur=R('purchases').filter(p=>!p.cancelled);
 const recv=inv.reduce((s,i)=>s+i.total-i.paid,0),pay=pur.reduce((s,p)=>s+p.total-p.paid,0);
 const salesM=inv.filter(i=>i.date.slice(0,7)===ym).reduce((s,i)=>s+i.total,0);
 const sm=E.stockMap();let rm=0,fg=0;for(const k in sm){const it=E.D.items.find(x=>x.id===k.split('|')[0]);if(it)it.cat==='Finished Good'?fg+=sm[k].value:rm+=sm[k].value}
 const jobs=R('jobs').filter(j=>j.status==='In Progress'),late=jobs.filter(j=>j.due&&j.due<today);
 const in7=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
 const chq=R('cheques').filter(c=>c.status==='Pending');
 const chqDue=chq.filter(c=>c.date<=in7).sort((a,b)=>a.date.localeCompare(b.date));
 const low=E.skuList().map(k=>Object.assign({},k,sm[k.itemId+'|'+k.variantId]||{qty:0,value:0})).filter(k=>k.min&&k.qty<=k.min).slice(0,8);
 /* last 6 months: sales vs expenses (from the ledger) */
 const months=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'))}
 const inc={},exp={};R('journalEntries').forEach(j=>{const m=j.date.slice(0,7);j.lines.forEach(x=>{const a=E.acct(x.acc);if(!a)return;if(a.type==='income')inc[m]=(inc[m]||0)+x.cr-x.dr;if(a.type==='expense')exp[m]=(exp[m]||0)+x.dr-x.cr})});
 const mx=Math.max(1,...months.map(m=>Math.max(inc[m]||0,exp[m]||0)));
 const chart=`<div style="display:flex;gap:14px;align-items:flex-end;height:150px;padding:4px 2px">${months.map(m=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="display:flex;gap:3px;align-items:flex-end;height:120px;width:100%;justify-content:center"><div title="Income ${E.m(inc[m]||0)}" style="width:40%;background:var(--ac);border-radius:4px 4px 0 0;height:${Math.max(2,(inc[m]||0)/mx*120)}px"></div><div title="Expenses ${E.m(exp[m]||0)}" style="width:40%;background:#ec4899;border-radius:4px 4px 0 0;height:${Math.max(2,(exp[m]||0)/mx*120)}px"></div></div><small class="muted">${m.slice(5)}</small></div>`).join('')}</div><p class="muted" style="font-size:11px"><span style="color:var(--ac)">&#9632;</span> Income &nbsp; <span style="color:#ec4899">&#9632;</span> Expenses</p>`;
 const list=(a,f,empty)=>a.length?`<div class="tw"><table><tbody>${a.map(f).join('')}</tbody></table></div>`:`<p class="muted">${empty}</p>`;
 return `<div class="kp">${E.kpi('Factory',E.esc(E.factory().name),'Code '+E.esc(E.factory().code))}${E.kpi('Cash & Bank',E.m(cash),'Cash in hand + bank')}${E.kpi('Sales this month',E.m(salesM),inv.filter(i=>i.date.slice(0,7)===ym).length+' invoices')}${E.kpi('Net Profit',E.m(sum('income')-sum('expense')),'Income - expenses, all time')}${E.kpi('Books',dr===cr?'<span class="ok">Balanced</span>':'<span class="bad">Out of balance</span>',R('journalEntries').length+' entries')}${E.kpi('Period lock',l||'None','Entries up to this date are closed')}</div>
 <div class="kp">${E.kpi('Customers owe us',E.m(recv),inv.filter(i=>i.total>i.paid).length+' open invoices')}${E.kpi('We owe suppliers',E.m(pay),pur.filter(p=>p.total>p.paid).length+' open bills')}${E.kpi('Materials stock',E.m(rm),'At average cost')}${E.kpi('Finished goods',E.m(fg),'At average cost')}${E.kpi('Jobs in progress',jobs.length,late.length?'<span class="bad">'+late.length+' overdue</span>':'None overdue')}${E.kpi('Cheques pending',chq.length,chqDue.length+' due within 7 days')}</div>
 <div class="g2"><div class="card"><h3>Income vs expenses (6 months)</h3>${chart}</div>
 <div class="card"><h3>Cheques due in 7 days</h3>${list(chqDue.slice(0,8),c=>`<tr><td>${c.date}</td><td>${c.dir==='in'?'Received':'Issued'}</td><td>${E.esc(c.chqNo)}</td><td class="r">${E.m(c.amount)}</td></tr>`,'Nothing due.')}</div></div>
 <div class="g2"><div class="card"><h3>Low stock</h3>${list(low,k=>`<tr><td>${E.esc(k.code)}</td><td>${E.esc(k.name)}</td><td class="r bad">${k.qty}</td><td class="r muted">min ${k.min}</td></tr>`,'All items above minimum level.')}</div>
 <div class="card"><h3>Overdue jobs</h3>${list(late.slice(0,8),j=>`<tr><td>${E.esc(j.no)}</td><td>${E.esc((E.D.parties.find(p=>p.id===j.partyId)||{}).name||'Stock run')}</td><td class="bad">Due ${j.due}</td></tr>`,'No overdue jobs.')}</div></div>`});})(window.ERP);
