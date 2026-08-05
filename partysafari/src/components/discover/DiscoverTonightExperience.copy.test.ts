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
  const adapterSource = readSource("src/components/discover/VenuePartyCard.tsx");
  const cardSource = readSource("src/components/crowd-pulse/CrowdPulseCard.tsx");
  assert.equal(adapterSource.includes("CrowdPulseCard"), true);
  assert.equal(cardSource.includes("Party Score"), true);
});

test("radar surfaces render the same crowd pulse values", () => {
  const source = readSource("src/components/radar/SafariRadarExperience.tsx");
  assert.equal(source.includes("CrowdPulseCard"), true);
  assert.equal(source.includes("Open on Map"), true);
  assert.equal(source.includes("Crowd Pulse ≥"), true);
});

test("shared crowd pulse card carries the new v2 venue signals", () => {
  const adapterSource = readSource("src/components/discover/VenuePartyCard.tsx");
  const source = readSource("src/components/crowd-pulse/CrowdPulseCard.tsx");
  for (const fragment of ["Live Check-ins", "Stories", "Lit Activity", "Saves"]) {
    assert.equal(adapterSource.includes(fragment), true);
  }
  for (const fragment of [
    "Current Vibe",
    "Peak Tonight",
    "Waiting for activity",
    "The first check-ins, stories, events, and activity will bring this venue to life.",
  ]) {
    assert.equal(source.includes(fragment), true);
  }
});

test("low-data copy is truthful and launch-ready", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  assert.equal(source.includes("Building tonight's pulse"), true);
  assert.equal(
    source.includes("Live check-ins, stories, events, and Lit activity will shape this venue's pulse as the night develops."),
    true
  );
  assert.equal(source.includes("Activity is currently below the privacy threshold."), true);
  const cardSource = readSource("src/components/crowd-pulse/CrowdPulseCard.tsx");
  assert.equal(
    cardSource.includes("The first check-ins, stories, events, and activity will bring this venue to life."),
    true
  );
  const radarSource = readSource("src/components/radar/SafariRadarExperience.tsx");
  assert.equal(radarSource.includes("Nothing is trending nearby yet."), true);
  assert.equal(
    radarSource.includes("Building tonight&apos;s pulse. We&apos;re collecting live check-ins, stories, events, and venue activity."),
    true
  );
});

test("founder gating and AI Discover gating remain unchanged", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  assert.equal(source.includes("founderCrowdPulseAccess ? ("), true);
  assert.equal(source.includes("FounderCalibrationControl"), true);
  assert.equal(source.includes("Founder Calibration"), true);
  assert.equal(source.includes("<details"), true);
  assert.equal(source.includes("aiCards.enabled ? ("), true);
});

test("non-founders have no founder container in render path", () => {
  const source = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  assert.equal(source.includes("founderCrowdPulseAccess ? ("), true);
  assert.equal(source.includes("Founder-only detail"), true);
});

test("reduced-motion support is present in shared pulse animations", () => {
  const meterSource = readSource("src/components/crowd-pulse/CrowdPulseMeter.tsx");
  const trendSource = readSource("src/components/crowd-pulse/CrowdPulseTrend.tsx");
  const cardSource = readSource("src/components/crowd-pulse/CrowdPulseCard.tsx");

  assert.equal(meterSource.includes("prefers-reduced-motion: reduce"), true);
  assert.equal(trendSource.includes("prefers-reduced-motion: reduce"), true);
  assert.equal(cardSource.includes("prefers-reduced-motion: reduce"), true);
});

test("radar empty states use truthful language and expected actions", () => {
  const source = readSource("src/components/radar/SafariRadarExperience.tsx");
  assert.equal(source.includes("Nothing is trending nearby yet."), true);
  assert.equal(source.includes("Browse Events"), true);
  assert.equal(source.includes("Explore Venues"), true);
  assert.equal(source.includes("Expand Search Radius"), true);
});

test("no Dashboard tab text was introduced in Discover or Radar implementations", () => {
  const discoverSource = readSource("src/components/discover/DiscoverTonightExperience.tsx");
  const radarSource = readSource("src/components/radar/SafariRadarExperience.tsx");

  assert.equal(discoverSource.includes("Dashboard"), false);
  assert.equal(radarSource.includes("Dashboard"), false);
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
