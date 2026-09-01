#!/usr/bin/env node
//
// Writes this repository's generated barangay boundary file from the canonical
// dataset, or verifies it is current.
//
//   naga-sync <target>            # write the copy
//   naga-sync <target> --check    # verify, exit 1 if stale
//
// Targets: comcen | backend | barangayApp
//
// Paths are resolved against the current working directory, so this is meant to
// be run from the consuming repository's root — which is what `npm run` does.

import { syncTarget, TARGETS } from '../render.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const key = args.find((a) => !a.startsWith('-'));

if (!key) {
  console.error(
    `usage: naga-sync <target> [--check]\n` +
    `targets: ${Object.keys(TARGETS).join(' | ')}`,
  );
  process.exit(2);
}

let result;
try {
  result = syncTarget(key, { check });
} catch (err) {
  console.error(`naga-sync: ${err.message}`);
  process.exit(2);
}

if (result.status === 'stale') {
  console.error(`  STALE  ${result.file}`);
  console.error(
    `\n${result.file} is out of sync with the canonical dataset.\n` +
    `Run: npm run sync:barangays`,
  );
  process.exit(1);
}

console.log(`  ${result.status === 'ok' ? 'ok   ' : 'wrote'}  ${result.file}`);
