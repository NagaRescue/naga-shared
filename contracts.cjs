// Contracts every NagaRescue repository has to agree on, and the checker that
// proves it still does.
//
// The barangay boundaries solved this by generating each app's copy from one
// dataset. These two cannot be generated: the victim-condition helpers differ
// per app (residentApp encodes, barangayApp decodes and colours, the backend
// normalises and validates), and the SMS token is a hand-written pure-JS HMAC in
// the apps because React Native has no node:crypto. So the copies stay
// hand-written and this file checks them instead.
//
// The check runs in EACH repository's own CI, against its own copy. That is the
// part that matters. Until now the comparison lived only in the backend's test
// suite and reached across into the app directories, which worked while all six
// apps shared one checkout and silently stopped working when they became
// separate repositories — the assertions did not fail, they skipped, so drift
// would have been caught by nobody.
//
// What drift costs, concretely:
//   vocabulary — barangayApp decodes an SMS SOS with a code table that no longer
//                matches what residentApp encoded, so the victim's condition
//                arrives blank or wrong on the operator's board.
//   token      — an app signs with an HMAC the backend no longer reproduces, so
//                every SMS SOS from that app is rejected as unauthenticated.
// Both fail silently, offline, in a flood, which is the one situation the SMS
// path exists for.

// CommonJS on purpose, even though this package is type: module. The backend
// requires it from CJS, and the mobile apps import it through babel-jest, which
// compiles imports down to require. A .cjs file is the one shape both consume
// without extra configuration.
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const victimConditions = read('victim-conditions.json');
const smsTokenVectors = read('sms-token-vectors.json');

/**
 * Check a local victim-condition list against the canonical one.
 * `local` is the array of { value, code, label } the repository ships.
 * Returns an array of human-readable problems; empty means it conforms.
 */
function checkVictimConditions(local) {
    const problems = [];
    const canonical = victimConditions.conditions;

    if (!Array.isArray(local)) return ['local victim conditions is not an array'];

    if (local.length !== canonical.length) {
        problems.push(`has ${local.length} conditions, canonical has ${canonical.length}`);
    }

    // Order is part of the contract, not incidental: it is the order the
    // resident reads the options in, least to most acute.
    canonical.forEach((want, i) => {
        const got = local[i];
        if (!got) {
            problems.push(`missing ${want.value} at position ${i}`);
            return;
        }
        for (const field of ['value', 'code', 'label']) {
            if (got[field] !== want[field]) {
                problems.push(
                    `position ${i}: ${field} is ${JSON.stringify(got[field])}, ` +
                    `canonical is ${JSON.stringify(want[field])}`,
                );
            }
        }
    });

    for (const got of local) {
        if (got && !canonical.some((c) => c.value === got.value)) {
            problems.push(`${got.value} is not in the canonical vocabulary`);
        }
    }

    return problems;
}

/**
 * Check an implementation of the SMS token against the canonical vectors.
 * `generateToken(body, secret)` must return the 10-hex-char token.
 * Returns an array of human-readable problems; empty means it conforms.
 */
function checkSmsToken(generateToken) {
    const problems = [];
    for (const { body, secret, token } of smsTokenVectors.vectors) {
        let got;
        try {
            got = generateToken(body, secret);
        } catch (err) {
            problems.push(`threw on ${JSON.stringify(body.slice(0, 32))}…: ${err.message}`);
            continue;
        }
        if (got !== token) {
            problems.push(
                `${JSON.stringify(body.slice(0, 32))}… produced ${JSON.stringify(got)}, ` +
                `canonical is ${JSON.stringify(token)}`,
            );
        }
    }
    return problems;
}

module.exports = {
    victimConditions,
    smsTokenVectors,
    checkVictimConditions,
    checkSmsToken,
};
