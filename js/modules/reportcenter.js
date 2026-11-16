/* Report Center: Party Ledger (search any customer/supplier), Receivables, Payables, Day Book, Trial Balance, Account Ledger, Cash & Bank.
   Every report can be printed (with your logo) or exported to Excel (CSV). */
(E=>{
const R={tab:'party',kind:'party',flt:'',from:E.today().slice(0,4)+'-01-01',to:E.today(),asat:E.today(),q:'',pid:'',acc:'',detail:false};
const P=id=>E.D.parties.find(x=>x.id===id)||{};
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+(+n||0));return x.toISOString().slice(0,10)};
const dayDiff=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const M=n=>({n:n||0}),Q=n=>({q:n||0}), T=(t,c)=>({t:String(t==null?'':t),c});
const nat=a=>a&&(a.type==='asset'||a.type==='expense');
const TABS=[['party','Ledger Search (anything)'],['ar','Receivables'],['ap','Payables'],['daybook','Day Book'],['tb','Trial Balance'],['gl','Account Ledger'],['bank','Cash & Bank']];
E.nav('Reports','rcenter','🗂','Report Center');

/* ---------- Party ledger: every transaction of one customer / supplier ---------- */
function ledgerFor(pid,from,to){
  const x=[];const add=(date,no,type,ref,desc,dr,cr)=>{if(dr||cr)x.push({date:date||'',no:no||'',type,ref:ref||'',desc:desc||'',dr:dr||0,cr:cr||0})};
  const inv=id=>(E.D.invoices.find(i=>i.id===id)||{}).no||'', bill=id=>(E.D.purchases.find(i=>i.id===id)||{}).no||'';
  E.rows('invoices').filter(i=>i.partyId===pid&&!i.cancelled).forEach(i=>add(i.date,i.no,i.opening?'Opening balance (customer)':'Sales invoice',(i.dnIds||[]).map(d=>(E.D.deliveries.find(q=>q.id===d)||{}).no).filter(Boolean).join(', ')||i.ref||'','',i.total,0));
  E.rows('receipts').filter(r=>r.partyId===pid).forEach(r=>{
    if(r.kind==='credit'){add(r.date,r.no,'Sales return / credit note','Invoice '+inv(r.invId),'',0,r.amount);if(r.refund)add(r.date,r.no,'Refund paid to customer','Invoice '+inv(r.invId),'',r.amount,0)}
    else{const m=(E.acct(r.acc)||{}).name||r.acc||'';add(r.date,r.no,'Receipt',m,(r.allocs||[]).map(a=>inv(a.id)).filter(Boolean).join(', '),0,r.amount);if(r.reversed)add(r.reversedOn||r.date,r.no,'Receipt reversed',m,'',r.amount,0)}});
  E.rows('purchases').filter(b=>b.partyId===pid&&!b.cancelled).forEach(b=>add(b.date,b.no,b.opening?'Opening balance (supplier)':'Purchase bill',b.invNo?'Supplier inv '+b.invNo:'',b.grnNo?'GRN '+b.grnNo:'',0,b.total));
  E.rows('payments').filter(r=>r.partyId===pid).forEach(r=>{
    if(r.kind==='debit'){add(r.date,r.no,'Purchase return / debit note','Bill '+bill(r.billId),'',r.amount,0);if(r.refund)add(r.date,r.no,'Refund received from supplier','Bill '+bill(r.billId),'',0,r.amount)}
    else{const m=(E.acct(r.acc)||{}).name||r.acc||'';add(r.date,r.no,'Payment',m,(r.allocs||[]).map(a=>bill(a.id)).filter(Boolean).join(', '),r.amount,0);if(r.reversed)add(r.reversedOn||r.date,r.no,'Payment reversed',m,'',0,r.amount)}});
  x.sort((a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no));
  let bal=0,open=0;const rows=[];
  x.forEach(t=>{if(from&&t.date<from){open+=t.dr-t.cr;bal=open;return}if(to&&t.date>to)return;bal+=t.dr-t.cr;rows.push(Object.assign({bal},t))});
  const dr=rows.reduce((s,t)=>s+t.dr,0),cr=rows.reduce((s,t)=>s+t.cr,0);
  return {open,rows,dr,cr,close:open+dr-cr};
}
const drcr=v=>v>0?'Dr':(v<0?'Cr':'');
const bal=v=>({n:Math.abs(v),suf:drcr(v)});
function party(){
  const p=P(R.pid);if(!R.pid||!p.id)return null;
  const L=ledgerFor(R.pid,R.from,R.to);
  const cheq=E.rows('cheques').filter(c=>c.partyId===R.pid&&c.status==='Pending');
  const rows=[];
  if(R.from)rows.push({c:[T(R.from),T(''),T('Balance brought forward'),T(''),T(''),M(0),M(0),bal(L.open)],cls:'b'});
  L.rows.forEach(t=>rows.push({c:[T(t.date),T(t.no),T(t.type),T(t.ref),T(t.desc),M(t.dr),M(t.cr),bal(t.bal)]}));
  const word=L.close>0?`${p.name} owes you ${E.m(L.close)}`:L.close<0?`You owe ${p.name} ${E.m(-L.close)}`:'Nothing outstanding';
  const od=[];E.rows('invoices').filter(i=>i.partyId===R.pid&&!i.cancelled&&i.total-i.paid>0).forEach(i=>od.push(['Invoice',i.no,i.date,addDays(i.date,p.days||0),i.total-i.paid]));
  E.rows('purchases').filter(b=>b.partyId===R.pid&&!b.cancelled&&b.total-b.paid>0).forEach(b=>od.push(['Bill',b.no,b.date,addDays(b.date,p.days||0),-(b.total-b.paid)]));
  return {title:'PARTY LEDGER',sub:p.name,cols:[['Date'],['Entry'],['Type'],['Reference'],['Details'],['Debit',1],['Credit',1],['Balance',1]],rows,
    foot:[T(''),T(''),T('Period total'),T(''),T(''),M(L.dr),M(L.cr),bal(L.close)],
    summary:[['Opening',E.m(Math.abs(L.open))+' '+drcr(L.open)],['Debits',E.m(L.dr)],['Credits',E.m(L.cr)],['Closing',E.m(Math.abs(L.close))+' '+drcr(L.close)]],
    note:word,who:p,open:od,cheq,meta:[['Party',p.name],['Period',(R.from||'start')+' to '+R.to]],land:true};
}

