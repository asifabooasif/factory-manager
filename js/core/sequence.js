/* Unbroken numbers per factory: JV-00001, JOB-00001 ... */
(E=>{E.next=async p=>{const id=E.fid+'-'+p;const s=E.D.sequences.find(x=>x.id===id)||{id,n:0,factoryId:E.fid};s.n++;await E.put('sequences',s);return p+'-'+String(s.n).padStart(5,'0')};})(window.ERP);
