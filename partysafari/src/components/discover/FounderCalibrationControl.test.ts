import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FounderCalibrationControl, {
  type FounderCalibrationControlProps,
  type FounderCalibrationTarget,
} from "@/components/discover/FounderCalibrationControl";
import type { CalibrationSubmitOutcome } from "@/lib/calibrationFeedback";

/**
 * Run with `npm test`. The claim being checked is "absent, not hidden": a
 * non-approved viewer must have no calibration markup in the tree at all, so
 * there is nothing for a devtools class toggle to reveal.
 *
 * Rendering is real, via `react-dom/server`, rather than a proxy assertion
 * about which props a parent would have passed. `AiDiscoverCards` decides
 * approval by handing this component an empty `targets` list — see
 * `calibrationTargets` there — so an empty list is precisely the non-approved
 * case.
 */

const onSubmit: FounderCalibrationControlProps["onSubmit"] = async () =>
  ({ status: "ok" }) as CalibrationSubmitOutcome;

function render(targets: readonly FounderCalibrationTarget[]): string {
  return renderToStaticMarkup(createElement(FounderCalibrationControl, { targets, onSubmit }));
}

// ---------------------------------------------------------------------------
// 9. Absent from the render tree for a non-approved profile
// ---------------------------------------------------------------------------

test("a non-approved viewer gets no calibration markup whatsoever", () => {
  const markup = render([]);

  assert.equal(markup, "");
  // Not merely invisible: none of the tell-tale strings, and no element at all.
  for (const fragment of ["Founder", "calibration", "Accurate", "Inaccurate", "hidden", "sr-only", "<"]) {
    assert.equal(markup.includes(fragment), false, `expected no "${fragment}" in a non-approved render`);
  }
});

test("the control is not hidden by styling when it is absent", () => {
  // A "hidden" implementation would still emit a wrapper; this asserts the
  // difference between the two failure modes explicitly.
  assert.equal(render([]).length, 0);
  assert.ok(render([{ feature: "aiDiscoverCards", label: "Card" }]).length > 0);
});

// ---------------------------------------------------------------------------
// ...and present, labelled and reachable for an approved one
// ---------------------------------------------------------------------------

test("an approved viewer gets one Accurate/Inaccurate pair per target", () => {
  const markup = render([
    { feature: "aiDiscoverCards", label: "Card" },
    { feature: "crowdPulse", label: "Pulse" },
  ]);

  assert.ok(markup.includes("Founder calibration"), "the control announces that it is internal");
  assert.equal(markup.split("Mark Card accurate").length - 1, 1);
  assert.equal(markup.split("Mark Card inaccurate").length - 1, 1);
  assert.equal(markup.split("Mark Pulse accurate").length - 1, 1);
  assert.equal(markup.split("Mark Pulse inaccurate").length - 1, 1);
});

test("only the targets offered are rendered", () => {
  const markup = render([{ feature: "crowdPulse", label: "Pulse" }]);

  assert.ok(markup.includes("Mark Pulse accurate"));
  assert.equal(markup.includes("Mark Card accurate"), false);
});

test("the buttons and the note are keyboard-reachable and touch-sized", () => {
  const markup = render([{ feature: "aiDiscoverCards", label: "Card" }]);

  // Real <button type="button"> elements, so they are tab-stops and respond to
  // Enter and Space without any key handling of our own.
  assert.equal(markup.split('type="button"').length - 1, 2);
  assert.equal(markup.includes("focus-visible:ring-2"), true);
  // 44px minimum on every interactive element, buttons and note input alike.
  assert.equal(markup.split("min-h-11").length - 1, 3);

  // The note is a labelled input, not a bare box.
  const labelMatch = markup.match(/<label[^>]*for="([^"]+)"/);
  assert.ok(labelMatch, "the note has a <label>");
  assert.ok(markup.includes(`id="${labelMatch![1]}"`), "the label points at the input");
  assert.ok(markup.includes('maxLength="500"'), "the note is capped at the DB CHECK length");

  // Status is announced rather than only shown.
  assert.ok(markup.includes('aria-live="polite"'));
});
