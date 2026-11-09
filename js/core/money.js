/* All money is stored as whole cents (integers) so rounding errors cannot happen. */
(E=>{E.c=v=>Math.round((parseFloat(v)||0)*100);
E.m=c=>(c<0?'-':'')+'Rs '+(Math.abs(c)/100).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});})(window.ERP);
