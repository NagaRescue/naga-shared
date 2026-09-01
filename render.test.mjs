// Guards the canonical dataset and the renderers that copy it into each app.
//
// In the monorepo this role was split across three per-app test files that each
// read ../../shared/naga-barangays.json. Those still exist, and still guard each
// app's committed copy against this dataset. What they cannot do any more is
// catch a fault in the dataset itself before it is published — they only run
// once an app has already pulled a new version. These tests run here, first.

import test from 'node:test';
import assert from 'node:assert';
import { canonical, TARGETS } from './render.mjs';

const EXPECTED_COUNT = 27;

test('the dataset holds all 27 Naga City barangays, uniquely named', () => {
  assert.strictEqual(canonical.barangays.length, EXPECTED_COUNT);
  const names = canonical.barangays.map((b) => b.name);
  assert.strictEqual(new Set(names).size, EXPECTED_COUNT, 'names must be unique');
});

test('every barangay carries a PSGC code, a border colour and a closed ring', () => {
  for (const b of canonical.barangays) {
    assert.match(b.psgc, /^PH\d+$/, `${b.name}: PSGC code`);
    assert.match(b.borderColor, /^#[0-9a-fA-F]{6}$/, `${b.name}: border colour`);
    assert.ok(b.coordinates.length >= 4, `${b.name}: a ring needs at least 4 points`);

    const [firstLng, firstLat] = b.coordinates[0];
    const [lastLng, lastLat] = b.coordinates[b.coordinates.length - 1];
    assert.deepStrictEqual(
      [firstLng, firstLat],
      [lastLng, lastLat],
      `${b.name}: ring must close — first and last point differ`,
    );
  }
});

test('coordinates are [lng, lat] and land inside the Bicol region', () => {
  // Naga City sits near 13.62 N, 123.19 E. Catching a swapped pair matters:
  // latitude in the longitude slot puts the whole city in the Gulf of Guinea.
  for (const b of canonical.barangays) {
    for (const [lng, lat] of b.coordinates) {
      assert.ok(lng > 122.5 && lng < 124.0, `${b.name}: longitude ${lng} out of range`);
      assert.ok(lat > 13.0 && lat < 14.2, `${b.name}: latitude ${lat} out of range`);
    }
  }
});

test('borderColorOrder covers the dataset exactly', () => {
  const order = canonical.borderColorOrder;
  assert.deepStrictEqual(
    [...order].sort(),
    canonical.barangays.map((b) => b.name).sort(),
    'borderColorOrder and the barangay list must name the same 27 places',
  );
});

test('every renderer emits all 27 barangays and is deterministic', () => {
  for (const [key, target] of Object.entries(TARGETS)) {
    const once = target.render();
    assert.strictEqual(once, target.render(), `${key}: render is not deterministic`);
    for (const b of canonical.barangays) {
      assert.ok(
        once.includes(JSON.stringify(b.name)),
        `${key}: output is missing ${b.name}`,
      );
    }
    assert.ok(once.startsWith('// GENERATED FILE'), `${key}: missing generated-file banner`);
  }
});
