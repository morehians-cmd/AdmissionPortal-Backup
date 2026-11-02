function approveApplication(token,studentId,authorizationNote){
 const lock=LockService.getScriptLock();let u,row,flags=[];
 try{
  lock.waitLock(20000);u=owner_(token);const hit=findStudent_(String(studentId||''));if(!hit)throw new Error('Application not found.');
  row=Object.assign({},hit.o);if(row.EnrollStatus==='Enrolled'&&row.ReviewStatus==='Approved')return ok({StudentID:row.StudentID,alreadyApproved:true},'This application is already approved.');
  if(['Cancelled','Transferred Out'].includes(row.EnrollStatus))throw new Error('Cancelled or transferred records cannot be approved.');
  flags=flagRows_().filter(f=>f.StudentID===row.StudentID&&f.Status==='Active');const note=String(authorizationNote||'').trim().slice(0,500);
  if(flags.length&&!note)throw new Error('ACTIVE_HOLD: '+flags.map(f=>f.Office).join(', '));
  const before=Object.assign({},row),was=row.EnrollStatus||'Not Enrolled';row.ReviewStatus='Approved';row.EnrollStatus='Enrolled';row.ApprovedBy=u.Username;row.ApprovedByRole=approvalActorRole_(u);row.ApprovedAt=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');row.ApprovalRemarks=note?'Authorized exception: '+note:String(row.ApprovalRemarks||'');stampAudit_(row,u);
  put_(sh_('S'),hit.r,1,[COLS.map(k=>row[k]||'')]);
  try{approvalLog_(u,row,'Approved',row.ApprovalRemarks,flags,note);}catch(err){put_(sh_('S'),hit.r,1,[COLS.map(k=>before[k]||'')]);throw new Error('Decision history could not be saved; the enrollment change was rolled back. '+err.message);}
  logStatus_([logRow_(row,was,u)]);audit_(u,'application.approve',row.StudentID,flags.length?'authorized exception: '+note:'');
 }catch(e){return fail(e);}finally{try{lock.releaseLock();}catch(_){}}
 notify_(row,'Application approved','Your application has been approved and your enrollment status is now ENROLLED. Any outstanding documentary requirements may still be submitted.');
 return ok({StudentID:row.StudentID},'Application approved. Enrollment status is now Enrolled.');
}
function returnApplication(token,studentId,remarks){
 const lock=LockService.getScriptLock();
 try{lock.waitLock(20000);const u=owner_(token),hit=findStudent_(String(studentId||''));if(!hit)throw new Error('Application not found.');
  const before=Object.assign({},hit.o),row=Object.assign({},hit.o),note=String(remarks||'').trim().slice(0,1000);if(!note)throw new Error('Enter the correction instructions before returning this application.');
  if(['Enrolled','Cancelled','Transferred Out'].includes(row.EnrollStatus))throw new Error('This record can no longer be returned for correction.');row.ReviewStatus='Returned';row.ApprovalRemarks=note;put_(sh_('S'),hit.r,1,[COLS.map(k=>row[k]||'')]);
  try{approvalLog_(u,row,'Returned',note,[],'');}catch(err){put_(sh_('S'),hit.r,1,[COLS.map(k=>before[k]||'')]);throw new Error('Decision history could not be saved; the return action was rolled back. '+err.message);}
  audit_(u,'application.return',row.StudentID,note);return ok({StudentID:row.StudentID},'Application returned for correction.');
 }catch(e){return fail(e);}finally{try{lock.releaseLock();}catch(_){}}
}
