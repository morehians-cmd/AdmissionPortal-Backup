const APPROVAL_COLS=['LoggedAt','StudentID','FullName','Actor','ActorRole','Decision','Remarks','ActiveHolds','HoldExceptionReason'];
function approvalSh_(){const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName('Approval History');if(!sh){sh=ss.insertSheet('Approval History');sh.getRange(1,1,1,APPROVAL_COLS.length).setValues([APPROVAL_COLS]).setFontWeight('bold');sh.setFrozenRows(1);sh.getRange(1,1,sh.getMaxRows(),APPROVAL_COLS.length).setNumberFormat('@');}return sh;}
function approvalActorRole_(u){return u.Clearance==='Full'?'System Admin':'System Manager';}
function approvalLog_(u,row,decision,remarks,holds,reason){approvalSh_().appendRow([Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'),row.StudentID,row.FullName,u.Username,approvalActorRole_(u),decision,String(remarks||''),(holds||[]).map(h=>h.Office+':'+h.FlagID).join(', '),String(reason||'')]);}
function reviewQueue(token){try{owner_(token);const rows=rows_('S').filter(r=>['For Review','Returned',''].includes(r.ReviewStatus||'')&&!['Enrolled','Cancelled','Transferred Out'].includes(r.EnrollStatus)).reverse().slice(0,500);return ok(rows.map(r=>({StudentID:r.StudentID,FullName:r.FullName,GradeLevel:r.GradeLevel,Section:r.Section,SchoolYear:r.SchoolYear,EnrollStatus:r.EnrollStatus||'Not Enrolled',ReviewStatus:r.ReviewStatus||'For Review',SubmittedAt:r.SubmittedAt||r.CreatedAt||'',PendingRequirements:reqsFor_(r).req.filter(k=>!r[k]||r[k]==='None').length,ActiveHolds:holdsOf_(r.StudentID)})));}catch(e){return fail(e);}}

function approvalHistoryList(token){
 try{
  owner_(token);const sh=approvalSh_(),n=sh.getLastRow()-1;if(n<1)return ok([]);
  const start=Math.max(2,sh.getLastRow()-499),rows=sh.getRange(start,1,sh.getLastRow()-start+1,APPROVAL_COLS.length).getDisplayValues();
  return ok(rows.reverse().map(r=>{const o={};APPROVAL_COLS.forEach((k,i)=>o[k]=String(r[i]||''));return o;}));
 }catch(e){return fail(e);}
}
