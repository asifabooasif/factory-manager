/* Print documents: Delivery Note, Invoice, Receipt, Credit Note. Logo, colours and company details: System > Print & Documents. */
(E=>{
let OV=null;                                                  // live form values while previewing
const S=k=>(OV&&k in OV)?OV[k]:(E.setting(k)||'');
const cu=id=>E.D.parties.find(x=>x.id===id)||{};
const pp=l=>E.packPairs(l.itemId);
const ONES=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'],TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const w3=n=>(n>=100?ONES[Math.floor(n/100)]+' hundred'+(n%100?' and ':''):'')+(n%100<20?ONES[n%100]:TENS[Math.floor(n%100/10)]+(n%10?'-'+ONES[n%10]:''));
function words(cents){const r=Math.floor(cents/100),c=cents%100;if(!r&&!c)return 'Zero rupees only';let p=[],n=r;[[1e9,'billion'],[1e6,'million'],[1e3,'thousand']].forEach(([v,t])=>{if(n>=v){p.push(w3(Math.floor(n/v))+' '+t);n%=v}});if(n)p.push(w3(n));let s=(p.join(' ')||'zero');s=s.charAt(0).toUpperCase()+s.slice(1)+' rupees';if(c)s+=' and '+w3(c)+' cents';return s+' only'}
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+(+n||0));return x.toISOString().slice(0,10)};
const H={Small:44,Medium:64,Large:88};
const logoH=()=>H[S('pr_logoSize')]||64;
const accent=()=>/^#[0-9a-f]{6}$/i.test(S('pr_color'))?S('pr_color'):'#1e3a8a';
function company(){const f=E.factory()||{};return {name:S('pr_name')||f.name||'',addr:S('pr_addr'),phone:S('pr_phone'),email:S('pr_email'),reg:S('pr_reg'),bank:S('pr_bank'),terms:S('pr_terms'),foot:S('pr_foot')}}
const CSS=()=>`@page{size:${S('pr_paper')==='A5'?'A5':'A4'};margin:12mm 12mm 16mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Arial;color:#777}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}:root{--ac:${accent()}}
body{font:${S('pr_font')==='Large'?'13px':'11.5px'}/1.4 "Segoe UI",Arial,Helvetica,sans-serif;color:#1b1f2a;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.brand{display:flex;gap:14px;align-items:center}
.brand img{max-height:${logoH()}px;max-width:${Math.round(logoH()*3)}px;object-fit:contain;display:block}
.brand h1{margin:0;font-size:19px;color:var(--ac);line-height:1.15}.sm{font-size:10.5px;color:#4b5263;white-space:pre-line}
.docbox{text-align:right}.ti{font-size:25px;font-weight:800;letter-spacing:2px;color:var(--ac);line-height:1}
.meta{display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:11px;margin-top:8px;justify-content:end;text-align:left}.meta span:nth-child(odd){color:#6b7280}.meta span:nth-child(even){font-weight:600;text-align:right}
.rule{height:4px;background:var(--ac);margin:10px 0 12px;border-radius:2px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid #d6d9e0;border-radius:6px;padding:9px 12px;background:#fafbfc;min-height:62px}
.card h4{margin:0 0 4px;font-size:9px;letter-spacing:1.2px;color:var(--ac);text-transform:uppercase}.card strong{font-size:13px}
table.it{width:100%;border-collapse:collapse;margin-top:14px}table.it th{background:var(--ac);color:#fff;font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;padding:7px 8px;text-align:left}
table.it th.r{text-align:right}table.it td{padding:7px 8px;border-bottom:1px solid #e3e6ec;vertical-align:top}table.it tbody tr:nth-child(even){background:#f6f7fa}tr{break-inside:avoid}
.r{text-align:right;white-space:nowrap}.nw{white-space:nowrap}table.it tfoot td{font-weight:700;border-top:2px solid var(--ac);border-bottom:0;background:#fff}
.sum{display:flex;justify-content:space-between;gap:20px;margin-top:14px;align-items:flex-start;break-inside:avoid}
.words{flex:1;border-left:4px solid var(--ac);background:#f3f5fa;padding:8px 12px;border-radius:0 6px 6px 0}.words b{display:block;font-size:9px;letter-spacing:1px;color:var(--ac);text-transform:uppercase;margin-bottom:2px}
.tot{width:46%;border-collapse:collapse}.tot td{padding:4px 8px}.tot .gt td{background:var(--ac);color:#fff;font-size:14px;font-weight:700;padding:7px 8px}.tot .bal td{font-weight:700;font-size:13px;border-top:1px solid #1b1f2a}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;break-inside:avoid}.notes .card{background:#fff}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:58px;break-inside:avoid}.sig div{border-top:1px solid #333;text-align:center;padding-top:4px;font-size:10px;color:#444}
.blank{display:inline-block;border-bottom:1px solid #777;min-width:120px}.big{font-size:22px;font-weight:800;color:var(--ac)}
.stamp{position:fixed;top:38%;left:22%;font-size:72px;font-weight:800;color:rgba(190,0,0,.16);transform:rotate(-20deg);border:7px solid rgba(190,0,0,.16);padding:0 22px;letter-spacing:4px}
.copy{font-size:9px;letter-spacing:2px;color:#777;margin-top:4px}`;
const logoImg=()=>S('pr_logo')?`<img src="${S('pr_logo')}" alt="">`:'';
function page(title,meta,body,o={}){const c=company(),addr=[c.addr,[c.phone&&'Tel: '+c.phone,c.email].filter(Boolean).join('  ·  '),c.reg&&'Reg / VAT: '+c.reg].filter(Boolean).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${E.esc(title)}</title><style>${CSS()}</style></head><body>${o.stamp?`<div class="stamp">${o.stamp}</div>`:''}
<div class="top"><div class="brand">${logoImg()}<div><h1>${E.esc(c.name)}</h1><div class="sm">${E.esc(addr)}</div></div></div>
<div class="docbox"><div class="ti">${title}</div><div class="meta">${meta.map(([k,v])=>`<span>${E.esc(k)}</span><span>${E.esc(String(v))}</span>`).join('')}</div>${S('pr_copy')?`<div class="copy">${E.esc(S('pr_copy'))}</div>`:''}</div></div><div class="rule"></div>${body}
${o.nosign?'':`<div class="sig"><div>${o.s1||'Prepared by'}</div><div>${o.s2||'Authorised by'}</div><div>${o.s3||'Customer signature, name, date and stamp'}</div></div>`}
${c.foot?`<p class="sm" style="margin-top:16px;text-align:center">${E.esc(c.foot)}</p>`:''}</body></html>`}
function out(html){
  if(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())return E.toast('Printing needs a PC or a browser. On Android open the site in Chrome, then use the menu > Print > Save as PDF.','error');
  const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  const d=f.contentWindow.document;d.open();d.write(html);d.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){E.toast('Printing is not available here','error')}setTimeout(()=>f.remove(),60000)},500)}
const who=(p,t)=>`<div class="card"><h4>${t}</h4><strong>${E.esc(p.name||'')}</strong>${p.code?` <span class="sm">(${E.esc(p.code)})</span>`:''}<div class="sm">${E.esc([p.addr,p.phone&&'Tel: '+p.phone].filter(Boolean).join('\n'))}</div></div>`;

function htmlDN(d){const p=cu(d.partyId),pr=!!S('pr_dnPrices');
  const rows=d.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${E.esc(l.code||'')}</td><td>${E.esc(l.name||'')}</td><td class="r">${l.qty}</td><td class="r">${l.qty*pp(l)}</td>${pr?`<td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.amount)}</td>`:''}</tr>`).join('');
  const packs=d.lines.reduce((a,l)=>a+l.qty,0),pairs=d.lines.reduce((a,l)=>a+l.qty*pp(l),0);
  return page('DELIVERY NOTE',[['D/N no',d.no],['Date',d.date]],
   `<div class="cards">${who(p,'Deliver to')}<div class="card"><h4>Transport</h4>Vehicle no: <span class="blank"></span><br>Driver: <span class="blank"></span></div></div>
   <table class="it"><thead><tr><th style="width:28px">#</th><th style="width:110px">Code</th><th>Description</th><th class="r">Packs</th><th class="r">Pairs</th>${pr?'<th class="r">Rate / pair</th><th class="r">Amount</th>':''}</tr></thead><tbody>${rows}</tbody>
   <tfoot><tr><td colspan="3" class="r">TOTAL</td><td class="r">${packs}</td><td class="r">${pairs}</td>${pr?`<td></td><td class="r">${E.m(d.total)}</td>`:''}</tr></tfoot></table>
   <p class="sm" style="margin-top:10px">Goods received in good order and in the quantities shown above.</p>`,
   {s1:'Prepared by',s2:'Delivered by (name)',s3:'Received by: signature, name, date and stamp',stamp:d.status==='Cancelled'?'CANCELLED':''})}
