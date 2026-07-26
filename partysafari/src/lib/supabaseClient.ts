import { createBrowserClient } from "@supabase/ssr";
import { isAuthLockAbortError } from "@/lib/supabaseDiagnostics";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

type GlobalSupabaseState = {
  client?: BrowserSupabaseClient;
  authSubscriptionInitialized?: boolean;
  realtimeDisabledPatched?: boolean;
  userIdCache?: { value: string | null; at: number };
  userIdPromise?: Promise<string | null> | null;
};

const USER_CACHE_TTL_MS = 15_000;

function getGlobalState(): GlobalSupabaseState {
  const globalRef = globalThis as typeof globalThis & { __partysafariSupabaseState__?: GlobalSupabaseState };
  if (!globalRef.__partysafariSupabaseState__) {
    globalRef.__partysafariSupabaseState__ = {};
  }
  return globalRef.__partysafariSupabaseState__;
}

function invalidateUserCache() {
  const state = getGlobalState();
  state.userIdCache = { value: null, at: 0 };
  state.userIdPromise = null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function createSupabaseBrowser() {
  const state = getGlobalState();

  if (!state.client) {
    state.client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  if (!state.authSubscriptionInitialized) {
    state.authSubscriptionInitialized = true;
    if (!TEMP_KILL_SWITCH.disableAuthStateChangeListener) {
      state.client.auth.onAuthStateChange(() => {
        invalidateUserCache();
      });
    }
  }

  if (TEMP_KILL_SWITCH.disableSupabaseRealtime && !state.realtimeDisabledPatched) {
    state.realtimeDisabledPatched = true;
    const noopChannel = {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
      unsubscribe() {
        return this;
      },
    };

    const clientAny = state.client as unknown as {
      channel: (...args: unknown[]) => unknown;
      removeChannel: (...args: unknown[]) => Promise<unknown>;
    };

    clientAny.channel = (..._args: unknown[]) => noopChannel;
    clientAny.removeChannel = async (..._args: unknown[]) => ({ data: null });
  }

  return state.client;
}

export async function resolveCurrentUserId(force = false) {
  const state = getGlobalState();
  const now = Date.now();

  if (!force && state.userIdCache && now - state.userIdCache.at < USER_CACHE_TTL_MS) {
    return state.userIdCache.value;
  }

  if (!force && state.userIdPromise) {
    return state.userIdPromise;
  }

  const supabase = createSupabaseBrowser();
  state.userIdPromise = (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const value = data?.user?.id || null;
      state.userIdCache = { value, at: Date.now() };
      return value;
    } catch (error) {
      if (isAuthLockAbortError(error)) {
        await sleep(120 + Math.floor(Math.random() * 100));
        try {
          const { data } = await supabase.auth.getUser();
          const value = data?.user?.id || null;
          state.userIdCache = { value, at: Date.now() };
          return value;
        } catch {
          state.userIdCache = { value: null, at: Date.now() };
          return null;
        }
      }

      state.userIdCache = { value: null, at: Date.now() };
      return null;
    }
  })()
    .finally(() => {
      state.userIdPromise = null;
    });

  return state.userIdPromise;
}
