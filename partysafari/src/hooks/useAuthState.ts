"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import {
  createSingleFlightTask,
  INITIAL_AUTH_CONTROL_STATE,
  reduceAuthControlState,
  toAuthControlView,
  toAuthErrorMessage,
} from "@/lib/authControl";

type UseAuthStateResult = ReturnType<typeof toAuthControlView> & {
  userId: string | null;
  signOut: () => Promise<{ ok: boolean }>;
  clearError: () => void;
};

export function useAuthState(): UseAuthStateResult {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [state, dispatch] = useReducer(reduceAuthControlState, INITIAL_AUTH_CONTROL_STATE);
  const mountedRef = useRef(true);
  const signOutRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dispatch({ type: "session:loading" });

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mountedRef.current) {
        return;
      }
      dispatch({ type: "session:resolved", userId: data.user?.id || null });
    };

    void load();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!mountedRef.current) {
        return;
      }
      dispatch({ type: "auth:changed", userId: session?.user?.id || null });
    });

    return () => {
      authSubscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const singleFlightSignOut = useMemo(
    () =>
      createSingleFlightTask(async () => {
        const requestId = signOutRequestIdRef.current + 1;
        signOutRequestIdRef.current = requestId;
        dispatch({ type: "signout:requested" });

        try {
          const { error } = await supabase.auth.signOut();
          if (error) {
            throw error;
          }

          if (!mountedRef.current || requestId !== signOutRequestIdRef.current) {
            return { ok: true };
          }

          dispatch({ type: "signout:succeeded" });
          router.replace("/");
          router.refresh();
          return { ok: true };
        } catch (cause) {
          if (!mountedRef.current || requestId !== signOutRequestIdRef.current) {
            return { ok: false };
          }

          dispatch({ type: "signout:failed", message: toAuthErrorMessage(cause) });
          return { ok: false };
        }
      }),
    [router, supabase]
  );

  const signOut = useCallback(async () => {
    if (!state.userId) {
      return { ok: false };
    }
    return singleFlightSignOut();
  }, [singleFlightSignOut, state.userId]);

  const clearError = useCallback(() => {
    dispatch({ type: "error:cleared" });
  }, []);

  const view = toAuthControlView(state);

  return {
    ...view,
    userId: state.userId,
    signOut,
    clearError,
  };
}