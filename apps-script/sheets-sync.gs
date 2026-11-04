// Google Sheets copy. Paste in your sheet: Extensions > Apps Script. Change SECRET, then Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
var SECRET = 'CHANGE_THIS_SECRET';
var H = {
  items:['id','art','name','cat','unit','pack','price','active'], variants:['id','itemId','sku','color','size','barcode','active'],
  parties:['id','code','name','type','phone','addr','limit','days','active'], journalEntries:['id','no','date','ref','narr','source','amount','lines'],
  invoices:['id','no','date','partyId','gross','disc','total','paid','cancelled'], deliveries:['id','no','date','partyId','total','cogs','status'],
  purchases:['id','no','date','partyId','invNo','total','paid','cancelled'], wageRuns:['id','no','kind','type','date','from','to','gross','net','paid'],
  jobs:['id','no','date','due','partyId','priority','status','notes']
};
var MONEY = {price:1, limit:1, gross:1, disc:1, total:1, paid:1, cogs:1, net:1, amount:1}; // stored as cents in the app
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){
  try{
    var d = JSON.parse(e.postData.contents);
    if(d.key !== SECRET) return out({status:'denied'});
    var headers = H[d.sheet]; if(!headers) return out({status:'unknown sheet'});
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(d.sheet);
    if(!sh){ sh = ss.insertSheet(d.sheet); sh.appendRow(headers); sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#5b21b6').setFontColor('#ffffff'); sh.setFrozenRows(1); }
    var ids = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){return r[0];}) : [];
    d.records.forEach(function(r){
      if(d.sheet === 'journalEntries') r.amount = (r.lines||[]).reduce(function(s,l){return s + (l.dr||0);},0);
      var row = headers.map(function(h){var v = r[h]; if(v === undefined || v === null) return ''; if(MONEY[h] && typeof v === 'number') return v/100; if(typeof v === 'object') return JSON.stringify(v); return v;});
      var i = ids.indexOf(r.id);
      if(i >= 0){ sh.getRange(i+2,1,1,row.length).setValues([row]); } else { sh.appendRow(row); ids.push(r.id); }
    });
    return out({status:'success'});
  }catch(err){ return out({status:'error', message:String(err)}); }
}
