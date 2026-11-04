/* Multi-factory: every record carries factoryId. Chart of accounts is created per factory. */
(E=>{E.fid=localStorage.getItem('erp_f')||'';
E.factory=()=>E.D.factories.find(f=>f.id===E.fid);
const SEED=[['1000','Cash in Hand','asset',1],['1010','Petty Cash','asset',0],['1100','Bank - Main Account','asset',1],['1110','Post-Dated Cheques Received','asset',0],['1200','Trade Receivables','asset',0],['1250','Employee Advances','asset',0],['1300','Raw Material Stock','asset',0],['1310','Work In Progress','asset',0],['1320','Finished Goods Stock','asset',0],
['2000','Trade Payables','liability',0],['2100','EPF/ETF Payable','liability',0],['2200','Wages Payable','liability',0],['3000','Owner Capital','equity',0],['3100','Retained Earnings','equity',0],
['4000','Sales Revenue','income',0],['5000','Direct Material Cost','expense',0],['5100','Direct Labour','expense',0],['5200','Factory Overheads','expense',0],['5300','Factory Loss (Wastage/Damage)','expense',0],['5400','Cost of Goods Sold','expense',0],
['6000','Factory Rent','expense',0],['6010','Electricity','expense',0],['6020','Transport','expense',0],['6030','Tea & Refreshments','expense',0],['6040','Maintenance & Repairs','expense',0],['6050','Admin Salaries','expense',0],['6060','Finance Charges','expense',0]];
E.newFactory=async(name,code)=>{const f=await E.save('factories',{name,code});
 for(const [c,n,t,b] of SEED)await E.put('coa',{id:f.id+'-'+c,factoryId:f.id,code:c,name:n,type:t,bank:b});
 E.setF(f.id);return f};
E.setF=id=>{E.fid=id;localStorage.setItem('erp_f',id)};
E.renderFSel=()=>{E.$('fsel').innerHTML=E.D.factories.map(f=>`<option value="${f.id}" ${f.id===E.fid?'selected':''}>${E.esc(f.name)}</option>`).join('');};
document.addEventListener('change',e=>{if(e.target.id==='fsel'){E.setF(e.target.value);E.go()}});
E.firstFactory=()=>{E.modal('Welcome — create your first factory',`<div class="f">Factory name *<input id="fn" placeholder="Lanka Slipper Works"></div><div class="f">Short code *<input id="fc" placeholder="LSW"></div><p class="muted">You can add more factories later and switch between them at the top.</p>`,`<button class="btn p" data-a="mkFactory">Create</button>`);const x=E.$('mw').querySelector('.mh button');if(x)x.remove();};E.A.firstFac=()=>E.firstFactory();
E.A.mkFactory=async()=>{const n=E.val('fn'),c=E.val('fc').toUpperCase();if(!n||!c)return E.toast('Name and code required','error');await E.newFactory(n,c);E.closeM();E.renderFSel();E.go();};})(window.ERP);
