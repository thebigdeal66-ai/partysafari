"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { FRIEND_STATE_SYNC_EVENT, type FriendStateSyncDetail } from "@/lib/friendSync";

interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface FriendRow {
  user_id: string;
  friend_id: string;
  created_at: string;
}

function MiniAvatar({ profile }: { profile: FriendProfile }) {
  const [imgError, setImgError] = useState(false);
  const initials = (profile.name || profile.username || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (profile.avatarUrl && !imgError) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.name}
        onError={() => setImgError(true)}
        className="h-9 w-9 rounded-full border-2 border-violet-500/20 object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-full border-2 border-violet-500/20 bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-white">{initials}</span>
    </div>
  );
}

export default function FriendsDashboardSection() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentFriends, setRecentFriends] = useState<FriendProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Pending incoming requests count
    const { count } = await supabase
      .from("friend_requests")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("status", "pending");

    setPendingCount(count ?? 0);

    // Recent friends
    const { data: friendData } = await supabase
      .from("friendships")
      .select("user_id, friend_id, created_at")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(5);

    const seenIds = new Set<string>();
    const friendIds: string[] = [];
    for (const row of (friendData ?? []) as FriendRow[]) {
      const otherId: string = row.user_id === userId ? row.friend_id : row.user_id;
      if (!otherId || otherId === userId || seenIds.has(otherId)) {
        continue;
      }

      seenIds.add(otherId);
      friendIds.push(otherId);
    }

    if (friendIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", friendIds);

      setRecentFriends(
        ((profileData ?? []) as ProfileRow[]).map((p) => ({
          id: p.id,
          name: p.full_name || p.username || "Unknown",
          username: p.username ? (p.username.startsWith("@") ? p.username : `@${p.username}`) : "",
          avatarUrl: p.avatar_url ?? null,
        }))
      );
    } else {
      setRecentFriends([]);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: update when requests or friendships change
  useEffect(() => {
    const channel = supabase.channel("friends-dashboard-section");
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void load();
      });
    void channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, load]);

  useEffect(() => {
    const handleFriendSync = (event: Event) => {
      const custom = event as CustomEvent<FriendStateSyncDetail>;
      if (!custom.detail) {
        return;
      }

      void load();
    };

    window.addEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    return () => {
      window.removeEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    };
  }, [load]);

  if (isLoading) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Friends</h2>
          {pendingCount > 0 && (
            <p className="mt-1 text-sm text-violet-300">
              {pendingCount} pending {pendingCount === 1 ? "request" : "requests"}
            </p>
          )}
        </div>
        <Link
          href="/friends"
          className="rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 transition"
        >
          View All Friends
        </Link>
      </div>

      {recentFriends.length === 0 ? (
        <p className="text-sm text-white/60">
          No friends yet.{" "}
          <Link href="/friends" className="text-violet-300 hover:underline">
            Find people to add
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {recentFriends.map((profile) => (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              <MiniAvatar profile={profile} />
              <span className="text-white/90">{profile.name}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
