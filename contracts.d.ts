// Types for contracts.cjs, shipped with the package so TypeScript consumers
// (the ComCen dashboard) get checking rather than `any`.

export interface VictimCondition {
    /** Stored value, e.g. "in_water". */
    value: string;
    /** Single-character SMS wire code, e.g. "3". "0" is reserved for not-reported. */
    code: string;
    /** Human label shown to residents and operators. */
    label: string;
}

export interface VictimConditionContract {
    notReportedLabel: string;
    conditions: VictimCondition[];
}

export interface SmsTokenVector {
    body: string;
    secret: string;
    /** The 10-hex-char token a conforming implementation must produce. */
    token: string;
}

export interface SmsTokenContract {
    algorithm: string;
    tokenHexChars: number;
    vectors: SmsTokenVector[];
}

export declare const victimConditions: VictimConditionContract;
export declare const smsTokenVectors: SmsTokenContract;

/**
 * Compare a repository's own victim-condition list against the canonical one.
 * Returns human-readable problems; an empty array means it conforms.
 */
export declare function checkVictimConditions(
    local: ReadonlyArray<Partial<VictimCondition>> | unknown,
): string[];

/**
 * Run an implementation of the SMS token against the canonical vectors.
 * Returns human-readable problems; an empty array means it conforms.
 */
export declare function checkSmsToken(
    generateToken: (body: string, secret: string) => string,
): string[];
