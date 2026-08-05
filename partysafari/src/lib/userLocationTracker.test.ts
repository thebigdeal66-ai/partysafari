import { strict as assert } from "node:assert";

// The tracker is browser-only. This test documents its cache contract without
// importing DOM globals into the Node test runner.
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function isFresh(savedAt: number, now: number) {
  return Number.isFinite(savedAt) && now - savedAt <= CACHE_MAX_AGE_MS;
}

assert.equal(isFresh(1_000, 1_000 + CACHE_MAX_AGE_MS), true);
assert.equal(isFresh(1_000, 1_001 + CACHE_MAX_AGE_MS), false);
assert.equal(isFresh(Number.NaN, 2_000), false);
