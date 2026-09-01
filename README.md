# @naga-rescue/shared

The canonical Naga City barangay dataset, and the generator that writes each
app's bundled copy of it.

## What's in here

| File | Purpose |
|---|---|
| `naga-barangays.json` | The dataset: 27 barangays with names, PSGC codes, border colours and boundary polygons |
| `naga_city_barangays_latlong.csv` | PSA centroids and bounding boxes, kept for provenance — the dataset was cross-checked against it |
| `render.mjs` | The renderers, one per consuming repository |
| `bin/sync.mjs` | The `naga-sync` CLI |

Source: OCHA/HDX Common Operational Dataset — Philippines Subnational
Administrative Boundaries, layer `phl_admin4` v03 (valid 2025-02-12), filtered to
`adm3_pcode PH0501724`, WGS84 (EPSG:4326), coordinates `[longitude, latitude]`,
rounded to 6 decimal places.

## Why the data is copied instead of imported

The maps must render with no network, so the boundaries are bundled into each app
rather than fetched. comcen builds with Vite and the mobile apps with Metro, and
neither resolves imports from outside its own package root without extra
configuration. So each app commits its own generated copy, produced from here.

Hand-syncing is what failed before. comcen's boundaries were replaced with the
official COD dataset in f8d9e01 and barangayApp's copy was not; the two disagreed
silently for months — 0 of 27 barangays matched, Pacol was out by 1.4 km, and 33
impossible interior holes stayed in a map an operator was reading during a flood.
The generator and the `--check` guard exist because of that.

## Consuming it

Add the dependency and the two scripts:

```jsonc
{
  "devDependencies": {
    "@naga-rescue/shared": "github:NagaRescue/naga-shared#v1.0.0"
  },
  "scripts": {
    "sync:barangays": "naga-sync <target>",
    "check:barangays": "naga-sync <target> --check"
  }
}
```

Targets, and the file each writes relative to its repo root:

| Target | Writes |
|---|---|
| `comcen` | `src/data/nagaGeoJSON.ts` |
| `backend` | `src/constants/nagaBoundaries.js` |
| `barangayApp` | `assets/data/nagaGeoJSON.js` |

`npm run check:barangays` runs in each consumer's CI and fails if that repo's
copy has drifted.

## Changing the dataset

1. Edit `naga-barangays.json` here. Never edit a generated file in a consuming repo.
2. `npm test` — the dataset guards run: 27 unique barangays, closed rings, PSGC
   codes, `[lng, lat]` ordering inside the Bicol bounding box, and
   `borderColorOrder` covering the set exactly.
3. Tag a release: `git tag v1.1.0 && git push --tags`.
4. In each consuming repo, bump the `#v1.x.y` ref, `npm install`, then
   `npm run sync:barangays`, and commit the regenerated file.

Step 4 is deliberate rather than automatic: a boundary change alters which
barangay receives an SOS, so it lands in each app as a reviewable commit.
