/* Per-factory switches + period locking. */
(E=>{const DEF={fgCats:['Flat','PU'],taxOn:false,epfOn:true,epfOtBonus:false,epfEmp:8,epfCo:12,etf:3,packSize:6,wastage:'ask',lockedUntil:''};
E.setting=k=>{const s=E.rows('settings')[0]||{};return k in s?s[k]:DEF[k]};
E.setSetting=async o=>{const s=E.rows('settings')[0]||{id:'set-'+E.fid};const b=JSON.parse(JSON.stringify(s));return E.save('settings',Object.assign(s,o),b)};
E.fgCats=()=>{const c=E.setting('fgCats');return Array.isArray(c)&&c.length?c:DEF.fgCats};
E.locked=d=>{const l=E.setting('lockedUntil');return !!l&&d<=l};})(window.ERP);
