/* Print documents: Delivery Note, Invoice, Customer Receipt, Credit Note. Company details come from System > Print & Documents. */
(E=>{
const S=k=>E.setting(k)||'';
const cu=id=>E.D.parties.find(x=>x.id===id)||{};
const pp=l=>E.packPairs(l.itemId);
const ONES=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'],TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const w3=n=>(n>=100?ONES[Math.floor(n/100)]+' hundred'+(n%100?' and ':''):'')+(n%100<20?ONES[n%100]:TENS[Math.floor(n%100/10)]+(n%10?'-'+ONES[n%10]:''));
function words(cents){const r=Math.floor(cents/100),c=cents%100;if(!r&&!c)return 'Zero rupees only';let p=[],n=r;[[1e9,'billion'],[1e6,'million'],[1e3,'thousand']].forEach(([v,t])=>{if(n>=v){p.push(w3(Math.floor(n/v))+' '+t);n%=v}});if(n)p.push(w3(n));let s=(p.join(' ')||'zero');s=s.charAt(0).toUpperCase()+s.slice(1)+' rupees';if(c)s+=' and '+w3(c)+' cents';return s+' only'}
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+(+n||0));return x.toISOString().slice(0,10)};
function company(){const f=E.factory()||{};return {name:S('pr_name')||f.name||'',addr:S('pr_addr'),phone:S('pr_phone'),email:S('pr_email'),reg:S('pr_reg'),bank:S('pr_bank'),terms:S('pr_terms'),foot:S('pr_foot')}}
const CSS=sz=>`@page{size:${sz||'A4'};margin:12mm}*{box-sizing:border-box}body{font:12px/1.35 Arial,Helvetica,sans-serif;color:#111;margin:0}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}.hd h1{margin:0;font-size:20px}.hd .t{text-align:right}.hd .t h2{margin:0;font-size:22px;letter-spacing:1px}.bx{display:flex;gap:16px;margin:12px 0}.bx>div{flex:1;border:1px solid #bbb;padding:8px;border-radius:4px}.bx b{display:block;font-size:10px;color:#555;text-transform:uppercase;margin-bottom:3px}table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#eee;text-align:left}th,td{border:1px solid #bbb;padding:5px 6px}.r{text-align:right}.tt td{border:0;padding:3px 6px}.tt{width:55%;margin-left:auto}.big td{font-weight:bold;font-size:13px;border-top:2px solid #111}.w{margin:8px 0;font-style:italic}.s{display:flex;justify-content:space-between;margin-top:64px;gap:20px}.s div{flex:1;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:11px}.sm{font-size:10.5px;color:#444;white-space:pre-line}.stamp{position:fixed;top:40%;left:20%;font-size:70px;color:rgba(200,0,0,.2);transform:rotate(-20deg);border:6px solid rgba(200,0,0,.2);padding:0 20px}`;
function page(title,metaHtml,bodyHtml,o={}){const c=company();
  return `<html><head><meta charset="utf-8"><title>${E.esc(title)}</title><style>${CSS(S('pr_paper')||'A4')}</style></head><body>${o.stamp?`<div class="stamp">${o.stamp}</div>`:''}
  <div class="hd"><div><h1>${E.esc(c.name)}</h1><div class="sm">${E.esc([c.addr,c.phone&&'Tel: '+c.phone,c.email,c.reg&&'Reg/VAT: '+c.reg].filter(Boolean).join('\n'))}</div></div><div class="t"><h2>${title}</h2>${metaHtml}</div></div>${bodyHtml}
  ${o.nosign?'':`<div class="s"><div>Prepared by</div><div>${o.sig2||'Authorised by'}</div><div>${o.sig3||'Customer signature, name, date and stamp'}</div></div>`}
  ${c.foot?`<p class="sm" style="margin-top:14px;text-align:center">${E.esc(c.foot)}</p>`:''}</body></html>`}
/* print through a hidden frame: no pop-up blocking, works in the browser and the Windows app */
function out(html){
  if(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform())return E.toast('Printing needs a PC or a browser. On Android open the site in Chrome, then use the menu > Print > Save as PDF.','error');
  const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
  const d=f.contentWindow.document;d.open();d.write(html);d.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){E.toast('Printing is not available here','error')}setTimeout(()=>f.remove(),60000)},400)}
const party=(p,l)=>`<div><b>${l}</b><strong>${E.esc(p.name||'')}</strong><div class="sm">${E.esc([p.addr,p.phone&&'Tel: '+p.phone].filter(Boolean).join('\n'))}</div></div>`;

