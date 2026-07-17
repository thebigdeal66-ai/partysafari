"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { recordActivity } from "@/lib/activityFeed";

interface FollowButtonProps {
  targetUserId: string;
  initialFollowing?: boolean;
  onStateChange?: (following: boolean) => void;
}

export default function FollowButton({
  targetUserId,
  initialFollowing = false,
  onStateChange,
}: FollowButtonProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [following, setFollowing] = useState(initialFollowing);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  const handleToggle = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      window.location.href = "/login";
      return;
    }

    if (user.id === targetUserId) {
      return;
    }

    setIsBusy(true);

    if (following) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId);

      if (!error) {
        setFollowing(false);
        onStateChange?.(false);
      }
    } else {
      const { error } = await supabase.from("follows").insert({
        follower_id: user.id,
        following_id: targetUserId,
      });

      if (!error) {
        setFollowing(true);
        onStateChange?.(true);
        await recordActivity({
          actorId: user.id,
          actionType: 'followed_profile',
          profileId: targetUserId,
          metadata: { targetUserId },
        });
      }
    }

    setIsBusy(false);
  };

  return (
    <button
      onClick={() => void handleToggle()}
      disabled={isBusy}
      className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
        following
          ? "border border-violet-500/50 bg-violet-500/20 text-violet-200 hover:border-violet-400"
          : "border border-violet-500/50 bg-violet-500/10 text-violet-200 hover:border-violet-300 hover:bg-violet-500/20"
      } ${isBusy ? "opacity-70" : ""}`}
    >
      {isBusy ? "Working..." : following ? "Following" : "Follow"}
    </button>
  );
}
