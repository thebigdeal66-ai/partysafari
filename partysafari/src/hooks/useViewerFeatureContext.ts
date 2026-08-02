"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { logSupabaseQueryError } from "@/lib/supabaseDiagnostics";
import {
  hasCityTargetingConfigured,
  hasTargetingConfigured,
  type FeatureFlag,
  type FeatureViewerContext,
} from "@/lib/featureFlags";

/**
 * The viewer identity that targeted feature flags resolve against.
 *
 * **Costs nothing when nothing is targeted.** If no deploy-time allowlist or
 * city is configured for any of the requested flags — the production default —
 * this hook makes no calls at all and reports an empty context, so a user
 * outside the rollout issues exactly the requests they issued before targeting
 * existed. The city read is gated separately and only happens when a city is
 * actually configured, because that is the only case where the answer can
 * change a decision.
 *
 * `resolveCurrentUserId` is the codebase's existing auth accessor (the same one
 * `litEngine` uses for the Lit write) and it is globally cached for 15s, so on a
 * surface that already resolves the viewer this adds no round trip either.
 */

export type ViewerFeatureContext = FeatureViewerContext & {
  /** True until the identity this deploy actually needs has been resolved. */
  loading: boolean;
};

const EMPTY_CONTEXT: ViewerFeatureContext = { profileId: null, city: null, loading: false };

type ProfileCityRow = {
  home_city?: string | null;
};

export function useViewerFeatureContext(flags: readonly FeatureFlag[]): ViewerFeatureContext {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  // Keyed on contents: callers pass a fresh array literal every render.
  const flagKey = useMemo(() => Array.from(new Set(flags)).sort().join(","), [flags]);
  const needsProfileId = useMemo(
    () => (flagKey ? flagKey.split(",") : []).some((flag) => hasTargetingConfigured(flag as FeatureFlag)),
    [flagKey]
  );
  const needsCity = useMemo(
    () => (flagKey ? flagKey.split(",") : []).some((flag) => hasCityTargetingConfigured(flag as FeatureFlag)),
    [flagKey]
  );

  const [context, setContext] = useState<ViewerFeatureContext>(() =>
    needsProfileId ? { profileId: null, city: null, loading: true } : EMPTY_CONTEXT
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!needsProfileId) {
      // Targeting is read from build-time inlined env vars, so this cannot flip
      // after mount and the initial state is already the empty context.
      return;
    }

    const load = async () => {
      const profileId = await resolveCurrentUserId();
      if (!mountedRef.current) {
        return;
      }

      if (!profileId || !needsCity) {
        setContext({ profileId, city: null, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("home_city")
        .eq("id", profileId)
        .maybeSingle();

      if (error) {
        logSupabaseQueryError({
          scope: "useViewerFeatureContext",
          table: "profiles",
          queryName: "loadViewerCity",
          query: "select home_city by id",
          error,
        });
      }

      if (!mountedRef.current) {
        return;
      }
      // An unreadable city is "no city", which denies city-targeted access
      // rather than granting it.
      setContext({ profileId, city: (data as ProfileCityRow | null)?.home_city ?? null, loading: false });
    };

    void load();
  }, [needsCity, needsProfileId, supabase]);

  return context;
}
