/**
 * Temporary Google Apps Script compatibility harness.
 *
 * Run only in a separate, empty Apps Script test project.
 * Paste the generated AP_KdfBundle.gs above/beside this file, then run
 * runKdfCompatibilityTests(). This is not production authentication code.
 */

function runKdfCompatibilityTests() {
  if (typeof AP_KDF === 'undefined' || typeof AP_KDF.derivePasswordKey !== 'function') {
    throw new Error('AP_KDF bundle is missing. Build and paste AP_KdfBundle.gs first.');
  }

  var results = [];
  function record(name, fn) {
    try {
      fn();
      results.push({ test: name, status: 'PASS' });
    } catch (error) {
      results.push({ test: name, status: 'FAIL', error: String(error && error.message || error) });
    }
  }
  function assertEqual(actual, expected, label) {
    if (actual !== expected) throw new Error(label + ': expected ' + expected + ', got ' + actual);
  }
  function utf8Bytes(value) {
    var signed = Utilities.newBlob(value, 'text/plain').getBytes();
    return new Uint8Array(signed.map(function (byte) { return byte & 255; }));
  }
  function toHex(bytes) {
    return Array.prototype.map.call(bytes, function (byte) {
      return ('0' + (byte & 255).toString(16)).slice(-2);
    }).join('');
  }

  record('RFC 7914 PBKDF2-HMAC-SHA256 vector 1 (32-byte prefix)', function () {
    var actual = AP_KDF.derivePasswordKey(utf8Bytes('passwd'), utf8Bytes('salt'), 1);
    assertEqual(toHex(actual),
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc',
      'RFC vector output');
  });

  record('UTF-8 byte conversion and derived-key length', function () {
    var password = utf8Bytes('Môrëh Academy 🔐');
    var salt = utf8Bytes('admission-portal-test-salt');
    var actual = AP_KDF.derivePasswordKey(password, salt, 1200);
    assertEqual(toHex(actual),
      'af8efbc4b9c7b1b244325fec151b36db7042ce4bac8b96673d1399786da92567',
      'UTF-8 test output');
    assertEqual(actual.length, 32, 'Derived key length');
  });

  record('Invalid iteration count is rejected', function () {
    var thrown = false;
    try {
      AP_KDF.derivePasswordKey(utf8Bytes('password'), utf8Bytes('salt'), 0);
    } catch (error) {
      thrown = true;
    }
    if (!thrown) throw new Error('Zero iterations were not rejected');
  });

  var benchmarks = [];
  [100000, 300000, 600000].forEach(function (iterations) {
    var passwordBytes = utf8Bytes('benchmark-only-password');
    var saltBytes = utf8Bytes('benchmark-salt-16b');
    // Warm up the code path once, then collect five independent samples.
    AP_KDF.derivePasswordKey(passwordBytes, saltBytes, iterations);
    var samples = [];
    for (var sample = 0; sample < 5; sample++) {
      var started = Date.now();
      AP_KDF.derivePasswordKey(passwordBytes, saltBytes, iterations);
      samples.push(Date.now() - started);
    }
    var sorted = samples.slice().sort(function (a, b) { return a - b; });
    benchmarks.push({
      iterations: iterations,
      samplesMs: samples,
      medianMs: sorted[2],
      worstMs: sorted[sorted.length - 1]
    });
  });

  var passed = results.filter(function (item) { return item.status === 'PASS'; }).length;
  var report = {
    runtime: 'Google Apps Script V8',
    passed: passed,
    failed: results.length - passed,
    tests: results,
    benchmark: benchmarks,
    note: 'Benchmark timings are a single local run, not a security certification or production capacity guarantee.'
  };
  Logger.log(JSON.stringify(report, null, 2));
  if (report.failed) throw new Error('KDF compatibility tests failed: ' + report.failed);
  return report;
}
