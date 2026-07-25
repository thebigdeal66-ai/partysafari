import type { PostgrestError } from "@supabase/supabase-js";

type QueryDiagnosticsInput = {
  scope: string;
  table?: string | null;
  queryName?: string | null;
  query?: string | null;
  error: PostgrestError | Error | null | undefined;
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAuthLockAbortError(error: unknown) {
  if (!error) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("aborterror") &&
    normalized.includes("lock") &&
    (normalized.includes("steal") || normalized.includes("broken by another request"))
  );
}

function classify(error: PostgrestError | Error) {
  const raw = `${"code" in error ? error.code ?? "" : ""} ${error.message ?? ""} ${"details" in error ? error.details ?? "" : ""} ${"hint" in error ? error.hint ?? "" : ""}`.toLowerCase();

  return {
    missingColumn:
      raw.includes("column") &&
      (raw.includes("does not exist") || raw.includes("pgrst204") || raw.includes("schema cache")),
    missingTable: raw.includes("relation") && raw.includes("does not exist"),
    rlsDenied:
      raw.includes("permission denied") ||
      raw.includes("42501") ||
      raw.includes("row-level security") ||
      raw.includes("violates row-level security"),
  };
}

export function logSupabaseQueryError(input: QueryDiagnosticsInput) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (!input.error) {
    return;
  }

  try {
    const baseError = input.error;
    const classInfo = classify(baseError);
    const code = "code" in baseError && hasText(baseError.code) ? baseError.code : "unknown";
    const details = "details" in baseError && hasText(baseError.details) ? baseError.details : "none";
    const hint = "hint" in baseError && hasText(baseError.hint) ? baseError.hint : "none";
    const status =
      "status" in baseError &&
      (typeof baseError.status === "number" || typeof baseError.status === "string")
        ? String(baseError.status)
        : "unknown";

    const message = hasText(baseError.message) ? baseError.message : String(baseError);
    const queryName = input.queryName && input.queryName.trim().length > 0 ? input.queryName : "unknown";
    const table = input.table && input.table.trim().length > 0 ? input.table : "unknown";
    const query = input.query && input.query.trim().length > 0 ? input.query : "unknown";
    const isAuthLockAbort = isAuthLockAbortError(baseError);

    if (isAuthLockAbort) {
      console.warn(
        `[Supabase][AuthLock] concurrent auth lock interrupted request\n` +
          `scope=${input.scope}\n` +
          `table=${table}\n` +
          `queryName=${queryName}\n` +
          `query=${query}\n` +
          `message=${message}`
      );
      console.warn("Raw Supabase error:", baseError);
      return;
    }

    console.error(
      `[Supabase][${input.scope}] FAILED\n` +
        `table=${table}\n` +
        `queryName=${queryName}\n` +
        `query=${query}\n` +
        `code=${code}\n` +
        `status=${status}\n` +
        `message=${message}\n` +
        `details=${details}\n` +
        `hint=${hint}\n` +
        `missingColumn=${classInfo.missingColumn}\n` +
        `missingTable=${classInfo.missingTable}\n` +
        `rlsDenied=${classInfo.rlsDenied}`
    );

    console.error("Raw Supabase error:", baseError);
  } catch (logError) {
    console.error("[Supabase][Diagnostics] Failed to format query error log");
    console.error("Raw Supabase error:", input.error);
    console.error("Raw diagnostics formatting error:", logError);
  }
}

export function normalizeUnknownError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return new Error(error);
  }
  return new Error(fallbackMessage);
}
