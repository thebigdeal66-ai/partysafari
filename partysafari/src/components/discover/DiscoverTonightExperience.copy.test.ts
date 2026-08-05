import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Crowd Pulse is the primary discover section and legacy labels are removed", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");

  assert.equal(source.includes('eyebrow="LIVE NIGHTLIFE INTELLIGENCE"'), true);
  assert.equal(source.includes('title="Crowd Pulse"'), true);
  assert.equal(
    source.includes(
      'description="See where tonight\'s energy is building through live check-ins, stories, events, and activity."'
    ),
    true
  );

  assert.equal(source.includes("Hot Right Now"), false);
  assert.equal(source.includes("Top venues ranked by Party Score"), false);
  assert.equal(source.includes("Open Live Map"), false);
});

test("hero CTA text is View Crowd Pulse and still routes to /map", () => {
  const source = readSource("src/components/discover/DiscoverHero.tsx");
  assert.equal(source.includes('href="/map"'), true);
  assert.equal(source.includes("View Crowd Pulse"), true);
});

test("venue cards keep Party Score as a supporting metric", () => {
  const source = readSource("src/components/discover/VenuePartyCard.tsx");
  assert.equal(source.includes("Crowd Pulse State"), true);
  assert.equal(source.includes("Party Score"), true);
});

test("low-data copy is truthful and launch-ready", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  assert.equal(source.includes("Building tonight's pulse"), true);
  assert.equal(
    source.includes("Live check-ins, stories, events, and Lit activity will shape this venue's pulse as the night develops."),
    true
  );
  assert.equal(source.includes("Activity is currently below the privacy threshold."), true);
});

test("founder gating and AI Discover gating remain unchanged", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  assert.equal(source.includes("founderCrowdPulseAccess ? ("), true);
  assert.equal(source.includes("FounderCalibrationControl"), true);
  assert.equal(source.includes("aiCards.enabled ? ("), true);
});

test("no invented profile fields or predictive claims were introduced", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  for (const fragment of [
    "average age",
    "wait time",
    "predicted",
    "forecast",
    "followers",
    "demographic",
    "dance-floor",
    "% growth",
  ]) {
    assert.equal(source.toLowerCase().includes(fragment), false);
  }
});
