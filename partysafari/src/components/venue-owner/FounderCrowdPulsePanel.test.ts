import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildFounderCrowdPulseCalibrationDraft,
  buildFounderCrowdPulseViewModel,
  FounderCrowdPulsePanelContent,
  shouldRenderFounderCrowdPulsePanel,
  type VenueOwnerCrowdPulseVenue,
} from "@/components/venue-owner/FounderCrowdPulsePanel";
import { buildPartyScoreFromSignals, emptyPartyScore } from "@/lib/partyScore";
import { emptyCrowdPulse } from "@/lib/crowdPulse";
import type { CrowdPulseResult } from "@/lib/crowdPulseTypes";
import { explainVenue } from "@/lib/psi";
import type { CalibrationSubmitOutcome } from "@/lib/calibrationFeedback";

const VENUE: VenueOwnerCrowdPulseVenue = {
  id: "venue-123",
  name: "The Neon Harbor",
  city: "Ocean City",
  state: "MD",
  current_status: "Open",
};

function makePartyScore(overrides: Partial<Parameters<typeof buildPartyScoreFromSignals>[0]["signals"]> = {}) {
  return buildPartyScoreFromSignals({
    venueId: VENUE.id,
    signals: {
      liveCheckins: 0,
      activeStories: 0,
      storyReactions: 0,
      activeEvents: 0,
      friendPresence: 0,
      goingRsvps: 0,
      interestedRsvps: 0,
      recentActivity: 0,
      recentCheckins: 0,
      recentStories: 0,
      recentStoryReactions: 0,
      recentRsvpActivity: 0,
      recentEventActivity: 0,
      recentFriendActivity: 0,
      litSignals: 0,
      recentLitSignals: 0,
      litDecayWeight: 0,
      ...overrides,
    },
    confidence: 0.94,
    updatedAt: "2026-08-03T23:15:00.000Z",
  });
}

function makeCrowdPulse(overrides: Partial<CrowdPulseResult> = {}): CrowdPulseResult {
  const base: CrowdPulseResult = emptyCrowdPulse("2026-08-03T23:15:00.000Z");
  return {
    ...base,
    ...overrides,
    buckets: overrides.buckets || base.buckets,
    summary: overrides.summary || base.summary,
  };
}

function render(model: ReturnType<typeof buildFounderCrowdPulseViewModel>, loading = false, error: string | null = null) {
  return renderToStaticMarkup(
    createElement(FounderCrowdPulsePanelContent, {
      loading,
      error,
      model,
      onRetry: () => undefined,
      onSubmitCalibration: async () => ({ status: "ok" } as CalibrationSubmitOutcome),
    })
  );
}

test("the panel stays absent for signed-out viewers", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: false,
      viewerLoading: false,
      allowed: true,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: true,
    }),
    false
  );
});

test("the panel stays absent for unresolved viewer context", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: true,
      viewerLoading: true,
      allowed: true,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: true,
    }),
    false
  );
});

test("the panel stays absent for non-allowlisted viewers", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: true,
      viewerLoading: false,
      allowed: false,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: true,
    }),
    false
  );
});

test("the panel stays absent when the dashboard is not on overview", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: true,
      viewerLoading: false,
      allowed: true,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: false,
    }),
    false
  );
});

test("the panel is visible for the founder allowlist", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: true,
      viewerLoading: false,
      allowed: true,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: true,
    }),
    true
  );
});

test("the calibration payload keeps the actual venue uuid", () => {
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: makePartyScore({ liveCheckins: 5, activeStories: 2, activeEvents: 1, litSignals: 1 }),
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(makePartyScore({ liveCheckins: 5, activeStories: 2, activeEvents: 1, litSignals: 1 })),
  });

  const draft = buildFounderCrowdPulseCalibrationDraft({ model, accurate: true, note: "Matched the room." });
  assert.equal(draft.venueId, VENUE.id);
});

test("the calibration payload carries the raw pulse level and canonical reason codes", () => {
  const score = makePartyScore({ liveCheckins: 5, activeStories: 2, activeEvents: 1, litSignals: 1 });
  const explanation = explainVenue(score);
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse({
      buckets: [
        {
          id: "cp:1:1",
          label: "38.335° N, 75.085° W",
          center: { lat: 38.335, lng: -75.085 },
          intensity: 0.68,
          weightedIntensity: 27.2,
          level: "busy",
          trend: "rising",
          signalCounts: { checkin: 5, story: 2, event: 1, rsvpGoing: 0, rsvpInterested: 0, lit: 1 },
          contributorCount: 4,
          contributorFloorMet: true,
          confidence: 0.86,
          venueIds: [VENUE.id],
          updatedAt: "2026-08-03T23:12:00.000Z",
        },
      ],
      summary: {
        updatedAt: "2026-08-03T23:12:00.000Z",
        hasSignal: true,
        reportedBucketCount: 1,
        suppressedBucketCount: 0,
        venueCount: 1,
        excludedVenueCount: 0,
        totalWeightedIntensity: 27.2,
        peakLevel: "busy",
        trend: "rising",
      },
    }),
    psi: explanation,
  });

  const draft = buildFounderCrowdPulseCalibrationDraft({ model, accurate: false, note: null });
  assert.equal(draft.crowdPulseLevel, "busy");
  assert.deepEqual(draft.reasonCodes, explanation.reasons.map((reason) => reason.id));
});

