import { createSupabaseBrowser } from "@/lib/supabaseClient";

export type ActivityActionType = "created_event" | "rsvp_event" | "commented_event" | "saved_event" | "followed_profile";

const DUPLICATE_WINDOW_MS = 60_000;

function normalizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMetadata(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeMetadata(entry)])
    );
  }

  return value;
}

export async function recordActivity(params: {
  actorId: string;
  actionType: ActivityActionType;
  eventId?: string | null;
  profileId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseBrowser();
  const createdAt = new Date().toISOString();
  const metadata = normalizeMetadata(params.metadata ?? {}) as Record<string, unknown>;
  const duplicateWindowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();

  let lookupQuery = supabase
    .from("activity_feed")
    .select("id, metadata")
    .eq("actor_id", params.actorId)
    .eq("action_type", params.actionType)
    .gte("created_at", duplicateWindowStart)
    .limit(5);

  if (params.eventId != null) {
    lookupQuery = lookupQuery.eq("event_id", params.eventId);
  } else {
    lookupQuery = lookupQuery.filter("event_id", "is", null);
  }

  if (params.profileId != null) {
    lookupQuery = lookupQuery.eq("profile_id", params.profileId);
  } else {
    lookupQuery = lookupQuery.filter("profile_id", "is", null);
  }

  const { data: existingRows, error: lookupError } = await lookupQuery;

  if (lookupError) {
    console.error("Failed to look up recent activity feed entries:", {
      message: lookupError.message,
      details: lookupError.details,
      hint: lookupError.hint,
      code: lookupError.code,
    });
  }

  const normalizedMetadata = JSON.stringify(metadata);
  const isDuplicate = (existingRows ?? []).some((row) => {
    const existingMetadata = JSON.stringify(normalizeMetadata(row.metadata ?? {}));
    return existingMetadata === normalizedMetadata;
  });

  if (isDuplicate) {
    return;
  }

  const { error } = await supabase.from("activity_feed").insert({
    actor_id: params.actorId,
    action_type: params.actionType,
    event_id: params.eventId ?? null,
    profile_id: params.profileId ?? null,
    metadata,
    created_at: createdAt,
  });

  if (error) {
    console.error(
      "Failed to record activity feed item:",
      error.message,
      error.details,
      error.hint,
      error.code
    );
  }
}