/* ---------- Employee / worker ledger ---------- */
function empM(){
  const e=E.D.employees.find(x=>x.id===R.pid);if(!e)return null;
  if(!E.empLedgerEvents)return {title:'EMPLOYEE LEDGER',sub:e.name,cols:[['Info']],rows:[{c:[T('Update js/modules/payroll.js to see employee ledgers here.')]}],summary:[],meta:[],who:{name:e.name,type:'Employee',addr:e.code||''},note:''};
  const ev=E.empLedgerEvents(e.id).slice().sort((a,b)=>a.d.localeCompare(b.d));let before=0,run=0,earn=0,giv=0,rec=0,paid=0;const rows=[];
  ev.forEach(x=>{const g=x.adv+x.loan;if(R.from&&x.d<R.from){before+=g;run=before;return}if(R.to&&x.d>R.to)return;run+=g;earn+=x.earn||0;paid+=x.pay||0;if(g>0)giv+=g;else rec-=g;
    rows.push({c:[T(x.d),T(x.k),T(x.t),M(x.earn||0),M(g>0?g:0),M(g<0?-g:0),M(x.pay||0),M(run)]})});
  if(R.from)rows.unshift({c:[T(R.from),T(''),T('Brought forward (advances + loans)'),M(0),M(0),M(0),M(0),M(before)],cls:'b'});
  const ab=E.advBal?E.advBal(e.id):0,lb=E.loanBal?E.loanBal(e.id):0;
  return {title:'EMPLOYEE LEDGER',sub:(e.code||'')+' · '+e.name,cols:[['Date'],['Type'],['Details'],['Earned',1],['Advance / loan given',1],['Recovered',1],['Paid',1],['Advance + loan balance',1]],rows,
    foot:[T(''),T(''),T('Period total'),M(earn),M(giv),M(rec),M(paid),M(run)],summary:[['Earned',E.m(earn)],['Paid',E.m(paid)],['Advance balance',E.m(ab)],['Staff loan balance',E.m(lb)]],
    note:`Advance balance ${E.m(ab)} · Staff loan balance ${E.m(lb)}`,who:{name:e.name,type:'Employee',addr:[e.code,e.phone].filter(Boolean).join('  ·  ')},meta:[['Employee',(e.code||'')+' '+e.name],['Period',(R.from||'start')+' to '+R.to]],land:true};
}
/* ---------- Any chart-of-accounts account (expenses, income, bank, assets, liabilities) ---------- */
function acctM(){const a=E.acct(R.pid);if(!a)return null;R.acc=a.code;const m=gl();m.who={name:a.code+' · '+a.name,type:a.type,addr:a.nature?'Nature: '+a.nature:''};m.note='Closing balance '+m.summary[3][1];return m}
/* ---------- A production job: every cost posted to work-in-progress ---------- */
function jobM(){
  const j=E.D.jobs.find(x=>x.id===R.pid);if(!j)return null;let open=0,run=0,dr=0,cr=0;const cat={Material:0,Labour:0,Overhead:0},rows=[];
  E.rows('journalEntries').slice().sort((a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no)).forEach(je=>je.lines.forEach(l=>{if(l.job!==j.id||l.acc!=='1310')return;const v=l.dr-l.cr;
    if(R.from&&je.date<R.from){open+=v;run=open;return}if(R.to&&je.date>R.to)return;run+=v;dr+=l.dr;cr+=l.cr;if(cat[l.cat]!=null)cat[l.cat]+=v;
    rows.push({c:[T(je.date),T(je.no),T(je.source||''),T(l.cat||''),T(l.narr||je.narr||''),M(l.dr),M(l.cr),M(run)]})}));
  if(R.from)rows.unshift({c:[T(R.from),T(''),T(''),T(''),T('Brought forward'),M(0),M(0),M(open)],cls:'b'});
  const cu=P(j.partyId);
  return {title:'JOB COST LEDGER',sub:'Job '+j.no,cols:[['Date'],['Entry'],['Source'],['Cost type'],['Narration'],['Cost added',1],['Released / credited',1],['Work-in-progress balance',1]],rows,
    foot:[T(''),T(''),T(''),T(''),T('Period total'),M(dr),M(cr),M(run)],summary:[['Materials',E.m(cat.Material)],['Labour',E.m(cat.Labour)],['Overhead',E.m(cat.Overhead)],['Balance in WIP',E.m(run)]],
    note:`Status: ${j.status||''}${j.due?' · due '+j.due:''}`,who:{name:'Job '+j.no,type:'Job',addr:[cu.name&&'Customer: '+cu.name,j.notes].filter(Boolean).join('\n')},meta:[['Job',j.no],['Period',(R.from||'start')+' to '+R.to]],land:true};
}
/* ---------- An article or material: every stock movement ---------- */
function itemM(){
  const it=E.D.items.find(x=>x.id===R.pid);if(!it)return null;let oq=0,ov=0,q=0,v=0,inq=0,outq=0;const rows=[];
  E.rows('stockMoves').filter(x=>x.itemId===it.id).sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{
    if(R.from&&x.date<R.from){oq+=x.qty;ov+=x.value;q=oq;v=ov;return}if(R.to&&x.date>R.to)return;q+=x.qty;v+=x.value;if(x.qty>0)inq+=x.qty;else outq-=x.qty;
    const vr=E.D.variants&&E.D.variants.find(y=>y.id===x.variantId);const jb=x.job?(E.D.jobs.find(y=>y.id===x.job)||{}).no||'':'';
    rows.push({c:[T(x.date),T(x.type||''),T(x.ref||''),T(vr?(vr.code||vr.name||''):''),T(jb),Q(x.qty>0?x.qty:0),Q(x.qty<0?-x.qty:0),M(x.value),Q(q),M(v)]})});
  if(R.from)rows.unshift({c:[T(R.from),T(''),T('Brought forward'),T(''),T(''),Q(0),Q(0),M(0),Q(oq),M(ov)],cls:'b'});
  return {title:'STOCK LEDGER',sub:(it.code||'')+' · '+it.name,cols:[['Date'],['Type'],['Reference'],['Variant'],['Job'],['Qty in',1],['Qty out',1],['Value',1],['Qty balance',1],['Value balance',1]],rows,
    foot:[T(''),T(''),T(''),T(''),T('Period total'),Q(inq),Q(outq),M(v-ov),Q(q),M(v)],summary:[['In',String(+inq.toFixed(3))],['Out',String(+outq.toFixed(3))],['On hand',String(+q.toFixed(3))],['Stock value',E.m(v)]],
    note:`On hand ${+q.toFixed(3)} · value ${E.m(v)}`,who:{name:it.name,type:it.cat||'Item',addr:it.code||''},meta:[['Item',(it.code||'')+' '+it.name],['Period',(R.from||'start')+' to '+R.to]],land:true};
}
const entity=()=>({party,emp:empM,acct:acctM,job:jobM,item:itemM}[R.kind]||party)();
/* ---------- Receivables / Payables ageing ---------- */
const BK=['Not due','1-30 days','31-60 days','61-90 days','Over 90'];
function ageing(kind){
  const ar=kind==='ar',docs=(ar?E.rows('invoices'):E.rows('purchases')).filter(d=>!d.cancelled&&d.total-d.paid>0&&d.date<=R.asat),by={};
  docs.forEach(d=>{const p=P(d.partyId),due=addDays(d.date,p.days||0),late=dayDiff(due,R.asat),b=late<=0?0:late<=30?1:late<=60?2:late<=90?3:4,g=by[d.partyId]||(by[d.partyId]={p,v:[0,0,0,0,0],docs:[]});
    g.v[b]+=d.total-d.paid;g.docs.push({d,due,late,bal:d.total-d.paid})});
  const rows=[],tot=[0,0,0,0,0];
  Object.values(by).sort((a,b)=>(a.p.name||'').localeCompare(b.p.name||'')).forEach(g=>{
    const t=g.v.reduce((s,x)=>s+x,0);g.v.forEach((x,i)=>tot[i]+=x);
    rows.push({c:[T(g.p.name||'?'),...g.v.map(M),M(t),T(ar&&g.p.limit&&t>g.p.limit?'Over limit '+E.m(g.p.limit):''),],pid:g.p.id,cls:'b'});
    if(R.detail)g.docs.sort((a,b)=>a.d.date.localeCompare(b.d.date)).forEach(x=>rows.push({c:[T(`${x.d.no}  ·  ${x.d.date}  ·  due ${x.due}`+(x.late>0?`  ·  ${x.late} days late`:'')),T(''),T(''),T(''),T(''),T(''),M(x.bal),T('')],cls:'sub'}))});
  const all=tot.reduce((s,x)=>s+x,0);
  return {title:ar?'RECEIVABLES AGEING':'PAYABLES AGEING',sub:(ar?'Customers who owe you':'Suppliers you owe')+' · as at '+R.asat,cols:[[ar?'Customer':'Supplier'],...BK.map(b=>[b,1]),['Total',1],[ar?'Credit limit':'']],rows,
    foot:[T('TOTAL'),...tot.map(M),M(all),T('')],summary:[['Total outstanding',E.m(all)],['Overdue',E.m(tot.slice(1).reduce((s,x)=>s+x,0))],[ar?'Customers':'Suppliers',String(rows.filter(r=>r.pid).length)]],
    meta:[['As at',R.asat],['Ageing from','due date']],land:true,note:'Ageing counts days after the due date (invoice date plus the party’s credit days). Balances are as they stand now.'};
}
/* ---------- Day book ---------- */
function daybook(){
  const rows=[];let n=0,dr=0;
  E.rows('journalEntries').filter(j=>j.date>=R.from&&j.date<=R.to).sort((a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no)).forEach(j=>{
    const t=j.lines.reduce((s,l)=>s+l.dr,0);n++;dr+=t;
    rows.push({c:[T(j.date),T(j.no),T(j.source||'manual'),T((j.narr||'')+(j.ref?'  ['+j.ref+']':'')),M(t),T('')],cls:'b'});
    j.lines.forEach(l=>rows.push({c:[T(''),T(''),T(l.acc+'  '+((E.acct(l.acc)||{}).name||'')),T(l.narr||''),M(l.dr||0),M(l.cr||0)],cls:'sub'}))});
  return {title:'DAY BOOK',sub:R.from+' to '+R.to,cols:[['Date'],['Entry'],['Source / account'],['Narration'],['Debit',1],['Credit',1]],rows,foot:[T(''),T(''),T(n+' entries'),T(''),M(dr),M(dr)],summary:[['Entries',String(n)],['Total value',E.m(dr)]],meta:[['Period',R.from+' to '+R.to]],land:true};
}
/* ---------- Trial balance as at a date ---------- */
function net(from,to){const m={};E.rows('journalEntries').forEach(j=>{if((from&&j.date<from)||(to&&j.date>to))return;j.lines.forEach(l=>m[l.acc]=(m[l.acc]||0)+l.dr-l.cr)});return m}
function tb(){
  const m=net('',R.asat),rows=[];let d=0,c=0;
  E.rows('coa').slice().sort((a,b)=>a.code.localeCompare(b.code)).forEach(a=>{const v=m[a.code]||0;if(!v)return;if(v>0)d+=v;else c-=v;rows.push({c:[T(a.code),T(a.name),T(a.type),M(v>0?v:0),M(v<0?-v:0)]})});
  return {title:'TRIAL BALANCE',sub:'As at '+R.asat,cols:[['Code'],['Account'],['Type'],['Debit',1],['Credit',1]],rows,foot:[T(''),T('TOTAL'),T(''),M(d),M(c)],summary:[['Total debit',E.m(d)],['Total credit',E.m(c)],['Check',d===c?'Balanced':'OUT BY '+E.m(Math.abs(d-c))]],meta:[['As at',R.asat]],note:d===c?'':'The trial balance does not balance. Please check the Health Check screen.'};
}
/* ---------- Account ledger (general ledger) ---------- */
function gl(){
  const a=E.acct(R.acc);if(!a)return null;const dn=nat(a);let open=0,run=0;const rows=[];let dr=0,cr=0;
  E.rows('journalEntries').slice().sort((x,y)=>x.date.localeCompare(y.date)||x.no.localeCompare(y.no)).forEach(j=>j.lines.forEach(l=>{if(l.acc!==R.acc)return;const v=dn?l.dr-l.cr:l.cr-l.dr;
    if(R.from&&j.date<R.from){open+=v;run=open;return}if(R.to&&j.date>R.to)return;run+=v;dr+=l.dr;cr+=l.cr;
    rows.push({c:[T(j.date),T(j.no),T(j.source||'manual'),T(l.narr||j.narr||''),T(l.job?(E.D.jobs.find(x=>x.id===l.job)||{}).no||'':''),M(l.dr),M(l.cr),M(run)]})}));
  if(R.from)rows.unshift({c:[T(R.from),T(''),T(''),T('Balance brought forward'),T(''),M(0),M(0),M(open)],cls:'b'});
  return {title:'ACCOUNT LEDGER',sub:a.code+' · '+a.name,cols:[['Date'],['Entry'],['Source'],['Narration'],['Job'],['Debit',1],['Credit',1],['Balance',1]],rows,foot:[T(''),T(''),T(''),T('Period total'),T(''),M(dr),M(cr),M(run)],summary:[['Opening',E.m(open)],['Debits',E.m(dr)],['Credits',E.m(cr)],['Closing',E.m(run)]],meta:[['Account',a.code+' '+a.name],['Period',(R.from||'start')+' to '+R.to]],land:true};
}
/* ---------- Cash & bank ---------- */
function bank(){
  const A=E.rows('coa').filter(a=>a.bank).sort((a,b)=>a.code.localeCompare(b.code)),o=net('',addDays(R.from,-1)),p=net(R.from,R.to),rows=[];let to=0,ti=0,tp=0,tc=0;
  const flow={};E.rows('journalEntries').filter(j=>j.date>=R.from&&j.date<=R.to).forEach(j=>j.lines.forEach(l=>{const f=flow[l.acc]||(flow[l.acc]={i:0,o:0});f.i+=l.dr;f.o+=l.cr}));
  A.forEach(a=>{const op=o[a.code]||0,f=flow[a.code]||{i:0,o:0},cl=op+f.i-f.o;to+=op;ti+=f.i;tp+=f.o;tc+=cl;rows.push({c:[T(a.code),T(a.name),M(op),M(f.i),M(f.o),M(cl)]})});
  return {title:'CASH & BANK SUMMARY',sub:R.from+' to '+R.to,cols:[['Code'],['Account'],['Opening',1],['Money in',1],['Money out',1],['Closing',1]],rows,foot:[T(''),T('TOTAL'),M(to),M(ti),M(tp),M(tc)],summary:[['Opening',E.m(to)],['In',E.m(ti)],['Out',E.m(tp)],['Closing',E.m(tc)]],meta:[['Period',R.from+' to '+R.to]]};
}
const build=()=>({party:entity,ar:()=>ageing('ar'),ap:()=>ageing('ap'),daybook,tb,gl,bank}[R.tab]||party)();
/* ---------- rendering ---------- */
const cell=(c,i)=>{if('q' in c)return `<td class="r">${c.q?+(+c.q).toFixed(3):''}</td>`;if('n' in c){const s=c.n===0&&!c.suf?'':E.m(c.n)+(c.suf?' '+c.suf:'');return `<td class="r">${s}</td>`}return `<td>${E.esc(c.t)}</td>`};
function tableHtml(m,print){
  if(!m.rows.length&&!m.foot)return '';
  return `<div class="tw"><table class="${print?'it cmp':''}"><thead><tr>${m.cols.map(c=>`<th class="${c[1]?'r':''}">${E.esc(c[0])}</th>`).join('')}</tr></thead><tbody>${m.rows.map(r=>`<tr class="${r.cls||''}" ${!print&&r.pid?`data-a="rcOpen" data-id="${r.pid}" style="cursor:pointer"`:''}>${r.c.map(cell).join('')}</tr>`).join('')||`<tr><td colspan="${m.cols.length}" class="muted">Nothing found for this selection</td></tr>`}</tbody>${m.foot?`<tfoot><tr>${m.foot.map(cell).join('').replace(/<td/g,'<td style="font-weight:700;border-top:2px solid"')}</tr></tfoot>`:''}</table></div>`}
