/* PART 9 (v3) — Sign-in gate, user registry and cloud sync.
   - Everyone must sign in with Google to enter. Only emails in the owner's user list may use the system.
   - Default owner (cannot be removed): asifabooasif@gmail.com. Owners add / suspend / remove people and set roles.
   - After sign-in the user's cloud data loads live; the app keeps working offline (IndexedDB) and syncs when online.
   - Firestore collections: erp_data (business records), erp_users (people & roles). Security lives in firebase/firestore.rules. */
(E=>{
const OWNER='asifabooasif@gmail.com';
const CFG={apiKey:"AIzaSyCemkHwGDXgINLKSZAGebuXufJV1Vgc6NI",authDomain:"factory-manager-1b5fa.firebaseapp.com",projectId:"factory-manager-1b5fa",storageBucket:"factory-manager-1b5fa.firebasestorage.app",messagingSenderId:"869478675654",appId:"1:869478675654:web:a2ff3d1b2c1e215b5893c7"};
const SDK=['app','auth','firestore'].map(n=>'https://www.gstatic.com/firebasejs/10.8.0/firebase-'+n+'-compat.js');
const COL='erp_data',USERS='erp_users',SC=['items','variants','parties','journalEntries','invoices','deliveries','purchases','wageRuns','jobs'];
let fs=null,auth=null,unsubData=null,unsubMe=null,unsubUsers=null,first=true,opened=false,tWait=null,tOpen=null;
const raw={put:E.put,del:E.del};E.raw=raw;
E.OWNER=OWNER;E.role='viewer';E.profile=null;
E.sync={on:true,user:null,state:'Cloud: starting…',level:'warn',ready:false,authChecked:false,granted:false,users:[]};
const iso=()=>new Date().toISOString(),norm=s=>String(s||'').trim().toLowerCase();
const canWrite=()=>E.role==='owner'||E.role==='accountant';

/* ---------- status text in the header ---------- */
const COLOR={ok:'#16a34a',warn:'#d97706',err:'#dc2626',off:'#6b7280'};
const st=(t,lv)=>{E.sync.state=t;E.sync.level=lv||'warn';const e=E.$('syn');if(e){e.textContent=t;e.style.color=COLOR[E.sync.level];e.style.cursor='pointer';e.title='Open Cloud & Backup';e.onclick=()=>{location.hash='#/cloud'}}};
const explain=e=>{const c=(e&&e.code)||'',m=(e&&e.message)||String(e);
 if(c==='permission-denied'||/insufficient permissions/i.test(m))return 'Firestore refused access. Publish the new firebase/firestore.rules in Firebase Console → Firestore Database → Rules (see README step 4).';
 if(c==='auth/unauthorized-domain')return 'This website address is not authorised. Firebase Console → Authentication → Settings → Authorized domains → Add domain: '+location.hostname;
 if(c==='auth/operation-not-allowed')return 'Google sign-in is switched off. Firebase Console → Authentication → Sign-in method → Google → Enable.';
 if(c==='auth/popup-blocked')return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.';
 if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request')return 'Sign-in window was closed before finishing.';
 if(c==='auth/network-request-failed'||c==='unavailable'||/offline|network/i.test(m))return 'Cannot reach Firebase. Check the internet connection.';
 if(c==='not-found'||/NOT_FOUND|does not exist/i.test(m))return 'The Firestore database has not been created. Firebase Console → Build → Firestore Database → Create database.';
 if(/api key/i.test(m)||c==='auth/invalid-api-key')return 'Firebase API key rejected. Check the config in js/core/sync.js.';
 return m};
E.sync.explain=explain;

/* ---------- full-screen sign-in gate ---------- */
const G_LOGO='<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const gate=(mode,msg)=>{let g=E.$('gate');
 if(!g){const s=document.createElement('style');s.textContent='#gate{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--sb,linear-gradient(180deg,#150b30,#3b1d7a))}#gate .gc{background:var(--s,#fff);color:var(--t,#1a1533);border-radius:18px;padding:34px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}#gate .gl{font-size:44px;margin-bottom:6px}#gate h2{font-size:20px;margin-bottom:8px}#gate p{margin:8px 0;line-height:1.5}#gate .gbig{width:100%;justify-content:center;padding:12px 16px;font-size:14px;margin-top:14px}#gate .gerr{color:#dc2626;font-size:12px;min-height:16px}#gate .gb{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}.gsp{width:34px;height:34px;border:4px solid #ddd6f3;border-top-color:#7c3aed;border-radius:50%;margin:10px auto;animation:gspin .8s linear infinite}@keyframes gspin{to{transform:rotate(360deg)}}';document.head.appendChild(s);g=document.createElement('div');g.id='gate';document.body.appendChild(g)}
 g.style.display='flex';const u=E.sync.user,em=u&&u.email?u.email:'';
 const head='<div class="gl">🏭</div>';
 const B={
  loading:`${head}<div class="gsp"></div><p>${E.esc(msg||'Loading…')}</p>`,
  signin:`${head}<h2>Lanka Slipper ERP</h2><p class="muted">Sign in with your Google account to enter. Only people added by the owner can use this system.</p><button class="btn p gbig" data-a="cloudIn">${G_LOGO}&nbsp; Continue with Google</button><p class="gerr">${E.esc(msg||'')}</p>`,
  denied:`${head}<h2>No access</h2><p><b>${E.esc(em)}</b></p><p class="muted">${E.esc(msg||'')}</p><div class="gb"><button class="btn p" data-a="cloudSwitch">Use a different Google account</button><button class="btn" data-a="cloudOut">Sign out</button></div>`,
  error:`${head}<h2>Cannot continue</h2><p>${E.esc(msg||'')}</p><div class="gb"><button class="btn p" data-a="gateRetry">Try again</button>${u?'<button class="btn" data-a="cloudOut">Sign out</button>':''}</div>`};
 g.innerHTML='<div class="gc">'+(B[mode]||B.loading)+'</div>'};
const hideGate=()=>{const g=E.$('gate');if(g)g.style.display='none'};

/* ---------- user chip (name, role, sign-out) in the header ---------- */
const ROLE={owner:'Owner',accountant:'Accountant',viewer:'View only'};E.ROLE=ROLE;
const chip=()=>{const tr=document.querySelector('.tr');if(!tr)return;let c=E.$('uchip');
 if(!E.sync.granted||!E.profile){if(c)c.style.display='none';return}
 if(!c){c=document.createElement('span');c.id='uchip';c.style.cssText='display:flex;gap:8px;align-items:center;margin-right:4px';tr.prepend(c)}
 const p=E.profile,u=E.sync.user,nm=p.name||(u&&u.displayName)||p.email,ph=(u&&u.photoURL)||p.photo||'';
 c.style.display='flex';
 c.innerHTML=(ph?`<img src="${E.esc(ph)}" referrerpolicy="no-referrer" style="width:28px;height:28px;border-radius:50%" onerror="this.style.display='none'">`:`<span style="width:28px;height:28px;border-radius:50%;background:var(--ac);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600">${E.esc((nm[0]||'?').toUpperCase())}</span>`)+`<span style="line-height:1.15;font-size:12px"><b>${E.esc(nm)}</b><br><span class="muted" style="font-size:10.5px">${ROLE[p.role]||p.role}${E.sync.offlineGrace?' · offline':''}</span></span><button class="btn sm" data-a="cloudOut" title="Sign out">⎋</button>`};

const load=u=>new Promise((res,rej)=>{if(document.querySelector('script[src="'+u+'"]'))return res();const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>rej(new Error('offline'));document.head.appendChild(s)});
const did=(c,i)=>c+'__'+i;
const SH=()=>({url:localStorage.getItem('erp_sheet_url')||'',key:localStorage.getItem('erp_sheet_key')||''});
const doc=(c,o,del)=>({col:c,rid:o.id,factoryId:o.factoryId||'',updatedAt:o.updatedAt||iso(),deleted:!!del,json:del?'':JSON.stringify(o)});
const pend=()=>{try{return JSON.parse(localStorage.getItem('erp_pend_del')||'[]')}catch(e){return[]}};
const setPend=a=>localStorage.setItem('erp_pend_del',JSON.stringify(a));

function push(c,o,del){
 if(!E.sync.user||!fs||!E.sync.granted){if(del)setPend(pend().concat([{c,id:o.id}]));return}
 fs.collection(COL).doc(did(c,o.id)).set(doc(c,o,del)).catch(e=>st('Sync error: '+explain(e),'err'))}
function sheet(c,recs){const s=SH();if(!s.url||!SC.includes(c))return Promise.resolve();return fetch(s.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({key:s.key,sheet:c,records:recs})}).catch(()=>{})}
E.put=async(c,o)=>{const r=await raw.put(c,o);push(c,r);sheet(c,[r]);return r};
E.del=async(c,id)=>{await raw.del(c,id);push(c,{id,factoryId:E.fid},true)};
E.sheetsAll=async()=>{let n=0;for(const c of SC){const a=E.D[c]||[];for(let i=0;i<a.length;i+=50){await sheet(c,a.slice(i,i+50));n+=Math.min(50,a.length-i)}}return n};

