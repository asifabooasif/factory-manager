/* PART 3 — Stock engine. Moves carry qty AND value (cents); issues use weighted-average cost; stock can never go negative. */
(E=>{E.stockMap=()=>{const m={};E.rows('stockMoves').forEach(x=>{const k=x.itemId+'|'+(x.variantId||''),a=m[k]||(m[k]={qty:0,value:0});a.qty+=x.qty;a.value+=x.value});for(const k in m)m[k].qty=Math.round(m[k].qty*1000)/1000;return m};
E.stock=(i,v)=>E.stockMap()[i+'|'+(v||'')]||{qty:0,value:0};
E.skuList=f=>{const out=[];E.rows('items').filter(i=>i.active&&(!f||f(i))).forEach(i=>{const vs=E.rows('variants').filter(v=>v.itemId===i.id&&v.active);
 if(!vs.length)out.push({itemId:i.id,variantId:'',code:i.art,name:i.name,cat:i.cat,unit:i.unit,barcode:'',min:i.min,label:i.art+' — '+i.name});
 else vs.forEach(v=>out.push({itemId:i.id,variantId:v.id,code:v.sku,name:i.name,cat:i.cat,unit:i.unit,barcode:v.barcode,min:i.min,label:v.sku+' — '+i.name+' ('+[v.color,v.size].filter(Boolean).join(' / ')+')'}))});return out};
E.skuFind=(t,f)=>{t=(t||'').trim();const l=t.toLowerCase();return E.skuList(f).find(s=>s.label.toLowerCase()===l||s.code.toLowerCase()===l||(t&&s.barcode===t))};
E.skuOpts=f=>E.skuList(f).map(s=>`<option value="${E.esc(s.label)}">`).join('');
E.stockIn=({date,itemId,variantId,qty,value,type,ref,job})=>E.put('stockMoves',{date,itemId,variantId:variantId||'',qty,value,type,ref,job:job||'',factoryId:E.fid});
E.outValue=(i,v,qty)=>{const s=E.stock(i,v);if(qty>s.qty+1e-9)throw new Error('Insufficient stock: only '+s.qty+' available');return qty>=s.qty-1e-9?s.value:Math.round(s.value*qty/s.qty)};
E.stockOut=async({date,itemId,variantId,qty,type,ref,job})=>{const value=E.outValue(itemId,variantId,qty);await E.put('stockMoves',{date,itemId,variantId:variantId||'',qty:-qty,value:-value,type,ref,job:job||'',factoryId:E.fid});return value};})(window.ERP);