E.A.prDN=id=>{const d=E.D.deliveries.find(x=>x.id===id);if(!d)return;const p=cu(d.partyId),pr=!!S('pr_dnPrices');
  const rows=d.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${E.esc(l.code||'')}</td><td>${E.esc(l.name||'')}</td><td class="r">${l.qty}</td><td class="r">${l.qty*pp(l)}</td>${pr?`<td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.amount)}</td>`:''}</tr>`).join('');
  const packs=d.lines.reduce((a,l)=>a+l.qty,0),pairs=d.lines.reduce((a,l)=>a+l.qty*pp(l),0);
  out(page('DELIVERY NOTE',`<div>No: <b>${E.esc(d.no)}</b><br>Date: ${E.esc(d.date)}</div>`,
   `<div class="bx">${party(p,'Deliver to')}<div><b>Details</b>Status: ${E.esc(d.status)}${d.invId?'<br>Invoiced':''}</div></div>
   <table><thead><tr><th>#</th><th>Code</th><th>Description</th><th class="r">Packs</th><th class="r">Pairs</th>${pr?'<th class="r">Rate / pair</th><th class="r">Amount</th>':''}</tr></thead><tbody>${rows}<tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>${packs}</b></td><td class="r"><b>${pairs}</b></td>${pr?`<td></td><td class="r"><b>${E.m(d.total)}</b></td>`:''}</tr></tbody></table>
   <p class="sm">Goods received in good condition and in the quantities shown above.</p>`,{sig2:'Delivered by (name / vehicle)',sig3:'Received by: signature, name, date and stamp',stamp:d.status==='Cancelled'?'CANCELLED':''}))};

E.A.prInv=id=>{const i=E.D.invoices.find(x=>x.id===id);if(!i)return;const p=cu(i.partyId),c=company();
  const dns=(i.dnIds||[]).map(k=>E.D.deliveries.find(q=>q.id===k)).filter(Boolean);let n=0;
  const rows=dns.map(d=>d.lines.map(l=>`<tr><td>${++n}</td><td>${E.esc(d.no)}</td><td>${E.esc(l.code||'')} ${E.esc(l.name||'')}</td><td class="r">${l.qty}</td><td class="r">${l.qty*pp(l)}</td><td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.amount)}</td></tr>`).join('')).join('');
  const due=addDays(i.date,p.days||0),bal=i.total-i.paid;
  out(page('INVOICE',`<div>No: <b>${E.esc(i.no)}</b><br>Date: ${E.esc(i.date)}<br>Due: ${due}</div>`,
   `<div class="bx">${party(p,'Bill to')}<div><b>Terms</b>${p.days?'Credit '+p.days+' days':'Immediate'}<br>Delivery notes: ${E.esc(dns.map(d=>d.no).join(', '))}</div></div>
   <table><thead><tr><th>#</th><th>D/N</th><th>Description</th><th class="r">Packs</th><th class="r">Pairs</th><th class="r">Rate / pair</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
   <table class="tt"><tr><td>Gross amount</td><td class="r">${E.m(i.gross)}</td></tr>${i.disc?`<tr><td>Discount</td><td class="r">- ${E.m(i.disc)}</td></tr>`:''}<tr class="big"><td>Invoice total</td><td class="r">${E.m(i.total)}</td></tr>${i.paid?`<tr><td>Paid / credited</td><td class="r">- ${E.m(i.paid)}</td></tr><tr class="big"><td>Balance due</td><td class="r">${E.m(bal)}</td></tr>`:''}</table>
   <p class="w">${E.esc(words(i.total))}</p>${c.bank?`<p class="sm"><b>Pay to:</b>\n${E.esc(c.bank)}</p>`:''}${c.terms?`<p class="sm"><b>Terms:</b>\n${E.esc(c.terms)}</p>`:''}`,{sig3:'Customer signature and stamp',stamp:i.cancelled?'CANCELLED':(bal<=0?'PAID':'')}))};

E.A.prRcpt=id=>{const r=E.D.receipts.find(x=>x.id===id);if(!r)return;const p=cu(r.partyId);
  const al=(r.allocs||[]).map(x=>{const i=E.D.invoices.find(q=>q.id===x.id);return `<tr><td>${i?E.esc(i.no):'?'}</td><td>${i?E.esc(i.date):''}</td><td class="r">${E.m(x.a)}</td></tr>`}).join('');
  const owing=E.rows('invoices').filter(i=>!i.cancelled&&i.partyId===r.partyId).reduce((s,i)=>s+(i.total-i.paid),0);
  out(page('RECEIPT',`<div>No: <b>${E.esc(r.no)}</b><br>Date: ${E.esc(r.date)}</div>`,
   `<div class="bx">${party(p,'Received from')}<div><b>Payment</b>Method: ${E.esc((E.acct(r.acc)||{}).name||r.acc||'')}<br>Amount: <strong>${E.m(r.amount)}</strong></div></div>
   <table><thead><tr><th>Applied to invoice</th><th>Invoice date</th><th class="r">Amount</th></tr></thead><tbody>${al||'<tr><td colspan="3">On account</td></tr>'}</tbody></table>
   <p class="w">${E.esc(words(r.amount))}</p><p class="sm">Total still owed by this customer after this receipt: <b>${E.m(owing)}</b></p>`,{sig2:'Received by',sig3:'',stamp:r.reversed?'REVERSED':''}))};

E.A.prCN=id=>{const r=E.D.receipts.find(x=>x.id===id);if(!r)return;const p=cu(r.partyId),inv=E.D.invoices.find(i=>i.id===r.invId)||{};
  const rows=(r.lines||[]).map((l,i)=>`<tr><td>${i+1}</td><td>${E.esc(l.code||'')}</td><td class="r">${l.qty}</td><td class="r">${E.m(l.rate)}</td><td class="r">${E.m(l.value)}</td></tr>`).join('');
  out(page('CREDIT NOTE',`<div>No: <b>${E.esc(r.no)}</b><br>Date: ${E.esc(r.date)}<br>Against invoice: ${E.esc(inv.no||'')}</div>`,
   `<div class="bx">${party(p,'Customer')}<div><b>Settlement</b>${r.refund?'Refunded to customer':'Deducted from the invoice balance'}</div></div>
   <table><thead><tr><th>#</th><th>Code</th><th class="r">Packs returned</th><th class="r">Rate</th><th class="r">Credit value</th></tr></thead><tbody>${rows}<tr><td colspan="4" class="r"><b>Total credit</b></td><td class="r"><b>${E.m(r.amount)}</b></td></tr></tbody></table><p class="w">${E.esc(words(r.amount))}</p>`,{sig3:'Customer acknowledgement'}))};