async function apply(d){if(!d||!E.D[d.col])return false;
 if(d.deleted){if(E.D[d.col].some(x=>x.id===d.rid)){await raw.del(d.col,d.rid);return true}return false}
 const o=JSON.parse(d.json),l=E.D[d.col].find(x=>x.id===o.id);if(l&&(l.updatedAt||'')>=(o.updatedAt||''))return false;
 E.keepTs=true;try{await raw.put(d.col,o)}finally{E.keepTs=false}return true}
async function commitAll(items){let b=fs.batch(),n=0,t=0;
 for(const [k,d] of items){b.set(fs.collection(COL).doc(k),d);n++;t++;if(n===400){await b.commit();b=fs.batch();n=0}}
 if(n)await b.commit();return t}
async function uploadNewer(s){const rm=new Map(s.docs.map(d=>[d.id,d.data().updatedAt||'']));const items=[];
 for(const c of E.cfg.cols)for(const o of E.D[c]||[]){const k=did(c,o.id);if(!rm.has(k)||(o.updatedAt||'')>rm.get(k))items.push([k,doc(c,o)])}
 const pd=pend();for(const p of pd)items.push([did(p.c,p.id),doc(p.c,{id:p.id,factoryId:E.fid,updatedAt:iso()},true)]);
 const n=await commitAll(items);if(pd.length)setPend([]);return n}
