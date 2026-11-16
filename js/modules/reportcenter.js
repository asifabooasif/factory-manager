/* Report Center: Party Ledger (search any customer/supplier), Receivables, Payables, Day Book, Trial Balance, Account Ledger, Cash & Bank.
   Every report can be printed (with your logo) or exported to Excel (CSV). */
(E=>{
const R={tab:'party',from:E.today().slice(0,4)+'-01-01',to:E.today(),asat:E.today(),q:'',pid:'',acc:'',detail:false};
const P=id=>E.D.parties.find(x=>x.id===id)||{};
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+(+n||0));return x.toISOString().slice(0,10)};
const dayDiff=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const M=n=>({n:n||0}), T=(t,c)=>({t:String(t==null?'':t),c});
const nat=a=>a&&(a.type==='asset'||a.type==='expense');
const TABS=[['party','Party Ledger'],['ar','Receivables'],['ap','Payables'],['daybook','Day Book'],['tb','Trial Balance'],['gl','Account Ledger'],['bank','Cash & Bank']];
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
const build=()=>({party,ar:()=>ageing('ar'),ap:()=>ageing('ap'),daybook,tb,gl,bank}[R.tab]||party)();
/* ---------- rendering ---------- */
const cell=(c,i)=>{if('n' in c){const s=c.n===0&&!c.suf?'':E.m(c.n)+(c.suf?' '+c.suf:'');return `<td class="r">${s}</td>`}return `<td>${E.esc(c.t)}</td>`};
function tableHtml(m,print){
  if(!m.rows.length&&!m.foot)return '';
  return `<div class="tw"><table class="${print?'it cmp':''}"><thead><tr>${m.cols.map(c=>`<th class="${c[1]?'r':''}">${E.esc(c[0])}</th>`).join('')}</tr></thead><tbody>${m.rows.map(r=>`<tr class="${r.cls||''}" ${!print&&r.pid?`data-a="rcOpen" data-id="${r.pid}" style="cursor:pointer"`:''}>${r.c.map(cell).join('')}</tr>`).join('')||`<tr><td colspan="${m.cols.length}" class="muted">Nothing found for this selection</td></tr>`}</tbody>${m.foot?`<tfoot><tr>${m.foot.map(cell).join('').replace(/<td/g,'<td style="font-weight:700;border-top:2px solid"')}</tr></tfoot>`:''}</table></div>`}
function kpis(m){return `<div class="kp">${m.summary.map(([k,v])=>E.kpi(k,v)).join('')}</div>`}
function body(){
  if(R.tab==='party'){
    const m=party();
    let h=`<div class="f" style="max-width:520px"><input class="fs" data-f="rc.q" placeholder="Search a customer or supplier by name, code or phone…" value="${E.esc(R.q)}" autocomplete="off" style="width:100%"></div><div id="rc_res">${results()}</div>`;
    if(!m)return h+'<p class="muted">Type a name, for example <b>Rashmi</b>, and choose the party. Their complete transaction ledger opens here.</p>';
    return h+`<div class="card" style="margin-top:10px"><h3>${E.esc(m.who.name)} <span class="tag">${E.esc(m.who.type||'')}</span></h3><p class="muted">${E.esc([m.who.addr,m.who.phone&&'Tel '+m.who.phone,m.who.days?'Credit '+m.who.days+' days':''].filter(Boolean).join('  ·  '))}</p><p><b>${E.esc(m.note)}</b> (as at ${R.to})</p></div>${kpis(m)}<div class="card">${tableHtml(m)}</div>`+
     (m.open.length?`<div class="card"><h3>Outstanding documents</h3><div class="tw"><table><thead><tr><th>Type</th><th>No</th><th>Date</th><th>Due</th><th class="r">Balance</th></tr></thead><tbody>${m.open.map(o=>`<tr><td>${o[0]}</td><td>${E.esc(o[1])}</td><td>${o[2]}</td><td>${o[3]}${o[3]<E.today()?' <span class="bad">overdue</span>':''}</td><td class="r">${E.m(Math.abs(o[4]))}${o[4]<0?' (you owe)':''}</td></tr>`).join('')}</tbody></table></div></div>`:'')+
     (m.cheq.length?`<div class="card"><h3>Cheques not yet cleared</h3><div class="tw"><table><thead><tr><th>Cheque no</th><th>Date</th><th>Direction</th><th class="r">Amount</th></tr></thead><tbody>${m.cheq.map(c=>`<tr><td>${E.esc(c.chqNo||c.no)}</td><td>${E.esc(c.date)}</td><td>${c.dir==='in'?'Received':'Issued'}</td><td class="r">${E.m(c.amount)}</td></tr>`).join('')}</tbody></table></div></div>`:'');
  }
  if(R.tab==='gl'&&!E.acct(R.acc))return '<p class="muted">Choose an account above.</p>';
  const m=build();return (m.note?`<p class="muted">${E.esc(m.note)}</p>`:'')+kpis(m)+`<div class="card">${tableHtml(m)}</div>`}
