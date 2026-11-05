/* IndexedDB — a small MASTER database (only the list of factories) plus one COMPLETELY SEPARATE database per factory:
   lanka_erp_v2_f_<factoryId>. E.D[col] always holds the ACTIVE factory's records, so every screen works as before,
   but one factory can never see or touch another factory's data. Old single-database data is split automatically (once). */
(E=>{let master=null,db=null,dbName='';
const fcols=()=>E.cfg.cols.filter(c=>c!=='factories'),fname=id=>E.cfg.db+'_f_'+id;
const open=(name,stores)=>new Promise((res,rej)=>{const r=indexedDB.open(name,E.cfg.dbVersion);
 r.onupgradeneeded=e=>stores.forEach(c=>{if(!e.target.result.objectStoreNames.contains(c))e.target.result.createObjectStore(c,{keyPath:'id'})});
 r.onsuccess=e=>res(e.target.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('Database is open in another tab. Close other tabs and reload.'))});
const getAll=(d,c)=>new Promise(res=>{if(!d||!d.objectStoreNames.contains(c))return res([]);const q=d.transaction(c).objectStore(c).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([])});
/* one-time: copy records of the old shared database into each factory's own database (old data stays in the master as a backup) */
async function split(){if(localStorage.getItem('erp_split_v3'))return;const facs=await getAll(master,'factories');
 for(const f of facs){const d=await open(fname(f.id),fcols());
  for(const c of fcols()){const rows=(await getAll(master,c)).filter(o=>o.factoryId===f.id||(!o.factoryId&&c==='auditLog'&&f===facs[0]));if(!rows.length)continue;
   await new Promise((res,rej)=>{const t=d.transaction(c,'readwrite'),s=t.objectStore(c);rows.forEach(o=>s.put(o));t.oncomplete=res;t.onerror=()=>rej(t.error)})}
  d.close()}
 localStorage.setItem('erp_split_v3','1')}
E.initDB=async()=>{E.cfg.cols.forEach(c=>E.D[c]=[]);master=await open(E.cfg.db,E.cfg.cols);await split()};
E.reload=async()=>{E.D.factories=await getAll(master,'factories');for(const c of fcols())E.D[c]=await getAll(db,c)};
E.openFactory=async id=>{const n=fname(id);if(db&&dbName===n)return;if(db){db.close();db=null}db=await open(n,fcols());dbName=n;await E.reload()};
E.closeFactory=()=>{if(db){db.close();db=null;dbName=''}fcols().forEach(c=>E.D[c]=[])};
E.put=(col,o)=>new Promise((res,rej)=>{const d=col==='factories'?master:db;if(!d)return rej(new Error('No factory is open'));
 if(!o.id)o.id=E.uid();if(!o.createdAt)o.createdAt=new Date().toISOString();if(!(E.keepTs&&o.updatedAt))o.updatedAt=new Date().toISOString();
 const t=d.transaction(col,'readwrite');t.objectStore(col).put(o);
 t.oncomplete=()=>{const a=E.D[col],i=a.findIndex(x=>x.id===o.id);i<0?a.push(o):a[i]=o;res(o)};t.onerror=()=>rej(t.error)});
E.del=(col,id)=>new Promise((res,rej)=>{const d=col==='factories'?master:db;if(!d)return rej(new Error('No factory is open'));
 const t=d.transaction(col,'readwrite');t.objectStore(col).delete(id);t.oncomplete=()=>{E.D[col]=E.D[col].filter(x=>x.id!==id);res()};t.onerror=()=>rej(t.error)});
E.rows=col=>E.D[col].filter(x=>x.factoryId===E.fid);
/* save = put + factory stamp + audit trail */
E.save=async(col,o,before)=>{if(!o.factoryId&&col!=='factories')o.factoryId=E.fid;const isNew=!E.D[col].some(x=>x.id===o.id);
 await E.put(col,o);await E.audit(isNew?'create':'update',col,o.id,before||null,o);return o};})(window.ERP);
