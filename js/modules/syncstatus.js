/* Sync & Devices: shows whether this device agrees with the cloud, and lets the Owner/Accountant make them match. */
(E=>{
const fsx=()=>firebase.firestore(), dcol=()=>fsx().collection('erp_factories').doc(E.fid).collection('data');
const cols=()=>E.cfg.cols.filter(c=>c!=='factories');
const pendN=()=>{try{return JSON.parse(localStorage.getItem('erp_pend_del_'+E.fid)||'[]').length}catch(e){return 0}};
let snap=null;
E.nav('System','syncstatus','🔄','Sync & Devices');
E.route('syncstatus','Sync & Devices',()=>{
  const u=E.sync.user,ok=!!(u&&E.sync.granted),f=E.factory()||{};
  const dev=(E.native&&E.native.is)?'Android app':(/Windows/.test(navigator.userAgent)?'Windows (browser or Windows app)':'Browser');
  const can=ok&&(E.role==='owner'||E.role==='accountant');
  let t='';
  if(snap){const keys=Object.keys(snap.rows).sort();t=`<div class="tw"><table><thead><tr><th>Records</th><th class="r">This device</th><th class="r">Cloud</th><th class="r">Difference</th></tr></thead><tbody>${keys.map(c=>{const a=snap.rows[c].local,b=snap.rows[c].cloud,d=a-b;return `<tr><td>${E.esc(c)}</td><td class="r">${a}</td><td class="r">${b}</td><td class="r ${d?'bad':'ok'}">${d?(d>0?'+':'')+d:'✓'}</td></tr>`}).join('')}</tbody></table></div><p class="muted">Checked ${E.esc(snap.at)} · ${snap.diff} collection(s) differ · ${snap.tomb} deleted-record marks in the cloud.</p>`}
  return `<div class="kp">${E.kpi('This device',dev,navigator.onLine?'online':'offline')}${E.kpi('Signed in',ok?'Yes':'No',ok?E.esc(u.email||''):'Cloud sync is OFF here')}${E.kpi('Factory',E.esc(f.name||'—'))}${E.kpi('Waiting to upload',pendN(),'deletions not yet sent to the cloud')}</div>
  ${ok?'':'<div class="card"><b class="bad">This device is not connected to the cloud.</b><p>Anything you add or erase here stays on this device only and will not appear on your other phones and computers. Sign in with Google first.</p></div>'}
  <div class="card"><h3>1 · Compare this device with the cloud</h3><p class="muted">Counts every record on this device and in the cloud, so you can see exactly where they differ.</p><button class="btn p" data-a="syCheck" ${ok?'':'disabled'}>Compare now</button>${t}</div>
  <div class="card"><h3>2 · Make them match</h3><p class="muted">Use after you see differences. Only the Owner or Accountant can do this. A backup file is downloaded first.</p>
   <div class="f" style="max-width:300px">Type <b>SYNC</b> to confirm<input id="sy_c" placeholder="SYNC"></div>
   <div class="bar"><button class="btn" data-a="syPull" ${can?'':'disabled'}>⬇ Make THIS device match the cloud</button><button class="btn d" data-a="syPush" ${can?'':'disabled'}>⬆ Make the CLOUD match this device</button></div>
   <ul class="muted"><li><b>This device matches the cloud:</b> records missing here are downloaded, records that exist only here are removed from this device. Use it on the device that is wrong.</li><li><b>Cloud matches this device:</b> records that exist only in the cloud are deleted for everyone, and this device's records are uploaded. Use it on the device that is right, for example after erasing data.</li></ul></div>`});

async function cloud(){
  const s=await dcol().get({source:'server'}),live=new Map();let tomb=0;
  s.forEach(d=>{const x=d.data();if(x.deleted){tomb++;return}if(x.factoryId&&x.factoryId!==E.fid)return;live.set(d.id,x)});
  return {live,tomb}}
const did=(c,i)=>c+'__'+i;
E.A.syCheck=async()=>{try{E.toast('Checking…');const {live,tomb}=await cloud(),rows={};
  for(const c of cols())rows[c]={local:E.rows(c).length,cloud:0};
  live.forEach(x=>{if(rows[x.col])rows[x.col].cloud++});
  const diff=Object.values(rows).filter(r=>r.local!==r.cloud).length;
  snap={rows,tomb,diff,at:new Date().toLocaleTimeString()};E.go()}catch(e){E.toast(E.sync.explain?E.sync.explain(e):e.message,'error')}};
const guard=()=>{if((E.val('sy_c')||'').trim()!=='SYNC'){E.toast('Type SYNC to confirm','error');return false}
  if(!E.sync.granted||!E.sync.user){E.toast('Sign in first','error');return false}
  if(!(E.role==='owner'||E.role==='accountant')){E.toast('Only the Owner or Accountant can do this','error');return false}return true};
E.A.syPull=async()=>{if(!guard())return;try{E.A.backup&&E.A.backup();const {live}=await cloud();let add=0,rem=0;
  for(const c of cols()){const have=new Set();
    for(const x of live.values()){if(x.col!==c)continue;have.add(x.rid);const o=JSON.parse(x.json),l=E.D[c].find(r=>r.id===o.id);
      if(!l||(l.updatedAt||'')<(o.updatedAt||'')){E.keepTs=true;try{await E.raw.put(c,o)}finally{E.keepTs=false}add++}}
    for(const r of E.rows(c).slice())if(!have.has(r.id)){await E.raw.del(c,r.id);rem++}}
  localStorage.removeItem('erp_pend_del_'+E.fid);snap=null;E.toast(`This device now matches the cloud (${add} added/updated, ${rem} removed)`,'success');E.go()}catch(e){E.toast(e.message,'error')}};
E.A.syPush=async()=>{if(!guard())return;try{E.A.backup&&E.A.backup();const {live}=await cloud();const now=new Date().toISOString();let b=fsx().batch(),n=0,gone=0;
  for(const [k,x] of live){if(!E.D[x.col]||E.D[x.col].some(r=>r.id===x.rid&&r.factoryId===E.fid))continue;
    b.set(dcol().doc(k),{col:x.col,rid:x.rid,factoryId:E.fid,updatedAt:now,deleted:true,json:''});gone++;if(++n===400){await b.commit();b=fsx().batch();n=0}}
  if(n)await b.commit();
  const up=await E.sync.pushAll();await fsx().waitForPendingWrites();localStorage.removeItem('erp_pend_del_'+E.fid);snap=null;
  E.toast(`Cloud now matches this device (${gone} removed from cloud, ${up} uploaded)`,'success');E.go()}catch(e){E.toast(e.message,'error')}};
})(window.ERP);