function kpis(m){return `<div class="kp">${m.summary.map(([k,v])=>E.kpi(k,v)).join('')}</div>`}
function body(){
  if(R.tab==='party'){
    const m=entity();
    let h=`<div class="bar" style="flex-wrap:wrap"><input class="fs" data-f="rc.q" placeholder="Search anything: a supplier, customer, worker, expense, bank, job or item…" value="${E.esc(R.q)}" autocomplete="off" style="min-width:300px;flex:1"><select class="fs" data-f="rc.flt">${[['','Everything'],['party','Customers & suppliers'],['emp','Employees / workers'],['exp','Expense accounts'],['acct','All accounts (bank, income, assets…)'],['job','Jobs'],['item','Articles & materials']].map(o=>`<option value="${o[0]}" ${R.flt===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div><div id="rc_res">${results()}</div>`;
    if(!m)return h+'<p class="muted">Type a name, for example <b>Rashmi</b>, <b>Electricity</b>, a worker or a job number, and choose it. The complete transaction ledger opens here, ready to print or export.</p>';
    const w=m.who||{};
    return h+`<div class="card" style="margin-top:10px"><h3>${E.esc(w.name||'')} <span class="tag">${E.esc(w.type||'')}</span></h3><p class="muted">${E.esc([w.addr,w.phone&&'Tel '+w.phone,w.days?'Credit '+w.days+' days':''].filter(Boolean).join('  ·  '))}</p><p><b>${E.esc(m.note||'')}</b> (as at ${R.to})</p></div>${kpis(m)}<div class="card">${tableHtml(m)}</div>`+
     ((m.open||[]).length?`<div class="card"><h3>Outstanding documents</h3><div class="tw"><table><thead><tr><th>Type</th><th>No</th><th>Date</th><th>Due</th><th class="r">Balance</th></tr></thead><tbody>${m.open.map(o=>`<tr><td>${o[0]}</td><td>${E.esc(o[1])}</td><td>${o[2]}</td><td>${o[3]}${o[3]<E.today()?' <span class="bad">overdue</span>':''}</td><td class="r">${E.m(Math.abs(o[4]))}${o[4]<0?' (you owe)':''}</td></tr>`).join('')}</tbody></table></div></div>`:'')+
     ((m.cheq||[]).length?`<div class="card"><h3>Cheques not yet cleared</h3><div class="tw"><table><thead><tr><th>Cheque no</th><th>Date</th><th>Direction</th><th class="r">Amount</th></tr></thead><tbody>${m.cheq.map(c=>`<tr><td>${E.esc(c.chqNo||c.no)}</td><td>${E.esc(c.date)}</td><td>${c.dir==='in'?'Received':'Issued'}</td><td class="r">${E.m(c.amount)}</td></tr>`).join('')}</tbody></table></div></div>`:'');
  }
  if(R.tab==='gl'&&!E.acct(R.acc))return '<p class="muted">Choose an account above.</p>';
  const m=build();return (m.note?`<p class="muted">${E.esc(m.note)}</p>`:'')+kpis(m)+`<div class="card">${tableHtml(m)}</div>`}
const KL={party:'Customer / supplier',emp:'Employee',acct:'Account',job:'Job',item:'Item'};
function results(){
  const q=R.q.trim().toLowerCase(),f=R.flt,out=[];if(!q&&!f)return '';
  const hit=s=>!q||s.toLowerCase().includes(q);
  if(!f||f==='party')E.rows('parties').filter(p=>hit(p.name+' '+(p.code||'')+' '+(p.phone||''))).forEach(p=>out.push({k:'party',id:p.id,l:p.name,s:(p.type||'')+(p.code?' · '+p.code:''),b:()=>{const b=ledgerFor(p.id,'','').close;return b>0?'owes you '+E.m(b):b<0?'you owe '+E.m(-b):'—'}}));
  if(!f||f==='emp')E.rows('employees').filter(e=>hit(e.name+' '+(e.code||'')+' '+(e.phone||''))).forEach(e=>out.push({k:'emp',id:e.id,l:e.name,s:'Employee'+(e.code?' · '+e.code:''),b:()=>{const a=(E.advBal?E.advBal(e.id):0)+(E.loanBal?E.loanBal(e.id):0);return a?'advance/loan '+E.m(a):'—'}}));
  if(!f||f==='exp'||f==='acct')E.rows('coa').filter(a=>(f!=='exp'||a.type==='expense')&&hit(a.code+' '+a.name+' '+a.type)).forEach(a=>out.push({k:'acct',id:a.code,l:a.code+' · '+a.name,s:'Account · '+a.type,b:()=>{const t=net('',E.today())[a.code]||0;return E.m(Math.abs(t))+(t>0?' Dr':t<0?' Cr':'')}}));
  if(!f||f==='job')E.rows('jobs').filter(j=>hit((j.no||'')+' '+(P(j.partyId).name||'')+' '+(j.notes||''))).forEach(j=>out.push({k:'job',id:j.id,l:'Job '+j.no,s:'Job · '+(P(j.partyId).name||'')+' · '+(j.status||''),b:()=>''}));
  if(!f||f==='item')E.rows('items').filter(i=>hit((i.name||'')+' '+(i.code||''))).forEach(i=>out.push({k:'item',id:i.id,l:i.name,s:'Item · '+(i.code||'')+(i.cat?' · '+i.cat:''),b:()=>''}));
  if(!out.length)return '<p class="muted">Nothing matches. Check the spelling or change the filter.</p>';
  out.sort((a,b)=>a.l.localeCompare(b.l));const sh=out.slice(0,25);
  return `<div class="tw"><table><tbody>${sh.map(o=>`<tr style="cursor:pointer" data-a="rcPick" data-id="${o.k}|${E.esc(o.id)}"><td><b>${E.esc(o.l)}</b></td><td class="muted">${E.esc(o.s)}</td><td class="r">${E.esc(o.b())}</td><td class="r"><button class="btn sm p">Open ledger</button></td></tr>`).join('')}</tbody></table></div>${out.length>25?`<p class="muted">Showing 25 of ${out.length}. Type more of the name to narrow it down.</p>`:''}`}
E.route('rcenter','Report Center',()=>{
  const dateBar=['party','daybook','gl','bank'].includes(R.tab),asBar=['ar','ap','tb'].includes(R.tab);
  return `<div class="bar" style="flex-wrap:wrap">${TABS.map(t=>`<button class="btn ${R.tab===t[0]?'p':''}" data-a="rcTab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div>
  <div class="bar" style="flex-wrap:wrap;margin-top:8px">${dateBar?`<span class="muted">From</span><input type="date" class="fs" data-f="rc.from" value="${R.from}"><span class="muted">to</span><input type="date" class="fs" data-f="rc.to" value="${R.to}">`:''}${asBar?`<span class="muted">As at</span><input type="date" class="fs" data-f="rc.asat" value="${R.asat}">`:''}${R.tab==='gl'?`<select class="fs" data-f="rc.acc" style="max-width:320px"><option value="">Choose account…</option>${E.opts(null,R.acc)}</select>`:''}${R.tab==='ar'||R.tab==='ap'?`<label class="muted"><input type="checkbox" data-a="rcDetail" ${R.detail?'checked':''}> Show every invoice / bill</label>`:''}<span class="gap"></span><button class="btn" data-a="rcCsv">⬇ Excel (CSV)</button><button class="btn p" data-a="rcPrint">🖨 Print</button></div>
  <div id="rcb" style="margin-top:10px">${body()}</div>`});
E.A.rcTab=t=>{R.tab=t;E.go()};E.A.rcDetail=(i,e)=>{R.detail=e.target.checked;E.$('rcb').innerHTML=body()};
E.A.rcPick=id=>{const i=String(id).indexOf('|');R.kind=String(id).slice(0,i);R.pid=String(id).slice(i+1);R.q='';E.go()};E.A.rcOpen=id=>{R.tab='party';R.kind='party';R.pid=id;R.q='';E.go()};
E.hooks.push(e=>{const f=e.target.dataset&&e.target.dataset.f;if(!f||!f.startsWith('rc.'))return;const k=f.slice(3);R[k]=e.target.value;
  if(k==='q'||k==='flt'){const el=E.$('rc_res');if(el)el.innerHTML=results()}else{const el=E.$('rcb');if(el)el.innerHTML=body()}});
E.A.rcPrint=()=>{const m=build();if(!m)return E.toast('Choose a party or account first','error');
  const who=m.who?E.prWho({name:m.who.name,addr:m.who.addr,phone:m.who.phone,code:''},KL[R.kind]||'Ledger of'):'';
  const inner=`${who?`<div class="cards">${who}<div class="card"><h4>Position</h4><strong>${E.esc(m.note||'')}</strong><div class="sm">As at ${R.to}</div></div></div>`:''}
   <div class="cards" style="grid-template-columns:repeat(${m.summary.length},1fr);margin-top:10px">${m.summary.map(([k,v])=>`<div class="card" style="min-height:0"><h4>${E.esc(k)}</h4><strong>${E.esc(v)}</strong></div>`).join('')}</div>
   ${tableHtml(m,true)}${m.note&&!m.who?`<p class="sm" style="margin-top:8px">${E.esc(m.note)}</p>`:''}`;
  E.prOut(E.prPage(m.title,[...m.meta,['Printed',E.today()]],(m.sub&&!m.who?`<p style="margin:0 0 6px;font-size:13px"><b>${E.esc(m.sub)}</b></p>`:'')+inner,{nosign:true,land:!!m.land}))};
E.A.rcCsv=()=>{const m=build();if(!m)return E.toast('Choose a party or account first','error');const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const line=c=>('q' in c)?(c.q||''):('n' in c)?(c.n/100).toFixed(2)+(c.suf?' '+c.suf:''):c.t;
  const out=[[E.factory().name],[m.title+' - '+(m.sub||'')],[],m.cols.map(c=>c[0]),...m.rows.map(r=>r.c.map(line)),...(m.foot?[m.foot.map(line)]:[])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+out.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download=m.title.toLowerCase().replace(/ /g,'-')+(m.who?'-'+m.who.name.replace(/\W+/g,'_').slice(0,30):'')+'-'+E.today()+'.csv';a.click()};
})(window.ERP);
