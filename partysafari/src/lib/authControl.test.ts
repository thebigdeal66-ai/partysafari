import assert from "node:assert/strict";
import test from "node:test";
import {
  createSingleFlightTask,
  INITIAL_AUTH_CONTROL_STATE,
  reduceAuthControlState,
  toAuthControlView,
} from "@/lib/authControl";

function reduce(actions: Array<Parameters<typeof reduceAuthControlState>[1]>) {
  return actions.reduce(reduceAuthControlState, INITIAL_AUTH_CONTROL_STATE);
}

test("Sign In is shown when signed out", () => {
  const state = reduce([{ type: "session:resolved", userId: null }]);
  const view = toAuthControlView(state);
  assert.equal(view.signedOut, true);
  assert.equal(view.label, "Sign In");
});

test("Sign Out is shown when signed in", () => {
  const state = reduce([{ type: "session:resolved", userId: "u-1" }]);
  const view = toAuthControlView(state);
  assert.equal(view.signedIn, true);
  assert.equal(view.label, "Sign Out");
});

test("loading does not claim a signed-in control", () => {
  const view = toAuthControlView(INITIAL_AUTH_CONTROL_STATE);
  assert.equal(view.loading, true);
  assert.equal(view.signedIn, false);
  assert.equal(view.label, "Checking session...");
});

test("signout request immediately enters signing-out state", () => {
  const state = reduce([
    { type: "session:resolved", userId: "u-1" },
    { type: "signout:requested" },
  ]);
  const view = toAuthControlView(state);
  assert.equal(view.signingOut, true);
  assert.equal(view.label, "Signing out...");
});

test("signout success resolves to signed out", () => {
  const state = reduce([
    { type: "session:resolved", userId: "u-1" },
    { type: "signout:requested" },
    { type: "signout:succeeded" },
  ]);
  const view = toAuthControlView(state);
  assert.equal(view.signingOut, false);
  assert.equal(view.signedOut, true);
  assert.equal(view.label, "Sign In");
});

test("signout failure restores Sign Out and carries an error", () => {
  const state = reduce([
    { type: "session:resolved", userId: "u-1" },
    { type: "signout:requested" },
    { type: "signout:failed", message: "Network down" },
  ]);
  const view = toAuthControlView(state);
  assert.equal(view.signingOut, false);
  assert.equal(view.signedIn, true);
  assert.equal(view.label, "Sign Out");
  assert.equal(view.error, "Network down");
});

test("auth listener signed-out event clears stale signing-out", () => {
  const state = reduce([
    { type: "session:resolved", userId: "u-1" },
    { type: "signout:requested" },
    { type: "auth:changed", userId: null },
  ]);
  const view = toAuthControlView(state);
  assert.equal(view.signingOut, false);
  assert.equal(view.label, "Sign In");
});

test("expired session resolves signed out", () => {
  const state = reduce([{ type: "session:resolved", userId: null }]);
  assert.equal(toAuthControlView(state).signedOut, true);
});

test("duplicate signout work is single-flight", async () => {
  let calls = 0;
  let releaseGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  const flight = createSingleFlightTask(async () => {
    calls += 1;
    await gate;
    return { ok: true };
  });

  const first = flight();
  const second = flight();
  assert.equal(calls, 1);

  releaseGate();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);

  const third = flight();
  assert.equal(calls, 2);
  await third;
});