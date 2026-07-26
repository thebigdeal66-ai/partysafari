"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NotificationCenter from "@/components/NotificationCenter";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { FRIEND_STATE_SYNC_EVENT } from "@/lib/friendSync";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

const MESSAGES_READ_EVENT = "partysafari:messages-read";

export default function NavBar() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [messageUnreadTotal, setMessageUnreadTotal] = useState(0);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshUnreadTotal = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError || !session?.user?.id) {
        setMessageUnreadTotal(0);
        setPendingFriendRequests(0);
        return;
      }

      const userId = session.user.id;

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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!isMounted || sessionError || !session?.user?.id) {
        return;
      }

      if (channel) {
        void supabase.removeChannel(channel);
      }

      channel = supabase.channel(`navbar-messages-${session.user.id}`);
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
            filter: `profile_id=eq.${session.user.id}`,
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
  }, [supabase]);

  return (
    <nav className="bg-[#07070B] border-b border-white/10 px-6 py-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-white">
          🔥 PartySafari
        </Link>
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-6">
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
          <NotificationCenter />
        </div>
        </div>

        <div className="mt-3 flex items-center gap-4 overflow-x-auto whitespace-nowrap pb-1 lg:hidden">
          <Link
            href="/"
            className="text-sm text-white/80 hover:text-violet-300 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/feed"
            className="text-sm text-white/80 hover:text-violet-300 transition-colors"
          >
            Feed
          </Link>
          <Link
            href="/messages"
            className="relative inline-flex items-center text-sm text-white/80 hover:text-violet-300 transition-colors"
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
            className="text-sm text-white/80 hover:text-violet-300 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/venue-owner"
            className="text-sm text-white/80 hover:text-violet-300 transition-colors"
          >
            Venue Owner
          </Link>
        </div>
      </div>
    </nav>
  );
}