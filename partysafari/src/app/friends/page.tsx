"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import FriendButton from "@/components/social/FriendButton";
import {
  emitFriendStateSync,
  FRIEND_STATE_SYNC_EVENT,
  isRelationshipConflictError,
  markIncomingFriendRequestNotificationRead,
  type FriendStateSyncDetail,
} from "@/lib/friendSync";

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface FriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  profiles: ProfileRow | null;
}

interface FriendRow {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
}

interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
}

interface FriendRequest {
  id: string;
  profile: FriendProfile;
  senderId: string;
  receiverId: string;
}

function Avatar({ profile }: { profile: FriendProfile }) {
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
        className="h-12 w-12 rounded-full border-2 border-violet-500/20 object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-12 w-12 rounded-full border-2 border-violet-500/20 bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-white">{initials}</span>
    </div>
  );
}

export default function FriendsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [suggested, setSuggested] = useState<FriendProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const loadAll = useCallback(async (userId: string) => {
    setErrorMessage(null);

    // Load incoming requests
    const { data: incomingData, error: incomingError } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (incomingError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[friends] Load incoming failed:", incomingError);
      }
      setErrorMessage("Unable to load friend requests.");
      setIsLoading(false);
      return;
    }

    // Load sent requests
    const { data: sentData } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("sender_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Load friendships
    const { data: friendshipData } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, created_at")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    // Collect all profile IDs we need
    const profileIds = new Set<string>();
    for (const row of (incomingData ?? []) as FriendRequestRow[]) {
      profileIds.add(row.sender_id);
    }
    for (const row of (sentData ?? []) as FriendRequestRow[]) {
      profileIds.add(row.receiver_id);
    }
    for (const row of (friendshipData ?? []) as FriendRow[]) {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      if (otherId && otherId !== userId) {
        profileIds.add(otherId);
      }
    }

    const allIds = Array.from(profileIds);
    const profileMap = new Map<string, FriendProfile>();

    if (allIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", allIds);

      for (const p of (profileData ?? []) as ProfileRow[]) {
        profileMap.set(p.id, {
          id: p.id,
          name: p.full_name || p.username || "Unknown",
          username: p.username ? (p.username.startsWith("@") ? p.username : `@${p.username}`) : "",
          avatarUrl: p.avatar_url ?? null,
        });
      }
    }

    const friendIds = new Set<string>();
    const pendingIds = new Set<string>();

    const incomingList: FriendRequest[] = [];
    for (const row of (incomingData ?? []) as FriendRequestRow[]) {
      const profile = profileMap.get(row.sender_id);
      if (profile) {
        incomingList.push({
          id: row.id,
          profile,
          senderId: row.sender_id,
          receiverId: row.receiver_id,
        });
        pendingIds.add(row.sender_id);
      }
    }

    const sentList: FriendRequest[] = [];
    for (const row of (sentData ?? []) as FriendRequestRow[]) {
      const profile = profileMap.get(row.receiver_id);
      if (profile) {
        sentList.push({
          id: row.id,
          profile,
          senderId: row.sender_id,
          receiverId: row.receiver_id,
        });
        pendingIds.add(row.receiver_id);
      }
    }

    const seenFriendIds = new Set<string>();
    const friendList: FriendProfile[] = [];
    for (const row of (friendshipData ?? []) as FriendRow[]) {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      if (!otherId || otherId === userId || seenFriendIds.has(otherId)) {
        continue;
      }

      const profile = profileMap.get(otherId);
      if (profile) {
        friendList.push(profile);
        friendIds.add(otherId);
        seenFriendIds.add(otherId);
      }
    }

    setIncomingRequests(incomingList);
    setSentRequests(sentList);
    setFriends(friendList);

    // Load suggestions: random profiles excluding self, friends, and pending
    const excludeIds = new Set([userId, ...Array.from(friendIds), ...Array.from(pendingIds)]);
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .not("id", "in", `(${Array.from(excludeIds).join(",")})`)
      .limit(20);

    const suggestedList: FriendProfile[] = ((allProfiles ?? []) as ProfileRow[])
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.full_name || p.username || "Unknown",
        username: p.username ? (p.username.startsWith("@") ? p.username : `@${p.username}`) : "",
        avatarUrl: p.avatar_url ?? null,
      }));

    setSuggested(suggestedList);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setIsLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      if (!isMounted) return;
      setCurrentUserId(userId);
      if (!userId) {
        setIsLoading(false);
        return;
      }
      await loadAll(userId);
    };

    void init();
    return () => { isMounted = false; };
  }, [supabase, loadAll]);

  // Realtime updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel(`friends-page-${currentUserId}`);
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        void loadAll(currentUserId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void loadAll(currentUserId);
      });

    void channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, supabase, loadAll]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const handleFriendSync = (event: Event) => {
      const custom = event as CustomEvent<FriendStateSyncDetail>;
      const detail = custom.detail;
      if (!detail) {
        return;
      }

      if (detail.currentUserId !== currentUserId && detail.targetUserId !== currentUserId) {
        return;
      }

      void loadAll(currentUserId);
    };

    window.addEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    return () => {
      window.removeEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    };
  }, [currentUserId, loadAll]);

  const handleRespond = useCallback(async (request: FriendRequest, action: "accept" | "decline") => {
    const requestId = request.id;
    if (!currentUserId || busyIds.has(requestId)) return;
    setBusyIds((prev) => new Set([...prev, requestId]));

    const { error } = await supabase.rpc("respond_to_friend_request", {
      p_request_id: requestId,
      p_action: action,
    });

    if (error) {
      if (isRelationshipConflictError(error)) {
        await loadAll(currentUserId);
      } else {
        if (process.env.NODE_ENV === "development") {
          console.warn("[friends] respond_to_friend_request failed:", error);
        }
        setErrorMessage(`Could not ${action} request right now.`);
      }
    } else {
      if (action === "accept") {
        await markIncomingFriendRequestNotificationRead(supabase, currentUserId, request.senderId);
      }

      await loadAll(currentUserId);
      emitFriendStateSync({
        reason: action === "accept" ? "request_accepted" : "request_declined",
        currentUserId,
        targetUserId: request.senderId,
        actorId: request.senderId,
        requestId,
      });
    }

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
  }, [currentUserId, supabase, loadAll, busyIds]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl text-center py-16">
          <p className="text-white/70">Loading friends…</p>
        </div>
      </main>
    );
  }

  if (!currentUserId) {
    return (
      <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl text-center py-16">
          <p className="text-white/70">Please <Link href="/login" className="text-violet-300 hover:underline">sign in</Link> to view your friends.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Social</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Friends</h1>
          {errorMessage && <p className="mt-2 text-sm text-rose-300">{errorMessage}</p>}
        </div>

        {/* Incoming Requests */}
        {incomingRequests.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              Incoming Requests
              <span className="ml-2 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">
                {incomingRequests.length}
              </span>
            </h2>
            <div className="space-y-3">
              {incomingRequests.map((request) => {
                const { id, profile } = request;
                return (
                <div key={id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10061f] p-4">
                  <Avatar profile={profile} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-sm text-violet-300 truncate">{profile.username}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => void handleRespond(request, "accept")}
                      disabled={busyIds.has(id)}
                      className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => void handleRespond(request, "decline")}
                      disabled={busyIds.has(id)}
                      className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-60 transition"
                    >
                      Decline
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Sent Requests */}
        {sentRequests.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Sent Requests</h2>
            <div className="space-y-3">
              {sentRequests.map(({ id, profile }) => (
                <div key={id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10061f] p-4">
                  <Avatar profile={profile} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-sm text-violet-300 truncate">{profile.username}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/50">
                    Request Sent
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Friends */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            My Friends
            {friends.length > 0 && (
              <span className="ml-2 text-sm font-normal text-white/60">({friends.length})</span>
            )}
          </h2>
          {friends.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#10061f] p-6 text-center text-white/60">
              You haven't added any friends yet. Discover people below!
            </div>
          ) : (
            <div className="space-y-3">
              {friends.map((profile) => (
                <div key={profile.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10061f] p-4">
                  <Avatar profile={profile} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-sm text-violet-300 truncate">{profile.username}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/messages`}
                      className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
                    >
                      Message
                    </Link>
                    <Link
                      href={`/profiles/${profile.id}`}
                      className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 transition"
                    >
                      Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Suggested */}
        {suggested.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Suggested People</h2>
            <div className="space-y-3">
              {suggested.map((profile) => (
                <div key={profile.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10061f] p-4">
                  <Avatar profile={profile} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-sm text-violet-300 truncate">{profile.username}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <FriendButton targetUserId={profile.id} compact />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
