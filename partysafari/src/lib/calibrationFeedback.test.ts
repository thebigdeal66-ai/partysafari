import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH,
  CALIBRATION_NOTE_MAX_LENGTH,
  CALIBRATION_REASON_CODES_MAX_ENTRIES,
  CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH,
  CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH,
  buildCalibrationFeedbackRow,
  submitCalibrationFeedback,
  validateCalibrationFeedbackRow,
  type CalibrationFeedbackDraft,
  type CalibrationFeedbackRow,
} from "@/lib/calibrationFeedback";

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

type SupabaseState = { userIdCache?: { value: string | null; at: number }; userIdPromise?: unknown };
type SubmitOptions = NonNullable<Parameters<typeof submitCalibrationFeedback>[1]>;

function withSession(profileId: string | null, run: () => Promise<void>): Promise<void> {
  const globalRef = globalThis as typeof globalThis & { __partysafariSupabaseState__?: SupabaseState };
  const previous = globalRef.__partysafariSupabaseState__;
  globalRef.__partysafariSupabaseState__ = { userIdCache: { value: profileId, at: Date.now() }, userIdPromise: null };
  return run().finally(() => {
    globalRef.__partysafariSupabaseState__ = previous;
  });
}

function captureInserts(error: { code?: string; message?: string } | null) {
  const rows: CalibrationFeedbackRow[] = [];
  const supabase = {
    from: () => ({
      insert: async (row: CalibrationFeedbackRow) => {
        rows.push(row);
        return { error };
      },
    }),
  } as unknown as SubmitOptions["supabase"];
  return { rows, supabase };
}

test("the row is always attributed to the id passed in, never to the draft", () => {
  assert.equal(buildCalibrationFeedbackRow(DRAFT, FOUNDER_PROFILE_ID).profile_id, FOUNDER_PROFILE_ID);
  assert.equal(buildCalibrationFeedbackRow(DRAFT, OTHER_PROFILE_ID).profile_id, OTHER_PROFILE_ID);
});

test("a smuggled profile id on the draft cannot reach the row", () => {
  const smuggled = {
    ...DRAFT,
    profile_id: OTHER_PROFILE_ID,
    profileId: OTHER_PROFILE_ID,
    user_id: OTHER_PROFILE_ID,
    auth: { uid: OTHER_PROFILE_ID },
  } as unknown as CalibrationFeedbackDraft;

  const row = buildCalibrationFeedbackRow(smuggled, FOUNDER_PROFILE_ID);
  assert.equal(row.profile_id, FOUNDER_PROFILE_ID);
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

test("a signed-out caller writes nothing at all", async () => {
  await withSession(null, async () => {
    const { rows, supabase } = captureInserts(null);
    const outcome = await submitCalibrationFeedback(DRAFT, { supabase });

    assert.deepEqual(outcome, { status: "unauthenticated" });
    assert.equal(rows.length, 0);
  });
});

test("the inserted row is attributed to the session, not to anything the caller passed", async () => {
  await withSession(FOUNDER_PROFILE_ID, async () => {
    const { rows, supabase } = captureInserts(null);
    const smuggled = { ...DRAFT, profile_id: OTHER_PROFILE_ID } as unknown as CalibrationFeedbackDraft;
    const outcome = await submitCalibrationFeedback(smuggled, { supabase });

    assert.deepEqual(outcome, { status: "ok" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].profile_id, FOUNDER_PROFILE_ID);
  });
});

test("an over-long note is refused before the insert rather than by a 23514", async () => {
  await withSession(FOUNDER_PROFILE_ID, async () => {
    const { rows, supabase } = captureInserts(null);
    const outcome = await submitCalibrationFeedback(
      { ...DRAFT, note: "x".repeat(CALIBRATION_NOTE_MAX_LENGTH + 1) },
      { supabase }
    );

    assert.equal(outcome.status, "invalid");
    assert.equal(rows.length, 0);
  });
});

test("a missing table degrades to unavailable", async () => {
  await withSession(FOUNDER_PROFILE_ID, async () => {
    const { supabase } = captureInserts({ code: "42P01", message: 'relation "public.calibration_feedback" does not exist' });
    assert.deepEqual(await submitCalibrationFeedback(DRAFT, { supabase }), { status: "unavailable" });
  });
});

test("validation mirrors the CHECK constraints in db/021", () => {
  const base = buildCalibrationFeedbackRow(DRAFT, FOUNDER_PROFILE_ID);
  assert.equal(validateCalibrationFeedbackRow(base), null);

  assert.equal(validateCalibrationFeedbackRow({ ...base, note: "x".repeat(CALIBRATION_NOTE_MAX_LENGTH) }), null);
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, note: "x".repeat(CALIBRATION_NOTE_MAX_LENGTH + 1) }), null);

  assert.equal(validateCalibrationFeedbackRow({ ...base, recommendation_category: "x".repeat(CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH) }), null);
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, recommendation_category: "x".repeat(CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH + 1) }), null);

  assert.equal(validateCalibrationFeedbackRow({ ...base, displayed_psi_label: "x".repeat(CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH) }), null);
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, displayed_psi_label: "x".repeat(CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH + 1) }), null);

  assert.equal(validateCalibrationFeedbackRow({ ...base, reason_codes: Array.from({ length: CALIBRATION_REASON_CODES_MAX_ENTRIES }, (_, i) => `r${i}`) }), null);
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, reason_codes: Array.from({ length: CALIBRATION_REASON_CODES_MAX_ENTRIES + 1 }, (_, i) => `r${i}`) }), null);

  const oversizedPayload = Array.from({ length: 2 }, () => "x".repeat(400));
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, reason_codes: oversizedPayload }), null);

  const serialized = "{" + Array.from({ length: 2 }, (_, i) => `r${i}`).join(",") + "}";
  assert.equal(validateCalibrationFeedbackRow({ ...base, reason_codes: ["r0", "r1"] }), null);
  assert.notEqual(validateCalibrationFeedbackRow({ ...base, reason_codes: ["x".repeat(CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH)] }), null);
  assert.equal(serialized.length > CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH, false);
});
