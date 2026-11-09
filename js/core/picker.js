/* Searchable, categorised picker. Any <input list="…"> whose <datalist> options carry data-g (category), data-a (article),
   data-c (colour), data-s (size run), data-b (badge, e.g. stock) opens this panel instead of the plain browser drop-down.
   Plain datalists (e.g. customers) get the same search box without categories. Barcode scanners work: scan, Enter, done. */
(E=>{const css=document.createElement('style');css.textContent=`#pk{position:fixed;z-index:9500;background:var(--s);color:var(--t);border:1px solid var(--bd);border-radius:14px;box-shadow:0 18px 50px rgba(20,10,60,.3);display:flex;flex-direction:column;overflow:hidden}
#pk .h{display:flex;gap:8px;padding:10px;border-bottom:1px solid var(--bd)}#pk .h input{flex:1;padding:10px 12px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--t);font-size:14px}#pk .h button{border:0;background:var(--s2);color:var(--t);border-radius:10px;width:38px;cursor:pointer}
#pk .c{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid var(--bd);flex:0 0 auto}#pk .c button{white-space:nowrap;border:1px solid var(--bd);background:var(--s);color:var(--t2);border-radius:99px;padding:5px 12px;font-size:12px;cursor:pointer}#pk .c button.on{background:var(--ac);border-color:var(--ac);color:#fff}
#pk .l{overflow-y:auto;flex:1}#pk .gh{position:sticky;top:0;background:var(--s2);color:var(--t3);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:6px 14px}
#pk .r{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--bd)}#pk .r.on,#pk .r:hover{background:var(--acs)}
#pk .dot{width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.25);flex:0 0 14px}#pk .m{flex:1;min-width:0}#pk .a{font-weight:800;font-size:16px;letter-spacing:.3px}#pk .n{font-size:12px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#pk .b{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--s2);color:var(--t2);white-space:nowrap}#pk .b.z{background:#fee2e2;color:#b91c1c}
#pk .f{padding:7px 14px;font-size:11px;color:var(--t3);border-top:1px solid var(--bd)}#pk .e{padding:26px;text-align:center;color:var(--t3)}
@media(max-width:640px){#pk{left:8px!important;right:8px!important;width:auto!important;top:8px!important;bottom:8px!important;max-height:none!important}}`;document.head.appendChild(css);
const COL={black:'#111',white:'#fff',brown:'#6b4226',tan:'#c19a6b',beige:'#e8d8b9',blue:'#2563eb',navy:'#1e3a8a',red:'#dc2626',maroon:'#7f1d1d',pink:'#ec4899',grey:'#9ca3af',gray:'#9ca3af',green:'#16a34a',yellow:'#facc15',orange:'#f97316',purple:'#7c3aed',gold:'#d4a017',silver:'#c0c0c0',cream:'#fff3d6',skyblue:'#38bdf8',sky:'#38bdf8'};
const dot=c=>{if(!c)return '';const k=c.toLowerCase().replace(/[^a-z]/g,'');let h=COL[k];if(!h){let n=0;for(const ch of k)n=(n*31+ch.charCodeAt(0))%360;h='hsl('+n+',60%,55%)'}return `<span class="dot" style="background:${h}"></span>`};
let skip=0,pop=null,cur=null,all=[],grp='',q='',act=0,view=[];
const $q=()=>pop&&pop.querySelector('#pkq');
function read(id){const l=document.getElementById(id);return l?[...l.options].map(o=>({v:o.value,g:o.dataset.g||'',a:o.dataset.a||'',c:o.dataset.c||'',s:o.dataset.s||'',b:o.dataset.b||o.getAttribute('label')||'',k:(o.value+' '+(o.dataset.k||'')).toLowerCase()})):[]}
function close(){if(pop){pop.remove();pop=null}cur=null}
function pick(i){if(!cur||!view[i])return;const inp=cur,v=view[i].v;skip=Date.now()+400;close();inp.value=v;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));const n=inp.nextElementSibling;if(n&&n.tagName==='INPUT')n.focus();else inp.focus()}
function paint(){if(!pop)return;const words=q.toLowerCase().split(/\s+/).filter(Boolean);
 view=all.filter(o=>(!grp||o.g===grp)&&words.every(w=>o.k.includes(w)));if(act>=view.length)act=Math.max(0,view.length-1);
 const groups=[...new Set(all.map(o=>o.g).filter(Boolean))];
 pop.querySelector('.c').style.display=groups.length>1?'':'none';
 pop.querySelector('.c').innerHTML=`<button data-g="" class="${grp?'':'on'}">All (${all.length})</button>`+groups.map(g=>`<button data-g="${E.esc(g)}" class="${grp===g?'on':''}">${E.esc(g)} (${all.filter(o=>o.g===g).length})</button>`).join('');
 let h='',last=null;view.slice(0,120).forEach((o,i)=>{if(!grp&&groups.length>1&&o.g!==last){h+=`<div class="gh">${E.esc(o.g||'Other')}</div>`;last=o.g}
  const z=/^0\s/.test(o.b),title=o.a||o.v.split(' — ')[0];
  h+=`<div class="r ${i===act?'on':''}" data-i="${i}">${dot(o.c)}<div class="m"><div class="a">${E.esc(title)}${o.c?' <span style="font-weight:600;font-size:13px">· '+E.esc(o.c)+'</span>':''}</div><div class="n">${E.esc(o.a?o.v.split(' — ')[1]||'':'')}${o.s?' · size run '+E.esc(o.s):''}</div></div>${o.b?`<span class="b ${z?'z':''}">${E.esc(o.b)}</span>`:''}</div>`});
 pop.querySelector('.l').innerHTML=h||'<div class="e">Nothing matches. Try fewer letters.</div>';
 pop.querySelector('.f').textContent=view.length+' found'+(view.length>120?' (showing 120 — type to narrow)':'')+' · ↑↓ move · Enter choose · Esc close';
 const on=pop.querySelector('.r.on');if(on)on.scrollIntoView({block:'nearest'})}
