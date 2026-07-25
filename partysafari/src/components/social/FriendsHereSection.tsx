"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

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

interface CheckInRow {
  profile_id: string;
}

interface FriendRow {
  friend_id: string;
}

function AvatarBubble({ profile }: { profile: FriendProfile }) {
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
        title={profile.name}
        onError={() => setImgError(true)}
        className="h-8 w-8 rounded-full border-2 border-[#10061f] object-cover"
      />
    );
  }
  return (
    <div
      title={profile.name}
      className="h-8 w-8 rounded-full border-2 border-[#10061f] bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center"
    >
      <span className="text-xs font-bold text-white">{initials}</span>
    </div>
  );
}

interface FriendsHereProps {
  venueId: string;
}

export default function FriendsHereSection({ venueId }: FriendsHereProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendsHere, setFriendsHere] = useState<FriendProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (userId: string) => {
    // Get user's friend IDs
    const { data: friendData } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", userId);

    const friendIds = new Set(((friendData ?? []) as FriendRow[]).map((r) => r.friend_id));
    if (friendIds.size === 0) {
      setFriendsHere([]);
      setIsLoading(false);
      return;
    }

    // Get active check-ins at this venue
    const { data: checkInData } = await supabase
      .from("venue_checkins")
      .select("profile_id")
      .eq("venue_id", venueId)
      .gt("expires_at", new Date().toISOString());

    const checkedInIds = ((checkInData ?? []) as CheckInRow[])
      .map((r) => r.profile_id)
      .filter((id) => friendIds.has(id));

    if (checkedInIds.length === 0) {
      setFriendsHere([]);
      setIsLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", checkedInIds);

    setFriendsHere(
      ((profileData ?? []) as ProfileRow[]).map((p) => ({
        id: p.id,
        name: p.full_name || p.username || "Unknown",
        username: p.username ?? "",
        avatarUrl: p.avatar_url ?? null,
      }))
    );
    setIsLoading(false);
  }, [supabase, venueId]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      if (!isMounted) return;
      setCurrentUserId(userId);
      if (!userId) { setIsLoading(false); return; }
      await load(userId);
    };
    void init();
    return () => { isMounted = false; };
  }, [supabase, load]);

  // Realtime check-in updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel(`friends-here-${venueId}-${currentUserId}`);
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "venue_checkins",
      filter: `venue_id=eq.${venueId}`,
    }, () => {
      void load(currentUserId);
    });

    void channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, venueId, supabase, load]);

  if (isLoading || friendsHere.length === 0) return null;

  const displayed = friendsHere.slice(0, 5);
  const overflow = friendsHere.length - displayed.length;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3">
      <div className="flex -space-x-2">
        {displayed.map((p) => (
          <AvatarBubble key={p.id} profile={p} />
        ))}
        {overflow > 0 && (
          <div className="h-8 w-8 rounded-full border-2 border-[#10061f] bg-white/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-white/70">+{overflow}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-green-200">
        <span className="font-semibold text-white">{friendsHere.length}</span>{" "}
        {friendsHere.length === 1 ? "friend is" : "friends are"} here
      </p>
    </div>
  );
}
