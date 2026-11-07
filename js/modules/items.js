(E=>{const n=E.N.find(x=>x.id==='items');if(n)n.soon=0;
const CATS=['Finished Good','Raw Material','Accessory','Packing'],UNITS=['Pair','Pcs','Kg','Meter','Sheet','Roll','Litre','Box','Pack'];
const F={q:'',g:'',act:'1'};const vs=id=>E.rows('variants').filter(v=>v.itemId===id);
const ean=async()=>{const k=+(await E.next('BC')).slice(3),b='890'+String(k).padStart(9,'0');let s=0;for(let i=0;i<12;i++)s+=+b[i]*(i%2?3:1);return b+((10-s%10)%10)};
const used=id=>E.D.stockMoves.some(m=>m.itemId===id)||E.D.jobLines.some(l=>l.itemId===id)||E.D.issues.some(l=>l.itemId===id);
const list=s=>(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const title=c=>c.replace(/\s+/g,' ').trim().replace(/\w\S*/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
const grpOf=i=>i.cat==='Finished Good'?'FG:'+(i.sub||'Other'):i.cat;
async function genPacks(it,colours){let made=0;const ex=vs(it.id);
 for(const raw of colours){const c=title(raw);if(ex.some(v=>(v.color||'').toLowerCase()===c.toLowerCase()&&!v.size))continue;
  let sku=(it.art+'-'+c.toUpperCase().replace(/\s+/g,'')),k=2;while(E.rows('variants').some(v=>v.sku===sku))sku=sku.split('#')[0]+'#'+k++;
  const v=await E.save('variants',{itemId:it.id,color:c,size:'',sku,barcode:await ean(),active:true});ex.push(v);made++}
 return made}
async function gen(it,sizes,cols){let made=0;const ex=vs(it.id);
 for(const c of cols.length?cols:[''])for(const s of sizes.length?sizes:['']){
  if(ex.some(v=>(v.color||'').toLowerCase()===c.toLowerCase()&&(v.size||'').toLowerCase()===s.toLowerCase()))continue;
  let sku=[it.art,c.slice(0,3).toUpperCase(),s].filter(Boolean).join('-'),k=2;while(E.rows('variants').some(v=>v.sku===sku))sku=sku.split('#')[0]+'#'+k++;
  const v=await E.save('variants',{itemId:it.id,color:c,size:s,sku,barcode:await ean(),active:true});ex.push(v);made++}
 return made}
E.genPacks=genPacks;E.genVars=gen;
function chips(){const rows=E.rows('items').filter(i=>F.act===''||i.active===(F.act==='1')),cnt=k=>rows.filter(i=>k==='FG:*'?i.cat==='Finished Good':grpOf(i)===k).length;
 const subs=[...new Set([...E.fgCats(),...rows.filter(i=>i.cat==='Finished Good').map(i=>i.sub||'Other')])];
 const b=(k,l,c)=>`<button class="chip ${F.g===k?'on':''}" data-a="itGrp" data-id="${k}">${l} <small>${c}</small></button>`;
 return `<div class="chips">${b('','All',rows.length)}${b('FG:*','Finished goods',cnt('FG:*'))}${subs.map(s=>b('FG:'+s,'↳ '+E.esc(s),cnt('FG:'+s))).join('')}${['Raw Material','Accessory','Packing'].map(c=>b(c,c,cnt(c))).join('')}</div>`}
function tbl(){const s=F.q.toLowerCase();
 const rows=E.rows('items').filter(i=>(!F.g||(F.g==='FG:*'?i.cat==='Finished Good':grpOf(i)===F.g))&&(F.act===''||i.active===(F.act==='1'))&&(!s||(i.art+' '+i.name+' '+(i.sub||'')+' '+(i.sizeRun||'')+' '+vs(i.id).map(v=>v.sku+' '+v.barcode+' '+v.color).join(' ')).toLowerCase().includes(s))).sort((a,b)=>grpOf(a).localeCompare(grpOf(b))||a.art.localeCompare(b.art));
 return `<div class="tw"><table><thead><tr><th>Article No</th><th>Name</th><th>Category</th><th>Pack (size run)</th><th>Colours (packs)</th><th class="r">Price</th><th></th></tr></thead><tbody>${rows.map(i=>{const fgI=i.cat==='Finished Good',v=vs(i.id).filter(x=>x.active);
  return `<tr style="${i.active?'':'opacity:.5'}"><td><b style="font-size:15px">${E.esc(i.art)}</b></td><td>${E.esc(i.name)}</td><td><span class="tag">${fgI?E.esc(i.sub||'Finished Good'):i.cat}</span></td>
  <td>${fgI?(i.sizeRun?`<b>${E.esc(i.sizeRun.split(',').map(x=>x.trim()).join(' · '))}</b><div class="muted">${i.pack} pairs per pack</div>`:'<span class="muted">not set</span>'):`${i.unit}`}</td>
  <td><button class="btn sm" data-a="vars" data-id="${i.id}">${fgI?v.length+' colour'+(v.length===1?'':'s'):v.length+' SKUs'}</button> ${fgI?v.slice(0,4).map(x=>E.esc(x.color||'')).filter(Boolean).join(', '):''}</td><td class="r">${fgI?(i.price?E.m(i.price)+'<div class="muted">sell / pack</div>':'—'):(i.buyPrice?E.m(i.buyPrice)+'<div class="muted">buy / '+E.esc(i.unit)+'</div>':'<span class="bad">no purchase price</span>')}</td>
  <td class="r">${fgI?`<button class="btn sm" data-a="bomM" data-id="${i.id}">BOM</button> `:''}<button class="btn sm" data-a="editItem" data-id="${i.id}">Edit</button> <button class="btn sm d" data-a="delItem" data-id="${i.id}">${used(i.id)?(i.active?'Deactivate':'Activate'):'Delete'}</button></td></tr>`}).join('')||'<tr><td colspan="7" class="muted">No items found</td></tr>'}</tbody></table></div><p class="muted small">${rows.length} item(s). Finished goods are counted in packs (one size run in one colour). Costs are calculated when a Job is completed.</p>`}
E.route('items','Items',()=>`<style>.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.chip{border:1px solid var(--bd);background:var(--s);color:var(--t2);border-radius:99px;padding:6px 14px;font-size:12.5px;cursor:pointer}.chip small{opacity:.7;margin-left:3px}.chip.on{background:var(--ac);border-color:var(--ac);color:#fff}</style>
<div class="bar"><input style="max-width:340px" class="fs" placeholder="🔍 Search article no, name, colour, barcode…" data-f="it.q" value="${E.esc(F.q)}"><select class="fs" data-f="it.act"><option value="1" ${F.act==='1'?'selected':''}>Active</option><option value="0" ${F.act==='0'?'selected':''}>Inactive</option><option value="" ${F.act===''?'selected':''}>All</option></select><span class="gap"></span><button class="btn p" data-a="newItem">+ New Item</button></div><div id="chp">${chips()}</div><div id="tbl">${tbl()}</div>`);
E.A.itGrp=k=>{F.g=k;E.$('chp').innerHTML=chips();E.$('tbl').innerHTML=tbl()};
E.hooks.push(e=>{const t=e.target,f=t.dataset&&t.dataset.f;if(f&&f.startsWith('it.')){F[f.slice(3)]=t.value;E.$('tbl').innerHTML=tbl();if(f==='it.act')E.$('chp').innerHTML=chips()}
 if(t.id==='i_cat')fgToggle();
 /* ── FIX: use expandSizes for live count ── */
 if(t.id==='i_run'){const c=E.expandSizes(t.value).length;if(c&&E.$('i_pack'))E.$('i_pack').value=c}});
function fgToggle(){const fgI=E.val('i_cat')==='Finished Good';document.querySelectorAll('.i-fg').forEach(x=>x.style.display=fgI?'':'none');document.querySelectorAll('.i-nf').forEach(x=>x.style.display=fgI?'none':'');if(fgI&&E.$('i_unit'))E.$('i_unit').value='Pack'}
const form=id=>{const it=id?E.D.items.find(x=>x.id===id):null,fgI=!it||it.cat==='Finished Good';
 E.modal(it?'Edit Item':'New Item',`<div class="g2"><div class="f">Article No *<input id="i_art" value="${E.esc(it?.art)}" ${it?'disabled':''} placeholder="F001"></div><div class="f">Category *<select id="i_cat" ${it&&used(it.id)?'disabled':''}>${CATS.map(c=>`<option ${(it?it.cat:'Finished Good')===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
 <div class="g2 i-fg" style="${fgI?'':'display:none'}"><div class="f">Finished-goods category *<select id="i_sub">${E.fgCats().concat(it&&it.sub&&!E.fgCats().includes(it.sub)?[it.sub]:[]).map(c=>`<option ${it?.sub===c?'selected':''}>${E.esc(c)}</option>`).join('')}</select><small class="muted">Add more under Settings → Finished-goods categories</small></div><div class="f">Size run in ONE pack *<input id="i_run" value="${E.esc(it?.sizeRun)}" placeholder="36-41"><small class="muted">Try 36-41 (auto 6 pairs), or 6,7,7,8,8,9, or 36-41,36-41 (12 pairs)</small></div></div>
 <div class="f">Item Name *<input id="i_name" value="${E.esc(it?.name)}"></div>
 <div class="g2"><div class="f">Unit<select id="i_unit">${UNITS.map(u=>`<option ${((it?it.unit:'Pack')===u)?'selected':''}>${u}</option>`).join('')}</select></div><div class="f"><span class="i-fg" style="${fgI?'':'display:none'}">Pairs in one pack</span><span class="i-nf" style="${fgI?'display:none':''}">Pairs/units per pack (optional)</span><input id="i_pack" type="number" value="${it?it.pack:E.setting('packSize')}"></div>
 <div class="f i-fg" style="${fgI?'':'display:none'}">Selling price per PACK (optional)<input id="i_price" type="number" step="0.01" value="${it&&it.price?it.price/100:''}"></div><div class="f i-nf" style="${fgI?'display:none':''}">Purchase price per unit (Rs) *<input id="i_buy" type="number" step="0.01" value="${it&&(it.buyPrice||it.cat!=='Finished Good'&&it.price)?(it.buyPrice||it.price)/100:''}"><small class="muted">What you pay the supplier. Used for purchases and costing.</small></div><div class="f">Reorder level (alert below this)<input id="i_min" type="number" value="${it?.min||''}"></div></div><div class="g2 i-nf" style="${fgI?'display:none':''}"><div class="f">Preferred supplier<select id="i_sup"><option value="">— none —</option>${E.rows('parties').filter(p=>p.active&&p.type!=='Customer').map(p=>`<option value="${p.id}" ${it&&it.supId===p.id?'selected':''}>${E.esc(p.name)}</option>`).join('')}</select></div><div class="f">Specification / notes<input id="i_spec" value="${E.esc(it?.spec)}" placeholder="e.g. 3mm EVA sheet, 36 inch width"></div></div>
 ${it?`<p class="muted">Add colours from the <b>Colours</b> button on the list.</p>`:`<div class="f i-fg" style="${fgI?'':'display:none'}">Colours (comma separated) — one pack and one barcode per colour<input id="i_cols" placeholder="Black, Brown, Navy"></div><div class="g2 i-nf" style="${fgI?'display:none':''}"><div class="f">Sizes (comma separated)<input id="i_sizes" placeholder="6,7,8,9"></div><div class="f">Colours (comma separated)<input id="i_cols2" placeholder="Black,Brown"></div></div><p class="muted">Leave colours empty if the item has none. SKUs and barcodes are generated automatically.</p>`}`,
 `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveItem" data-id="${id||''}">Save Item</button>`,1)};
E.A.newItem=()=>form();E.A.editItem=id=>form(id);
E.A.saveItem=async id=>{const art=E.val('i_art').toUpperCase(),name=E.val('i_name'),cat=E.val('i_cat')||(id&&E.D.items.find(x=>x.id===id).cat),fgI=cat==='Finished Good';
 if(!id&&!art)return E.toast('Article No required','error');if(!name)return E.toast('Item name required','error');
 if(!id&&E.rows('items').some(i=>i.art===art))return E.toast('Article No already exists','error');
 /* ── FIX: use expandSizes so 36-41 becomes 36,37,38,39,40,41 ── */
 const run=fgI?E.expandSizes(E.val('i_run')):[];
 if(fgI&&!run.length)return E.toast('Enter the size run of one pack, e.g. 36-41 or 6,7,7,8,8,9','error');
 if(!fgI&&!(E.c(E.val('i_buy'))>0))return E.toast('Enter the purchase price per unit (what you pay the supplier)','error');
 const it=id?E.D.items.find(x=>x.id===id):{art,active:true},b=id?JSON.parse(JSON.stringify(it)):null;
 Object.assign(it,{name,cat,unit:fgI?'Pack':E.val('i_unit'),pack:fgI?run.length:Math.max(0,parseInt(E.val('i_pack'))||0),sizeRun:fgI?run.join(','):'',sub:fgI?E.val('i_sub'):'',price:fgI?E.c(E.val('i_price')):0,buyPrice:fgI?(it.buyPrice||0):E.c(E.val('i_buy')),supId:fgI?'':E.val('i_sup'),spec:fgI?'':E.val('i_spec'),min:parseFloat(E.val('i_min'))||0});
 await E.save('items',it,b);
 if(!id){const m=fgI?await genPacks(it,list(E.val('i_cols'))):await gen(it,list(E.val('i_sizes')),list(E.val('i_cols2')));E.toast('Item saved'+(m?' with '+m+(fgI?' colour pack(s) and barcode(s)':' SKUs'):''),'success')}else E.toast('Item updated','success');
 E.closeM();E.go()};
E.A.delItem=async id=>{const it=E.D.items.find(x=>x.id===id);
 if(used(id)){const b=JSON.parse(JSON.stringify(it));it.active=!it.active;await E.save('items',it,b)}
 else if(confirm('Delete '+it.art+' and its SKUs?')){for(const v of vs(id)){await E.del('variants',v.id);await E.audit('delete','variants',v.id,v,null)}await E.del('items',id);await E.audit('delete','items',id,it,null)}
 E.go()};
E.A.vars=id=>{const it=E.D.items.find(x=>x.id===id),fgI=it.cat==='Finished Good';
 E.modal(it.art+(fgI?' · Colour packs & barcodes':' · SKUs & barcodes'),`${fgI?`<p style="margin-bottom:8px"><span class="tag">${E.esc(it.sub||'Finished Good')}</span> <b>${it.pack}</b> pairs per pack · size run <b>${E.esc((it.sizeRun||'').split(',').join(' · '))}</b></p>`:''}<div class="tw"><table><thead><tr><th>${fgI?'Colour':'SKU'}</th>${fgI?'<th>Code</th>':'<th>Size</th><th>Colour</th>'}<th>Barcode</th><th></th></tr></thead><tbody>${vs(id).map(v=>`<tr style="${v.active?'':'opacity:.5'}">${fgI&&!v.size?`<td><b>${E.esc(v.color)||'—'}</b></td><td>${E.esc(v.sku)}</td>`:`<td>${E.esc(v.sku)}</td><td>${E.esc(v.size)||'—'}</td><td>${E.esc(v.color)||'—'}</td>`}<td>${v.barcode}</td><td class="r"><button class="btn sm" data-a="lblOne" data-id="${v.id}">🏷 Label</button> <button class="btn sm" data-a="vToggle" data-id="${v.id}">${v.active?'Deactivate':'Activate'}</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">No colours yet</td></tr>'}</tbody></table></div>
 ${fgI?'<div class="f">Add colours (comma separated)<input id="v_c" placeholder="Navy, Pink"></div><p class="muted">Each colour is one pack with its own barcode. Existing colours are skipped. Old size-wise SKUs (if any) can be deactivated once their stock is zero.</p>':'<div class="g2"><div class="f">Add sizes<input id="v_s" placeholder="10,11"></div><div class="f">Add colours<input id="v_c" placeholder="Navy"></div></div><p class="muted">Existing size/colour combinations are skipped.</p>'}`,
 `<button class="btn" data-a="close">Close</button><button class="btn p" data-a="addVars" data-id="${id}">Generate</button>`,1)};
E.A.addVars=async id=>{const it=E.D.items.find(x=>x.id===id),m=it.cat==='Finished Good'?await genPacks(it,list(E.val('v_c'))):await gen(it,list(E.val('v_s')),list(E.val('v_c')));E.toast(m+' new SKU(s) created',m?'success':'');E.A.vars(id);E.go()};
E.A.vToggle=async id=>{const v=E.D.variants.find(x=>x.id===id),b=JSON.parse(JSON.stringify(v));v.active=!v.active;await E.save('variants',v,b);E.A.vars(v.itemId);E.go()};
E.A.lblOne=id=>{const v=E.D.variants.find(x=>x.id===id),k=E.skuList(()=>true).find(s=>s.variantId===id)||(()=>{const i=E.D.items.find(x=>x.id===v.itemId);return {itemId:i.id,variantId:v.id,code:v.sku,name:i.name,art:i.art,color:v.color,size:v.size,run:i.sizeRun,group:i.sub||i.cat,pairs:i.pack,barcode:v.barcode}})();
 E.printLabels([k],parseInt(prompt('How many labels?','1'))||1)};})(window.ERP);S