/* Salary & Advance Register — per worker for a chosen month: advances taken, recovered, balance, salary paid. */
(E=>{let M=E.today().slice(0,7);
E.nav('People & Payroll','advreg','📒','Salary & Advance Register');
const runs=()=>E.rows('wageRuns').filter(r=>r.kind==='run'&&!r.cancelled),adv=()=>E.rows('wageRuns').filter(r=>r.kind==='advance'&&!r.cancelled);
function data(){const f=M+'-01',t=M+'-31';return E.rows('employees').sort((a,b)=>a.code.localeCompare(b.code)).map(e=>{
 const A=adv().filter(r=>r.empId===e.id),R=runs().map(r=>({r,l:r.lines.find(l=>l.empId===e.id)})).filter(x=>x.l),
  g0=A.filter(r=>r.date<f).reduce((s,r)=>s+r.amount,0),c0=R.filter(x=>x.r.date<f).reduce((s,x)=>s+(x.l.advRec||0),0),
  gm=A.filter(r=>r.date>=f&&r.date<=t),cm=R.filter(x=>x.r.date>=f&&x.r.date<=t),
  g=gm.reduce((s,r)=>s+r.amount,0),c=cm.reduce((s,x)=>s+(x.l.advRec||0),0),netS=cm.filter(x=>x.r.type==='Monthly').reduce((s,x)=>s+(x.l.net||0),0),netW=cm.filter(x=>x.r.type!=='Monthly').reduce((s,x)=>s+(x.l.net||0),0),net=netS+netW;
 return{e,open:g0-c0,gm,g,c,close:g0-c0+g-c,net,netS,netW}}).filter(x=>x.open||x.g||x.c||x.net||x.close)}
const body=()=>{const D=data(),S=k=>D.reduce((s,x)=>s+x[k],0);
 return `<div class="kp">${E.kpi('Advances given',E.m(S('g')),M)}${E.kpi('Recovered',E.m(S('c')),'from wages')}${E.kpi('Advance balance',E.m(S('close')),'still owed by workers')}${E.kpi('Wages (net)',E.m(S('netW')),'piece & daily')+E.kpi('Salaries (net)',E.m(S('netS')),'monthly staff')}</div>
 <div class="tw"><table><thead><tr><th>Worker</th><th class="r">Opening advance</th><th>Advances taken this month</th><th class="r">Total taken</th><th class="r">Recovered</th><th class="r">Closing balance</th><th class="r">Wages paid (net)</th><th class="r">Salary (net)</th></tr></thead><tbody>${D.map(x=>`<tr><td><b>${E.esc(x.e.name)}</b><br><span class="muted">${x.e.code} · ${x.e.payType}</span></td><td class="r">${E.m(x.open)}</td><td>${x.gm.map(r=>r.date.slice(5)+' · '+E.m(r.amount)).join('<br>')||'—'}<div class="muted" style="font-size:11px">${x.gm.length?x.gm.length+' advance(s)':''}</div></td><td class="r">${E.m(x.g)}</td><td class="r">${E.m(x.c)}</td><td class="r"><b class="${x.close>0?'bad':''}">${E.m(x.close)}</b></td><td class="r">${E.m(x.netW)}</td><td class="r"><b>${E.m(x.netS)}</b></td></tr>`).join('')||'<tr><td colspan="8" class="muted">No advances or wages in this month</td></tr>'}</tbody></table></div>`};
E.route('advreg','Salary & Advance Register',()=>`<div class="bar"><input type="month" class="fs" style="max-width:180px" data-f="ar.m" value="${M}"><span class="gap"></span><button class="btn" data-nav="payroll">Give advance (Payroll → Advance)</button><button class="btn" onclick="window.print()">🖨 Print</button></div><div id="arb">${body()}</div>`);
E.hooks.push(e=>{if(e.target.dataset&&e.target.dataset.f==='ar.m'&&e.target.value){M=e.target.value;E.$('arb').innerHTML=body()}});
})(window.ERP);
