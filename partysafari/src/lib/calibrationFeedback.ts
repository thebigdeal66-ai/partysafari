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
 */

type SupabaseClientLike = ReturnType<typeof createSupabaseBrowser>;

export const CALIBRATION_FEEDBACK_TABLE = "calibration_feedback";

export const CALIBRATION_NOTE_MAX_LENGTH = 500;
export const CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH = 64;
export const CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH = 120;
export const CALIBRATION_REASON_CODES_MAX_ENTRIES = 10;
export const CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH = 640;
export const CALIBRATION_FEATURES = ["crowdPulse", "aiDiscoverCards"] as const;

export type CalibrationFeature = (typeof CALIBRATION_FEATURES)[number];

export type CalibrationFeedbackDraft = {
  feature: CalibrationFeature;
  venueId?: string | null;
  recommendationCategory?: string | null;
  displayedPartyScore?: number | null;
  displayedPsiLabel?: string | null;
  crowdPulseLevel?: string | null;
  reasonCodes?: readonly string[] | null;
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

export function validateCalibrationFeedbackRow(row: CalibrationFeedbackRow): string | null {
  if (!CALIBRATION_FEATURES.includes(row.feature)) {
    return "Unknown calibration feature.";
  }
  if (
    row.recommendation_category !== null &&
    row.recommendation_category.length > CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH
  ) {
    return `Category labels must stay under ${CALIBRATION_RECOMMENDATION_CATEGORY_MAX_LENGTH} characters.`;
  }
  if (
    row.displayed_psi_label !== null &&
    row.displayed_psi_label.length > CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH
  ) {
    return `PSI labels must stay under ${CALIBRATION_DISPLAYED_PSI_LABEL_MAX_LENGTH} characters.`;
  }
  if (row.reason_codes !== null && row.reason_codes.length > CALIBRATION_REASON_CODES_MAX_ENTRIES) {
    return `Use at most ${CALIBRATION_REASON_CODES_MAX_ENTRIES} reason codes.`;
  }
  if (
    row.reason_codes !== null &&
    `{${row.reason_codes.join(",")}}`.length > CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH
  ) {
    return `Reason code payload must stay under ${CALIBRATION_REASON_CODES_SERIALIZED_MAX_LENGTH} characters.`;
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
