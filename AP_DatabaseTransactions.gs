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

/**
 * Update exactly one existing row by a unique key. Caller MUST already hold
 * the script lock. Key fields cannot be changed by this helper. The full row
 * is rewritten once after validating the target and update fields.
 */
function AP_updateOneLocked_(tableName, keyField, keyValue, updates) {
  const headers = AP_SCHEMA[tableName];
  if (!headers || headers.indexOf(keyField) === -1 || keyValue === '' ||
      keyValue === null || keyValue === undefined ||
      !updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Invalid update target.');
  }
  const updateKeys = Object.keys(updates);
  if (!updateKeys.length) throw new Error('At least one update field is required.');
  updateKeys.forEach(function (key) {
    if (headers.indexOf(key) === -1) throw new Error('Unknown field for ' + tableName + ': ' + key);
    if (key === keyField) throw new Error('The record key cannot be changed.');
  });

  const sheet = AP_getSpreadsheet_().getSheetByName(tableName);
  AP_assertSheetSchema_(tableName, sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Target record was not found.');

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const keyIndex = headers.indexOf(keyField);
  const matches = [];
  values.forEach(function (row, index) {
    if (String(row[keyIndex]) === String(keyValue)) matches.push(index);
  });
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'Target key is not unique.' : 'Target record was not found.');
  }

  const rowIndex = matches[0];
  const updated = values[rowIndex].slice();
  updateKeys.forEach(function (key) {
    updated[headers.indexOf(key)] = updates[key];
  });
  const sheetRow = rowIndex + 2;
  sheet.getRange(sheetRow, 1, 1, headers.length).setValues([updated]);
  return { row: sheetRow, updatedFields: updateKeys.length };
}
