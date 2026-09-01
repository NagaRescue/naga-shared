// Renders each app's barangay boundary file from the canonical dataset.
//
// Why generated copies rather than a runtime import: this is a disaster-response
// system whose maps have to render with no network, so the boundaries are
// bundled into each app rather than fetched. comcen builds with vite and the
// mobile apps with Metro, and neither resolves imports from outside its own
// package root without extra configuration — so the data is copied in, and the
// copies are produced from here instead of by hand.
//
// Hand-syncing is exactly what failed before: comcen's boundaries were replaced
// with the official COD dataset in f8d9e01, barangayApp's copy was not, and the
// two silently disagreed for months — 0 of 27 barangays matched, with Pacol out
// by 1.4 km and 33 impossible interior holes still in the map an operator was
// looking at during a flood.
//
// This module used to be scripts/sync-barangay-boundaries.mjs in the monorepo,
// where it wrote all three copies in one pass because it could see all three
// working trees. Each app is now its own repository, so no single process can
// reach them: the renderers live here, and each consuming repo runs `naga-sync`
// against its own target. `--check` still runs in each app's test suite, so a
// stale copy fails that app's CI exactly as before.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const canonical = JSON.parse(
  fs.readFileSync(path.join(HERE, 'naga-barangays.json'), 'utf8'),
);

const { barangays, source } = canonical;

const banner = (relPath) =>
  [
    'GENERATED FILE — DO NOT EDIT BY HAND.',
    '',
    'Source of truth: naga-barangays.json in @naga-rescue/shared',
    'Regenerate with: npm run sync:barangays',
    '',
    `Dataset: ${source.dataset}`,
    `  layer ${source.layer}, version ${source.version}, valid_on ${source.validOn}`,
    `  filtered to ${source.filteredTo}`,
    `  CRS ${source.crs}; coordinates are ${source.coordinateOrder}`,
    `  rounded to ${source.precision}`,
    '',
    ...source.notes,
    '',
    `This copy: ${relPath}`,
  ]
    .map((l) => (l ? `// ${l}` : '//'))
    .join('\n');

/** Coordinates, one [lng, lat] pair per line, matching the previous hand-written layout. */
const coordBlock = (coords, indent) =>
  coords.map(([lng, lat]) => `${indent}[${lng}, ${lat}],`).join('\n');

function renderFeatures() {
  return barangays
    .map((b) => {
      const head = `  {\n    // PSGC ${b.psgc}\n    name: ${JSON.stringify(b.name)},\n    coordinates: [\n`;
      return `${head}${coordBlock(b.coordinates, '      ')}\n    ],\n  },`;
    })
    .join('\n');
}

function renderColors() {
  const byName = new Map(barangays.map((b) => [b.name, b.borderColor]));
  // borderColorOrder is a hand-chosen sequence that spreads similar hues apart
  // so neighbouring barangays contrast. Lookup is by name so the order is
  // cosmetic, but preserving it keeps the generated file diff-free.
  const order = canonical.borderColorOrder?.length
    ? canonical.borderColorOrder
    : barangays.map((b) => b.name);
  const missing = order.filter((n) => !byName.has(n));
  const extra = [...byName.keys()].filter((n) => !order.includes(n));
  if (missing.length) throw new Error('borderColorOrder names not in dataset: ' + missing.join(', '));
  if (extra.length) throw new Error('barangays missing from borderColorOrder: ' + extra.join(', '));

  // Values align in a single column, four spaces past the longest key — the
  // layout the file already had, so regenerating leaves no whitespace diff.
  const keyWidth = Math.max(...order.map((n) => JSON.stringify(n).length + 1)) + 4;
  return order
    .map((n) => `  ${(JSON.stringify(n) + ':').padEnd(keyWidth)} ${JSON.stringify(byName.get(n))},`)
    .join('\n');
}

// Keyed by consuming repository. `file` is relative to that repo's root, which
// is the process working directory when `naga-sync` runs.
export const TARGETS = {
  comcen: {
    // TypeScript, consumed by NagaCityMap.tsx and Deployment.tsx.
    file: 'src/data/nagaGeoJSON.ts',
    render: () => `${banner('comcen/src/data/nagaGeoJSON.ts')}

export interface BarangayFeature {
  name: string;
  coordinates: [number, number][];
}

export const NAGA_BARANGAYS: BarangayFeature[] = [
${renderFeatures()}
];

export const BARANGAY_BORDER_COLORS: Record<string, string> = {
${renderColors()}
};
`,
  },

  backend: {
    // CommonJS, consumed by src/utils/incidentBarangay.js to resolve an SOS's
    // coordinates to the barangay that owns it (T-04-2).
    //
    // src/constants/nagaBarangays.js used to say the backend "only needs the
    // names and should not carry 456 KB of polygon data to check a string".
    // That was true while the backend only validated names. Decision D-9 made
    // the incident's barangay the one that receives the SOS, which is a
    // point-in-polygon question, and no amount of name-checking answers it.
    // The names file stays — it is still what validates a PUT payload.
    file: 'src/constants/nagaBoundaries.js',
    render: () => `${banner('NagaRescueBackend/src/constants/nagaBoundaries.js')}

// Rings are closed [lng, lat] loops, GeoJSON coordinate order. Note that this
// is the OPPOSITE order from every lat/lng pair elsewhere in the backend —
// resolveIncidentBarangay() is the only caller and it does the swap once.
const NAGA_BARANGAY_BOUNDARIES = [
${renderFeatures()}
];

module.exports = { NAGA_BARANGAY_BOUNDARIES };
`,
  },

  barangayApp: {
    // Plain JS for Metro, consumed by app/evacuation.jsx.
    file: 'assets/data/nagaGeoJSON.js',
    render: () => `${banner('barangayApp/assets/data/nagaGeoJSON.js')}

export const NAGA_BARANGAYS = [
${renderFeatures()}
];

export const BARANGAY_BORDER_COLORS = {
${renderColors()}
};
`,
  },
};

/**
 * Writes (or, with `check`, verifies) one target inside `cwd`.
 * Returns { key, file, status } where status is 'ok' | 'wrote' | 'stale'.
 */
export function syncTarget(key, { cwd = process.cwd(), check = false } = {}) {
  const target = TARGETS[key];
  if (!target) {
    throw new Error(
      `unknown target "${key}" — expected one of: ${Object.keys(TARGETS).join(', ')}`,
    );
  }

  const abs = path.join(cwd, target.file);
  const next = target.render();
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;

  if (current === next) return { key, file: target.file, status: 'ok' };
  if (check) return { key, file: target.file, status: 'stale' };

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, next);
  return { key, file: target.file, status: 'wrote' };
}