function htmlInv(i){const p=cu(i.partyId),c=company();
  const dns=(i.dnIds||[]).map(k=>E.D.deliveries.find(q=>q.id===k)).filter(Boolean);let n=0;
  const rows=dns.map(d=>d.lines.map(l=>`<tr><td>${++n}</td><td class="nw">${E.esc(d.no)}</td><td>${E.esc(l.code||'')} ${E.esc(l.name||'')}</td><td class="r">${l.qty}</td><td class="r">${l.qty*pp(l)}</td><td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.amount)}</td></tr>`).join('')).join('');
  const packs=dns.reduce((a,d)=>a+d.lines.reduce((x,l)=>x+l.qty,0),0),pairs=dns.reduce((a,d)=>a+d.lines.reduce((x,l)=>x+l.qty*pp(l),0),0);
  const due=addDays(i.date,p.days||0),bal=i.total-i.paid;
  return page('INVOICE',[['Invoice no',i.no],['Date',i.date],['Due date',due],['Terms',p.days?p.days+' days credit':'Immediate']],
   `<div class="cards">${who(p,'Bill to')}<div class="card"><h4>Delivery notes</h4>${E.esc(dns.map(d=>d.no).join(', ')||'—')}</div></div>
   <table class="it"><thead><tr><th style="width:28px">#</th><th style="width:88px">D/N</th><th>Description</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Rate / pair</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
   <tfoot><tr><td colspan="3" class="r">TOTAL</td><td class="r">${packs}</td><td class="r">${pairs}</td><td></td><td class="r">${E.m(i.gross)}</td></tr></tfoot></table>
   <div class="sum"><div class="words"><b>Amount in words</b>${E.esc(words(i.total))}</div>
   <table class="tot"><tr><td>Gross amount</td><td class="r">${E.m(i.gross)}</td></tr>${i.disc?`<tr><td>Discount</td><td class="r">- ${E.m(i.disc)}</td></tr>`:''}<tr class="gt"><td>INVOICE TOTAL</td><td class="r">${E.m(i.total)}</td></tr>${i.paid?`<tr><td>Paid / credited</td><td class="r">- ${E.m(i.paid)}</td></tr><tr class="bal"><td>BALANCE DUE</td><td class="r">${E.m(bal)}</td></tr>`:''}</table></div>
   ${(c.bank||c.terms)?`<div class="notes">${c.bank?`<div class="card"><h4>Pay to</h4><div class="sm">${E.esc(c.bank)}</div></div>`:'<div></div>'}${c.terms?`<div class="card"><h4>Terms &amp; conditions</h4><div class="sm">${E.esc(c.terms)}</div></div>`:'<div></div>'}</div>`:''}`,
   {s3:'Customer signature and stamp',stamp:i.cancelled?'CANCELLED':(bal<=0?'PAID':'')})}
