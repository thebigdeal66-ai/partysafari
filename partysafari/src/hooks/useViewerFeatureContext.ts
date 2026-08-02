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

export type ViewerFeatureContext = FeatureViewerContext & {
  loading: boolean;
};

const EMPTY_CONTEXT: ViewerFeatureContext = { profileId: null, city: null, loading: false };

type ProfileCityRow = {
  home_city?: string | null;
};

export function useViewerFeatureContext(flags: readonly FeatureFlag[]): ViewerFeatureContext {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
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

      const { data, error } = await supabase.from("profiles").select("home_city").eq("id", profileId).maybeSingle();

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

      setContext({ profileId, city: (data as ProfileCityRow | null)?.home_city ?? null, loading: false });
    };

    void load();
  }, [needsCity, needsProfileId, supabase]);

  return context;
}
