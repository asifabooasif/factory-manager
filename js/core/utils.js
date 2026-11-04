(E=>{const $=id=>document.getElementById(id);E.$=$;E.val=id=>($(id)?.value||'').trim();
E.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
E.uid=()=>'x'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
E.today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
E.toast=(m,t)=>{const e=document.createElement('div');e.className='ts '+(t||'');e.textContent=m;$('ts').appendChild(e);setTimeout(()=>e.remove(),3500)};
E.modal=(t,b,f,w)=>{$('mw').innerHTML=`<div class="m ${w?'w':''}"><div class="mh"><span>${E.esc(t)}</span><button data-a="close">✕</button></div><div class="mb">${b}</div><div class="mf">${f}</div></div>`;$('mw').classList.add('o')};
E.closeM=()=>{$('mw').classList.remove('o');$('mw').innerHTML=''};E.A.close=E.closeM;
E.kpi=(l,v,s)=>`<div class="k"><small>${l}</small><div>${v}</div><i>${s||''}</i></div>`;})(window.ERP);
/* Shared helpers added in Part 13: file download and CSV parsing. */
(E=>{E.download=(name,text,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+text],{type:(type||'text/plain')+';charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};
E.csvCell=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
E.parseCsv=t=>{t=t.replace(/^\ufeff/,'');const out=[];let row=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
 else if(c==='"')q=true;else if(c===','){row.push(cur);cur=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x.trim()))out.push(row);row=[]}else cur+=c}
 row.push(cur);if(row.some(x=>x.trim()))out.push(row);return out}})(window.ERP);
