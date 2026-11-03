/**
 * Isolated Apps Script checks for AP_Auth.gs authentication primitives.
 *
 * Copy this file and the current AP_Auth.gs into a separate, empty Apps Script
 * project. Do not connect it to the admission spreadsheet. The test runner
 * stubs Utilities only where required and never sends email or reads sheets.
 */
/**
 * Runs the one-time handle consumer against an in-memory fake sheet.
 * All global stubs are restored even when an assertion throws.
 */
function AP_testWithChallenge_(expiry, callback) {
  const root=globalThis;
  const originalHmac=root.AP_authHmac_;
  const originalLockService=root.LockService;
  const originalGetSpreadsheet=root.AP_getSpreadsheet_;
  const challengeId='123e4567-e89b-42d3-a456-426614174000';
  const row=[challengeId,'parent@example.test','PARENT_INVITATION_VERIFY','unused',
    expiry,0,5,'VERIFIED',new Date(),new Date(),'STUDENT-TEST','2026-2027'];
  const sheet={
    getLastRow:function(){return 2;},
    getRange:function(){
      return {
        getValues:function(){return [row];},
        setValue:function(value){row[7]=value;}
      };
    }
  };
  root.AP_authHmac_=function(value){return 'TESTMAC_'+value;};
  root.LockService={getScriptLock:function(){return {
    waitLock:function(){},releaseLock:function(){}
  };}};
  root.AP_getSpreadsheet_=function(){return {getSheetByName:function(){return sheet;}};};
  try {
    const payload='VERIFICATION_HANDLE:v1:'+challengeId+':PARENT_INVITATION_VERIFY';
    const handle=challengeId+'.TESTMAC_'+payload;
    return callback(handle,row);
  } finally {
    root.AP_authHmac_=originalHmac;
    root.LockService=originalLockService;
    root.AP_getSpreadsheet_=originalGetSpreadsheet;
  }
}

function runAuthPrimitiveTests() {
  const results = [];
  function check(name, fn) {
    try {
      if (fn() !== true) throw new Error('Assertion returned false');
      results.push({test:name,status:'PASS'});
    } catch (err) {
      results.push({test:name,status:'FAIL',error:String(err && err.message || err)});
    }
  }

  check('constant-time comparator accepts equal fixed strings', function() {
    return AP_authConstantTimeEqual_('AbCdEf0123456789','AbCdEf0123456789');
  });
  check('constant-time comparator rejects changed final character', function() {
    return !AP_authConstantTimeEqual_('AbCdEf0123456789','AbCdEf0123456780');
  });
  check('constant-time comparator rejects different lengths', function() {
    return !AP_authConstantTimeEqual_('AbCdEf0123456789','AbCdEf012345678');
  });
  check('constant-time comparator rejects non-string values', function() {
    return !AP_authConstantTimeEqual_(null,'AbCdEf0123456789');
  });
  check('12-character hexadecimal OTP format is accepted', function() {
    return /^[A-F0-9]{12}$/.test('A1B2C3D4E5F6');
  });
  check('verification handle is consumed and returns server-side context', function() {
    return AP_testWithChallenge_(new Date(Date.now()+60000),function(handle,row) {
      const result=AP_authConsumeVerificationHandle_(handle,'PARENT_INVITATION_VERIFY');
      return result.email==='parent@example.test' && result.studentId==='STUDENT-TEST' &&
        result.schoolYear==='2026-2027' && row[7]==='CONSUMED';
    });
  });
  check('lock-held resolver consumes verified handle', function() {
    return AP_testWithChallenge_(new Date(Date.now()+60000),function(handle,row) {
      const result=AP_authResolveVerificationHandleLocked_(handle,'PARENT_INVITATION_VERIFY');
      return result.email==='parent@example.test' && result.studentId==='STUDENT-TEST' &&
        result.schoolYear==='2026-2027' && row[7]==='CONSUMED';
    });
  });
  check('verification handle cannot be replayed', function() {
    return AP_testWithChallenge_(new Date(Date.now()+60000),function(handle) {
      AP_authConsumeVerificationHandle_(handle,'PARENT_INVITATION_VERIFY');
      try {
        AP_authConsumeVerificationHandle_(handle,'PARENT_INVITATION_VERIFY');
        return false;
      } catch(err) { return true; }
    });
  });
  check('verification handle cannot be used for another purpose', function() {
    return AP_testWithChallenge_(new Date(Date.now()+60000),function(handle) {
      try {
        AP_authConsumeVerificationHandle_(handle,'NEW_STUDENT_PARENT_VERIFY');
        return false;
      } catch(err) { return true; }
    });
  });
  check('expired verification handle is rejected', function() {
    return AP_testWithChallenge_(new Date(Date.now()-1000),function(handle) {
      try {
        AP_authConsumeVerificationHandle_(handle,'PARENT_INVITATION_VERIFY');
        return false;
      } catch(err) { return true; }
    });
  });
  check('legacy 8-character OTP format is rejected', function() {
    return !/^[A-F0-9]{12}$/.test('A1B2C3D4');
  });

  const report = {runtime:'Google Apps Script V8',passed:results.filter(r=>r.status==='PASS').length,
    failed:results.filter(r=>r.status==='FAIL').length,tests:results};
  Logger.log(JSON.stringify(report,null,2));
  return report;
}
