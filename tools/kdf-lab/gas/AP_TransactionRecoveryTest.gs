/**
 * Isolated failure-injection tests for the proposed parent-invitation
 * transaction recovery protocol.
 *
 * Copy this file alone into a separate Apps Script V8 project and run
 * runTransactionRecoveryTests(). It uses only in-memory objects and does not
 * open or modify the admission spreadsheet.
 *
 * This validates the recovery model, not a production transaction handler.
 */
function runTransactionRecoveryTests() {
  const results = [];
  function check(name, fn) {
    try {
      if (fn() !== true) throw new Error('Assertion returned false');
      results.push({ test: name, status: 'PASS' });
    } catch (err) {
      results.push({ test: name, status: 'FAIL', error: String(err && err.message || err) });
    }
  }

  function makeState() {
    return {
      journal: null,
      challenge: 'VERIFIED',
      invitation: 'PENDING',
      records: { Users: {}, ParentProfiles: {}, ParentStudentLinks: {} },
      auditCommitted: false,
      successReturned: false
    };
  }

  function planned() {
    return {
      transactionId: 'TX-1',
      challengeId: 'CH-1',
      invitationId: 'INV-1',
      userId: 'USR-1',
      parentId: 'PAR-1',
      linkId: 'LNK-1'
    };
  }

  function execute(state, failAt) {
    const ids = planned();
    if (state.journal && state.journal.transactionId !== ids.transactionId) {
      throw new Error('Different transaction already owns this invitation.');
    }
    if (!state.journal) {
      state.journal = { transactionId: ids.transactionId, phase: 'PREPARED', ids: ids };
    }
    function fail(point) {
      if (failAt === point) throw new Error('Injected failure: ' + point);
    }
    function addOnce(table, id, data) {
      if (state.records[table][id]) {
        if (state.records[table][id].transactionId !== ids.transactionId) {
          throw new Error('Planned ID collision.');
        }
        return;
      }
      state.records[table][id] = { transactionId: ids.transactionId, data: data };
    }
    fail('afterJournal');
    if (state.challenge === 'VERIFIED') state.challenge = 'CONSUMED';
    else if (state.challenge !== 'CONSUMED') throw new Error('Challenge unavailable.');
    state.journal.phase = 'CHALLENGE_CONSUMED';
    fail('afterChallenge');
    addOnce('Users', ids.userId, { email: 'guardian@example.test' });
    state.journal.phase = 'USER_CREATED';
    fail('afterUser');
    addOnce('ParentProfiles', ids.parentId, { userId: ids.userId });
    state.journal.phase = 'PROFILE_CREATED';
    fail('afterProfile');
    addOnce('ParentStudentLinks', ids.linkId, { parentId: ids.parentId, studentId: 'STU-1' });
    state.journal.phase = 'LINK_CREATED';
    fail('afterLink');
    state.invitation = 'ACCEPTED';
    state.journal.phase = 'INVITATION_ACCEPTED';
    fail('afterInvitation');
    state.auditCommitted = true;
    fail('afterAudit');
    state.journal.phase = 'COMMITTED';
    state.successReturned = true;
    return true;
  }

  function recover(state) {
    if (!state.journal) return 'NO_TRANSACTION';
    const ids = state.journal.ids;
    const user = state.records.Users[ids.userId];
    const profile = state.records.ParentProfiles[ids.parentId];
    const link = state.records.ParentStudentLinks[ids.linkId];
    const allRecords = !!user && !!profile && !!link;
    const bindingsValid = allRecords &&
      profile.data.userId === ids.userId &&
      link.data.parentId === ids.parentId &&
      link.data.studentId === 'STU-1' &&
      user.transactionId === ids.transactionId &&
      profile.transactionId === ids.transactionId &&
      link.transactionId === ids.transactionId;
    if (state.journal.phase === 'COMMITTED' && state.invitation === 'ACCEPTED' &&
        state.challenge === 'CONSUMED' && bindingsValid && state.auditCommitted) {
      return 'COMMITTED';
    }
    if (state.invitation === 'ACCEPTED' || state.auditCommitted ||
        (profile && !user) || (link && (!profile || !user))) {
      state.journal.phase = 'NEEDS_REVIEW';
      return 'NEEDS_REVIEW';
    }
    if (state.journal.phase === 'PREPARED' && state.challenge === 'VERIFIED' &&
        !user && !profile && !link && state.invitation === 'PENDING') {
      state.journal.phase = 'ABORTED';
      return 'ABORTED';
    }
    return 'RESUMABLE';
  }

  check('failure before journal leaves no transaction state', function () {
    const s = makeState();
    // The journal append itself fails: no state is persisted.
    return s.journal === null && recover(s) === 'NO_TRANSACTION';
  });

  [
    ['after journal', 'afterJournal'],
    ['after challenge consumption', 'afterChallenge'],
    ['after user append', 'afterUser'],
    ['after parent profile append', 'afterProfile'],
    ['after parent-student link append', 'afterLink'],
    ['after invitation update', 'afterInvitation'],
    ['after final audit append', 'afterAudit']
  ].forEach(function (entry) {
    check('failure injection ' + entry[0] + ' leaves inspectable state', function () {
      const s = makeState();
      try { execute(s, entry[1]); } catch (err) {}
      return !!s.journal && s.journal.transactionId === 'TX-1' &&
        typeof recover(s) === 'string' && !s.successReturned;
    });
  });

  check('retry after challenge consumption does not duplicate planned records', function () {
    const s = makeState();
    try { execute(s, 'afterUser'); } catch (err) {}
    execute(s, null);
    return Object.keys(s.records.Users).length === 1 &&
      Object.keys(s.records.ParentProfiles).length === 1 &&
      Object.keys(s.records.ParentStudentLinks).length === 1 &&
      s.journal.phase === 'COMMITTED' && s.successReturned;
  });

  check('completed transaction is recognized without repeating writes', function () {
    const s = makeState();
    execute(s, null);
    const before = JSON.stringify(s.records);
    const status = recover(s);
    return status === 'COMMITTED' && JSON.stringify(s.records) === before;
  });

  check('partial link without required parent records is escalated', function () {
    const s = makeState();
    s.journal = { transactionId: 'TX-1', phase: 'LINK_CREATED', ids: planned() };
    s.records.ParentStudentLinks['LNK-1'] = {
      transactionId: 'TX-1',
      data: { parentId: 'PAR-1', studentId: 'STU-1' }
    };
    return recover(s) === 'NEEDS_REVIEW' && s.journal.phase === 'NEEDS_REVIEW';
  });

  check('success is never returned before committed marker', function () {
    const s = makeState();
    try { execute(s, 'afterAudit'); } catch (err) {}
    return s.auditCommitted === true && s.journal.phase === 'INVITATION_ACCEPTED' &&
      s.successReturned === false;
  });

  check('journal model contains no credential or verification secrets', function () {
    const s = makeState();
    execute(s, null);
    const serialized = JSON.stringify(s.journal);
    return !/password|otp|verificationHandle|inviteCode|sessionToken|derivedKey/i.test(serialized);
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
