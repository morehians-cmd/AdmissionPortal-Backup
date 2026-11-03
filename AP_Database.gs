/** Read-only schema diagnostics and guarded low-level helpers. */
function AP_getSpreadsheet_() {
  return SpreadsheetApp.openById(AP_CONFIG.SPREADSHEET_ID);
}
/** Run manually in the Apps Script editor. Does not modify any sheet. */
function AP_healthCheck() {
  const ss=AP_getSpreadsheet_();
  const sheets=Object.keys(AP_SCHEMA).map(function(name){
    const expected=AP_SCHEMA[name], sh=ss.getSheetByName(name);
    if(!sh) return {sheet:name,status:'MISSING',expectedColumns:expected.length};
    const actual=sh.getRange(1,1,1,expected.length).getDisplayValues()[0];
    const mismatches=expected.filter(function(h,i){return actual[i]!==h;});
    return {sheet:name,status:mismatches.length?'HEADER_MISMATCH':(sh.getLastColumn()>expected.length?'EXTRA_COLUMNS':'OK'),
      expectedColumns:expected.length,actualColumns:sh.getLastColumn(),mismatchedHeaders:mismatches};
  });
  return {success:sheets.every(function(x){return x.status==='OK';}),spreadsheetName:ss.getName(),
    spreadsheetId:ss.getId(),schemaVersion:AP_CONFIG.SCHEMA_VERSION,checkedAt:new Date().toISOString(),sheets:sheets};
}
/** Internal only. Never expose raw sheet reads to unauthenticated clients. */
function AP_readRows_(name) {
  const headers=AP_SCHEMA[name]; if(!headers) throw new Error('Unknown table.');
  const sh=AP_getSpreadsheet_().getSheetByName(name); if(!sh) throw new Error('Missing sheet: '+name);
  if(sh.getLastRow()<2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues().map(function(row){
    const out={}; headers.forEach(function(h,i){out[h]=row[i] instanceof Date?row[i].toISOString():row[i];}); return out;
  });
}
/** Internal append primitive. Call only after authorization and validation. */
function AP_appendRow_(name,record) {
  const headers=AP_SCHEMA[name]; if(!headers||!record||typeof record!=='object') throw new Error('Invalid table or record.');
  const sh=AP_getSpreadsheet_().getSheetByName(name); if(!sh) throw new Error('Missing sheet: '+name);
  const values=headers.map(function(h){return record[h]===undefined?'':record[h];});
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try { sh.appendRow(values); } finally { lock.releaseLock(); }
}
