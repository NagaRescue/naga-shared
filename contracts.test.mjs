// Guards the contracts themselves, before any consumer is checked against them.

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  victimConditions,
  smsTokenVectors,
  checkVictimConditions,
  checkSmsToken,
} from './contracts.cjs';

// ── The victim-condition vocabulary ────────────────────────────────────────

test('the vocabulary is short enough to answer in one tap', () => {
  // A list nobody can scan in a flood is a list nobody fills in.
  assert.ok(victimConditions.conditions.length <= 6,
    `${victimConditions.conditions.length} options is past the point where this is one tap`);
});

test('values, codes and labels are each unique', () => {
  for (const field of ['value', 'code', 'label']) {
    const seen = victimConditions.conditions.map((c) => c[field]);
    assert.strictEqual(new Set(seen).size, seen.length, `duplicate ${field}`);
  }
});

test("'0' is reserved for not-reported and is never a real condition", () => {
  // encodeSOS sends '0' when the resident skipped the question. A condition
  // claiming that code would turn skipping into an answer.
  assert.ok(!victimConditions.conditions.some((c) => c.code === '0'));
});

test('a conforming copy passes and a drifted one is rejected', () => {
  const good = victimConditions.conditions.map((c) => ({ ...c }));
  assert.deepStrictEqual(checkVictimConditions(good), []);

  const relabelled = good.map((c, i) => (i === 0 ? { ...c, label: 'Fine' } : c));
  assert.ok(checkVictimConditions(relabelled).length > 0, 'a changed label must be caught');

  const recoded = good.map((c, i) => (i === 0 ? { ...c, code: '9' } : c));
  assert.ok(checkVictimConditions(recoded).length > 0, 'a changed wire code must be caught');

  // Order is the UI order the resident reads, so it is part of the contract.
  const reordered = [good[1], good[0], ...good.slice(2)];
  assert.ok(checkVictimConditions(reordered).length > 0, 'reordering must be caught');

  assert.ok(checkVictimConditions(good.slice(1)).length > 0, 'a dropped condition must be caught');
});

// ── The SMS token ──────────────────────────────────────────────────────────

test('every vector is a 10-char hex token', () => {
  assert.ok(smsTokenVectors.vectors.length >= 5, 'too few vectors to be convincing');
  for (const v of smsTokenVectors.vectors) {
    assert.match(v.token, /^[0-9a-f]{10}$/, `${v.body.slice(0, 24)}…`);
  }
});

test('the vectors are truly HMAC-SHA256 truncated to 10 hex chars', () => {
  // Recomputed here from node:crypto rather than trusted, so a mistake in the
  // generator cannot silently become the standard every app is held to.
  for (const { body, secret, token } of smsTokenVectors.vectors) {
    const expected = crypto.createHmac('sha256', secret).update(body, 'utf8')
      .digest('hex').slice(0, smsTokenVectors.tokenHexChars);
    assert.strictEqual(token, expected, `vector for ${body.slice(0, 24)}… is wrong`);
  }
});

test('the vectors cover every message type and awkward secret shapes', () => {
  const bodies = smsTokenVectors.vectors.map((v) => v.body);
  for (const kind of ['SOS MESSAGE', '|DSP|', '|ACK|', '|EWS|', '|CHK|']) {
    assert.ok(bodies.some((b) => b.includes(kind)), `no vector covers ${kind}`);
  }
  const secrets = smsTokenVectors.vectors.map((v) => v.secret);
  assert.ok(secrets.some((s) => s.length < 32), 'no short-secret vector');
  assert.ok(secrets.some((s) => /[^\x00-\x7F]/.test(s)),
    'no non-ASCII secret vector — UTF-8 handling is exactly where a hand-written HMAC drifts');
});

test('a conforming implementation passes and a broken one is rejected', () => {
  const good = (body, secret) => crypto.createHmac('sha256', secret)
    .update(body, 'utf8').digest('hex').slice(0, 10);
  assert.deepStrictEqual(checkSmsToken(good), []);

  const tooLong = (body, secret) => crypto.createHmac('sha256', secret)
    .update(body, 'utf8').digest('hex').slice(0, 12);
  assert.ok(checkSmsToken(tooLong).length > 0, 'wrong truncation must be caught');

  const wrongAlgo = (body, secret) => crypto.createHmac('sha1', secret)
    .update(body, 'utf8').digest('hex').slice(0, 10);
  assert.ok(checkSmsToken(wrongAlgo).length > 0, 'wrong algorithm must be caught');

  const throws = () => { throw new Error('boom'); };
  assert.ok(checkSmsToken(throws).length > 0, 'a throwing implementation must be reported, not crash');
});
