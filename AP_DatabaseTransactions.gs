/**
 * Lock-aware database write primitives.
 *
 * These are internal helpers only. Callers must authorize and validate the
 * complete business operation before writing. A script lock serializes
 * cooperating executions; it does not make multiple sheet writes atomic.
 */

function AP_recordToRow_(tableName, record) {
  const headers = AP_SCHEMA[tableName];
  if (!headers || !record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Invalid table or record.');
  }
  Object.keys(record).forEach(function (key) {
    if (headers.indexOf(key) === -1) {
      throw new Error('Unknown field for ' + tableName + ': ' + key);
    }
  });
  return headers.map(function (header) {
    return record[header] === undefined ? '' : record[header];
  });
}

function AP_assertSheetSchema_(tableName, sheet) {
  const headers = AP_SCHEMA[tableName];
  if (!headers || !sheet) throw new Error('Unknown table or missing sheet.');
  if (sheet.getLastColumn() !== headers.length) {
    throw new Error('Sheet schema column count mismatch: ' + tableName);
  }
  const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (actual[i] !== headers[i]) {
      throw new Error('Sheet schema header mismatch: ' + tableName + ' column ' + (i + 1));
    }
  }
}

/**
 * Append a contiguous batch to one sheet. Caller MUST already hold the
 * script lock. This is a single-sheet write, not a multi-sheet transaction.
 */
function AP_appendRowsLocked_(tableName, records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('At least one record is required.');
  }
  const sheet = AP_getSpreadsheet_().getSheetByName(tableName);
  AP_assertSheetSchema_(tableName, sheet);
  const values = records.map(function (record) {
    return AP_recordToRow_(tableName, record);
  });
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, AP_SCHEMA[tableName].length).setValues(values);
  return { startRow: startRow, rowCount: values.length };
}

/** Single-record convenience method for a caller that already holds the lock. */
function AP_appendRowLocked_(tableName, record) {
  return AP_appendRowsLocked_(tableName, [record]).startRow;
}