/* ---- System > Print & Documents: company details printed on every document ---- */
E.nav('System','printsetup','🖨','Print & Documents');
const F=[['pr_name','Company name (on all documents)','text'],['pr_addr','Address','area'],['pr_phone','Phone','text'],['pr_email','Email','text'],['pr_reg','Registration / VAT no.','text'],['pr_bank','Bank details (printed on invoices)','area'],['pr_terms','Invoice terms and conditions','area'],['pr_foot','Footer line (all documents)','text']];
E.route('printsetup','Print & Documents',()=>`<div class="card"><h3>Company details on printed documents</h3><p class="muted">Used on delivery notes, invoices, receipts and credit notes. Saved for every device.</p><div class="g2">${F.map(([k,l,t])=>`<div class="f" ${t==='area'?'style="grid-column:1/-1"':''}>${l}${t==='area'?`<textarea id="${k}" rows="2">${E.esc(S(k))}</textarea>`:`<input id="${k}" value="${E.esc(S(k)||(k==='pr_name'?(E.factory()||{}).name:''))}">`}</div>`).join('')}
 <div class="f">Paper size<select id="pr_paper"><option ${S('pr_paper')!=='A5'?'selected':''}>A4</option><option ${S('pr_paper')==='A5'?'selected':''}>A5</option></select></div>
 <div class="f">Delivery note<select id="pr_dnPrices"><option value="">Quantities only (no prices)</option><option value="1" ${S('pr_dnPrices')?'selected':''}>Show rates and amounts</option></select></div></div>
 <div class="bar"><button class="btn p" data-a="prSave">Save</button></div></div>
 <div class="card"><h3>How to print</h3><ol class="muted"><li>Sales &amp; Receivables: press 🖨 on a delivery note or invoice. Receipts: Sales &gt; Receipts &gt; 🖨. Credit notes: Sales Returns &gt; 🖨.</li><li>The print window opens. Choose your printer, or choose <b>Save as PDF</b> to email it.</li><li>Printing works in the browser and the Windows app. On Android use Chrome, then menu &gt; Print.</li></ol></div>`);
E.A.prSave=async()=>{try{const o={};F.forEach(([k])=>o[k]=E.val(k).trim());o.pr_paper=E.val('pr_paper');o.pr_dnPrices=E.val('pr_dnPrices');await E.setSetting(o);E.toast('Saved','success')}catch(e){E.toast(e.message,'error')}};
E.words=words;
})(window.ERP);
