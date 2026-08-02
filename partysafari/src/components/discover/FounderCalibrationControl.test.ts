import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FounderCalibrationControl, {
  type FounderCalibrationControlProps,
  type FounderCalibrationTarget,
} from "@/components/discover/FounderCalibrationControl";
import type { CalibrationSubmitOutcome } from "@/lib/calibrationFeedback";

const onSubmit: FounderCalibrationControlProps["onSubmit"] = async () => ({ status: "ok" }) as CalibrationSubmitOutcome;

function render(targets: readonly FounderCalibrationTarget[]): string {
  return renderToStaticMarkup(createElement(FounderCalibrationControl, { targets, onSubmit }));
}

test("a non-approved viewer gets no calibration markup whatsoever", () => {
  const markup = render([]);

  assert.equal(markup, "");
  for (const fragment of ["Founder", "calibration", "Accurate", "Inaccurate", "hidden", "sr-only", "<"]) {
    assert.equal(markup.includes(fragment), false, `expected no "${fragment}" in a non-approved render`);
  }
});

test("the control is not hidden by styling when it is absent", () => {
  assert.equal(render([]).length, 0);
  assert.ok(render([{ feature: "aiDiscoverCards", label: "Card" }]).length > 0);
});

test("an approved viewer gets one Accurate/Inaccurate pair per target", () => {
  const markup = render([
    { feature: "aiDiscoverCards", label: "Card" },
    { feature: "crowdPulse", label: "Pulse" },
  ]);

  assert.ok(markup.includes("Founder calibration"));
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
  assert.equal(markup.split('type="button"').length - 1, 2);
  assert.equal(markup.includes("focus-visible:ring-2"), true);
  assert.equal(markup.split("min-h-11").length - 1, 3);
  const labelMatch = markup.match(/<label[^>]*for="([^"]+)"/);
  assert.ok(labelMatch);
  assert.ok(markup.includes(`id="${labelMatch![1]}"`));
  assert.ok(markup.includes('maxLength="500"'));
  assert.ok(markup.includes('aria-live="polite"'));
});
