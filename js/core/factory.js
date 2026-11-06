/* Multi-factory. Every factory is a separate world: its own local database, its own cloud data tree, its own users and its own Google Sheet.
   Chart of accounts is created per factory. */
(E=>{E.fid=localStorage.getItem('erp_f')||'';
E.factory=()=>E.D.factories.find(f=>f.id===E.fid);
E.canSee=E.canSee||(()=>true);                     /* replaced by sync.js: staff only see factories they were given */
E.visibleFactories=()=>E.D.factories.filter(f=>E.canSee(f.id)).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
/* Chart of accounts. nature: dm Direct material · dl Direct labour · oh Indirect factory overhead · adm Administration · sel Selling & distribution · fin Finance · oth Other.
   beh: fixed / variable / semi. Every expense head carries its nature so expense entry can show whether it is direct or indirect. */
const SEED=[['1000','Cash in Hand','asset',1],['1010','Petty Cash','asset',0],['1100','Bank - Main Account','asset',1],['1110','Post-Dated Cheques Received','asset',0],['1200','Trade Receivables','asset',0],['1250','Employee Advances','asset',0],['1300','Raw Material Stock','asset',0],['1310','Work In Progress','asset',0],['1320','Finished Goods Stock','asset',0],
['2000','Trade Payables','liability',0],['2100','EPF/ETF Payable','liability',0],['2200','Wages Payable','liability',0],['2210','Accrued Piece-Rate Wages','liability',0],['2230','Staff Deductions Payable','liability',0],['2300','Accrued Expenses','liability',0],
['3000','Owner Capital','equity',0],['3100','Retained Earnings','equity',0],['3200','Opening Balance Equity','equity',0],
['4000','Sales Revenue','income',0],
['5000','Direct Material Cost','expense',0,'dm','variable'],['5100','Direct Labour','expense',0,'dl','variable'],['5110','Piece-Rate Wages','expense',0,'dl','variable'],['5120','Daily Wages - Production','expense',0,'dl','variable'],['5130','Production Staff Salaries','expense',0,'dl','fixed'],['5140','EPF/ETF on Production Labour','expense',0,'dl','variable'],
['5200','Factory Overheads (general)','expense',0,'oh','variable'],['5210','Factory Electricity','expense',0,'oh','semi'],['5220','Factory Rent','expense',0,'oh','fixed'],['5230','Machine Repairs & Maintenance','expense',0,'oh','semi'],['5240','Indirect Materials (glue, thread, consumables)','expense',0,'oh','variable'],['5250','Freight Inwards & Handling','expense',0,'oh','variable'],['5260','Depreciation - Factory Machinery','expense',0,'oh','fixed'],['5270','Supervisors & Indirect Labour','expense',0,'oh','fixed'],['5280','Water, Fuel & Gas','expense',0,'oh','semi'],['5290','Overhead Absorbed to Jobs (contra)','expense',0,'contra','variable'],
['5300','Factory Loss (Wastage/Damage)','expense',0,'loss','variable'],['5400','Cost of Goods Sold','expense',0,'cogs','variable'],
['6000','Factory Rent','expense',0,'oh','fixed'],['6010','Electricity','expense',0,'oh','semi'],['6020','Transport','expense',0,'sel','variable'],['6030','Tea & Refreshments','expense',0,'adm','variable'],['6040','Maintenance & Repairs','expense',0,'oh','semi'],['6050','Admin Salaries','expense',0,'adm','fixed'],['6060','Finance Charges','expense',0,'fin','variable'],
['6070','Telephone & Internet','expense',0,'adm','fixed'],['6080','Stationery & Printing','expense',0,'adm','variable'],['6090','Office Rent','expense',0,'adm','fixed'],['6100','Marketing & Advertising','expense',0,'sel','variable'],['6110','Delivery & Distribution','expense',0,'sel','variable'],['6120','Insurance','expense',0,'adm','fixed'],['6130','Professional Fees','expense',0,'adm','semi'],['6140','Bank Charges','expense',0,'fin','variable'],['6150','Depreciation - Office','expense',0,'adm','fixed'],['6160','Sales Commission','expense',0,'sel','variable'],['6170','Security','expense',0,'adm','fixed'],['6180','Miscellaneous Expenses','expense',0,'oth','variable']];
E.NATURE={dm:'Direct material',dl:'Direct labour',oh:'Indirect factory overhead',adm:'Administrative',sel:'Selling & distribution',fin:'Finance',oth:'Other',contra:'Overhead absorbed (contra)',loss:'Factory loss',cogs:'Cost of goods sold'};
E.natureTreat=n=>n==='dm'||n==='dl'?'job':n==='oh'?'pool':'period';
/* adds any account that is missing and fills in nature / behaviour on older accounts (never overwrites a value you set) */
E.ensureCoa=async()=>{if(!E.fid||!E.D.coa)return 0;let n=0;
 for(const [c,nm,t,b,nat,beh] of SEED){const id=E.fid+'-'+c,a=E.D.coa.find(x=>x.factoryId===E.fid&&x.code===c);
  if(!a){await E.put('coa',{id,factoryId:E.fid,code:c,name:nm,type:t,bank:b,nature:nat||'',beh:beh||''});n++}
  else if(nat&&!a.nature){a.nature=nat;a.beh=a.beh||beh||'';await E.put('coa',a);n++}}
 return n};
/* creates the factory record, its OWN empty database, and its chart of accounts */
E.newFactory=async(name,code)=>{const f=await E.put('factories',{id:E.uid(),name,code,createdBy:E.user||''});
 E.setF(f.id);await E.openFactory(f.id);
 await E.ensureCoa();
 await E.audit('create','factories',f.id,null,f);return f};
E.setF=id=>{E.fid=id;localStorage.setItem('erp_f',id)};
E.renderFSel=()=>{const v=E.visibleFactories();E.$('fsel').innerHTML=v.map(f=>`<option value="${f.id}" ${f.id===E.fid?'selected':''}>${E.esc(f.name)}</option>`).join('');E.$('fsel').style.display=v.length>1?'':'none'};
E.switchF=async id=>{if(E.sync&&E.sync.switchTo)return E.sync.switchTo(id);E.setF(id);await E.openFactory(id);E.go()};
document.addEventListener('change',e=>{if(e.target.id==='fsel')E.switchF(e.target.value)});
E.firstFactory=()=>{E.modal('Welcome — create your first factory',`<div class="f">Factory name *<input id="fn" placeholder="Lanka Slipper Works"></div><div class="f">Short code *<input id="fc" placeholder="LSW"></div><p class="muted">Each factory is completely separate: its own data, its own database and its own Google Sheet. You can add more factories later and switch between them at the top.</p>`,`<button class="btn p" data-a="mkFactory">Create</button>`);const x=E.$('mw').querySelector('.mh button');if(x)x.remove();};E.A.firstFac=()=>E.firstFactory();
E.A.mkFactory=async()=>{try{const n=E.val('fn'),c=E.val('fc').toUpperCase();if(!n||!c)return E.toast('Name and code required','error');const f=await E.newFactory(n,c);E.closeM();await E.switchF(f.id);E.toast('Factory created','success')}catch(e){E.toast(e.message,'error')}};})(window.ERP);
