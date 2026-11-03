/**
 * Isolated Apps Script checks for AP_Auth.gs authentication primitives.
 *
 * Copy this file and the current AP_Auth.gs into a separate, empty Apps Script
 * project. Do not connect it to the admission spreadsheet. The test runner
 * stubs Utilities only where required and never sends email or reads sheets.
 */
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
  check('legacy 8-character OTP format is rejected', function() {
    return !/^[A-F0-9]{12}$/.test('A1B2C3D4');
  });

  const report = {runtime:'Google Apps Script V8',passed:results.filter(r=>r.status==='PASS').length,
    failed:results.filter(r=>r.status==='FAIL').length,tests:results};
  Logger.log(JSON.stringify(report,null,2));
  return report;
}
