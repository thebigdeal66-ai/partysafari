import assert from "node:assert/strict";
import test from "node:test";
import {
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