function htmlRc(r){const p=cu(r.partyId);
  const al=(r.allocs||[]).map(x=>{const i=E.D.invoices.find(q=>q.id===x.id);return `<tr><td>${i?E.esc(i.no):'?'}</td><td>${i?E.esc(i.date):''}</td><td class="r">${E.m(x.a)}</td></tr>`}).join('');
  const owing=E.rows('invoices').filter(i=>!i.cancelled&&i.partyId===r.partyId).reduce((s,i)=>s+(i.total-i.paid),0);
  return page('RECEIPT',[['Receipt no',r.no],['Date',r.date],['Method',(E.acct(r.acc)||{}).name||r.acc||'']],
   `<div class="cards">${who(p,'Received from')}<div class="card"><h4>Amount received</h4><div class="big">${E.m(r.amount)}</div></div></div>
   <table class="it"><thead><tr><th>Applied to invoice</th><th>Invoice date</th><th class="r">Amount</th></tr></thead><tbody>${al}${(r.advance||0)>0?'<tr><td colspan="2"><b>Kept on account (advance / overpayment)</b></td><td class="r">'+E.m(r.advance)+'</td></tr>':''}${!al&&!(r.advance>0)?'<tr><td colspan="3">On account</td></tr>':''}</tbody><tfoot><tr><td colspan="2" class="r">TOTAL</td><td class="r">${E.m(r.amount)}</td></tr></tfoot></table>
   <div class="sum"><div class="words"><b>Amount in words</b>${E.esc(words(r.amount))}</div><table class="tot"><tr class="bal"><td>Still owed by customer</td><td class="r">${E.m(owing)}</td></tr>${E.custCredit&&E.custCredit(r.partyId)>0?'<tr><td>Credit held for customer</td><td class="r">'+E.m(E.custCredit(r.partyId))+'</td></tr>':''}</table></div>`,
   {s1:'Prepared by',s2:'Received by (cashier)',s3:'',stamp:r.reversed?'REVERSED':''})}
