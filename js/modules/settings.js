(E=>{E.route('settings','Settings',()=>{const s=k=>E.setting(k);
 const canDelete = E.isOwner() && E.visibleFactories().length > 1;
 return `<div class="card"><h3>Factories</h3>
  <p class="muted" style="margin-bottom:10px">Every factory is completely separate: its own data, its own database, its own users and its own Google Sheet. Switch factory from the box at the top.</p>
  <div class="tw"><table><thead><tr><th>Name</th><th>Code</th><th></th></tr></thead><tbody>
    ${E.visibleFactories().map(f=>`<tr><td>${E.esc(f.name)}${f.id===E.fid?' <span class="tag">Active</span>':''}</td>
      <td>${E.esc(f.code)}</td>
      <td class="r">
        ${f.id!==E.fid?`<button class="btn sm" data-a="useFac" data-id="${f.id}">Open</button> `:''}
        ${canDelete?`<button class="btn sm d" data-a="delFac" data-id="${f.id}" title="Permanently delete this factory">🗑 Delete</button>`:''}
      </td></tr>`).join('')}
  </tbody></table></div>
  ${E.isOwner()?'<button class="btn" data-a="addFactory">+ Add Factory</button>':'<p class="muted">Only an Owner can add a factory.</p>'}
  ${E.isOwner()&&E.visibleFactories().length<=1?'<p class="muted" style="margin-top:8px">You need at least two factories before you can delete one.</p>':''}
 </div>
 <div class="card"><h3>Options for ${E.esc(E.factory().name)}</h3>
  <div class="g2">
    <div class="f">Pairs per pack (default for new articles)<input id="s_pack" type="number" value="${s('packSize')}"></div>
    <div class="f">Finished-goods categories (comma separated)<input id="s_fgc" value="${E.esc(E.fgCats().join(', '))}" placeholder="Flat, PU"></div>
    <div class="f">Wastage rule<select id="s_w"><option value="ask" ${s('wastage')==='ask'?'selected':''}>Ask each time</option><option value="loss" ${s('wastage')==='loss'?'selected':''}>Always factory loss</option><option value="cost" ${s('wastage')==='cost'?'selected':''}>Always add to product cost</option></select></div>
    <div class="f">EPF employee % <input id="s_ee" type="number" value="${s('epfEmp')}"></div>
    <div class="f">EPF employer % <input id="s_ec" type="number" value="${s('epfCo')}"></div>
    <div class="f">ETF % <input id="s_etf" type="number" value="${s('etf')}"></div>
    <div class="f">Lock periods up to (date)<input id="s_lock" type="date" value="${s('lockedUntil')}"></div>
  </div>
  <label class="f" style="flex-direction:row;gap:8px"><input type="checkbox" id="s_tax" style="width:auto" ${s('taxOn')?'checked':''}> Use taxes (off for now)</label>
  <label class="f" style="flex-direction:row;gap:8px"><input type="checkbox" id="s_epf" style="width:auto" ${s('epfOn')?'checked':''}> Calculate EPF/ETF in payroll</label>
  <label class="f" style="flex-direction:row;gap:8px"><input type="checkbox" id="s_epfob" style="width:auto" ${s('epfOtBonus')?'checked':''}> Include overtime and bonus in the EPF/ETF base (off = EPF only on basic, piece wages and allowances)</label>
  <button class="btn p" data-a="saveSet">Save options</button>
 </div>
 <div class="card"><h3>Data — ${E.esc(E.factory().name)}</h3><button class="btn" data-a="backup">⬇ Download backup of this factory (JSON)</button></div>
 <div class="card"><h3>Audit log (latest 40)</h3>
  <div class="tw"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th></tr></thead><tbody>
    ${E.D.auditLog.filter(a=>a.factoryId===E.fid).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,40).map(a=>`<tr><td>${a.at.slice(0,19).replace('T',' ')}</td><td>${E.esc(a.user)}</td><td><span class="tag">${a.action}</span></td><td>${a.col}</td></tr>`).join('')}
  </tbody></table></div>
 </div>`});

E.A.saveSet=async()=>{await E.setSetting({packSize:+E.val('s_pack')||6,fgCats:E.val('s_fgc').split(',').map(x=>x.trim()).filter(Boolean),wastage:E.val('s_w'),epfEmp:+E.val('s_ee')||0,epfCo:+E.val('s_ec')||0,etf:+E.val('s_etf')||0,lockedUntil:E.val('s_lock'),taxOn:E.$('s_tax').checked,epfOn:E.$('s_epf').checked,epfOtBonus:E.$('s_epfob').checked});E.toast('Options saved','success');E.go()};
E.A.addFactory=()=>E.isOwner()?E.modal('Add Factory',`<div class="f">Name *<input id="fn"></div><div class="f">Code *<input id="fc"></div>`,`<button class="btn" data-a="close">Cancel</button><button class="btn p" data-a="mkF2">Create</button>`):E.toast('Only an Owner can add a factory','error');
E.A.useFac=id=>E.switchF(id);
E.A.mkF2=async()=>{try{const n=E.val('fn'),c=E.val('fc').toUpperCase();if(!n||!c)return E.toast('Name and code required','error');const f=await E.newFactory(n,c);E.closeM();await E.switchF(f.id);E.toast('Factory created — it has its own empty database. Give staff access under Users & Access.','success')}catch(e){E.toast(e.message,'error')}};
E.A.backup=()=>{const a=document.createElement('a');const dump={};E.cfg.cols.filter(c=>c!=='factories').forEach(c=>dump[c]=E.D[c]);dump._factory={id:E.fid,name:E.factory().name};a.href=URL.createObjectURL(new Blob([JSON.stringify(dump,null,2)],{type:'application/json'}));a.download='lanka-erp-backup-'+(E.factory().code||'factory')+'-'+E.today()+'.json';a.click()};

/* ══════════════════════════════════════════════════════════════════════
   NEW: delete factory with two-step confirmation
   ══════════════════════════════════════════════════════════════════════ */
E.A.delFac = async id => {
  if (!E.isOwner()) return E.toast('Only an Owner can delete factories', 'error');
  const f = E.D.factories.find(x => x.id === id);
  if (!f) return E.toast('Factory not found', 'error');
  if (E.visibleFactories().length <= 1) return E.toast('Cannot delete the only factory. Create another first.', 'error');

  const confirmed = confirm(
    '⚠️ DELETE FACTORY "' + f.name + '"?\n\n' +
    'This will PERMANENTLY remove:\n' +
    '• All data in this factory (local + cloud)\n' +
    '• All users\' access to this factory\n' +
    '• The factory\'s Google Sheet link\n\n' +
    'This CANNOT be undone.\n\nContinue?'
  );
  if (!confirmed) return;

  const typed = prompt('Type the factory name EXACTLY to confirm deletion:\n\n"' + f.name + '"');
  if (typed !== f.name) {
    return E.toast('Name does not match — cancelled', 'error');
  }

  try {
    E.toast('Deleting factory…', 'info');
    await E.deleteFactory(id);
    E.toast('✓ Factory deleted', 'success');
    E.go();
  } catch (e) {
    E.toast('Delete failed: ' + e.message, 'error');
  }
};
})(window.ERP);