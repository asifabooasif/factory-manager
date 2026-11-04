(E=>{E.route=(id,title,fn)=>E.R[id]={title,fn};E.nav=(g,id,ico,label,soon)=>E.N.push({g,id,ico,label,soon});let cur='dashboard';
E.go=()=>{cur=location.hash.replace(/^#\/?/,'')||'dashboard';if(!E.R[cur])cur='dashboard';
 let h='',g='';E.N.forEach(n=>{if(n.only&&E.role!==n.only)return;if(n.g!==g){h+=`<div class="nl">${n.g}</div>`;g=n.g}h+=`<div class="ni ${cur===n.id?'on':''} ${n.soon?'soon':''}" data-nav="${n.id}"><span>${n.ico}</span><span>${n.label}</span></div>`});
 E.$('nav').innerHTML=h;E.$('pt').textContent=E.R[cur].title;
 try{E.$('v').innerHTML=(E.fid&&E.factory())?E.R[cur].fn():'<div class="card"><h3>Welcome</h3><p class="muted" style="margin-bottom:14px">Create your factory to begin.</p><button class="btn p" data-a="firstFac">Create factory</button></div>'}catch(e){E.$('v').innerHTML='<div class="card bad">Error: '+E.esc(e.message)+'</div>';console.error(e)}};
addEventListener('hashchange',E.go);
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');
 if(n){const it=E.N.find(x=>x.id===n.dataset.nav);if(it.soon)return E.toast('Coming in a later part');location.hash='#/'+it.id;return}
 const a=e.target.closest('[data-a]');if(a&&E.A[a.dataset.a])E.A[a.dataset.a](a.dataset.id,e)});
document.addEventListener('input',e=>E.hooks.forEach(h=>h(e)));
E.A.theme=()=>{const h=document.documentElement,t=h.dataset.theme==='dark'?'professional':'dark';h.dataset.theme=t;localStorage.setItem('erp_t',t)};})(window.ERP);
