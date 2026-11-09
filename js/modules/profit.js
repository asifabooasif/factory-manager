/* PART 18 — Profitability. Real margin per article, customer and job from deliveries (revenue and cost recognised at delivery, less invoice discount), less sales returns. Reconciled to ledger account 4000. */
(E=>{const at=E.N.findIndex(n=>n.id==='ledger');E.N.splice(at,0,{g:'Reports',id:'profit',ico:'💹',label:'Profitability'});
const F={tab:'art',from:'',to:''},inR=d=>(!F.from||d>=F.from)&&(!F.to||d<=F.to);
const pty=id=>(E.D.parties.find(x=>x.id===id)||{}).name||'(unknown)',itm=id=>E.D.items.find(x=>x.id===id)||{};
function calc(){const A={},C={},J={};let rev=0,cost=0,unBill=0,unCost=0,ret=0,retCost=0,retRows=0;
 const add=(M,k,n,q,r,c)=>{const a=M[k]||(M[k]={n,q:0,r:0,c:0});a.q+=q;a.r+=r;a.c+=c};
 /* Revenue is recognised at delivery (cost too). The invoice only adds its discount. Old delivery notes (no 'unbilled' flag) keep the old rule: revenue at invoice. */
 E.rows('deliveries').filter(d=>d.unbilled&&d.status!=='Cancelled'&&inR(d.date)).forEach(d=>{const jn=d.jobId?((E.D.jobs.find(x=>x.id===d.jobId)||{}).no||'?'):'(no job)';
  d.lines.forEach(l=>{const t=itm(l.itemId);rev+=l.amount;cost+=l.cost;add(A,l.itemId,(t.art||'?')+' - '+(t.name||l.name),l.qty,l.amount,l.cost);add(C,d.partyId,pty(d.partyId),l.qty,l.amount,l.cost);add(J,jn,jn,l.qty,l.amount,l.cost)})});
 E.rows('invoices').filter(i=>!i.cancelled&&!i.opening&&i.gross>0&&inR(i.date)).forEach(i=>{const f=i.total/i.gross;(i.dnIds||[]).forEach(k=>{const d=E.D.deliveries.find(x=>x.id===k);if(!d)return;
  const jn=d.jobId?((E.D.jobs.find(x=>x.id===d.jobId)||{}).no||'?'):'(no job)';
  d.lines.forEach(l=>{const t=itm(l.itemId);
   if(d.unbilled){const r=-l.amount*(i.disc||0)/i.gross;if(!r)return;rev+=r;add(A,l.itemId,(t.art||'?')+' - '+(t.name||l.name),0,r,0);add(C,i.partyId,pty(i.partyId),0,r,0);add(J,jn,jn,0,r,0);return}
   const r=l.amount*f;rev+=r;cost+=l.cost;add(A,l.itemId,(t.art||'?')+' - '+(t.name||l.name),l.qty,r,l.cost);add(C,i.partyId,pty(i.partyId),l.qty,r,l.cost);add(J,jn,jn,l.qty,r,l.cost)})})});
 E.rows('receipts').filter(x=>x.kind==='credit'&&inR(x.date)).forEach(x=>{ret+=x.amount;retCost+=x.cost||0;retRows++;const inv=E.D.invoices.find(q=>q.id===x.invId);
  (x.lines||[]).forEach(l=>{const t=itm(l.itemId);add(A,l.itemId,(t.art||'?')+' - '+(t.name||''),-l.qty,-l.value,-(l.cost||0))});if(inv)add(C,inv.partyId,pty(inv.partyId),0,-x.amount,-(x.cost||0))});
 E.rows('deliveries').filter(d=>d.status==='Delivered'&&!d.unbilled&&inR(d.date)).forEach(d=>{unBill+=d.total;unCost+=d.cogs});
 /* ledger check */
 let led=0;E.rows('journalEntries').filter(j=>inR(j.date)).forEach(j=>j.lines.filter(l=>l.acc==='4000').forEach(l=>led+=l.cr-l.dr));
 const net=Math.round(rev-ret);return {A,C,J,rev:Math.round(rev),cost,ret,retCost,retRows,net,led,unBill,unCost,jobsRet:ret}}
const tbl=(M,extra)=>{const rows=Object.values(M).map(a=>Object.assign(a,{p:a.r-a.c})).sort((a,b)=>b.p-a.p);
 return `<div class="tw"><table><thead><tr><th>Name</th><th class="r">Packs</th><th class="r">Revenue</th><th class="r">Cost</th><th class="r">Profit</th><th class="r">Margin</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${E.esc(a.n)}</td><td class="r">${a.q}</td><td class="r">${E.m(Math.round(a.r))}</td><td class="r">${E.m(Math.round(a.c))}</td><td class="r ${a.p<0?'bad':'ok'}"><b>${E.m(Math.round(a.p))}</b></td><td class="r ${a.p<0?'bad':''}">${a.r?(a.p/a.r*100).toFixed(1)+'%':'-'}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">No invoiced sales in this period</td></tr>'}${extra||''}</tbody></table></div>`};
const body=()=>{const D=calc(),m=D.rev-D.ret,c=D.cost-D.retCost,diff=D.net-D.led,ok=Math.abs(diff)<=1;
 const tab=F.tab==='art'?tbl(D.A):F.tab==='cus'?tbl(D.C):tbl(D.J,D.ret?`<tr><td class="muted">Sales returns (not linked to a job)</td><td class="r"></td><td class="r">${E.m(-D.ret)}</td><td class="r">${E.m(-D.retCost)}</td><td class="r"></td><td class="r"></td></tr>`:'');
 return `<div class="kp">${E.kpi('Net sales',E.m(m),'After discounts and returns')}${E.kpi('Cost of goods sold',E.m(c),'Average cost at delivery')}${E.kpi('Gross profit',E.m(m-c),'')}${E.kpi('Gross margin',m?((m-c)/m*100).toFixed(1)+'%':'-','')}</div>
 <div class="bar"><button class="btn ${F.tab==='art'?'p':''}" data-a="pfTab" data-id="art">By article</button><button class="btn ${F.tab==='cus'?'p':''}" data-a="pfTab" data-id="cus">By customer</button><button class="btn ${F.tab==='job'?'p':''}" data-a="pfTab" data-id="job">By job</button></div>${tab}
 <div class="card"><h3>Accuracy check</h3><p>Net sales here: <b>${E.m(D.net)}</b> &nbsp; | &nbsp; Ledger 4000 Sales Revenue for the same dates: <b>${E.m(D.led)}</b> &nbsp; ${ok?'<span class="ok">Agrees</span>':'<span class="bad">Differs by '+E.m(diff)+'</span>'}</p>${ok?'':'<p class="muted">A difference means a manual journal touched account 4000, or an invoice date falls outside the chosen dates. Check the Ledger Search.</p>'}<p class="muted">Old delivery notes not yet moved to Unbilled Receivable (Sales screen), in this period: ${E.m(D.unBill)} sales value (cost ${E.m(D.unCost)}). Not counted above until moved or invoiced.</p></div>`};
E.route('profit','Profitability',()=>`<div class="bar"><div class="f" style="margin:0">From<input class="fs" type="date" data-f="pf.from" value="${F.from}"></div><div class="f" style="margin:0">To<input class="fs" type="date" data-f="pf.to" value="${F.to}"></div></div><div id="pfb">${body()}</div>`);
E.hooks.push(e=>{const f=e.target.dataset&&e.target.dataset.f;if(f&&f.startsWith('pf.')){F[f.slice(3)]=e.target.value;E.$('pfb').innerHTML=body()}});
E.A.pfTab=t=>{F.tab=t;E.$('pfb').innerHTML=body()};
})(window.ERP);
