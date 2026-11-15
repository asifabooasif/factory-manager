/* Local Database (this PC): Firebase stays the main store. One click copies every record into a SQLite database on this PC.
   Works only inside the Windows app (it needs the app's file access). */
(E=>{
const L=()=>window.erpLocal||null;
const K='erp_localdb_';const ls={get:(k,d)=>{try{const v=localStorage.getItem(K+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>localStorage.setItem(K+k,JSON.stringify(v))};
let info=null,last=ls.get('last',null),busy=false,timer=null;
const here=()=>(location.hash.replace(/^#\/?/,'')||'dashboard')==='localdb';
const cols=()=>E.cfg.cols.filter(c=>c!=='factories');
const collect=()=>{const out=[];for(const c of cols())for(const r of E.rows(c))out.push({col:c,id:r.id,data:r});return out};
async function refresh(){if(L()&&E.fid)try{info=await L().info(E.fid)}catch(e){info={error:e.message}}}
async function send(auto){
  if(!L())return E.toast('Open this in the Windows app on the PC that keeps the local database','error');
  if(busy)return;busy=true;
  try{
    const recs=collect(),u=E.sync&&E.sync.user;
    const r=await L().send({factoryId:E.fid,factoryName:(E.factory()||{}).name||'',user:u?u.email:'',records:recs});
    last=Object.assign({sentCounts:Object.fromEntries(cols().map(c=>[c,E.rows(c).length]))},r);ls.set('last',last);
    await refresh();
    if(!auto||!r.ok)E.toast(r.ok?`Saved to the local database: ${r.added} new, ${r.changed} changed, ${r.removed} removed. Verified.`:'Saved, but verification found a problem. Open Local Database for details.',r.ok?'success':'error');
    if(here())E.go();
  }catch(e){E.toast('Local database: '+e.message,'error')}finally{busy=false}
}
function arm(){clearInterval(timer);const m=ls.get('auto',0);if(m&&L())timer=setInterval(()=>{if(E.fid&&E.sync&&E.sync.granted)send(true)},m*60000)}
E.nav('System','localdb','💽','Local Database (this PC)');
E.route('localdb','Local Database (this PC)',()=>{
  if(!L())return `<div class="card"><h3>Local Database</h3><p>This feature saves a full copy of all your data in a database file on <b>one chosen PC</b>. Firebase stays the main store.</p><p class="bad"><b>This device cannot do it.</b> Open the <b>Slipper ERP Windows app</b> on the PC that should keep the database.</p></div>`;
  if(!info&&!busy)refresh().then(()=>{if(here()&&info)E.go()});
  const i=info||{},l=last,fmt=t=>t?new Date(t).toLocaleString():'never';
  const rows=l&&l.stored?Object.keys(Object.assign({},l.sentCounts,Object.fromEntries(Object.entries(l.stored).map(([k,v])=>[k,0])))).sort().map(c=>{const s=(l.sentCounts||{})[c]||0,d=(l.stored[c]||{live:0}).live;return `<tr><td>${E.esc(c)}</td><td class="r">${s}</td><td class="r">${d}</td><td class="r ${s===d?'ok':'bad'}">${s===d?'✓':'differs'}</td></tr>`}).join(''):'';
  const m=ls.get('auto',0);
  return `<div class="kp">${E.kpi('Local database',i.integrity==='ok'?'Healthy':(i.error?'Error':'Not created yet'),E.esc(i.integrity==='ok'?'integrity check passed':i.error||'created on first send'))}${E.kpi('Records stored',i.records!=null?i.records:'—','on this PC')}${E.kpi('Last send',l?E.esc(new Date(l.at).toLocaleTimeString()):'never',l?E.esc(new Date(l.at).toLocaleDateString()):'')}${E.kpi('Auto send',m?`every ${m} min`:'Off')}</div>
  <div class="card"><h3>Send all data to the local database</h3><p class="muted">Copies every record (invoices, journals, stock, wages, jobs…) into a SQLite database on this PC. Records you delete in the ERP are kept in the database marked as removed, and every changed record keeps its older version in a history table. Nothing in Firebase is touched.</p>
  <div class="bar"><button class="btn p" data-a="ldSend">💽 Send now</button><button class="btn" data-a="ldFolder">Choose folder</button><button class="btn" data-a="ldOpen">Open folder</button></div>
  <div class="f" style="max-width:260px;margin-top:10px">Send automatically<select id="ld_auto"><option value="0" ${!m?'selected':''}>Off (button only)</option><option value="15" ${m==15?'selected':''}>Every 15 minutes</option><option value="30" ${m==30?'selected':''}>Every 30 minutes</option><option value="60" ${m==60?'selected':''}>Every hour</option></select></div>
  <p class="muted" style="margin-top:8px">Database file: <b>${E.esc(i.path||'—')}</b><br>A dated backup copy of the database is saved daily in its <b>backups</b> folder (30 kept). Copy that folder to a USB drive or another disk regularly.</p></div>
  ${l?`<div class="card"><h3>Last send · ${E.esc(fmt(l.at))}</h3><p class="${l.ok?'ok':'bad'}"><b>${l.ok?'Verified: the database matches the app and the ledger balances.':'Problem: counts differ or the ledger does not balance. Check the table below.'}</b></p><p class="muted">Sent ${l.sent} · new ${l.added} · changed ${l.changed} · unchanged ${l.unchanged} · removed ${l.removed} · restored ${l.restored}<br>Ledger in the database: debits ${E.m(l.totalDr)} · credits ${E.m(l.totalCr)}</p><div class="tw"><table><thead><tr><th>Records</th><th class="r">In the app</th><th class="r">In the local database</th><th class="r">Check</th></tr></thead><tbody>${rows}</tbody></table></div></div>`:''}`;
});
E.A.ldSend=()=>send(false);
E.A.ldFolder=async()=>{try{const d=await L().chooseFolder();if(d){await refresh();E.toast('Folder saved. The next send creates the database there.','success');E.go()}}catch(e){E.toast(e.message,'error')}};
E.A.ldOpen=()=>L()&&L().openFolder();
E.hooks.push(e=>{if(e.target&&e.target.id==='ld_auto'){ls.set('auto',+e.target.value||0);arm();E.toast(e.target.value>0?'Auto send every '+e.target.value+' minutes':'Auto send is off','success')}});
setTimeout(arm,3000);
})(window.ERP);
