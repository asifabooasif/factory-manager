/* Multi-factory. Every factory is a separate world: its own local database, its own cloud data tree, its own users and its own Google Sheet.
   Chart of accounts is created per factory. */
(E=>{E.fid=localStorage.getItem('erp_f')||'';
E.factory=()=>E.D.factories.find(f=>f.id===E.fid);
E.canSee=E.canSee||(()=>true);                     /* replaced by sync.js: staff only see factories they were given */
E.visibleFactories=()=>E.D.factories.filter(f=>E.canSee(f.id)).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
const SEED=[['1000','Cash in Hand','asset',1],['1010','Petty Cash','asset',0],['1100','Bank - Main Account','asset',1],['1110','Post-Dated Cheques Received','asset',0],['1200','Trade Receivables','asset',0],['1250','Employee Advances','asset',0],['1300','Raw Material Stock','asset',0],['1310','Work In Progress','asset',0],['1320','Finished Goods Stock','asset',0],
['2000','Trade Payables','liability',0],['2100','EPF/ETF Payable','liability',0],['2200','Wages Payable','liability',0],['3000','Owner Capital','equity',0],['3100','Retained Earnings','equity',0],
['4000','Sales Revenue','income',0],['5000','Direct Material Cost','expense',0],['5100','Direct Labour','expense',0],['5200','Factory Overheads','expense',0],['5300','Factory Loss (Wastage/Damage)','expense',0],['5400','Cost of Goods Sold','expense',0],
['6000','Factory Rent','expense',0],['6010','Electricity','expense',0],['6020','Transport','expense',0],['6030','Tea & Refreshments','expense',0],['6040','Maintenance & Repairs','expense',0],['6050','Admin Salaries','expense',0],['6060','Finance Charges','expense',0]];
/* creates the factory record, its OWN empty database, and its chart of accounts */
E.newFactory=async(name,code)=>{const f=await E.put('factories',{id:E.uid(),name,code,createdBy:E.user||''});
 E.setF(f.id);await E.openFactory(f.id);
 for(const [c,n,t,b] of SEED)await E.put('coa',{id:f.id+'-'+c,factoryId:f.id,code:c,name:n,type:t,bank:b});
 await E.audit('create','factories',f.id,null,f);return f};
E.setF=id=>{E.fid=id;localStorage.setItem('erp_f',id)};
E.renderFSel=()=>{const v=E.visibleFactories();E.$('fsel').innerHTML=v.map(f=>`<option value="${f.id}" ${f.id===E.fid?'selected':''}>${E.esc(f.name)}</option>`).join('');E.$('fsel').style.display=v.length>1?'':'none'};
E.switchF=async id=>{if(E.sync&&E.sync.switchTo)return E.sync.switchTo(id);E.setF(id);await E.openFactory(id);E.go()};
document.addEventListener('change',e=>{if(e.target.id==='fsel')E.switchF(e.target.value)});
E.firstFactory=()=>{E.modal('Welcome — create your first factory',`<div class="f">Factory name *<input id="fn" placeholder="Lanka Slipper Works"></div><div class="f">Short code *<input id="fc" placeholder="LSW"></div><p class="muted">Each factory is completely separate: its own data, its own database and its own Google Sheet. You can add more factories later and switch between them at the top.</p>`,`<button class="btn p" data-a="mkFactory">Create</button>`);const x=E.$('mw').querySelector('.mh button');if(x)x.remove();};E.A.firstFac=()=>E.firstFactory();
E.A.mkFactory=async()=>{try{const n=E.val('fn'),c=E.val('fc').toUpperCase();if(!n||!c)return E.toast('Name and code required','error');const f=await E.newFactory(n,c);E.closeM();await E.switchF(f.id);E.toast('Factory created','success')}catch(e){E.toast(e.message,'error')}};})(window.ERP);