E.sync.pushAll=async()=>{if(!fs||!E.sync.user)throw new Error('Sign in first');if(!canWrite())throw new Error('View-only access cannot upload');const items=[];
 for(const c of E.cfg.cols)for(const o of E.D[c]||[])items.push([did(c,o.id),doc(c,o)]);return commitAll(items)};

/* ---------- open the app once the user's data has loaded ---------- */
function openApp(){if(opened)return;opened=true;clearTimeout(tOpen);hideGate();
 if(!E.D.factories.length){if(canWrite())E.firstFactory();else E.toast('No data has been entered yet. Ask the owner.','error')}
 else{if(!E.factory())E.setF(E.D.factories[0].id);E.renderFSel()}
 chip();E.go()}

function listen(){if(unsubData)unsubData();first=true;st('Cloud: loading your data…','warn');
 unsubData=fs.collection(COL).onSnapshot({includeMetadataChanges:true},async s=>{try{
  const pd=new Set(pend().map(p=>did(p.c,p.id)));let ch=0;
  for(const c of s.docChanges()){if(c.doc.metadata.hasPendingWrites)continue;if(pd.has(c.doc.id))continue;if(await apply(c.doc.data()))ch++}
  if(first&&!s.metadata.fromCache){first=false;
   if(canWrite()){const n=await uploadNewer(s);if(n)E.toast(n+' local records uploaded to cloud','success')}
   openApp()}
  else if(ch&&opened){if(!E.factory()&&E.D.factories.length)E.setF(E.D.factories[0].id);E.renderFSel();E.go()}
  if(!first)st((s.metadata.fromCache?'Cloud: offline copy · ':'Cloud: synced ')+new Date().toLocaleTimeString(),s.metadata.fromCache?'warn':'ok')}
  catch(e){st('Cloud error: '+explain(e),'err')}},
  e=>{st('Cloud error: '+explain(e),'err');if(!opened)gate('error',explain(e))})}

/* owners watch the whole user registry live (for the Users & Access page) */
function startUsers(){if(unsubUsers)return;
 unsubUsers=fs.collection(USERS).onSnapshot(s=>{E.sync.users=s.docs.map(d=>Object.assign({id:d.id},d.data()));
  const a=document.activeElement;if(location.hash==='#/access'&&!(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)&&E.$('v').contains(a)))E.go()},e=>{})}