function htmlCN(r){const p=cu(r.partyId),inv=E.D.invoices.find(i=>i.id===r.invId)||{};
  const rows=(r.lines||[]).map((l,i)=>`<tr><td>${i+1}</td><td>${E.esc(l.code||'')}</td><td class="r">${l.qty}</td><td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.value)}</td></tr>`).join('');
  return page('CREDIT NOTE',[['Credit note no',r.no],['Date',r.date],['Against invoice',inv.no||'']],
   `<div class="cards">${who(p,'Customer')}<div class="card"><h4>Settlement</h4>${r.refund?'Refunded to the customer':'Deducted from the invoice balance'}</div></div>
   <table class="it"><thead><tr><th style="width:28px">#</th><th>Code</th><th class="r">Packs returned</th><th class="r">Rate / pair</th><th class="r">Credit value</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4" class="r">TOTAL CREDIT</td><td class="r">${E.m(r.amount)}</td></tr></tfoot></table>
   <div class="sum"><div class="words"><b>Amount in words</b>${E.esc(words(r.amount))}</div></div>`,{s3:'Customer acknowledgement'})}
E.A.prDN=id=>{const d=E.D.deliveries.find(x=>x.id===id);if(d)out(htmlDN(d))};
E.A.prInv=id=>{const i=E.D.invoices.find(x=>x.id===id);if(i)out(htmlInv(i))};
E.A.prRcpt=id=>{const r=E.D.receipts.find(x=>x.id===id);if(r)out(htmlRc(r))};
E.A.prCN=id=>{const r=E.D.receipts.find(x=>x.id===id);if(r)out(htmlCN(r))};

/* ---- logo on every other printout (purchase orders, quotes, statements, job sheets, reports …) ---- */
const logoBlock=()=>`<div style="margin:0 0 8px"><img src="${S('pr_logo')}" style="max-height:${logoH()}px;max-width:${logoH()*3}px;display:block" alt=""></div>`;
const _open=window.open;
window.open=function(u){const w=_open.apply(this,arguments);
  try{if(w&&(!u||u==='')&&S('pr_logo')&&S('pr_logoAll')!=='0'){const d=w.document,ow=d.write.bind(d);let done=false;
    d.write=function(h){if(!done&&typeof h==='string'&&/<body[^>]*>/i.test(h)){done=true;h=h.replace(/<body[^>]*>/i,m=>m+logoBlock())}return ow(h)}}}catch(e){}
  return w};

