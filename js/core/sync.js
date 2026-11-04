/* PART 9 — Optional cloud sync. The app always works offline; when switched on, every save is also written to Firebase Firestore and to Google Sheets (if configured). Last-write-wins by timestamp. */
(E=>{const CFG={apiKey:"AIzaSyCemkHwGDXgINLKSZAGebuXufJV1Vgc6NI",authDomain:"factory-manager-1b5fa.firebaseapp.com",projectId:"factory-manager-1b5fa",storageBucket:"factory-manager-1b5fa.firebasestorage.app",messagingSenderId:"869478675654",appId:"1:869478675654:web:a2ff3d1b2c1e215b5893c7"};
const SDK=['app','auth','firestore'].map(n=>'https://www.gstatic.com/firebasejs/10.8.0/firebase-'+n+'-compat.js');
let fs=null,auth=null,unsub=null;const raw={put:E.put,del:E.del};E.raw=raw;
E.sync={on:localStorage.getItem('erp_cloud')==='1',user:null,state:'Cloud off'};
const st=t=>{E.sync.state=t;const e=E.$('syn');if(e)e.textContent=t};
const load=u=>new Promise((res,rej)=>{if(document.querySelector('script[src="'+u+'"]'))return res();const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>rej(new Error('offline'));document.head.appendChild(s)});
const did=(c,i)=>c+'__'+i,SC=['items','variants','parties','journalEntries','invoices','deliveries','purchases','wageRuns','jobs'];
const SH=()=>({url:localStorage.getItem('erp_sheet_url')||'',key:localStorage.getItem('erp_sheet_key')||''});
const doc=(c,o,del)=>({col:c,rid:o.id,factoryId:o.factoryId||'',updatedAt:o.updatedAt||new Date().toISOString(),deleted:!!del,json:del?'':JSON.stringify(o)});
function push(c,o,del){if(!E.sync.user||!fs)return;fs.collection('erp_data').doc(did(c,o.id)).set(doc(c,o,del)).catch(e=>st('Sync error: '+e.message))}
function sheet(c,recs){const s=SH();if(!s.url||!SC.includes(c))return Promise.resolve();return fetch(s.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({key:s.key,sheet:c,records:recs})}).catch(()=>{})}
E.put=async(c,o)=>{const r=await raw.put(c,o);push(c,r);sheet(c,[r]);return r};
E.del=async(c,id)=>{await raw.del(c,id);push(c,{id,factoryId:E.fid},true)};
E.sheetsAll=async()=>{let n=0;for(const c of SC){const a=E.D[c]||[];for(let i=0;i<a.length;i+=50){await sheet(c,a.slice(i,i+50));n+=Math.min(50,a.length-i)}}return n};
async function apply(d){if(!E.D[d.col])return false;
 if(d.deleted){if(E.D[d.col].some(x=>x.id===d.rid)){await raw.del(d.col,d.rid);return true}return false}
 const o=JSON.parse(d.json),l=E.D[d.col].find(x=>x.id===o.id);if(l&&(l.updatedAt||'')>=(o.updatedAt||''))return false;
 E.keepTs=true;try{await raw.put(d.col,o)}finally{E.keepTs=false}return true}
async function uploadNewer(s){const rm=new Map(s.docs.map(d=>[d.id,d.data().updatedAt||'']));let b=fs.batch(),n=0;
 for(const c of E.cfg.cols)for(const o of E.D[c]||[]){const k=did(c,o.id);if(!rm.has(k)||(o.updatedAt||'')>rm.get(k)){b.set(fs.collection('erp_data').doc(k),doc(c,o));if(++n%400===0){await b.commit();b=fs.batch()}}}
 if(n%400)await b.commit();return n}
function listen(){if(unsub)unsub();st('Cloud: syncing…');let first=true;
 unsub=fs.collection('erp_data').onSnapshot(async s=>{try{let ch=0;for(const c of s.docChanges()){if(c.doc.metadata.hasPendingWrites)continue;if(await apply(c.doc.data()))ch++}
  if(first){first=false;const n=await uploadNewer(s);if(n)E.toast(n+' local records uploaded','success')}
  if(ch){if(!E.factory()&&E.D.factories.length)E.setF(E.D.factories[0].id);E.renderFSel&&E.renderFSel();E.setRole&&E.setRole(E.sync.user&&E.sync.user.email);E.go()}st('Cloud: synced '+new Date().toLocaleTimeString())}catch(e){st('Cloud error: '+e.message)}},e=>st('Cloud error: '+e.message))}
E.syncInit=async()=>{if(!E.sync.on)return st('Cloud off');
 try{st('Cloud: connecting…');for(const u of SDK)await load(u);if(!firebase.apps.length)firebase.initializeApp(CFG);auth=firebase.auth();fs=firebase.firestore();fs.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  auth.onAuthStateChanged(u=>{E.sync.user=u;if(u){E.user=u.displayName||u.email;E.setRole&&E.setRole(u.email);listen()}else{if(unsub)unsub();st('Cloud: not signed in')}if(E.R.cloud&&location.hash==='#/cloud')E.go()})}
 catch(e){st('Cloud unavailable (working offline)')}};
E.sync.signIn=()=>auth?auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>E.toast(e.message,'error')):E.toast('Cloud not ready. Check your internet connection.','error');
E.sync.signOut=()=>auth&&auth.signOut();
E.sync.enable=on=>{localStorage.setItem('erp_cloud',on?'1':'0');E.sync.on=on;if(on)E.syncInit();else{if(unsub)unsub();st('Cloud off')}};})(window.ERP);
