/* PART 2 — Items master: search, category filter, colours/sizes (SKUs + EAN-13 barcodes), pack size. No cost fields: cost comes from completed Jobs. */
(E=>{const n=E.N.find(x=>x.id==='items');if(n)n.soon=0;
const CATS=['Raw Material','Accessory','Finished Good','Packing'],UNITS=['Pair','Pcs','Kg','Meter','Sheet','Roll','Litre','Box','Pack'];
const F={q:'',cat:'',act:'1'};const vs=id=>E.rows('variants').filter(v=>v.itemId===id);
const ean=async()=>{const k=+(await E.next('BC')).slice(3),b='890'+String(k).padStart(9,'0');let s=0;for(let i=0;i<12;i++)s+=+b[i]*(i%2?3:1);return b+((10-s%10)%10)};
const used=id=>E.D.stockMoves.some(m=>m.itemId===id)||E.D.jobLines.some(l=>l.itemId===id)||E.D.issues.some(l=>l.itemId===id);
const list=s=>(s||'').split(',').map(x=>x.trim()).filter(Boolean);
function tbl(){const s=F.q.toLowerCase();
 const rows=E.rows('items').filter(i=>(!F.cat||i.cat===F.cat)&&(F.act===''||i.active===(F.act==='1'))&&(!s||(i.art+' '+i.name+' '+vs(i.id).map(v=>v.sku+' '+v.barcode).join(' ')).toLowerCase().includes(s))).sort((a,b)=>a.art.localeCompare(b.art));
 return `<div class="tw"><table><thead><tr><th>Article No</th><th>Name</th><th>Category</th><th>Unit</th><th class="r">Per pack</th><th class="r">Selling price</th><th>SKUs</th><th></th></tr></thead><tbody>${rows.map(i=>`<tr style="${i.active?'':'opacity:.5'}"><td><b>${E.esc(i.art)}</b></td><td>${E.esc(i.name)}</td><td><span class="tag">${i.cat}</span></td><td>${i.unit}</td><td class="r">${i.pack||'—'}</td><td class="r">${i.price?E.m(i.price):'—'}</td><td><button class="btn sm" data-a="vars" data-id="${i.id}">${vs(i.id).length} SKUs</button></td><td class="r">${i.cat==='Finished Good'?`<button class="btn sm" data-a="bomM" data-id="${i.id}">BOM</button> `:''}<button class="btn sm" data-a="editItem" data-id="${i.id}">Edit</button> <button class="btn sm d" data-a="delItem" data-id="${i.id}">${used(i.id)?(i.active?'Deactivate':'Activate'):'Delete'}</button></td></tr>`).join('')||'<tr><td colspan="8" class="muted">No items found</td></tr>'}</tbody></table></div><p class="muted small">${rows.length} item(s). Costs are never typed here; they are calculated when a Job is completed.</p>`}
E.route('items','Items',()=>`<div class="bar"><input style="max-width:320px" class="fs" placeholder="Search article no, name, SKU, barcode…" data-f="it.q" value="${E.esc(F.q)}"><select class="fs" data-f="it.cat"><option value="">All categories</option>${CATS.map(c=>`<option ${F.cat===c?'selected':''}>${c}</option>`).join('')}</select><select class="fs" data-f="it.act"><option value="1" ${F.act==='1'?'selected':''}>Active</option><option value="0" ${F.act==='0'?'selected':''}>Inactive</option><option value="" ${F.act===''?'selected':''}>All</option></select><span class="gap"></span><button class="btn p" data-a="newItem">+ New Item</button></div><div id="tbl">${tbl()}</div>`);
E.hooks.push(e=>{const f=e.target.dataset&&e.target.dataset.f;if(f&&f.startsWith('it.')){F[f.slice(3)]=e.target.value;E.$('tbl').innerHTML=tbl()}});
const form=id=>{const it=id?E.D.items.find(x=>x.id===id):null;
 E.modal(it?'Edit Item':'New Item',`<div class="g2"><div class="f">Article No *<input id="i_art" value="${E.esc(it?.art)}" ${it?'disabled':''} placeholder="ART-100"></div><div class="f">Category *<select id="i_cat">${CATS.map(c=>`<option ${it?.cat===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
 <div class="f">Item Name *<input id="i_name" value="${E.esc(it?.name)}"></div>
 <div class="g2"><div class="f">Unit<select id="i_unit">${UNITS.map(u=>`<option ${(it?.unit||'Pair')===u?'selected':''}>${u}</option>`).join('')}</select></div><div class="f">Pairs/units per pack<input id="i_pack" type="number" value="${it?it.pack:E.setting('packSize')}"></div>
 <div class="f">Selling price (optional)<input id="i_price" type="number" step="0.01" value="${it&&it.price?it.price/100:''}"></div><div class="f">Reorder level (optional)<input id="i_min" type="number" value="${it?.min||''}"></div></div>
 ${it?'<p class="muted">Add sizes or colours from the SKUs button on the list.</p>':'<div class="g2"><div class="f">Sizes (comma separated)<input id="i_sizes" placeholder="6,7,8,9"></div><div class="f">Colours (comma separated)<input id="i_cols" placeholder="Black,Brown"></div></div><p class="muted">Leave both empty if the item has no sizes or colours. SKUs and barcodes are generated automatically.</p>'}`,
 `<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="saveItem" data-id="${id||''}">Save Item</button>`)};
E.A.newItem=()=>form();E.A.editItem=id=>form(id);
async function gen(it,sizes,cols){let made=0;const ex=vs(it.id);
 for(const c of cols.length?cols:[''])for(const s of sizes.length?sizes:['']){
  if(ex.some(v=>v.color.toLowerCase()===c.toLowerCase()&&v.size.toLowerCase()===s.toLowerCase()))continue;
  let sku=[it.art,c.slice(0,3).toUpperCase(),s].filter(Boolean).join('-'),k=2;while(E.rows('variants').some(v=>v.sku===sku))sku=sku.split('#')[0]+'#'+k++;
  const v=await E.save('variants',{itemId:it.id,color:c,size:s,sku,barcode:await ean(),active:true});ex.push(v);made++}
 return made}
E.A.saveItem=async id=>{const art=E.val('i_art').toUpperCase(),name=E.val('i_name');
 if(!id&&!art)return E.toast('Article No required','error');if(!name)return E.toast('Item name required','error');
 if(!id&&E.rows('items').some(i=>i.art===art))return E.toast('Article No already exists','error');
 const it=id?E.D.items.find(x=>x.id===id):{art,active:true},b=id?JSON.parse(JSON.stringify(it)):null;
 Object.assign(it,{name,cat:E.val('i_cat'),unit:E.val('i_unit'),pack:Math.max(0,parseInt(E.val('i_pack'))||0),price:E.c(E.val('i_price')),min:parseFloat(E.val('i_min'))||0});
 await E.save('items',it,b);
 if(!id){const m=await gen(it,list(E.val('i_sizes')),list(E.val('i_cols')));E.toast('Item saved'+(m?' with '+m+' SKUs':''),'success')}else E.toast('Item updated','success');
 E.closeM();E.go()};
E.A.delItem=async id=>{const it=E.D.items.find(x=>x.id===id);
 if(used(id)){const b=JSON.parse(JSON.stringify(it));it.active=!it.active;await E.save('items',it,b)}
 else if(confirm('Delete '+it.art+' and its SKUs?')){for(const v of vs(id)){await E.del('variants',v.id);await E.audit('delete','variants',v.id,v,null)}await E.del('items',id);await E.audit('delete','items',id,it,null)}
 E.go()};
E.A.vars=id=>{const it=E.D.items.find(x=>x.id===id);
 E.modal(it.art+' · SKUs & barcodes',`<div class="tw"><table><thead><tr><th>SKU</th><th>Size</th><th>Colour</th><th>Barcode</th></tr></thead><tbody>${vs(id).map(v=>`<tr><td>${E.esc(v.sku)}</td><td>${E.esc(v.size)||'—'}</td><td>${E.esc(v.color)||'—'}</td><td>${v.barcode}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">No SKUs yet</td></tr>'}</tbody></table></div><div class="g2"><div class="f">Add sizes<input id="v_s" placeholder="10,11"></div><div class="f">Add colours<input id="v_c" placeholder="Navy"></div></div><p class="muted">Existing size/colour combinations are skipped.</p>`,`<button class="btn" data-a="close">Close</button><button class="btn p" data-a="addVars" data-id="${id}">Generate</button>`,1)};
E.A.addVars=async id=>{const it=E.D.items.find(x=>x.id===id),m=await gen(it,list(E.val('v_s')),list(E.val('v_c')));E.toast(m+' new SKU(s) created',m?'success':'');E.A.vars(id);E.go()};})(window.ERP);