test("the rendered panel shows the real Party Score", () => {
  const score = makePartyScore({ liveCheckins: 7, activeStories: 3, litSignals: 2, recentActivity: 4 });
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(score),
  });

  const markup = render(model);
  assert.match(markup, new RegExp(`>\\s*${model.partyScore.score}\\s*<`));
  assert.match(markup, /Party Score/);
  assert.match(markup, /Holding steady|Climbing|Cooling/);
});

test("the existing PSI explanation is reused in the panel", () => {
  const score = makePartyScore({ friendPresence: 2, liveCheckins: 6, activeStories: 1 });
  const explanation = explainVenue(score);
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse(),
    psi: explanation,
  });

  const markup = render(model);
  assert.match(markup, new RegExp(explanation.headline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(model.psiReasons.every((reason) => explanation.reasons.some((candidate) => candidate.id === reason.id)));
});

test("the low-data state is truthful", () => {
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: null,
    partyScore: emptyPartyScore(VENUE.id),
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(emptyPartyScore(VENUE.id)),
  });

  const markup = render(model);
  assert.match(markup, /Building tonight&#x27;s pulse/);
  assert.match(markup, /check-ins, stories, events, and Lit activity/);
});

test("privacy-floor suppression does not expose hidden counts", () => {
  const score = makePartyScore({ liveCheckins: 3 });
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: null,
    partyScore: score,
    crowdPulse: makeCrowdPulse({
      buckets: [
        {
          id: "cp:1:1",
          label: "38.335° N, 75.085° W",
          center: { lat: 38.335, lng: -75.085 },
          intensity: 0,
          weightedIntensity: 0,
          level: "no-signal",
          trend: "flat",
          signalCounts: { checkin: 0, story: 0, event: 0, rsvpGoing: 0, rsvpInterested: 0, lit: 0 },
          contributorCount: 0,
          contributorFloorMet: false,
          confidence: 0,
          venueIds: [VENUE.id],
          updatedAt: "2026-08-03T23:12:00.000Z",
        },
      ],
      summary: {
        updatedAt: "2026-08-03T23:12:00.000Z",
        hasSignal: false,
        reportedBucketCount: 0,
        suppressedBucketCount: 1,
        venueCount: 1,
        excludedVenueCount: 0,
        totalWeightedIntensity: 0,
        peakLevel: "no-signal",
        trend: "flat",
      },
    }),
    psi: explainVenue(score),
  });

  const markup = render(model);
  assert.match(markup, /Below privacy threshold/);
  assert.equal(markup.includes("contributorCount"), false);
  assert.equal(markup.includes("suppressedBucketCount"), false);
});

test("signal summary keeps only real existing signals", () => {
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: makePartyScore({ liveCheckins: 8, activeStories: 2, activeEvents: 1, litSignals: 2, recentLitSignals: 1 }),
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(makePartyScore({ liveCheckins: 8, activeStories: 2, activeEvents: 1, litSignals: 2, recentLitSignals: 1 })),
  });

  const markup = render(model);
  assert.match(markup, /Live check-ins/);
  assert.match(markup, /Active stories/);
  assert.match(markup, /Active events/);
  assert.match(markup, /Lit activity/);
  assert.equal(markup.includes("Recent activity"), false);
});

test("calibration control is withheld until there is something meaningful to rate", () => {
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: null,
    partyScore: emptyPartyScore(VENUE.id),
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(emptyPartyScore(VENUE.id)),
  });

  const markup = render(model);
  assert.equal(markup.includes("Founder calibration"), false);
});

test("the panel markup stays free of AI Discover copy", () => {
  const score = makePartyScore({ liveCheckins: 6, activeStories: 1 });
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(score),
  });

  const markup = render(model);
  assert.equal(markup.includes("AI says"), false);
  assert.equal(markup.includes("AI Discover"), false);
});

test("the loading state stays compact and non-blocking", () => {
  const score = makePartyScore({ liveCheckins: 4, activeStories: 1 });
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(score),
  });

  const markup = render(model, true);
  assert.match(markup, /animate-pulse/);
  assert.equal(markup.includes("Founder calibration"), false);
});

test("the error state announces a compact retry affordance", () => {
  const score = makePartyScore({ liveCheckins: 4, activeStories: 1 });
  const model = buildFounderCrowdPulseViewModel({
    venue: VENUE,
    programmedEventTitle: "Peak Set",
    partyScore: score,
    crowdPulse: makeCrowdPulse(),
    psi: explainVenue(score),
  });

  const markup = render(model, false, "Could not read Crowd Pulse right now.");
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Retry/);
});

test("sign-out or session loss hides the panel again", () => {
  assert.equal(
    shouldRenderFounderCrowdPulsePanel({
      authenticated: false,
      viewerLoading: false,
      allowed: true,
      venueId: VENUE.id,
      venueHasScope: true,
      overviewTabActive: true,
    }),
    false
  );
});
