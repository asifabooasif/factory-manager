/* IndexedDB. E.put updates the in-memory cache E.D so screens always read fresh data synchronously. */
(E=>{let db;
E.initDB=()=>new Promise((res,rej)=>{const r=indexedDB.open(E.cfg.db,E.cfg.dbVersion);
 r.onupgradeneeded=e=>E.cfg.cols.forEach(c=>{if(!e.target.result.objectStoreNames.contains(c))e.target.result.createObjectStore(c,{keyPath:'id'})});
 r.onsuccess=e=>{db=e.target.result;res()};r.onerror=()=>rej(r.error)});
E.reload=async()=>{for(const c of E.cfg.cols)E.D[c]=await new Promise(res=>{const q=db.transaction(c).objectStore(c).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([])})};
E.put=(col,o)=>new Promise((res,rej)=>{if(!o.id)o.id=E.uid();if(!o.createdAt)o.createdAt=new Date().toISOString();if(!(E.keepTs&&o.updatedAt))o.updatedAt=new Date().toISOString();
 const t=db.transaction(col,'readwrite');t.objectStore(col).put(o);
 t.oncomplete=()=>{const a=E.D[col],i=a.findIndex(x=>x.id===o.id);i<0?a.push(o):a[i]=o;res(o)};t.onerror=()=>rej(t.error)});
E.del=(col,id)=>new Promise(res=>{const t=db.transaction(col,'readwrite');t.objectStore(col).delete(id);t.oncomplete=()=>{E.D[col]=E.D[col].filter(x=>x.id!==id);res()}});
E.rows=col=>E.D[col].filter(x=>x.factoryId===E.fid);
/* save = put + factory stamp + audit trail */
E.save=async(col,o,before)=>{if(!o.factoryId&&col!=='factories')o.factoryId=E.fid;const isNew=!E.D[col].some(x=>x.id===o.id);
 await E.put(col,o);await E.audit(isNew?'create':'update',col,o.id,before||null,o);return o};})(window.ERP);
