/* PART 17 — Cash-flow forecast. Projects the bank balance week by week from what is actually open in the books: unpaid invoices (by credit days), unpaid bills, and cheques not yet cleared. Cheques already allocated to an invoice/bill are not counted twice. */
(E=>{const at=E.N.findIndex(n=>n.id==='ledger');E.N.splice(at,0,{g:'Reports',id:'cashflow',ico:'🔮',label:'Cash Forecast'});
const F={weeks:8,collectOverdue:'no',payOverdue:'yes',payroll:'no',other:''};
const addD=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10),diff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
const pty=id=>E.D.parties.find(x=>x.id===id)||{};
function calc(){const T=E.today(),W=+F.weeks,cols=W+1,z=()=>Array(cols).fill(0);
 const R={inv:z(),chin:z(),bill:z(),chout:z(),pay:z(),oth:z()};
 const idx=(d,inflow,always)=>{const n=diff(T,d);if(n<0)return (always||(inflow?F.collectOverdue==='yes':F.payOverdue==='yes'))?1:-1;const w=Math.floor(n/7)+1;return w>W?-1:w};
 E.rows('invoices').filter(i=>!i.cancelled&&i.total>i.paid).forEach(i=>{const k=idx(addD(i.date,pty(i.partyId).days||0),true);if(k>=0)R.inv[k]+=i.total-i.paid});
 E.rows('purchases').filter(p=>!p.cancelled&&p.total>p.paid).forEach(p=>{const k=idx(addD(p.date,pty(p.partyId).days||0),false);if(k>=0)R.bill[k]+=p.total-p.paid});
 E.rows('cheques').filter(c=>c.status==='Pending').forEach(c=>{const k=idx(c.date,c.dir==='in',true);if(k<0)return;(c.dir==='in'?R.chin:R.chout)[k]+=c.amount});
 if(F.payroll==='yes'){const sal=E.rows('employees').filter(e=>e.active&&e.payType==='Monthly').reduce((s,e)=>s+e.amount+(e.allow||0),0);
  if(sal){for(let w=1;w<=W;w++){const s=addD(T,(w-1)*7),e=addD(T,w*7-1);let d=new Date(Date.parse(s+'T00:00:00Z'));for(let n=0;n<7;n++){const x=new Date(d.getTime()+n*864e5),last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();if(x.getUTCDate()===last)R.pay[w]+=sal}}}}
 const oth=E.c(F.other);if(oth)for(let w=1;w<=W;w++)R.oth[w]=oth;
 const open=E.rows('coa').filter(a=>a.bank).reduce((s,a)=>s+E.bal(a.code),0),cl=[],op=[];let run=open;
 for(let c=0;c<cols;c++){op[c]=run;run+=R.inv[c]+R.chin[c]-R.bill[c]-R.chout[c]-R.pay[c]-R.oth[c];cl[c]=run}
 return {R,op,cl,cols,W,T,open}}
const body=()=>{const C=calc(),R=C.R,hd=['Overdue'].concat(Array.from({length:C.W},(_,i)=>'Wk '+(i+1)+'<br><small>'+addD(C.T,i*7).slice(5)+'</small>'));
 const row=(l,a,cls)=>`<tr><td>${l}</td>${a.map(v=>`<td class="r ${cls||''}">${v?E.m(v):'-'}</td>`).join('')}</tr>`,neg=C.cl.map((v,i)=>[v,i]).filter(x=>x[0]<0);
 const low=C.cl.reduce((m,v,i)=>v<m.v?{v,i}:m,{v:Infinity,i:0});
 return `<div class="kp">${E.kpi('Cash & bank now',E.m(C.open),'Ledger balance today')}${E.kpi('Projected end',E.m(C.cl[C.cols-1]),'After '+C.W+' weeks')}${E.kpi('Lowest point',E.m(low.v),low.i?'Week '+low.i:'Overdue / now')}${E.kpi('Shortfall',neg.length?'<span class="bad">'+neg.length+' period(s) negative</span>':'<span class="ok">None</span>',neg.length?'First: '+(neg[0][1]?'Week '+neg[0][1]:'Overdue / now'):'Cash stays positive')}</div>
 <div class="tw"><table><thead><tr><th></th>${hd.map(h=>`<th class="r">${h}</th>`).join('')}</tr></thead><tbody>
 <tr><td><b>Opening balance</b></td>${C.op.map(v=>`<td class="r"><b>${E.m(v)}</b></td>`).join('')}</tr>
 ${row('+ Customer invoices due',R.inv,'ok')}${row('+ Cheques received clearing',R.chin,'ok')}${row('- Supplier bills due',R.bill,'bad')}${row('- Cheques issued clearing',R.chout,'bad')}${F.payroll==='yes'?row('- Salaries (estimate)',R.pay,'bad'):''}${F.other?row('- Other fixed costs',R.oth,'bad'):''}
 <tr><td><b>Closing balance</b></td>${C.cl.map(v=>`<td class="r ${v<0?'bad':''}"><b>${E.m(v)}</b></td>`).join('')}</tr></tbody></table></div>`};
E.route('cashflow','Cash Forecast',()=>`<div class="card"><div class="g2"><div class="f">Weeks ahead<select data-f="cf.weeks">${[4,8,12,13].map(n=>`<option ${+F.weeks===n?'selected':''}>${n}</option>`).join('')}</select></div><div class="f">Overdue customer invoices<select data-f="cf.collectOverdue"><option value="no" ${F.collectOverdue==='no'?'selected':''}>Do not count (cautious)</option><option value="yes" ${F.collectOverdue==='yes'?'selected':''}>Assume collected in week 1</option></select></div><div class="f">Overdue supplier bills / cheques out<select data-f="cf.payOverdue"><option value="yes" ${F.payOverdue==='yes'?'selected':''}>Assume paid in week 1</option><option value="no" ${F.payOverdue==='no'?'selected':''}>Do not count</option></select></div><div class="f">Estimate monthly salaries (paid on last day of month)<select data-f="cf.payroll"><option value="no" ${F.payroll==='no'?'selected':''}>No</option><option value="yes" ${F.payroll==='yes'?'selected':''}>Yes - gross salary + allowances</option></select></div><div class="f">Other fixed cost per week (Rs)<input type="number" step="0.01" data-f="cf.other" value="${E.esc(F.other)}"></div></div><p class="muted">Based on invoice/bill dates plus each party's credit days. Cheques use their cheque date; a cheque already past its date but not yet cleared is counted in week 1. Overdue invoices or bills you chose not to count are left out. Items beyond the horizon are not shown.</p></div><div id="cfb">${body()}</div>`);
E.hooks.push(e=>{const f=e.target.dataset&&e.target.dataset.f;if(f&&f.startsWith('cf.')){F[f.slice(3)]=e.target.value;E.$('cfb').innerHTML=body()}});
})(window.ERP);
