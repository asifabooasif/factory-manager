/* PART 3 — Stock engine. Moves carry qty AND value (cents); issues use weighted-average cost; stock can never go negative. */
(E=>{E.stockMap=()=>{const m={};E.rows('stockMoves').forEach(x=>{const k=x.itemId+'|'+(x.variantId||''),a=m[k]||(m[k]={qty:0,value:0});a.qty+=x.qty;a.value+=x.value});for(const k in m)m[k].qty=Math.round(m[k].qty*1000)/1000;return m};
E.stock=(i,v)=>E.stockMap()[i+'|'+(v||'')]||{qty:0,value:0};
/* Finished goods are kept as COLOUR PACKS: one stock line per Article + Colour (a pack = one size run, e.g. 6,7,7,8,8,9). Quantity = packs.
   Older size-wise SKUs still appear (with their size) until you deactivate them. */
E.packPairs=itemId=>{const i=E.D.items.find(x=>x.id===itemId);return (i&&i.pack)||E.setting('packSize')||1};
E.skuList=f=>{const out=[];E.rows('items').filter(i=>i.active&&(!f||f(i))).forEach(i=>{const fgI=i.cat==='Finished Good',grp=fgI?(i.sub||'Finished Good'):i.cat,vs=E.rows('variants').filter(v=>v.itemId===i.id&&v.active);
 const base={itemId:i.id,name:i.name,cat:i.cat,group:grp,unit:fgI?'Pack':i.unit,min:i.min,art:i.art,run:i.sizeRun||'',pairs:i.pack||0};
 if(!vs.length)out.push(Object.assign({},base,{variantId:'',code:i.art,barcode:'',color:'',label:i.art+' — '+i.name}));
 else vs.forEach(v=>out.push(Object.assign({},base,{variantId:v.id,code:v.sku,barcode:v.barcode,color:v.color||'',size:v.size||'',label:v.sku+' — '+i.name+' ('+[v.color,v.size].filter(Boolean).join(' / ')+')'})))});return out};
E.skuFind=(t,f)=>{t=(t||'').trim();const l=t.toLowerCase();return E.skuList(f).find(s=>s.label.toLowerCase()===l||s.code.toLowerCase()===l||(t&&s.barcode===t))};
/* options for the searchable picker (js/core/picker.js): group = category, badge = stock on hand */
E.skuOpts=f=>{const m=E.stockMap();return E.skuList(f).map(s=>{const q=(m[s.itemId+'|'+s.variantId]||{qty:0}).qty;return `<option value="${E.esc(s.label)}" data-g="${E.esc(s.group)}" data-a="${E.esc(s.art)}" data-c="${E.esc(s.color)}" data-s="${E.esc(s.run||s.size||'')}" data-b="${q} ${s.unit==='Pack'?'packs':E.esc(s.unit)}" data-k="${E.esc(s.code+' '+s.barcode+' '+s.name+' '+s.group)}">`}).join('')};
E.stockIn=({date,itemId,variantId,qty,value,type,ref,job})=>E.put('stockMoves',{date,itemId,variantId:variantId||'',qty,value,type,ref,job:job||'',factoryId:E.fid});
E.outValue=(i,v,qty)=>{const s=E.stock(i,v);if(qty>s.qty+1e-9)throw new Error('Insufficient stock: only '+s.qty+' available');return qty>=s.qty-1e-9?s.value:Math.round(s.value*qty/s.qty)};
E.stockOut=async({date,itemId,variantId,qty,type,ref,job})=>{const value=E.outValue(itemId,variantId,qty);await E.put('stockMoves',{date,itemId,variantId:variantId||'',qty:-qty,value:-value,type,ref,job:job||'',factoryId:E.fid});return value};})(window.ERP);
