import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrowdPulseSnapshot,
  createCrowdPulseCalibrationDraft,
  hasMeaningfulCrowdPulseSignals,
  resolveCrowdPulseCalibrationAnchor,
} from "@/lib/discoverCrowdPulse";

const VENUE_ID = "02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f";

test("normal ranking can remain visible with no founder-only anchor", () => {
  assert.equal(resolveCrowdPulseCalibrationAnchor([]), null);
});

test("valid venue uuid is carried into calibration payload", () => {
  const anchor = resolveCrowdPulseCalibrationAnchor([
    {
      id: VENUE_ID,
      name: "Neon Pier",
      liveCheckins: 4,
      storyCount: 2,
      currentEvents: 1,
      partyScore: { score: 87, crowdLevel: "busy" },
      psiExplanation: {
        venueId: VENUE_ID,
        headline: "The floor is moving right now.",
        reasons: [
          {
            id: "liveCheckins",
            text: "People are checked in.",
            evidence: { key: "liveCheckins", value: 4, points: 4 },
          },
        ],
        hasEvidence: true,
        caveat: null,
      },
    },
  ]);

  assert.ok(anchor);
  const draft = createCrowdPulseCalibrationDraft({
    anchor: anchor!,
    accurate: true,
    note: "Matched what we saw",
  });

  assert.equal(draft.venueId, VENUE_ID);
  assert.equal(draft.feature, "crowdPulse");
  assert.equal(draft.displayedPartyScore, 87);
  assert.equal(draft.displayedPsiLabel, "The floor is moving right now.");
  assert.equal(draft.crowdPulseLevel, "busy");
  assert.deepEqual(draft.reasonCodes, ["liveCheckins"]);
});

test("low-data signal detection stays truthful and binary", () => {
  assert.equal(
    hasMeaningfulCrowdPulseSignals([
      {
        id: "v-1",
        name: "Quiet Spot",
        liveCheckins: 0,
        storyCount: 0,
        currentEvents: 0,
      },
    ]),
    false
  );

  assert.equal(
    hasMeaningfulCrowdPulseSignals([
      {
        id: "v-2",
        name: "Late Room",
        liveCheckins: 1,
        storyCount: 0,
        currentEvents: 0,
      },
    ]),
    true
  );
});

test("crowd pulse snapshot keeps party score as primary live pulse when present", () => {
  const snapshot = buildCrowdPulseSnapshot({
    partyScore: {
      score: 78,
      trend: "up",
      momentum: 9,
      confidence: 0.82,
      crowdLevel: "Busy",
    },
    liveCheckins: 4,
    storyCount: 2,
    currentEvents: 1,
    friendsHere: 3,
    litSignals: 1,
  });

  assert.equal(snapshot.pulseScore, 78);
  assert.equal(snapshot.trendDirection, "up");
  assert.equal(snapshot.trendLabel, "Rising Fast");
  assert.equal(snapshot.momentum, 9);
  assert.equal(snapshot.confidenceScore, 82);
  assert.equal(snapshot.confidenceBand, "High");
  assert.equal(snapshot.stateLabel, "Busy");
  assert.equal(snapshot.energyLabel, "High");
  assert.equal(snapshot.source, "live");
  assert.equal(snapshot.activity.total, 11);
});

test("crowd pulse snapshot derives a safe fallback when live score is absent", () => {
  const snapshot = buildCrowdPulseSnapshot({
    liveCheckins: 2,
    storyCount: 1,
    currentEvents: 1,
    friendsHere: 1,
    litSignals: 0,
  });

  assert.equal(snapshot.pulseScore > 22, true);
  assert.equal(snapshot.source, "live");
  assert.equal(snapshot.trendDirection, "stable");
  assert.equal(snapshot.trendLabel, "Stable");
  assert.equal(snapshot.confidenceBand, "Medium");
  assert.equal(snapshot.confidenceScore >= 15, true);
  assert.equal(snapshot.activity.total, 5);
});

test("crowd pulse snapshot remains explicit in no-signal demo mode", () => {
  const snapshot = buildCrowdPulseSnapshot({});

  assert.equal(snapshot.pulseScore, 22);
  assert.equal(snapshot.source, "demo");
  assert.equal(snapshot.activity.total, 0);
  assert.equal(snapshot.energyLabel, "Low");
  assert.equal(snapshot.confidenceScore >= 15, true);
});
