/* Posting engine. Entries are balanced (in cents), checked against locked periods, and can never be edited or deleted — only reversed. */
(E=>{E.acct=c=>E.rows('coa').find(a=>a.code===c);
E.post=async({date,ref,narr,lines,source})=>{
 if(!date)throw new Error('Date is required');
 if(E.locked(date))throw new Error('Period is locked up to '+E.setting('lockedUntil'));
 lines=(lines||[]).map(l=>({acc:l.acc,dr:Math.round(l.dr||0),cr:Math.round(l.cr||0),job:l.job||'',cat:l.cat||'',art:l.art||'',head:l.head||''})).filter(l=>l.dr||l.cr);
 if(lines.length<2)throw new Error('At least two lines are needed');
 for(const l of lines){if(l.dr<0||l.cr<0||(l.dr&&l.cr))throw new Error('Each line needs either a debit or a credit');if(!E.acct(l.acc))throw new Error('Unknown account '+l.acc)}
 const d=lines.reduce((s,l)=>s+l.dr,0),c=lines.reduce((s,l)=>s+l.cr,0);
 if(d!==c)throw new Error('Debits ('+E.m(d)+') must equal credits ('+E.m(c)+')');
 const no=await E.next('JV');
 const je=await E.put('journalEntries',{no,date,ref:ref||'',narr:narr||'',lines,source:source||'manual',locked:true,reversedBy:'',factoryId:E.fid});
 await E.audit('post','journalEntries',je.id,null,je);return je};
E.reverse=async id=>{const o=E.D.journalEntries.find(j=>j.id===id);if(!o)throw new Error('Entry not found');if(o.reversedBy)throw new Error('Already reversed');
 const r=await E.post({date:E.today(),ref:o.no,narr:'Reversal of '+o.no,source:'reversal',lines:o.lines.map(l=>({acc:l.acc,dr:l.cr,cr:l.dr,job:l.job,cat:l.cat,art:l.art,head:l.head}))});
 o.reversedBy=r.no;await E.put('journalEntries',o);await E.audit('reverse','journalEntries',o.id,null,{reversedBy:r.no});return r};
/* Post a journal entry AND save the record that belongs to it as ONE unit. If the follow-up work fails, the entry is reversed automatically,
   so a ledger entry can never be left behind without its matching record. fn(je) does the follow-up saves. */
E.postThen=async(args,fn)=>{const je=await E.post(args);
 try{return await fn(je)}
 catch(err){let note='';try{await E.reverse(je.id)}catch(x){console.error('auto-rollback failed',x);note=' WARNING: ledger entry '+je.no+' could not be rolled back automatically. Reverse it in the Journal.'}
  err.message=(err.message||'Failed')+(note||' (nothing was saved)');throw err}};
E.totals=()=>{const t={};E.rows('journalEntries').forEach(j=>j.lines.forEach(l=>{const x=t[l.acc]||(t[l.acc]={dr:0,cr:0});x.dr+=l.dr;x.cr+=l.cr}));return t};
E.bal=(code,t)=>{t=t||E.totals();const x=t[code]||{dr:0,cr:0},a=E.acct(code);return a&&(a.type==='asset'||a.type==='expense')?x.dr-x.cr:x.cr-x.dr};
E.opts=(f,sel)=>E.rows('coa').filter(a=>!a.inactive).filter(f||(()=>1)).sort((a,b)=>a.code.localeCompare(b.code)).map(a=>`<option value="${a.code}" ${a.code===sel?'selected':''}>${a.code} · ${E.esc(a.name)}</option>`).join('');})(window.ERP);
