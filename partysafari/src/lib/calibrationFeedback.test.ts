import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATION_FEATURES,
  CALIBRATION_NOTE_MAX_LENGTH,
  buildCalibrationFeedbackRow,
  validateCalibrationFeedbackRow,
  type CalibrationFeedbackDraft,
} from "@/lib/calibrationFeedback";

/**
 * Run with `npm test`.
 *
 * The property under test is the client half of db/021's
 * `WITH CHECK (auth.uid() = profile_id)`: there must be no call shape that
 * writes a judgment attributed to somebody else. The database is the real
 * boundary and its enforcement cannot be exercised from this sandbox — db/021
 * is not applied to the live project — so what is asserted here is that the
 * only thing the client can send is the caller's own id.
 */

/** `public.profiles.id` for `thebigdeal66`. A fixture, as in `featureFlags.test.ts`. */
const FOUNDER_PROFILE_ID = "02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f";
const OTHER_PROFILE_ID = "11111111-2222-4333-8444-555555555555";

const DRAFT: CalibrationFeedbackDraft = {
  feature: "aiDiscoverCards",
  venueId: "venue-1",
  recommendationCategory: "packed",
  displayedPartyScore: 72,
  displayedPsiLabel: "Filling up fast",
  crowdPulseLevel: "busy",
  reasonCodes: ["checkins_rising", "live_music"],
  accurate: true,
  note: "Matched the room.",
};

// ---------------------------------------------------------------------------
// 8. A judgment can only ever be attributed to the caller
// ---------------------------------------------------------------------------

test("the row is always attributed to the id passed in, never to the draft", () => {
  assert.equal(buildCalibrationFeedbackRow(DRAFT, FOUNDER_PROFILE_ID).profile_id, FOUNDER_PROFILE_ID);
  assert.equal(buildCalibrationFeedbackRow(DRAFT, OTHER_PROFILE_ID).profile_id, OTHER_PROFILE_ID);
});

test("a smuggled profile id on the draft cannot reach the row", () => {
  // The draft type has no profile field, so this can only happen via a cast —
  // which is exactly the shape a future careless caller would reach for.
  const smuggled = {
    ...DRAFT,
    profile_id: OTHER_PROFILE_ID,
    profileId: OTHER_PROFILE_ID,
    user_id: OTHER_PROFILE_ID,
    auth: { uid: OTHER_PROFILE_ID },
  } as unknown as CalibrationFeedbackDraft;

  const row = buildCalibrationFeedbackRow(smuggled, FOUNDER_PROFILE_ID);
  assert.equal(row.profile_id, FOUNDER_PROFILE_ID);

  // And no extra key rode along into the insert payload.
  assert.deepEqual(Object.keys(row).sort(), [
    "accurate",
    "crowd_pulse_level",
    "displayed_party_score",
    "displayed_psi_label",
    "feature",
    "note",
    "profile_id",
    "reason_codes",
    "recommendation_category",
    "venue_id",
  ]);
});

test("the insert payload carries no column the migration does not declare", () => {
  // A row is a fixed, typed column list — there is no JSON blob to grow, and
  // nothing here can carry location, message, story or friend-list content.
  const row = buildCalibrationFeedbackRow(DRAFT, FOUNDER_PROFILE_ID);
  for (const value of Object.values(row)) {
    assert.ok(
      value === null || ["string", "number", "boolean"].includes(typeof value) || Array.isArray(value),
      "every column is a scalar or a string array"
    );
  }
  assert.deepEqual(row.reason_codes, ["checkins_rising", "live_music"]);
});

// ---------------------------------------------------------------------------
// The row mirrors the migration's own constraints
// ---------------------------------------------------------------------------

test("blank text degrades to null rather than to an empty string", () => {
  const row = buildCalibrationFeedbackRow(
    {
      feature: "crowdPulse",
      venueId: "  ",
      recommendationCategory: null,
      displayedPartyScore: Number.NaN,
      displayedPsiLabel: undefined,
      crowdPulseLevel: "",
      reasonCodes: ["", "   "],
      accurate: false,
      note: "   ",
    },
    FOUNDER_PROFILE_ID
  );

  assert.deepEqual(row, {
    profile_id: FOUNDER_PROFILE_ID,
    feature: "crowdPulse",
    venue_id: null,
    recommendation_category: null,
    displayed_party_score: null,
    displayed_psi_label: null,
    crowd_pulse_level: null,
    reason_codes: null,
    accurate: false,
    note: null,
  });
});

test("validation mirrors the CHECK constraints in db/021", () => {
  const base = buildCalibrationFeedbackRow(DRAFT, FOUNDER_PROFILE_ID);
  assert.equal(validateCalibrationFeedbackRow(base), null);

  assert.equal(
    validateCalibrationFeedbackRow({ ...base, note: "x".repeat(CALIBRATION_NOTE_MAX_LENGTH) }),
    null
  );
  assert.notEqual(
    validateCalibrationFeedbackRow({ ...base, note: "x".repeat(CALIBRATION_NOTE_MAX_LENGTH + 1) }),
    null
  );

  for (const feature of CALIBRATION_FEATURES) {
    assert.equal(validateCalibrationFeedbackRow({ ...base, feature }), null);
  }
  assert.notEqual(
    validateCalibrationFeedbackRow({
      ...base,
      feature: "partyScore" as (typeof CALIBRATION_FEATURES)[number],
    }),
    null
  );
});
