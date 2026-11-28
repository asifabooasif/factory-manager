/* Posting engine. Entries are balanced (in cents), checked against locked periods, and can never be edited or deleted — only reversed. */
(E=>{E.acct=c=>E.rows('coa').find(a=>a.code===c);
E.post=async({date,ref,narr,lines,source,absOf})=>{
 if(!date)throw new Error('Date is required');
 if(E.locked(date))throw new Error('Period is locked up to '+E.setting('lockedUntil'));
 lines=(lines||[]).map(l=>({acc:l.acc,dr:Math.round(l.dr||0),cr:Math.round(l.cr||0),job:l.job||'',cat:l.cat||'',art:l.art||'',head:l.head||''})).filter(l=>l.dr||l.cr);
 if(lines.length<2)throw new Error('At least two lines are needed');
 for(const l of lines){if(l.dr<0||l.cr<0||(l.dr&&l.cr))throw new Error('Each line needs either a debit or a credit');if(!E.acct(l.acc))throw new Error('Unknown account '+l.acc)}
 const d=lines.reduce((s,l)=>s+l.dr,0),c=lines.reduce((s,l)=>s+l.cr,0);
 if(d!==c)throw new Error('Debits ('+E.m(d)+') must equal credits ('+E.m(c)+')');
 /* v98: stock accounts are controlled by the stock / job records; a hand-made journal cannot move them (it would break stock = ledger and WIP = jobs) */
 if((!source||source==='manual')&&lines.some(l=>['1300','1310','1320'].includes(l.acc)))throw new Error('Accounts 1300 Raw Material Stock, 1310 Work in Progress and 1320 Finished Goods are controlled by the stock and job records and cannot be used in a manual journal. Use a purchase, material issue / return, stock gain / loss, stocktake or job screen instead.');
 const no=await E.next('JV');
 const je=await E.put('journalEntries',{no,date,ref:ref||'',narr:narr||'',lines,source:source||'manual',locked:true,reversedBy:'',factoryId:E.fid,...(absOf?{absOf}:{})});
 await E.audit('post','journalEntries',je.id,null,je);return je};
E.reverse=async id=>{const o=E.D.journalEntries.find(j=>j.id===id);if(!o)throw new Error('Entry not found');if(o.reversedBy)throw new Error('Already reversed');
 /* guards (e.g. job costing) may refuse a reversal BEFORE anything is posted */
 (E.revGuards||[]).forEach(g=>g(o));
 const r=await E.post({date:E.today(),ref:o.no,narr:'Reversal of '+o.no,source:'reversal',lines:o.lines.map(l=>({acc:l.acc,dr:l.cr,cr:l.dr,job:l.job,cat:l.cat,art:l.art,head:l.head}))});
 /* the reversal entry and the 'reversed' flag are ONE unit: if the flag cannot be saved, the reversal is taken back so the entry can never be reversed twice */
 try{o.reversedBy=r.no;await E.put('journalEntries',o)}catch(err){delete o.reversedBy;try{await E.post({date:E.today(),ref:o.no,narr:'Rollback of failed reversal of '+o.no,source:'reversal',lines:r.lines.map(l=>({acc:l.acc,dr:l.cr,cr:l.dr,job:l.job,cat:l.cat,art:l.art,head:l.head}))})}catch(x){console.error('reversal rollback failed',x);err.message=(err.message||'Failed')+' WARNING: reversal '+r.no+' could not be undone automatically.'}throw err}
 await E.audit('reverse','journalEntries',o.id,null,{reversedBy:r.no});
 /* a cancelled cost stops being job cost: take its WIP absorption back too (job-costing.js / joballoc.js) */
 if(E.syncAbsorb&&!E._syncing)await E.syncAbsorb();return r};
/* Post a journal entry AND save the record that belongs to it as ONE unit. If the follow-up work fails, the entry is reversed automatically,
   so a ledger entry can never be left behind without its matching record. fn(je) does the follow-up saves. */
/* takes a reversal back completely (used only to roll back a failed multi-step action): the reversal entry is deleted and the original is open again */
E.unreverse=async(origId,revId)=>{const o=E.D.journalEntries.find(j=>j.id===origId);if(revId)await E.del('journalEntries',revId);if(o&&o.reversedBy){delete o.reversedBy;await E.put('journalEntries',o)}};
/* UNDO HELPERS: a multi-step change is one unit. Each step registers how to take itself back; if a later step fails, everything done so far is undone. */
E.undoStack=()=>{const u=[];return{push:f=>u.push(f),rollback:async()=>{while(u.length){const f=u.pop();try{await f()}catch(x){console.error('rollback failed',x)}}}}};
E.saveU=async(u,col,rec,change)=>{const b=JSON.parse(JSON.stringify(rec));change(rec);try{await E.save(col,rec,b)}catch(err){Object.keys(rec).forEach(k=>{if(!(k in b))delete rec[k]});Object.assign(rec,b);throw err}u.push(async()=>{const cur=JSON.parse(JSON.stringify(rec));Object.keys(rec).forEach(k=>{if(!(k in b))delete rec[k]});Object.assign(rec,b);await E.save(col,rec,cur)})};
E.postThen=async(args,fn)=>{const je=await E.post(args);
 try{const out=await fn(je);if(E.syncAbsorb&&!E._syncing)await E.syncAbsorb();return out}
 catch(err){let note='';try{await E.reverse(je.id)}catch(x){console.error('auto-rollback failed',x);note=' WARNING: ledger entry '+je.no+' could not be rolled back automatically. Reverse it in the Journal.'}
  err.message=(err.message||'Failed')+(note||' (nothing was saved)');throw err}};
/* Find the ledger entry that belongs to a record. Uses rec.jeId; for opening records made by the Setup Wizard (older data had no jeId) it falls back to the opening entry with the same reference number. */
E.jeOf=r=>{if(!r)return '';if(r.jeId&&E.D.journalEntries.some(j=>j.id===r.jeId))return r.jeId;const j=E.D.journalEntries.find(x=>x.source==='opening'&&x.ref===r.no&&!x.reversedBy);return j?j.id:(r.jeId||'')};
/* True when the entry was already reversed (e.g. an earlier cancel stopped half-way). */
E.isReversed=id=>{const j=E.D.journalEntries.find(x=>x.id===id);return !!(j&&j.reversedBy)};
E.totals=()=>{const t={};E.rows('journalEntries').forEach(j=>j.lines.forEach(l=>{const x=t[l.acc]||(t[l.acc]={dr:0,cr:0});x.dr+=l.dr;x.cr+=l.cr}));return t};
E.bal=(code,t)=>{t=t||E.totals();const x=t[code]||{dr:0,cr:0},a=E.acct(code);return a&&(a.type==='asset'||a.type==='expense')?x.dr-x.cr:x.cr-x.dr};
E.opts=(f,sel)=>E.rows('coa').filter(a=>!a.inactive).filter(f||(()=>1)).sort((a,b)=>a.code.localeCompare(b.code)).map(a=>`<option value="${a.code}" ${a.code===sel?'selected':''}>${a.code} · ${E.esc(a.name)}</option>`).join('');})(window.ERP);
