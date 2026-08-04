"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationCenter from "@/components/NotificationCenter";
import { useAuthState } from "@/hooks/useAuthState";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { FRIEND_STATE_SYNC_EVENT } from "@/lib/friendSync";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

const MESSAGES_READ_EVENT = "partysafari:messages-read";

export function NavAuthControl({
  loading,
  signedIn,
  signingOut,
  error,
  onSignIn,
  onSignOut,
}: {
  loading: boolean;
  signedIn: boolean;
  signingOut: boolean;
  error: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (loading) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className="inline-flex min-h-11 items-center rounded-full border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/60"
      >
        Checking session...
      </button>
    );
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="inline-flex min-h-11 items-center rounded-full border border-violet-300/35 bg-violet-500/15 px-4 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80"
      >
        Sign In
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={signingOut}
        aria-busy={signingOut ? "true" : undefined}
        onClick={onSignOut}
        className="inline-flex min-h-11 items-center rounded-full border border-orange-300/35 bg-orange-500/15 px-4 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200/80 disabled:opacity-70"
      >
        {signingOut ? "Signing out..." : "Sign Out"}
      </button>
      <p aria-live="polite" className="min-h-4 text-xs text-rose-200/90">
        {error}
      </p>
    </div>
  );
}

export default function NavBar() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const auth = useAuthState();
  const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userId = auth.userId;

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshUnreadTotal = async () => {
      if (!isMounted) {
        return;
      }

      if (!userId) {
        setMessageUnreadTotal(0);
        setPendingFriendRequests(0);
        return;
      }

      const { data, error } = await supabase.rpc("get_unread_message_counts");

      if (!isMounted) {
        return;
      }

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[NavBar] Failed to get message unread counts:", error);
        }
        setMessageUnreadTotal(0);
      } else {
        const total = Array.isArray(data)
          ? data.reduce((sum, row) => sum + (Number(row?.unread_count) || 0), 0)
          : 0;
        setMessageUnreadTotal(total);
      }

      const { count } = await supabase
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending");

      if (isMounted) {
        setPendingFriendRequests(count ?? 0);
      }
    };

    const setupRealtime = async () => {
      if (!isMounted || !userId) {
        return;
      }

      if (channel) {
        void supabase.removeChannel(channel);
      }

      channel = supabase.channel(`navbar-messages-${userId}`);
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
          },
          () => {
            void refreshUnreadTotal();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversation_participants",
            filter: `profile_id=eq.${userId}`,
          },
          () => {
            void refreshUnreadTotal();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
          },
          () => {
            void refreshUnreadTotal();
          }
        );

      void channel.subscribe();
    };

    const handleMessagesRead = () => {
      void refreshUnreadTotal();
    };

    const handleFriendSync = () => {
      void refreshUnreadTotal();
    };

    void refreshUnreadTotal();
    if (!TEMP_KILL_SWITCH.disableSupabaseRealtime) {
      void setupRealtime();
    }
    window.addEventListener(MESSAGES_READ_EVENT, handleMessagesRead);
    window.addEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);

    return () => {
      isMounted = false;
      window.removeEventListener(MESSAGES_READ_EVENT, handleMessagesRead);
      window.removeEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [supabase, userId]);

  const handleSignIn = () => {
    auth.clearError();
    setMobileMenuOpen(false);
    router.push("/login");
  };

  const handleSignOut = () => {
    auth.clearError();
    setMobileMenuOpen(false);
    void auth.signOut();
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-[#07070B] border-b border-white/10 px-6 py-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
        <Link href="/" className="text-2xl font-bold text-white">
          🔥 PartySafari
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden xl:flex items-center gap-5">
            <Link
              href="/"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/feed"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Feed
            </Link>
            <Link
              href="/profiles"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Profiles
            </Link>
            <Link
              href="/requests"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Requests
            </Link>
            <Link
              href="/friends"
              className="relative inline-flex items-center text-white/80 hover:text-violet-300 transition-colors"
            >
              <span>Friends</span>
              {pendingFriendRequests > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingFriendRequests}
                </span>
              ) : null}
            </Link>
            <Link
              href="/messages"
              className="relative inline-flex items-center text-white/80 hover:text-violet-300 transition-colors"
            >
              <span>Messages</span>
              {messageUnreadTotal > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {messageUnreadTotal}
                </span>
              ) : null}
            </Link>
            <Link
              href="/safari"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Safari Mode
            </Link>
            <Link
              href="/radar"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Safari Radar™
            </Link>
            <Link
              href="/dashboard"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Discover Tonight
            </Link>
            <Link
              href="/venue-owner"
              className="text-white/80 hover:text-violet-300 transition-colors"
            >
              Venue Owner
            </Link>
          </div>
          <NavAuthControl
            loading={auth.loading}
            signedIn={auth.signedIn}
            signingOut={auth.signingOut}
            error={auth.error}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
          />
          <NotificationCenter />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-primary-nav"
            className="inline-flex min-h-11 items-center rounded-full border border-white/12 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 xl:hidden"
          >
            Menu
          </button>
        </div>
        </div>

        <div
          id="mobile-primary-nav"
          className={`${mobileMenuOpen ? "mt-3 grid" : "hidden"} gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 xl:hidden`}
        >
          <Link
            href="/"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Home
          </Link>
          <Link
            href="/feed"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Feed
          </Link>
          <Link
            href="/profiles"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Profiles
          </Link>
          <Link
            href="/requests"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Requests
          </Link>
          <Link
            href="/friends"
            onClick={closeMobileMenu}
            className="relative inline-flex items-center rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            <span>Friends</span>
            {pendingFriendRequests > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {pendingFriendRequests}
              </span>
            ) : null}
          </Link>
          <Link
            href="/messages"
            onClick={closeMobileMenu}
            className="relative inline-flex items-center rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            <span>Messages</span>
            {messageUnreadTotal > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {messageUnreadTotal}
              </span>
            ) : null}
          </Link>
          <Link
            href="/dashboard"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Dashboard
          </Link>
          <Link
            href="/venue-owner"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Venue Owner
          </Link>
          <Link
            href="/safari"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Safari Mode
          </Link>
          <Link
            href="/radar"
            onClick={closeMobileMenu}
            className="rounded-xl px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-violet-300"
          >
            Safari Radar™
          </Link>
        </div>
      </div>
    </nav>
  );
}