const stopUsers=()=>{if(unsubUsers){unsubUsers();unsubUsers=null}E.sync.users=[]};
function stopAll(){if(unsubData){unsubData();unsubData=null}if(unsubMe){unsubMe();unsubMe=null}stopUsers();clearTimeout(tWait);clearTimeout(tOpen);opened=false;E.sync.granted=false}

/* ---------- access check: the signed-in email must be in the registry ---------- */
function deny(u,why){stopUsers();if(unsubData){unsubData();unsubData=null}E.sync.granted=false;opened=false;E.role='viewer';E.profile=null;chip();st('No access','err');
 gate('denied',why==='suspended'?'Your access has been suspended by the owner.':'This email has not been added. Ask the owner ('+OWNER+') to add it, then sign in again.')}
function onGranted(u,d,fromCache){const was=E.sync.granted,prev=E.role;
 E.profile=d;E.role=d.role;E.user=d.name||u.displayName||u.email;E.sync.granted=true;
 localStorage.setItem('erp_last_user',JSON.stringify({email:d.email,name:d.name||u.displayName||'',role:d.role}));
 chip();
 if(!was){gate('loading','Loading your data…');listen();if(d.role==='owner')startUsers();tOpen=setTimeout(openApp,12000);
  if(!fromCache)fs.collection(USERS).doc(d.email).update({lastLoginAt:iso(),name:d.name||u.displayName||'',photo:u.photoURL||''}).catch(()=>{})}
 else if(prev!==d.role){if(d.role==='owner')startUsers();else stopUsers();E.toast('Your access is now: '+ROLE[d.role],'success');if(opened)E.go()}}
function watchMe(u){const email=norm(u.email);
 unsubMe=fs.collection(USERS).doc(email).onSnapshot({includeMetadataChanges:true},async s=>{try{
  if(!s.exists){
   if(s.metadata.fromCache){clearTimeout(tWait);tWait=setTimeout(()=>{if(!E.sync.granted)gate('error','Could not reach the server to check your access. Check the internet and try again.')},10000);return}
   clearTimeout(tWait);
   if(email===OWNER){await fs.collection(USERS).doc(email).set({email,name:u.displayName||'',photo:u.photoURL||'',role:'owner',active:true,addedBy:'system',addedAt:iso(),lastLoginAt:iso()});return}
   return deny(u,'not-listed')}
  clearTimeout(tWait);
  const d=Object.assign({email},s.data());if(email===OWNER){d.role='owner';d.active=true}
  if(d.active===false)return deny(u,'suspended');
  onGranted(u,d,s.metadata.fromCache)}catch(e){gate('error',explain(e))}},
  e=>gate('error',explain(e)))}

function graceOffline(){let r=null;try{r=JSON.parse(localStorage.getItem('erp_last_user')||'null')}catch(e){}
 if(!r||!r.email){gate('error','Cannot reach Firebase and nobody has signed in on this device yet. Check the internet connection.');return}
 E.profile={email:r.email,name:r.name,role:r.role};E.role=r.role;E.user=r.name||r.email;E.sync.granted=true;E.sync.offlineGrace=true;
 st('Offline mode · cloud will sync when you are online','warn');opened=true;hideGate();chip();
 if(!E.D.factories.length){if(canWrite())E.firstFactory()}else{if(!E.factory())E.setF(E.D.factories[0].id);E.renderFSel()}E.go()}

E.syncInit=async()=>{
 gate('loading','Starting…');
 if(location.protocol==='file:'){gate('error','Sign-in needs the system\'s web address (your GitHub Pages link or localhost). Please open it from there instead of double-clicking index.html.');return}
 try{for(const u of SDK)await load(u)}catch(e){return graceOffline()}
 try{
  if(!firebase.apps.length)firebase.initializeApp(CFG);
  auth=firebase.auth();fs=firebase.firestore();
  try{fs.settings({experimentalAutoDetectLongPolling:true,merge:true})}catch(e){}
  fs.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  E.sync.ready=true;
  auth.onAuthStateChanged(u=>{E.sync.authChecked=true;E.sync.user=u;stopAll();E.sync.offlineGrace=false;
   if(!u){E.profile=null;E.role='viewer';chip();st('Signed out','warn');gate('signin');return}
   gate('loading','Checking your access…');watchMe(u)})}
 catch(e){gate('error',explain(e))}};

