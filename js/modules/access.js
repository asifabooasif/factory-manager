/* PART 12 (v2) — Users & Access. People live in Firestore (erp_users) and are managed by Owners.
   Roles: Owner = everything incl. managing users · Accountant = enter and edit all data · Viewer = read only.
   Default owner asifabooasif@gmail.com is built in and cannot be removed. Real protection is enforced by firebase/firestore.rules. */
(E=>{const at=E.N.findIndex(n=>n.id==='settings');E.N.splice(at,0,{g:'System',id:'access',ico:'🔐',label:'Users & Access',only:'owner'});
const w={put:E.put,del:E.del},deny=()=>Promise.reject(new Error('View-only access: you cannot change data'));
E.put=(c,o)=>E.role==='viewer'?deny():w.put(c,o);E.del=(c,i)=>E.role==='viewer'?deny():w.del(c,i);

const RD={owner:'Everything, including adding, suspending and removing people.',accountant:'Enter, edit and post all business data. Cannot manage users.',viewer:'Look at everything and print reports. Cannot change anything.'};
const ago=t=>{if(!t)return 'Never';const s=(Date.now()-new Date(t))/1000;if(s<90)return 'Just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';if(s<86400*30)return Math.round(s/86400)+' days ago';return new Date(t).toLocaleDateString()};
const av=(n,e)=>`<span style="width:34px;height:34px;border-radius:50%;background:var(--ac);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600;flex:0 0 34px">${E.esc(((n||e||'?')[0]).toUpperCase())}</span>`;
const roleTag=r=>`<span class="tag" style="${r==='owner'?'background:#fef3c7;color:#b45309':r==='viewer'?'background:var(--s2);color:var(--t3)':''}">${E.ROLE[r]||r}</span>`;

E.route('access','Users & Access',()=>{
 const me=E.profile||{},owner=E.role==='owner';
 if(!owner)return `<div class="card"><h3>Your access</h3><p>${av(me.name,me.email)} &nbsp;<b>${E.esc(me.name||me.email||'')}</b> · ${E.esc(me.email||'')}</p><p style="margin-top:10px">${roleTag(me.role)} <span class="muted">${E.esc(RD[me.role]||'')}</span></p><p class="muted" style="margin-top:12px">Only an Owner can add or change users.</p></div>`;
 let us=(E.sync.users||[]).slice();
 if(!us.some(u=>u.id===E.OWNER))us.unshift({id:E.OWNER,email:E.OWNER,name:'',role:'owner',active:true,addedBy:'system'});
 us.sort((a,b)=>(a.id===E.OWNER?-1:b.id===E.OWNER?1:(a.role===b.role?a.id.localeCompare(b.id):['owner','accountant','viewer'].indexOf(a.role)-['owner','accountant','viewer'].indexOf(b.role))));
 const n=r=>us.filter(u=>u.role===r&&u.active!==false).length,sus=us.filter(u=>u.active===false).length;
 const rows=us.map(u=>{const def=u.id===E.OWNER,self=u.id===me.email,lock=def||self,inv=!u.lastLoginAt&&!def,off=u.active===false;
  return `<tr data-q="${E.esc((u.id+' '+(u.name||'')).toLowerCase())}" style="${off?'opacity:.55':''}"><td><div style="display:flex;gap:10px;align-items:center">${av(u.name,u.id)}<div><b>${E.esc(u.name||u.id.split('@')[0])}</b> ${def?'<span class="tag" title="Built in — cannot be removed">🔒 Default owner</span>':''}${self?'<span class="tag">You</span>':''}${inv?'<span class="tag" style="background:#e0f2fe;color:#0369a1">Invited</span>':''}${off?'<span class="tag" style="background:#fee2e2;color:#b91c1c">Suspended</span>':''}<div class="muted">${E.esc(u.id)}</div></div></div></td>
  <td>${lock?roleTag(u.role):`<select data-uarole="${E.esc(u.id)}" style="padding:6px 8px;border:1px solid var(--bd);border-radius:8px;background:var(--s)">${['owner','accountant','viewer'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${E.ROLE[r]}</option>`).join('')}</select>`}</td>
  <td>${off?'<span class="bad">Suspended</span>':'<span class="ok">● Active</span>'}</td><td>${ago(u.lastLoginAt)}</td><td class="muted">${E.esc(u.addedBy||'')}${u.addedAt?'<br>'+new Date(u.addedAt).toLocaleDateString():''}</td>
  <td class="r" style="white-space:nowrap">${lock?'':`<button class="btn sm" data-a="uaToggle" data-id="${E.esc(u.id)}">${off?'Re-activate':'Suspend'}</button> <button class="btn sm d" data-a="uaRemove" data-id="${E.esc(u.id)}">Remove</button>`}</td></tr>`}).join('');
 return `<div class="kp">${E.kpi('People',us.length,'in the list')}${E.kpi('Owners',n('owner'),'full control')}${E.kpi('Accountants',n('accountant'),'can edit data')}${E.kpi('View only',n('viewer'),'read only')}${E.kpi('Suspended',sus,'blocked for now')}</div>
 <div class="card"><h3>Add a person</h3><p class="muted" style="margin-bottom:12px">They sign in with this exact Google account and their data loads automatically. Share the system link with them.</p>
 <div class="g2"><div class="f">Google email *<input id="ua_e" type="email" placeholder="name@gmail.com" autocomplete="off"></div><div class="f">Name (optional)<input id="ua_n" placeholder="e.g. Nimal – Accountant"></div></div>
 <div class="f" style="max-width:320px">Role<select id="ua_r"><option value="accountant">Accountant — enter &amp; edit data</option><option value="viewer">Viewer — read only</option><option value="owner">Owner — full control</option></select></div>
 <button class="btn p" data-a="uaAdd">➕ Add person</button></div>
 <div class="card"><h3>What each role can do</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">${['owner','accountant','viewer'].map(r=>`<div>${roleTag(r)}<p class="muted" style="margin-top:6px">${RD[r]}</p></div>`).join('')}</div></div>
 <div class="bar"><input id="ua_q" placeholder="🔍 Search people…" style="flex:1;max-width:340px;padding:9px 12px;border:1px solid var(--bd);border-radius:10px;background:var(--s)"><span class="gap"></span><span class="muted">Changes take effect immediately, even for people already signed in.</span></div>
 <div class="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Added by</th><th></th></tr></thead><tbody id="ua_t">${rows}</tbody></table></div>
 <p class="muted">Removing or suspending someone blocks their access to the cloud data straight away. A copy already saved in that person's browser stays until they clear their browser data.</p>`});

const run=async(f,ok)=>{try{await f();ok&&E.toast(ok,'success')}catch(e){E.toast(E.sync.explain?E.sync.explain(e):e.message,'error')}};
E.A.uaAdd=()=>run(async()=>{const e=E.val('ua_e');await E.sync.addUser(e,E.val('ua_n'),E.val('ua_r'));E.$('ua_e').value='';E.$('ua_n').value='';E.go()},'Person added — they can now sign in');
E.A.uaToggle=id=>{const u=E.sync.users.find(x=>x.id===id);if(!u)return;const off=u.active!==false;
 if(off&&!confirm('Suspend '+id+'? They will be blocked immediately.'))return;run(()=>E.sync.updateUser(id,{active:!off}),off?'Suspended':'Re-activated')};
E.A.uaRemove=id=>{if(!confirm('Remove '+id+' from the system? They will no longer be able to sign in.'))return;run(()=>E.sync.removeUser(id),'Removed')};
E.hooks.push(e=>{const t=e.target;
 if(t.dataset&&t.dataset.uarole){run(()=>E.sync.updateUser(t.dataset.uarole,{role:t.value}),'Role updated');return}
 if(t.id==='ua_q'){const q=t.value.trim().toLowerCase();document.querySelectorAll('#ua_t tr').forEach(r=>{r.style.display=(!q||r.dataset.q.includes(q))?'':'none'})}});
})(window.ERP);
