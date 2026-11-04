(async()=>{const E=window.ERP,t=localStorage.getItem('erp_t');if(t)document.documentElement.dataset.theme=t;
try{await E.initDB();await E.reload();
 if(!E.D.factories.length){E.firstFactory()}else{if(!E.factory())E.setF(E.D.factories[0].id);E.renderFSel()}
 E.go();E.syncInit();
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{})}
catch(e){document.body.innerHTML='<pre style="padding:20px;color:#c00">Startup failed: '+e.message+'</pre>';console.error(e)}})();
