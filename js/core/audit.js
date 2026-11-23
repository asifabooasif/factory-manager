(E=>{E.user='Local User';
const slim=o=>JSON.stringify(o,(k,v)=>k==='photo'&&typeof v==='string'&&v.length>200?'[photo]':v).slice(0,2000);
E.audit=(action,col,rid,before,after)=>E.put('auditLog',{action,col,rid,before:before?slim(before):null,after:after?slim(after):null,at:new Date().toISOString(),user:E.user,factoryId:E.fid||''});})(window.ERP);
