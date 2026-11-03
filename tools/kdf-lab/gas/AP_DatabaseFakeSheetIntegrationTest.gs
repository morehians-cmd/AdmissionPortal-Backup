/**
 * Fake-sheet integration tests for the production AP_DatabaseTransactions.gs.
 *
 * In a SEPARATE, EMPTY Apps Script V8 project, copy these files:
 *   1) AP_Config.gs
 *   2) AP_DatabaseTransactions.gs
 *   3) tools/kdf-lab/gas/AP_DatabaseFakeSheetIntegrationTest.gs
 *
 * Then run runDatabaseFakeSheetIntegrationTests().
 *
 * The harness replaces AP_getSpreadsheet_ with in-memory fake sheets. It
 * never opens the live spreadsheet. It tests the actual production helper
 * functions against a fuller Spreadsheet/Range test double.
 *
 * Limitation: helpers ending in Locked_ assume the caller already owns a
 * script lock. This harness does not prove LockService contention behavior
 * or a multi-tab transaction coordinator.
 */

function runDatabaseFakeSheetIntegrationTests() {
  const results = [];
  function check(name, fn) {
    try {
      if (fn() !== true) throw new Error('Assertion returned false');
      results.push({ test: name, status: 'PASS' });
    } catch (err) {
      results.push({ test: name, status: 'FAIL', error: String(err && err.message || err) });
    }
  }

  function FakeRange(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows || 1;
    this.numCols = numCols || 1;
  }
  FakeRange.prototype.getDisplayValues = function () {
    return this.getValues().map(function (row) {
      return row.map(function (value) { return value === null ? '' : String(value); });
    });
  };
  FakeRange.prototype.getValues = function () {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const source = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        line.push(source[this.col - 1 + c] === undefined ? '' : source[this.col - 1 + c]);
      }
      out.push(line);
    }
    return out;
  };
  FakeRange.prototype.setValues = function (values) {
    if (!Array.isArray(values) || values.length !== this.numRows ||
        values.some(function (row) { return !Array.isArray(row) || row.length !== this.numCols; })) {
      throw new Error('FakeRange setValues dimensions do not match range.');
    }
    if (this.sheet.failBeforeNextWrite) {
      this.sheet.failBeforeNextWrite = false;
      throw new Error('Injected failure before fake sheet commit.');
    }
    for (let r = 0; r < values.length; r++) {
      const targetRow = this.row - 1 + r;
      if (!this.sheet.rows[targetRow]) this.sheet.rows[targetRow] = [];
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.rows[targetRow][this.col - 1 + c] = values[r][c];
      }
    }
    this.sheet.writeCount++;
    if (this.sheet.failAfterNextWrite) {
      this.sheet.failAfterNextWrite = false;
      throw new Error('Injected acknowledgement failure after fake sheet commit.');
    }
  };

  function FakeSheet(name, headers) {
    this.name = name;
    this.rows = [headers.slice()];
    this.writeCount = 0;
    this.failBeforeNextWrite = false;
    this.failAfterNextWrite = false;
  }
  FakeSheet.prototype.getLastColumn = function () {
    return this.rows[0] ? this.rows[0].length : 0;
  };
  FakeSheet.prototype.getLastRow = function () {
    let last = this.rows.length;
    while (last > 1 && this.rows[last - 1].every(function (v) { return v === '' || v === null || v === undefined; })) last--;
    return last;
  };
  FakeSheet.prototype.getRange = function (row, col, numRows, numCols) {
    return new FakeRange(this, row, col, numRows, numCols);
  };

  function FakeSpreadsheet() {
    this.sheets = {};
  }
  FakeSpreadsheet.prototype.addSheet = function (name, headers) {
    this.sheets[name] = new FakeSheet(name, headers);
    return this.sheets[name];
  };
  FakeSpreadsheet.prototype.getSheetByName = function (name) {
    return this.sheets[name] || null;
  };

  const fakeBook = new FakeSpreadsheet();
  Object.keys(AP_SCHEMA).forEach(function (table) {
    fakeBook.addSheet(table, AP_SCHEMA[table]);
  });
  const originalGetSpreadsheet = globalThis.AP_getSpreadsheet_;
  globalThis.AP_getSpreadsheet_ = function () { return fakeBook; };

  function readRecords(tableName) {
    const sheet = fakeBook.getSheetByName(tableName);
    const headers = AP_SCHEMA[tableName];
    return sheet.rows.slice(1, sheet.getLastRow()).map(function (row) {
      const record = {};
      headers.forEach(function (header, i) { record[header] = row[i] === undefined ? '' : row[i]; });
      return record;
    });
  }

  try {
    check('production append helper persists schema-ordered rows to fake sheet', function () {
      const result = AP_appendRowsLocked_('Users', [
        { Email: 'one@example.test', UserID: 'USR-1', AccountType: 'PARENT' },
        { UserID: 'USR-2', Email: 'two@example.test', AccountType: 'PARENT' }
      ]);
      const rows = readRecords('Users');
      return result.startRow === 2 && result.rowCount === 2 && rows.length === 2 &&
        rows[0].UserID === 'USR-1' && rows[0].Email === 'one@example.test' &&
        rows[1].UserID === 'USR-2' && rows[1].Email === 'two@example.test';
    });

    check('production append helper rejects unknown fields without writing', function () {
      const sheet = fakeBook.getSheetByName('ParentProfiles');
      const before = sheet.writeCount;
      let rejected = false;
      try {
        AP_appendRowLocked_('ParentProfiles', { ParentID: 'PAR-X', UnapprovedField: 'x' });
      } catch (err) { rejected = /Unknown field/.test(String(err.message)); }
      return rejected && sheet.writeCount === before && readRecords('ParentProfiles').length === 0;
    });

    check('production schema guard blocks mismatched headers before write', function () {
      const sheet = fakeBook.getSheetByName('Messages');
      const before = sheet.writeCount;
      sheet.rows[0][0] = 'WrongHeader';
      let rejected = false;
      try { AP_appendRowLocked_('Messages', { MessageID: 'MSG-1' }); }
      catch (err) { rejected = /header mismatch/.test(String(err.message)); }
      sheet.rows[0][0] = AP_SCHEMA.Messages[0];
      return rejected && sheet.writeCount === before && readRecords('Messages').length === 0;
    });

    check('production keyed update persists one field and preserves untouched fields', function () {
      AP_appendRowLocked_('Settings', {
        SettingKey: 'ENROLLMENT_OPEN', SettingValue: 'FALSE',
        Description: 'test setting', IsActive: true
      });
      const result = AP_updateOneLocked_('Settings', 'SettingKey', 'ENROLLMENT_OPEN', {
        SettingValue: 'TRUE'
      });
      const row = readRecords('Settings')[0];
      return result.row === 2 && result.updatedFields === 1 &&
        row.SettingKey === 'ENROLLMENT_OPEN' && row.SettingValue === 'TRUE' &&
        row.Description === 'test setting' && row.IsActive === true;
    });

    check('production keyed update refuses duplicate keys', function () {
      AP_appendRowLocked_('Settings', { SettingKey: 'DUPLICATE', SettingValue: 'A' });
      AP_appendRowLocked_('Settings', { SettingKey: 'DUPLICATE', SettingValue: 'B' });
      let rejected = false;
      try {
        AP_updateOneLocked_('Settings', 'SettingKey', 'DUPLICATE', { SettingValue: 'C' });
      } catch (err) { rejected = /not unique/.test(String(err.message)); }
      return rejected;
    });

    check('write failure before commit leaves no appended row', function () {
      const sheet = fakeBook.getSheetByName('Notifications');
      sheet.failBeforeNextWrite = true;
      let failed = false;
      try { AP_appendRowLocked_('Notifications', { NotificationID: 'NTF-BEFORE' }); }
      catch (err) { failed = /before fake sheet commit/.test(String(err.message)); }
      return failed && readRecords('Notifications').length === 0;
    });

    check('acknowledgement failure after commit leaves row discoverable by planned ID', function () {
      const sheet = fakeBook.getSheetByName('ParentInvitations');
      sheet.failAfterNextWrite = true;
      let failed = false;
      try {
        AP_appendRowLocked_('ParentInvitations', {
          InvitationID: 'INV-UNCERTAIN', StudentID: 'STU-1',
          ParentEmail: 'guardian@example.test', Status: 'PENDING'
        });
      } catch (err) { failed = /after fake sheet commit/.test(String(err.message)); }
      const matches = readRecords('ParentInvitations').filter(function (r) {
        return r.InvitationID === 'INV-UNCERTAIN';
      });
      return failed && matches.length === 1 && matches[0].Status === 'PENDING';
    });

    check('recovery inspection can distinguish absent and persisted planned IDs', function () {
      AP_appendRowLocked_('AuditLogs', { AuditID: 'AUD-RECOVERY-1', Action: 'TXN_STARTED' });
      const records = readRecords('AuditLogs');
      const present = records.filter(function (r) { return r.AuditID === 'AUD-RECOVERY-1'; }).length;
      const absent = records.filter(function (r) { return r.AuditID === 'AUD-NOT-WRITTEN'; }).length;
      return present === 1 && absent === 0;
    });

    check('post-commit update acknowledgement failure leaves updated state inspectable', function () {
      const sheet = fakeBook.getSheetByName('Settings');
      sheet.failAfterNextWrite = true;
      let failed = false;
      try {
        AP_updateOneLocked_('Settings', 'SettingKey', 'ENROLLMENT_OPEN', {
          SettingValue: 'FALSE'
        });
      } catch (err) { failed = /after fake sheet commit/.test(String(err.message)); }
      const row = readRecords('Settings').filter(function (r) {
        return r.SettingKey === 'ENROLLMENT_OPEN';
      })[0];
      return failed && row && row.SettingValue === 'FALSE';
    });

    check('append helper rejects empty batches and malformed records', function () {
      let emptyRejected = false, malformedRejected = false;
      try { AP_appendRowsLocked_('Users', []); } catch (err) { emptyRejected = true; }
      try { AP_appendRowsLocked_('Users', [null]); } catch (err) { malformedRejected = true; }
      return emptyRejected && malformedRejected;
    });
  } finally {
    globalThis.AP_getSpreadsheet_ = originalGetSpreadsheet;
  }

  const report = {
    runtime: 'Google Apps Script V8',
    testMode: 'in-memory fake Spreadsheet/Range interfaces',
    passed: results.filter(function (r) { return r.status === 'PASS'; }).length,
    failed: results.filter(function (r) { return r.status === 'FAIL'; }).length,
    tests: results
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
