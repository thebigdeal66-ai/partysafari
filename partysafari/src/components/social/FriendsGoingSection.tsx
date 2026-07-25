"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

interface RsvpRow {
  user_id: string;
  status: string;
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

interface FriendsGoingProps {
  eventId: string;
}

export default function FriendsGoingSection({ eventId }: FriendsGoingProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [friendsGoing, setFriendsGoing] = useState<FriendProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Get current user's friend IDs
    const { data: friendData } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", userId);

    const friendIds = new Set(((friendData ?? []) as FriendRow[]).map((r) => r.friend_id));
    if (friendIds.size === 0) {
      setIsLoading(false);
      return;
    }

    // Get RSVPs going for this event
    const { data: rsvpData } = await supabase
      .from("event_rsvps")
      .select("user_id, status")
      .eq("event_id", eventId)
      .eq("status", "going");

    const goingUserIds = ((rsvpData ?? []) as RsvpRow[])
      .map((r) => r.user_id)
      .filter((id) => friendIds.has(id));

    if (goingUserIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", goingUserIds);

    setFriendsGoing(
      ((profileData ?? []) as ProfileRow[]).map((p) => ({
        id: p.id,
        name: p.full_name || p.username || "Unknown",
        username: p.username ?? "",
        avatarUrl: p.avatar_url ?? null,
      }))
    );
    setIsLoading(false);
  }, [supabase, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading || friendsGoing.length === 0) return null;

  const displayed = friendsGoing.slice(0, 5);
  const overflow = friendsGoing.length - displayed.length;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
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
      <p className="text-sm text-violet-200">
        <span className="font-semibold text-white">{friendsGoing.length}</span>{" "}
        {friendsGoing.length === 1 ? "friend is" : "friends are"} going
      </p>
      <Link
        href="/friends"
        className="ml-auto text-xs text-violet-300 hover:text-violet-100 transition"
      >
        View →
      </Link>
    </div>
  );
}