function results(){
  const q=R.q.trim().toLowerCase();if(!q)return '';
  const f=E.rows('parties').filter(p=>(p.name+' '+(p.code||'')+' '+(p.phone||'')).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,12);
  if(!f.length)return '<p class="muted">No customer or supplier matches that name.</p>';
  return `<div class="tw"><table><tbody>${f.map(p=>{const b=ledgerFor(p.id,'','').close;return `<tr style="cursor:pointer" data-a="rcPick" data-id="${p.id}"><td><b>${E.esc(p.name)}</b> <span class="muted">${E.esc(p.code||'')}</span></td><td>${E.esc(p.type||'')}</td><td class="r">${b>0?'owes you '+E.m(b):b<0?'you owe '+E.m(-b):'—'}</td><td class="r"><button class="btn sm p">Open ledger</button></td></tr>`}).join('')}</tbody></table></div>`}
E.route('rcenter','Report Center',()=>{
  const dateBar=['party','daybook','gl','bank'].includes(R.tab),asBar=['ar','ap','tb'].includes(R.tab);
  return `<div class="bar" style="flex-wrap:wrap">${TABS.map(t=>`<button class="btn ${R.tab===t[0]?'p':''}" data-a="rcTab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div>
  <div class="bar" style="flex-wrap:wrap;margin-top:8px">${dateBar?`<span class="muted">From</span><input type="date" class="fs" data-f="rc.from" value="${R.from}"><span class="muted">to</span><input type="date" class="fs" data-f="rc.to" value="${R.to}">`:''}${asBar?`<span class="muted">As at</span><input type="date" class="fs" data-f="rc.asat" value="${R.asat}">`:''}${R.tab==='gl'?`<select class="fs" data-f="rc.acc" style="max-width:320px"><option value="">Choose account…</option>${E.opts(null,R.acc)}</select>`:''}${R.tab==='ar'||R.tab==='ap'?`<label class="muted"><input type="checkbox" data-a="rcDetail" ${R.detail?'checked':''}> Show every invoice / bill</label>`:''}<span class="gap"></span><button class="btn" data-a="rcCsv">⬇ Excel (CSV)</button><button class="btn p" data-a="rcPrint">🖨 Print</button></div>
  <div id="rcb" style="margin-top:10px">${body()}</div>`});
E.A.rcTab=t=>{R.tab=t;E.go()};E.A.rcDetail=(i,e)=>{R.detail=e.target.checked;E.$('rcb').innerHTML=body()};
E.A.rcPick=id=>{R.pid=id;R.q='';E.go()};E.A.rcOpen=id=>{R.tab='party';R.pid=id;R.q='';E.go()};
E.hooks.push(e=>{const f=e.target.dataset&&e.target.dataset.f;if(!f||!f.startsWith('rc.'))return;const k=f.slice(3);R[k]=e.target.value;
  if(k==='q'){const el=E.$('rc_res');if(el)el.innerHTML=results()}else{const el=E.$('rcb');if(el)el.innerHTML=body()}});
E.A.rcPrint=()=>{const m=build();if(!m)return E.toast('Choose a party or account first','error');
  const who=m.who?E.prWho(m.who,'Party'):'';
  const inner=`${who?`<div class="cards">${who}<div class="card"><h4>Position</h4><strong>${E.esc(m.note)}</strong><div class="sm">As at ${R.to}</div></div></div>`:''}
   <div class="cards" style="grid-template-columns:repeat(${m.summary.length},1fr);margin-top:10px">${m.summary.map(([k,v])=>`<div class="card" style="min-height:0"><h4>${E.esc(k)}</h4><strong>${E.esc(v)}</strong></div>`).join('')}</div>
   ${tableHtml(m,true)}${m.note&&!m.who?`<p class="sm" style="margin-top:8px">${E.esc(m.note)}</p>`:''}`;
  E.prOut(E.prPage(m.title,[...m.meta,['Printed',E.today()]],(m.sub&&!m.who?`<p style="margin:0 0 6px;font-size:13px"><b>${E.esc(m.sub)}</b></p>`:'')+inner,{nosign:true,land:!!m.land}))};
E.A.rcCsv=()=>{const m=build();if(!m)return E.toast('Choose a party or account first','error');const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const line=c=>('n' in c)?(c.n/100).toFixed(2)+(c.suf?' '+c.suf:''):c.t;
  const out=[[E.factory().name],[m.title+' - '+(m.sub||'')],[],m.cols.map(c=>c[0]),...m.rows.map(r=>r.c.map(line)),...(m.foot?[m.foot.map(line)]:[])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+out.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download=m.title.toLowerCase().replace(/ /g,'-')+(m.who?'-'+m.who.name.replace(/\W+/g,'_'):'')+'-'+E.today()+'.csv';a.click()};
})(window.ERP);
