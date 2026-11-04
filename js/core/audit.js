(E=>{E.user='Local User';
E.audit=(action,col,rid,before,after)=>E.put('auditLog',{action,col,rid,before:before?JSON.stringify(before).slice(0,2000):null,after:after?JSON.stringify(after).slice(0,2000):null,at:new Date().toISOString(),user:E.user,factoryId:E.fid||''});})(window.ERP);