/* ---- System > Print & Documents ---- */
E.nav('System','printsetup','🖨','Print & Documents');
const TXT=[['pr_name','Company name (on all documents)','text'],['pr_addr','Address','area'],['pr_phone','Phone','text'],['pr_email','Email','text'],['pr_reg','Registration / VAT no.','text'],['pr_bank','Bank details (printed on invoices)','area'],['pr_terms','Invoice terms and conditions','area'],['pr_foot','Footer line (all documents)','text']];
const sel=(k,opts,cur)=>`<select id="${k}">${opts.map(([v,l])=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
function formVals(){const o={};TXT.forEach(([k])=>{const el=E.$(k);if(el)o[k]=el.value.trim()});['pr_paper','pr_dnPrices','pr_logoSize','pr_logoAll','pr_font','pr_copy','pr_color'].forEach(k=>{const el=E.$(k);if(el)o[k]=el.value});o.pr_logo=LOGO;return o}
let LOGO=null;
function preview(){const fr=E.$('pr_prev');if(!fr)return;OV=formVals();
  try{const D=E.D,sd=D.parties,si=D.items,sdl=D.deliveries;
    D.parties=[{id:'p',name:'Sample Customer (Pvt) Ltd',code:'C-001',addr:'25 Galle Road, Colombo 03',phone:'011 234 5678',days:30}];D.items=[{id:'i',pack:6}];
    const l=(q,r,n)=>({itemId:'i',code:'SL-001-BLK',name:n,qty:q,rate:r,amount:q*6*r});
    D.deliveries=[{id:'d',no:'DN-0001',date:E.today(),partyId:'p',lines:[l(20,45000,'Slipper Black, size 8'),l(10,45000,'Slipper Brown, size 9')],total:810000*0+(20*6*45000+10*6*45000),status:'Delivered'}];
    const g=D.deliveries[0].total;fr.srcdoc=htmlInv({no:'INV-0001',date:E.today(),partyId:'p',dnIds:['d'],gross:g,disc:Math.round(g*.02),total:g-Math.round(g*.02),paid:0});
    D.parties=sd;D.items=si;D.deliveries=sdl}catch(e){fr.srcdoc='<p style="font:13px Arial;padding:20px;color:#a00">'+E.esc(e.message)+'</p>'}
  finally{OV=null}}
E.route('printsetup','Print & Documents',()=>{LOGO=S('pr_logo')||'';setTimeout(preview,50);
 return `<div class="card"><h3>Logo</h3><p class="muted">Shown at the top left of every printed document. Use a PNG with a transparent background if you can.</p>
 <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div id="pr_lg" style="width:190px;height:80px;border:1px dashed var(--bd);border-radius:8px;display:flex;align-items:center;justify-content:center;background:#fff">${LOGO?`<img src="${LOGO}" style="max-width:180px;max-height:70px">`:'<span class="muted">No logo</span>'}</div>
 <div><input type="file" id="pr_file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="max-width:260px"> <button class="btn" data-a="prLogoDel">Remove logo</button><div class="muted" style="margin-top:4px">PNG, JPG or WebP. It is resized automatically.</div></div></div>
 <div class="g2" style="margin-top:12px"><div class="f">Logo size${sel('pr_logoSize',[['Small','Small'],['Medium','Medium'],['Large','Large']],S('pr_logoSize')||'Medium')}</div><div class="f">Also put the logo on other printouts (purchase orders, quotes, statements, job sheets, reports)${sel('pr_logoAll',[['1','Yes'],['0','No']],S('pr_logoAll')==='0'?'0':'1')}</div></div></div>
 <div class="card"><h3>Company details</h3><div class="g2">${TXT.map(([k,l,t])=>`<div class="f" ${t==='area'?'style="grid-column:1/-1"':''}>${l}${t==='area'?`<textarea id="${k}" rows="2">${E.esc(S(k))}</textarea>`:`<input id="${k}" value="${E.esc(S(k)||(k==='pr_name'?(E.factory()||{}).name:''))}">`}</div>`).join('')}</div></div>
 <div class="card"><h3>Layout</h3><div class="g2"><div class="f">Accent colour<input type="color" id="pr_color" value="${accent()}" style="height:38px;padding:2px"></div>
 <div class="f">Paper size${sel('pr_paper',[['A4','A4'],['A5','A5']],S('pr_paper')||'A4')}</div>
 <div class="f">Text size${sel('pr_font',[['Normal','Normal'],['Large','Large']],S('pr_font')||'Normal')}</div>
 <div class="f">Copy label (top right)${sel('pr_copy',[['',' None'],['ORIGINAL','ORIGINAL'],['DUPLICATE','DUPLICATE'],['CUSTOMER COPY','CUSTOMER COPY'],['OFFICE COPY','OFFICE COPY']],S('pr_copy'))}</div>
 <div class="f">Delivery note${sel('pr_dnPrices',[['','Quantities only (no prices)'],['1','Show rates and amounts']],S('pr_dnPrices')?'1':'')}</div></div>
 <div class="bar"><button class="btn p" data-a="prSave">Save for all devices</button></div></div>
 <div class="card"><h3>Live preview (sample invoice)</h3><iframe id="pr_prev" style="width:100%;height:640px;border:1px solid var(--bd);border-radius:8px;background:#fff"></iframe></div>
 <div class="card"><h3>How to print</h3><ol class="muted"><li>Sales &amp; Receivables: press 🖨 on a delivery note or invoice. Receipts: Sales &gt; Receipts &gt; 🖨. Credit notes: Sales Returns &gt; 🖨.</li><li>Choose your printer, or <b>Save as PDF</b> to email it.</li><li>Works in the browser and the Windows app. On Android use Chrome, then menu &gt; Print.</li></ol></div>`});
E.A.prSave=async()=>{try{const o=formVals();if(!o.pr_logo)o.pr_logo='';await E.setSetting(o);E.toast('Saved for all devices','success')}catch(e){E.toast(e.message,'error')}};
E.A.prLogoDel=()=>{LOGO='';E.$('pr_lg').innerHTML='<span class="muted">No logo</span>';const f=E.$('pr_file');if(f)f.value='';preview()};
/* resize the chosen picture so it stays small (it is stored with your settings and sent to every device) */
function shrink(file){return new Promise((ok,no)=>{const fr=new FileReader();fr.onerror=()=>no(new Error('Cannot read the file'));fr.onload=()=>{
  if(file.type==='image/svg+xml'){return fr.result.length>150000?no(new Error('This SVG is too large. Use a PNG.')):ok(fr.result)}
  const im=new Image();im.onerror=()=>no(new Error('This is not a valid picture'));im.onload=()=>{
   const s=Math.min(1,600/im.width,240/im.height),w=Math.max(1,Math.round(im.width*s)),h=Math.max(1,Math.round(im.height*s)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(im,0,0,w,h);
   let u=c.toDataURL('image/png');if(u.length>180000){x.globalCompositeOperation='destination-over';x.fillStyle='#fff';x.fillRect(0,0,w,h);u=c.toDataURL('image/jpeg',0.85)}
   if(u.length>250000)return no(new Error('The picture is too detailed. Try a simpler or smaller logo.'));ok(u)};im.src=fr.result};fr.readAsDataURL(file)})}
E.hooks.push(async e=>{const t=e.target;if(!t||!t.id)return;
  if(t.id==='pr_file'&&t.files&&t.files[0]){try{LOGO=await shrink(t.files[0]);E.$('pr_lg').innerHTML=`<img src="${LOGO}" style="max-width:180px;max-height:70px">`;preview()}catch(x){E.toast(x.message,'error')}}
  else if(/^pr_/.test(t.id)&&t.id!=='pr_file'&&t.id!=='pr_prev')preview()});
E.words=words;
})(window.ERP);
