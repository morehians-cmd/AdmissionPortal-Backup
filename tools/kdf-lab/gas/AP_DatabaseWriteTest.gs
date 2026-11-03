/**
 * Isolated tests for AP_DatabaseTransactions.gs.
 *
 * Copy AP_Config.gs, AP_DatabaseTransactions.gs, and this file into a
 * separate, empty Apps Script project. The fake sheet is in memory; no
 * spreadsheet is opened and no real data is read or changed.
 */
function runDatabaseWritePrimitiveTests() {
  const results = [];
  function check(name, fn) {
    try {
      if (fn() !== true) throw new Error('Assertion returned false');
      results.push({ test: name, status: 'PASS' });
    } catch (err) {
      results.push({ test: name, status: 'FAIL', error: String(err && err.message || err) });
    }
  }

  check('record mapping follows exact schema order', function () {
    const row = AP_recordToRow_('Users', { Email: 'parent@example.test', UserID: 'U-1' });
    return row[0] === 'U-1' && row[2] === 'parent@example.test' && row.length === AP_SCHEMA.Users.length;
  });

  check('unknown record fields are rejected', function () {
    try {
      AP_recordToRow_('Users', { UserID: 'U-1', Admin: true });
      return false;
    } catch (err) {
      return /Unknown field/.test(String(err.message));
    }
  });

  check('invalid table and array record are rejected', function () {
    let invalidTable = false;
    let invalidRecord = false;
    try { AP_recordToRow_('MissingTable', {}); } catch (err) { invalidTable = true; }
    try { AP_recordToRow_('Users', []); } catch (err) { invalidRecord = true; }
    return invalidTable && invalidRecord;
  });

  check('batch append writes one contiguous range in schema order', function () {
    const original = globalThis.AP_getSpreadsheet_;
    const headers = AP_SCHEMA.Settings;
    const writes = [];
    const sheet = {
      getLastColumn: function () { return headers.length; },
      getLastRow: function () { return 1; },
      getRange: function (row, col, numRows, numCols) {
        if (arguments.length === 3 || arguments.length === 4) {
          return {
            getDisplayValues: function () { return [headers]; },
            setValues: function (values) { writes.push({ row: row, col: col, numRows: numRows, numCols: numCols, values: values }); }
          };
        }
        return { getDisplayValues: function () { return [headers]; } };
      }
    };
    globalThis.AP_getSpreadsheet_ = function () {
      return { getSheetByName: function (name) { return name === 'Settings' ? sheet : null; } };
    };
    try {
      const result = AP_appendRowsLocked_('Settings', [
        { SettingKey: 'A', SettingValue: '1' },
        { SettingKey: 'B', SettingValue: '2' }
      ]);
      return result.startRow === 2 && result.rowCount === 2 &&
        writes.length === 1 && writes[0].row === 2 && writes[0].numRows === 2 &&
        writes[0].values[0][0] === 'A' && writes[0].values[1][0] === 'B';
    } finally {
      globalThis.AP_getSpreadsheet_ = original;
    }
  });

  check('header mismatch is rejected before writing', function () {
    const original = globalThis.AP_getSpreadsheet_;
    const headers = AP_SCHEMA.Settings.slice();
    headers[0] = 'WrongHeader';
    const sheet = {
      getLastColumn: function () { return headers.length; },
      getRange: function () { return { getDisplayValues: function () { return [headers]; } }; },
      getLastRow: function () { return 1; }
    };
    globalThis.AP_getSpreadsheet_ = function () {
      return { getSheetByName: function () { return sheet; } };
    };
    try {
      try {
        AP_appendRowsLocked_('Settings', [{ SettingKey: 'A' }]);
        return false;
      } catch (err) {
        return /header mismatch/.test(String(err.message));
      }
    } finally {
      globalThis.AP_getSpreadsheet_ = original;
    }
  });


  check('keyed update changes exactly one matching row and preserves other fields', function () {
    const original = globalThis.AP_getSpreadsheet_;
    const headers = AP_SCHEMA.Settings;
    const row = ['FEATURE_X', 'OLD', 'description', true, '', ''];
    let written = null;
    const sheet = {
      getLastColumn: function () { return headers.length; },
      getLastRow: function () { return 2; },
      getRange: function (startRow, startCol, numRows, numCols) {
        if (startRow === 1) return { getDisplayValues: function () { return [headers]; } };
        return {
          getValues: function () { return [row.slice()]; },
          setValues: function (values) { written = values[0]; }
        };
      }
    };
    globalThis.AP_getSpreadsheet_ = function () {
      return { getSheetByName: function () { return sheet; } };
    };
    try {
      const result = AP_updateOneLocked_('Settings', 'SettingKey', 'FEATURE_X', { SettingValue: 'NEW' });
      return result.row === 2 && result.updatedFields === 1 &&
        written[0] === 'FEATURE_X' && written[1] === 'NEW' && written[2] === 'description';
    } finally {
      globalThis.AP_getSpreadsheet_ = original;
    }
  });

  check('keyed update rejects duplicate keys and key mutation', function () {
    const original = globalThis.AP_getSpreadsheet_;
    const headers = AP_SCHEMA.Settings;
    const rows = [
      ['DUP', '1', '', true, '', ''],
      ['DUP', '2', '', true, '', '']
    ];
    const sheet = {
      getLastColumn: function () { return headers.length; },
      getLastRow: function () { return 3; },
      getRange: function (startRow) {
        if (startRow === 1) return { getDisplayValues: function () { return [headers]; } };
        return { getValues: function () { return rows; }, setValues: function () {} };
      }
    };
    globalThis.AP_getSpreadsheet_ = function () { return { getSheetByName: function () { return sheet; } }; };
    try {
      let duplicateRejected = false, keyRejected = false;
      try { AP_updateOneLocked_('Settings', 'SettingKey', 'DUP', { SettingValue: '3' }); }
      catch (err) { duplicateRejected = /not unique/.test(String(err.message)); }
      try { AP_updateOneLocked_('Settings', 'SettingKey', 'DUP', { SettingKey: 'OTHER' }); }
      catch (err) { keyRejected = /cannot be changed/.test(String(err.message)); }
      return duplicateRejected && keyRejected;
    } finally {
      globalThis.AP_getSpreadsheet_ = original;
    }
  });

  const report = {
    runtime: 'Google Apps Script V8',
    passed: results.filter(function (r) { return r.status === 'PASS'; }).length,
    failed: results.filter(function (r) { return r.status === 'FAIL'; }).length,
    tests: results
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
