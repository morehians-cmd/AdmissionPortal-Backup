/********************************************************************************
 * Verified Parent / Guardian access.
 * Guardian identity is established only through a one-time code sent to the
 * student's stored GuardEmail. A typed email address alone never grants access.
 ********************************************************************************/
const GUARD_LINK_COLS=['GuardianUsername','GuardianEmail','StudentID','Status','InvitedBy','InvitedAt','VerifiedAt'];
function guardianLinkSh_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName('Guardian Links');
 if(!sh){sh=ss.insertSheet('Guardian Links');sh.getRange(1,1,1,GUARD_LINK_COLS.length).setValues([GUARD_LINK_COLS]).setFontWeight('bold');sh.setFrozenRows(1);sh.getRange(1,1,sh.getMaxRows(),GUARD_LINK_COLS.length).setNumberFormat('@');}
 return sh;
}
function guardianLinkRows_(){
 const sh=guardianLinkSh_(),n=sh.getLastRow()-1;
 return n<1?[]:sh.getRange(2,1,n,GUARD_LINK_COLS.length).getDisplayValues().map((r,i)=>{const o={_r:i+2};GUARD_LINK_COLS.forEach((k,j)=>o[k]=String(r[j]||''));return o;});
}
function guardianLinksFor_(username){
 return guardianLinkRows_().filter(x=>x.GuardianUsername===username&&x.Status==='Verified');
}
/** Staff sends an invitation only to the guardian email already stored on the learner record. */
function createGuardianInvite(token,studentId){
 const lock=LockService.getScriptLock();
 try{
  lock.waitLock(15000);const actor=owner_(token),hit=findStudent_(String(studentId||''));
  if(!hit)throw new Error('Student record not found.');
  const email=String(hit.o.GuardEmail||'').trim().toLowerCase(),name=String(hit.o.GuardName||'').trim();
  if(!EMAIL_RE.test(email)||!name)throw new Error('A valid Parent / Guardian name and email must first be saved in the student profile.');
  const collision=rows_('U').find(u=>(u.Username===email||(u.Email||'').toLowerCase()===email)&&u.Role!=='guardian');
  if(collision)throw new Error('This email is already assigned to a non-guardian portal account. Contact the System Admin before proceeding.');
  if(!mailOn_())throw new Error('Automatic email is currently disabled. Enable email before sending a guardian invitation.');
  if(!pubMailOk_('reg'))throw new Error('Guardian invitations are temporarily paused by the daily email limit.');
  const challenge=Utilities.getUuid(),code=String(parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16)%1000000).padStart(6,'0');
  const rec={studentId:hit.o.StudentID,email:email,name:name,invitedBy:actor.Username,hash:otHash_(challenge,code),exp:Date.now()+900000,tries:0};
  CacheService.getScriptCache().put('gi_'+challenge,JSON.stringify(rec),900);
  try{MailApp.sendEmail({to:email,name:'Moreh Academy Admissions',subject:'Moreh Academy: Parent / Guardian portal invitation',
   body:'Hello '+name+',\n\nA Parent / Guardian portal invitation has been requested for the learner '+hit.o.FullName+'.\n\nInvitation reference: '+challenge+'\nYour one-time verification code is: '+code+'\n\nEnter this reference and code in the Parent / Guardian invitation section of the Moreh Academy portal within 15 minutes. You will create a password if this is your first linked account.\n\nIf you did not expect this invitation, contact the Admissions Office. The code grants access only after verification.'});}
  catch(e){CacheService.getScriptCache().remove('gi_'+challenge);throw new Error('The invitation email could not be sent. Please try again later.');}
  audit_(actor,'guardian.invite',hit.o.StudentID,email);
  return ok({challenge:challenge,hint:maskEmail_(email)},'A verification code was sent to '+maskEmail_(email)+'.');
 }catch(e){return fail(e);}finally{try{lock.releaseLock();}catch(_){}}
}
/** Public claim step. Existing guardian accounts may link another child using their existing password. */
function confirmGuardianInvite(challenge,code,password){
 const lock=LockService.getScriptLock();
 try{
  lock.waitLock(15000);const cache=CacheService.getScriptCache(),key='gi_'+String(challenge||''),raw=cache.get(key);
  if(!raw)throw new Error('Invitation expired. Ask the Admission Office to send a new invitation.');
  const rec=JSON.parse(raw),bad='Invalid or expired verification code.';
  if(Date.now()>rec.exp){cache.remove(key);throw new Error(bad);}
  if(!safeEq_(rec.hash,otHash_(String(challenge||''),String(code||'').trim()))){
   rec.tries++;if(rec.tries>=5)cache.remove(key);else cache.put(key,JSON.stringify(rec),Math.max(1,Math.ceil((rec.exp-Date.now())/1000)));
   throw new Error(bad);
  }
  const hit=findStudent_(rec.studentId);
  if(!hit||(String(hit.o.GuardEmail||'').trim().toLowerCase()!==rec.email))throw new Error('The guardian email on the learner record has changed. Request a new invitation.');
  const users=rows_('U'),found=users.find(u=>u.Username===rec.email||(u.Email||'').toLowerCase()===rec.email);
  let account=found;
  if(found&&found.Role!=='guardian')throw new Error('This email is already assigned to another account type. Contact the System Admin.');
  if(!found){
   const pw=String(password||'');if(pw.length<8)throw new Error('Create a password with at least 8 characters.');
   addUser_(rec.email,pw,'guardian',rec.name,'',rec.email,false,'Parent / Guardian','Guardian','Family');
   account=rows_('U').find(u=>u.Username===rec.email);
  }
  const sh=guardianLinkSh_(),links=guardianLinkRows_();
  if(!links.some(x=>x.GuardianUsername===account.Username&&x.StudentID===rec.studentId&&x.Status==='Verified')){
   put_(sh,sh.getLastRow()+1,1,[[account.Username,rec.email,rec.studentId,'Verified',rec.invitedBy,Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'),Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss')]]);
  }
  cache.remove(key);audit_(account.Username,'guardian.link',rec.studentId,'email verified');
  return ok({existingAccount:!!found,username:account.Username},found?'Guardian account linked to the learner. Sign in with your existing password.':'Guardian account created and linked. You may now sign in.');
 }catch(e){return fail(e);}finally{try{lock.releaseLock();}catch(_){}}
}
function getGuardianStudents(token){
 try{
  const u=who_(token);if(u.Role!=='guardian')throw new Error('Parent / Guardian account required.');
  const ids=[...new Set(guardianLinksFor_(u.Username).map(x=>x.StudentID))];
  const all=rows_('S'),map={};all.forEach(s=>map[s.StudentID]=s);
  return ok(ids.map(id=>map[id]).filter(Boolean).map(s=>({StudentID:s.StudentID,FullName:s.FullName,GradeLevel:s.GradeLevel,Section:s.Section,SchoolYear:s.SchoolYear,EnrollStatus:s.EnrollStatus||'Not Enrolled',ReviewStatus:s.ReviewStatus||'For Review'})));
 }catch(e){return fail(e);}
}
/** Limited, read-only child view: identity, enrollment/review state and document status only. */
function getGuardianStudent(token,studentId){
 try{
  const u=who_(token);if(u.Role!=='guardian')throw new Error('Parent / Guardian account required.');
  const id=String(studentId||'');if(!guardianLinksFor_(u.Username).some(x=>x.StudentID===id))throw new Error('This learner is not linked to your verified guardian account.');
  const hit=findStudent_(id);if(!hit)throw new Error('Student record not found.');const r=hit.o,out={StudentID:r.StudentID,FullName:r.FullName,GradeLevel:r.GradeLevel,Section:r.Section,SchoolYear:r.SchoolYear,EnrollStatus:r.EnrollStatus||'Not Enrolled',ReviewStatus:r.ReviewStatus||'For Review',Holds:studentHolds_(id)};
  reqsFor_(r).show.forEach(k=>{out[k]=r[k]||'None';out[k+'Date']=r[k+'Date']||'';});
  return ok(out);
 }catch(e){return fail(e);}
}
