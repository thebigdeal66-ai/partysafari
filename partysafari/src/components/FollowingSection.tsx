"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

interface FollowingProfile {
  id: string;
  following_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    profile_type: string | null;
  } | null;
}

interface RawFollowingProfile {
  id: string;
  following_id: string;
  profiles:
    | {
        id: string;
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
        profile_type: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        username: string | null;
        avatar_url: string | null;
        profile_type: string | null;
      }[]
    | null;
}

function normalizeFollowingRow(row: RawFollowingProfile): FollowingProfile {
  const profilePayload = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    following_id: row.following_id,
    profiles: profilePayload
      ? {
          id: profilePayload.id,
          full_name: profilePayload.full_name ?? null,
          username: profilePayload.username ?? null,
          avatar_url: profilePayload.avatar_url ?? null,
          profile_type: profilePayload.profile_type ?? null,
        }
      : null,
  };
}

export default function FollowingSection() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [following, setFollowing] = useState<FollowingProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadFollowing = async () => {
      setErrorMessage(null);
      setIsLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Supabase auth.getUser error:", {
          message: userError.message,
          details: (userError as any).details ?? null,
          hint: (userError as any).hint ?? null,
          code: (userError as any).code ?? null,
        });
        setErrorMessage("Unable to verify user session.");
        setIsLoading(false);
        return;
      }

      const userId = userData?.user?.id;
      if (!userId) {
        setFollowing([]);
        setIsLoading(false);
        return;
      }

      try {
        // First load follows (only the relation rows)
        const { data: followsData, error: followsError } = await supabase
          .from("follows")
          .select("id, following_id")
          .eq("follower_id", userId)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (followsError) {
          console.error("Supabase follows query error:", {
            message: followsError.message,
            details: (followsError as any).details ?? null,
            hint: (followsError as any).hint ?? null,
            code: (followsError as any).code ?? null,
          });
          setErrorMessage("Unable to load your following list right now.");
          setFollowing([]);
          setIsLoading(false);
          return;
        }

        const followRows = (followsData ?? []) as { id: string; following_id: string }[];

        // If there are no follows, show normal empty state (not an error)
        if (followRows.length === 0) {
          setFollowing([]);
          setIsLoading(false);
          return;
        }

        // Fetch the corresponding profiles in a second query to avoid relying on a DB relation
        const followingIds = followRows.map((r) => r.following_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url, profile_type")
          .in("id", followingIds);

        if (!isMounted) return;

        if (profilesError) {
          console.error("Supabase profiles query error:", {
            message: profilesError.message,
            details: (profilesError as any).details ?? null,
            hint: (profilesError as any).hint ?? null,
            code: (profilesError as any).code ?? null,
          });
          // Don't crash: return follows with null profiles so UI can show empty avatars safely
          const fallback = followRows.map((r) => ({ id: r.id, following_id: r.following_id, profiles: null }));
          setFollowing(fallback as FollowingProfile[]);
          setIsLoading(false);
          return;
        }

        const profiles = (profilesData ?? []) as {
          id: string;
          full_name: string | null;
          username: string | null;
          avatar_url: string | null;
          profile_type: string | null;
        }[];

        // Map follows to include the matching profile (if any)
        const mapped = followRows.map((r) => {
          const profile = profiles.find((p) => p.id === r.following_id) ?? null;
          return {
            id: r.id,
            following_id: r.following_id,
            profiles: profile
              ? {
                  id: profile.id,
                  full_name: profile.full_name ?? null,
                  username: profile.username ?? null,
                  avatar_url: profile.avatar_url ?? null,
                  profile_type: profile.profile_type ?? null,
                }
              : null,
          } as FollowingProfile;
        });

        setFollowing(mapped);
      } catch (err) {
        // Unexpected errors: log and show friendly message
        console.error("Unexpected error loading following:", err);
        setErrorMessage("Unable to load your following list right now.");
        setFollowing([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadFollowing();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        Loading your following list...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-rose-300">
        {errorMessage}
      </div>
    );
  }

  if (following.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
        You aren&apos;t following anyone yet. Visit a profile page to start following people.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {following.map((row) => {
        const profile = row.profiles;
        if (!profile) return null;

        const displayName = profile.full_name || profile.username || "Unnamed profile";
        const handle = profile.username ? (profile.username.startsWith("@") ? profile.username : `@${profile.username}`) : "";

        return (
          <Link
            key={row.id}
            href={`/profiles/${profile.id}`}
            className="block rounded-3xl border border-white/10 bg-[#10061f] p-4 transition hover:border-violet-400"
          >
            <div className="flex items-center gap-4">
              <img
                src={profile.avatar_url || "/api/placeholder/120/120"}
                alt={displayName}
                className="h-14 w-14 rounded-full border border-violet-500/20 object-cover"
              />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{displayName}</h3>
                <p className="text-sm text-violet-300">{handle}</p>
                <p className="mt-1 text-sm text-white/60">{profile.profile_type || "user"}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