E.sync.signIn=async()=>{
 if(!auth)return E.toast('Cloud not ready. Check your internet connection.','error');
 const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 try{await auth.signInWithPopup(p)}
 catch(e){if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){try{await auth.signInWithRedirect(p);return}catch(e2){e=e2}}
  gate('signin',explain(e))}};
E.sync.signOut=()=>{localStorage.removeItem('erp_last_user');return auth?auth.signOut():location.reload()};
E.A.cloudIn=()=>E.sync.signIn();E.A.cloudOut=()=>E.sync.signOut();E.A.gateRetry=()=>location.reload();
E.A.cloudSwitch=async()=>{try{await auth.signOut()}catch(e){}E.sync.signIn()};

/* ---------- user registry API (owner only; Firestore rules enforce it too) ---------- */
const needOwner=()=>{if(E.role!=='owner'||!fs)throw new Error('Only an Owner can manage users')};
E.sync.addUser=async(email,name,role)=>{needOwner();email=norm(email);
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new Error('Enter a valid Google email address');
 if(!ROLE[role])throw new Error('Choose a role');
 if(email===OWNER)throw new Error('That is the default owner');
 const ref=fs.collection(USERS).doc(email);if((await ref.get()).exists)throw new Error('That email is already in the list');
 const d={email,name:String(name||'').trim(),role,active:true,addedBy:E.profile.email,addedAt:iso(),lastLoginAt:null};
 await ref.set(d);E.audit&&E.audit('user-add','erp_users',email,null,{role});return d};
E.sync.updateUser=async(email,patch)=>{needOwner();email=norm(email);
 if(email===OWNER)throw new Error('The default owner cannot be changed');
 if(email===E.profile.email&&(patch.active===false||(patch.role&&patch.role!=='owner')))throw new Error('You cannot lower your own access');
 const before=(E.sync.users.find(u=>u.id===email))||null;
 await fs.collection(USERS).doc(email).update(patch);E.audit&&E.audit('user-update','erp_users',email,before&&{role:before.role,active:before.active},patch)};
E.sync.removeUser=async email=>{needOwner();email=norm(email);
 if(email===OWNER)throw new Error('The default owner cannot be removed');
 if(email===E.profile.email)throw new Error('You cannot remove yourself');
 await fs.collection(USERS).doc(email).delete();E.audit&&E.audit('user-remove','erp_users',email,null,null)};

/* ---------- plain-language connection check (Cloud & Backup → Test connection) ---------- */
E.sync.test=async()=>{const out=[],add=(t,g,h)=>out.push({t,g:!!g,h:g?'':(h||'')});
 add('Opened from a web address (https / localhost)',location.protocol!=='file:','Open the GitHub Pages link instead of the downloaded index.html.');
 add('Internet connection',navigator.onLine,'You appear to be offline.');
 add('Firebase code loaded',!!(window.firebase&&fs),'Firebase scripts could not load (internet / ad-blocker?).');
 add('Signed in with Google',!!E.sync.user,'Sign in first.');
 add('Email is on the allowed-users list ('+(E.profile?ROLE[E.profile.role]:'no role')+')',E.sync.granted&&!E.sync.offlineGrace,'Ask the owner to add this email.');
 let cloud=null;
 if(fs&&E.sync.user&&E.sync.granted){
  try{
   if(canWrite()){const r=fs.collection(COL).doc('__ping');
    await r.set({col:'__ping',rid:'ping',factoryId:'',updatedAt:iso(),deleted:true,json:''});
    const g=await r.get({source:'server'});add('Test record written to and read back from Firestore',g.exists,'Write succeeded but could not be read back.');await r.delete()}
   const all=await fs.collection(COL).get({source:'server'});add('Business data readable from Firestore',true);
   cloud=all.docs.filter(d=>d.id!=='__ping'&&!d.data().deleted).length}
  catch(e){add('Firestore write / read',false,explain(e))}}
 const local=E.cfg.cols.reduce((n,c)=>n+(E.D[c]||[]).length,0);
 return {checks:out,local,cloud}};
})(window.ERP);
