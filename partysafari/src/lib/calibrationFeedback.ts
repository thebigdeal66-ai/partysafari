import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";

/**
 * The write path for Founder calibration judgments (db/021).
 *
 * One row per judgment on one rendered recommendation, and nothing else. The
 * columns are an exact, typed list — there is no JSON blob to quietly grow, and
 * there is deliberately no column for location, movement, message or story
 * content, friend lists or attendee identity. What a founder can record here is
 * what was already on their own screen plus their verdict on it.
 *
 * **`profile_id` is not an input.** `buildCalibrationFeedbackRow` takes the
 * caller's own resolved id as a separate argument and the draft type has no
 * field for it, so there is no call shape that submits feedback as somebody
 * else. The `WITH CHECK (auth.uid() = profile_id)` policy in db/021 is the
 * enforcement; this is the client honouring it rather than discovering it.
 *
 * db/021 has not been applied to the live project, so the table is expected to
 * be missing in production. A missing table is reported as `unavailable` — the
 * same degrade-don't-throw contract `litEngine` uses for `venue_lit_signals`.
 */

type SupabaseClientLike = ReturnType<typeof createSupabaseBrowser>;

export const CALIBRATION_FEEDBACK_TABLE = "calibration_feedback";

/** Mirrors the `calibration_feedback_note_length_check` CHECK in db/021. */
export const CALIBRATION_NOTE_MAX_LENGTH = 500;

/** Mirrors the `calibration_feedback_feature_check` CHECK in db/021. */
export const CALIBRATION_FEATURES = ["crowdPulse", "aiDiscoverCards"] as const;

export type CalibrationFeature = (typeof CALIBRATION_FEATURES)[number];

/**
 * What was on screen, plus the verdict. Note the absence of any profile field:
 * the submitter is whoever is authenticated, never whoever is named.
 */
export type CalibrationFeedbackDraft = {
  feature: CalibrationFeature;
  /** Null only for a surface that is not venue-scoped. Both features are, in practice. */
  venueId?: string | null;
  /** The AI Discover card category, or the Crowd Pulse level word. */
  recommendationCategory?: string | null;
  displayedPartyScore?: number | null;
  displayedPsiLabel?: string | null;
  crowdPulseLevel?: string | null;
  /** PSI / AI Discover reason identifiers, as an explicit array rather than JSON. */
  reasonCodes?: readonly string[] | null;
  /**
   * Always explicit. The column is nullable so a future partial-judgment flow
   * has somewhere to go, but this control only writes on an Accurate or
   * Inaccurate press, so every row it creates carries a verdict.
   */
  accurate: boolean;
  note?: string | null;
};

export type CalibrationFeedbackRow = {
  profile_id: string;
  feature: CalibrationFeature;
  venue_id: string | null;
  recommendation_category: string | null;
  displayed_party_score: number | null;
  displayed_psi_label: string | null;
  crowd_pulse_level: string | null;
  reason_codes: string[] | null;
  accurate: boolean;
  note: string | null;
};

export type CalibrationSubmitOutcome =
  | { status: "ok" }
  | { status: "unauthenticated" }
  /** db/021 is not deployed to this project. */
  | { status: "unavailable" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The row as it will be inserted, given a draft and the caller's own id.
 *
 * Pure and exported so the "cannot submit as another profile" property is
 * testable without a database: whatever the draft contains, `profile_id` is the
 * id passed in.
 */
export function buildCalibrationFeedbackRow(
  draft: CalibrationFeedbackDraft,
  profileId: string
): CalibrationFeedbackRow {
  const reasonCodes = (draft.reasonCodes || [])
    .map((code) => (typeof code === "string" ? code.trim() : ""))
    .filter((code) => code.length > 0);

  return {
    profile_id: profileId,
    feature: draft.feature,
    venue_id: nullableText(draft.venueId),
    recommendation_category: nullableText(draft.recommendationCategory),
    displayed_party_score: nullableScore(draft.displayedPartyScore),
    displayed_psi_label: nullableText(draft.displayedPsiLabel),
    crowd_pulse_level: nullableText(draft.crowdPulseLevel),
    reason_codes: reasonCodes.length > 0 ? reasonCodes : null,
    accurate: draft.accurate === true,
    note: nullableText(draft.note),
  };
}

/**
 * Client-side mirror of db/021's CHECK constraints, so an over-long note is a
 * sentence under the control rather than a 23514 the user cannot read.
 */
export function validateCalibrationFeedbackRow(row: CalibrationFeedbackRow): string | null {
  if (!CALIBRATION_FEATURES.includes(row.feature)) {
    return "Unknown calibration feature.";
  }
  if (row.note !== null && row.note.length > CALIBRATION_NOTE_MAX_LENGTH) {
    return `Keep the note under ${CALIBRATION_NOTE_MAX_LENGTH} characters.`;
  }
  return null;
}

export async function submitCalibrationFeedback(
  draft: CalibrationFeedbackDraft,
  options: { supabase?: SupabaseClientLike } = {}
): Promise<CalibrationSubmitOutcome> {
  const supabase = options.supabase || createSupabaseBrowser();
  const profileId = await resolveCurrentUserId();

  if (!profileId) {
    return { status: "unauthenticated" };
  }

  const row = buildCalibrationFeedbackRow(draft, profileId);
  const invalid = validateCalibrationFeedbackRow(row);
  if (invalid) {
    return { status: "invalid", message: invalid };
  }

  const { error } = await supabase.from(CALIBRATION_FEEDBACK_TABLE).insert(row);

  if (!error) {
    return { status: "ok" };
  }

  const code = error.code || "";
  const message = (error.message || "").toLowerCase();

  // 42P01 undefined_table — db/021 is not deployed to this project.
  if (code === "42P01" || message.includes("does not exist")) {
    return { status: "unavailable" };
  }

  logSupabaseQueryError({
    scope: "calibrationFeedback.submitCalibrationFeedback",
    table: CALIBRATION_FEEDBACK_TABLE,
    queryName: "insertCalibrationFeedback",
    query: "insert one calibration judgment for the authenticated profile",
    error: normalizeUnknownError(error, "Failed to record calibration feedback."),
  });

  return { status: "error", message: error.message || "Could not record that right now." };
}