function openFor(inp){const id=inp.dataset.pl||inp.getAttribute('list');if(!id)return;inp.dataset.pl=id;inp.removeAttribute('list');
 if(pop&&cur===inp)return;close();cur=inp;all=read(id);grp='';q='';act=0;
 pop=document.createElement('div');pop.id='pk';pop.innerHTML='<div class="h"><input id="pkq" placeholder="🔍 Search art no, colour, name or scan barcode…" autocomplete="off"><button type="button" title="Close">✕</button></div><div class="c"></div><div class="l"></div><div class="f"></div>';
 document.body.appendChild(pop);const r=inp.getBoundingClientRect(),w=Math.min(Math.max(r.width,420),innerWidth-16),left=Math.max(8,Math.min(r.left,innerWidth-w-8)),below=innerHeight-r.bottom,h=Math.min(520,Math.max(260,below>320?below-16:r.top-16));
 pop.style.cssText+=`left:${left}px;width:${w}px;max-height:${h}px;${below>320?`top:${r.bottom+6}px`:`bottom:${innerHeight-r.top+6}px`}`;
 const s=$q();s.value=inp.value&&all.some(o=>o.v===inp.value)?'':inp.value;q=s.value;paint();s.focus();s.select()}
document.addEventListener('focusin',e=>{const t=e.target;if(t.tagName==='INPUT'&&(t.getAttribute('list')||t.dataset.pl)&&!t.dataset.nopick&&!(pop&&pop.contains(t))&&Date.now()>skip)setTimeout(()=>openFor(t),0)});
document.addEventListener('click',e=>{const t=e.target;if(t.tagName==='INPUT'&&t.dataset.pl&&!pop&&Date.now()>skip)openFor(t)});
document.addEventListener('mousedown',e=>{if(!pop)return;if(pop.contains(e.target)){if(e.target.id!=='pkq')e.preventDefault();const c=e.target.closest('.c button'),r=e.target.closest('.r');if(c){grp=c.dataset.g;act=0;paint()}else if(r)pick(+r.dataset.i);else if(e.target.closest('.h button'))close()}else if(e.target!==cur)close()});
document.addEventListener('input',e=>{if(e.target.id==='pkq'){q=e.target.value;act=0;paint();e.stopPropagation()}},true);
document.addEventListener('keydown',e=>{if(!pop||e.target.id!=='pkq')return;
 if(e.key==='ArrowDown'){e.preventDefault();act=Math.min(view.length-1,act+1);paint()}else if(e.key==='ArrowUp'){e.preventDefault();act=Math.max(0,act-1);paint()}
 else if(e.key==='Enter'){e.preventDefault();pick(act)}else if(e.key==='Escape'){e.preventDefault();const i=cur;skip=Date.now()+400;close();i&&i.focus()}else if(e.key==='Tab'){const i=cur;close();if(i){const n=i.nextElementSibling;n&&n.focus&&(e.preventDefault(),n.focus())}}},true);
})(window.ERP);
