"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import FollowButton from "@/components/FollowButton";
import FriendButton from "@/components/social/FriendButton";
import ProfileSafetyActions from "@/components/social/ProfileSafetyActions";
import StoryComposer from "@/components/stories/StoryComposer";
import StoryGrid from "@/components/stories/StoryGrid";
import StoryViewer from "@/components/stories/StoryViewer";
import { useStories } from "@/components/stories/useStories";

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  location: string | null;
  profile_type: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

interface ProfilePageState {
  id: string;
  type: string;
  name: string;
  username: string;
  avatar: string | null;
  coverImage: string;
  bio: string;
  location: string;
  joinedDate: string;
  stats: {
    followers: number;
    following: number;
    eventsAttended: number;
    photosShared: number;
    eventsHosted: number;
    rating: number;
    reviews: number;
    gigsPlayed: number;
    tracks: number;
  };
  recentEvents: any[];
  favoriteGenres: string[];
  upcomingEvents: any[];
  amenities: string[];
  currentPromotions: string[];
  upcomingGigs: any[];
  genres: string[];
  achievements: string[];
}

function ProfileAvatar({
  name,
  username,
  avatarUrl,
}: {
  name: string;
  username: string;
  avatarUrl: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const safeAvatarUrl = typeof avatarUrl === "string" && avatarUrl.trim().length > 0
    ? avatarUrl
    : null;
  const initials = (name || username || "?")
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (safeAvatarUrl && !imgError) {
    return (
      <img
        src={safeAvatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="h-24 w-24 rounded-full border-4 border-violet-500/20 object-cover"
      />
    );
  }

  return (
    <div className="h-24 w-24 rounded-full border-4 border-violet-500/20 bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
      <span className="text-xl font-bold text-white">{initials || "?"}</span>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [profile, setProfile] = useState<ProfilePageState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);

  const rawId = (params?.id as string | undefined) ?? "";
  const lookup = (rawId.startsWith("@") ? rawId.slice(1) : rawId).toLowerCase();
  const storyState = useStories({
    enabled: Boolean(profile?.id),
    authorId: profile?.id || undefined,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);

      const { data: row, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, bio, location, profile_type, avatar_url, created_at")
        .or(`id.eq.${lookup},username.eq.${lookup}`)
        .maybeSingle();

      if (!isMounted) return;

      if (error || !row) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const profileRow = row as ProfileRow;
      const profileData: ProfilePageState = {
        id: profileRow.id,
        type: (profileRow.profile_type as string) ?? "user",
        name: profileRow.full_name || profileRow.username || "",
        username: profileRow.username ? (profileRow.username.startsWith("@") ? profileRow.username : `@${profileRow.username}`) : "",
        avatar: profileRow.avatar_url?.trim() ? profileRow.avatar_url : null,
        coverImage: "/api/placeholder/800/300",
        bio: profileRow.bio || "",
        location: profileRow.location || "",
        joinedDate: profileRow.created_at ? new Date(profileRow.created_at).toLocaleString(undefined, { month: "long", year: "numeric" }) : "",
        stats: {
          followers: 0,
          following: 0,
          eventsAttended: 0,
          photosShared: 0,
          eventsHosted: 0,
          rating: 0,
          reviews: 0,
          gigsPlayed: 0,
          tracks: 0,
        },
        recentEvents: [],
        favoriteGenres: [],
        upcomingEvents: [],
        amenities: [],
        currentPromotions: [],
        upcomingGigs: [],
        genres: [],
        achievements: [],
      };

      setProfile(profileData);

      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id ?? null;

      if (currentUserId && currentUserId !== profileRow.id) {
        const { data: followData } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", currentUserId)
          .eq("following_id", profileRow.id)
          .maybeSingle();

        setIsFollowing(Boolean(followData));
      } else {
        setIsFollowing(false);
      }

      const { count: followerCount } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", profileRow.id);

      const { count: followingCountValue } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", profileRow.id);

      if (!isMounted) return;

      setFollowersCount(followerCount ?? 0);
      setFollowingCount(followingCountValue ?? 0);
      setIsLoading(false);
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [lookup, supabase]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold mb-4">Loading Profile</h1>
          <p className="text-white/70">Please wait while we load the profile details.</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold mb-4">Profile Not Found</h1>
          <p className="text-white/70">The profile you're looking for doesn't exist.</p>
        </div>
      </main>
    );
  }

  const fmt = (n?: number) => (n ?? 0).toLocaleString();
  const isOwnProfile = storyState.currentUserId === profile.id;
  const hasActiveStories = storyState.authorGroups.length > 0;
  const profileStories = [...storyState.stories].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const renderProfileAvatar = () => {
    const avatar = <ProfileAvatar name={profile.name} username={profile.username} avatarUrl={profile.avatar} />;
    if (!hasActiveStories) {
      return avatar;
    }

    return (
      <button type="button" onClick={() => setViewerAuthorId(profile.id)} className="rounded-full bg-gradient-to-br from-violet-500 to-orange-500 p-1">
        {avatar}
      </button>
    );
  };

  const storySection = hasActiveStories || isOwnProfile ? (
    <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">Story</h2>
          <p className="mt-1 text-sm text-white/65">Active stories disappear automatically after they expire.</p>
        </div>
        {isOwnProfile ? (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
          >
            Add Story
          </button>
        ) : null}
      </div>
      <StoryGrid
        stories={profileStories}
        emptyMessage="No active stories right now."
        onOpenStory={(story) => setViewerAuthorId(story.author_id)}
      />
    </section>
  ) : null;

  const renderUserProfile = () => (
    <div className="space-y-8">
      {/* Header Section */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <div className="flex items-start gap-6">
          {renderProfileAvatar()}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
            <p className="text-violet-300">{profile.username}</p>
            <p className="mt-2 text-white/70">{profile.bio}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-white/60">
              <span>📍 {profile.location}</span>
              <span>📅 Joined {profile.joinedDate}</span>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <FollowButton
              targetUserId={profile.id}
              initialFollowing={isFollowing}
              onStateChange={(next) => {
                setIsFollowing(next);
                setFollowersCount((value) => Math.max(0, value + (next ? 1 : -1)));
              }}
            />
            <FriendButton targetUserId={profile.id} />
            <button className="rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
              Message
            </button>
            <ProfileSafetyActions targetUserId={profile.id} />
          </div>
        </div>
      </section>

      {storySection}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{fmt(followersCount)}</div>
          <div className="text-sm text-white/60">Followers</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{fmt(followingCount)}</div>
          <div className="text-sm text-white/60">Following</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.eventsAttended}</div>
          <div className="text-sm text-white/60">Events</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.photosShared}</div>
          <div className="text-sm text-white/60">Photos</div>
        </div>
      </section>

      {/* Recent Events */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <h2 className="text-2xl font-semibold text-white mb-6">Recent Events</h2>
        <div className="space-y-4">
          {(profile.recentEvents ?? []).map((event: any, index: number) => (
            <div key={index} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
              <div>
                <h3 className="font-semibold text-white">{event.name}</h3>
                <p className="text-sm text-violet-300">{event.venue}</p>
              </div>
              <span className="text-sm text-white/60">{event.date}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Favorite Genres */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Favorite Genres</h2>
        <div className="flex flex-wrap gap-2">
          {(profile.favoriteGenres ?? []).map((genre: any) => (
            <span
              key={genre}
              className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200"
            >
              {genre}
            </span>
          ))}
        </div>
      </section>
    </div>
  );

  const renderBusinessProfile = () => (
    <div className="space-y-8">
      {/* Header Section */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <div className="flex items-start gap-6">
          {renderProfileAvatar()}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
            <p className="text-violet-300">{profile.username}</p>
            <p className="mt-2 text-white/70">{profile.bio}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-white/60">
              <span>📍 {profile.location}</span>
              <span>📅 Since {profile.joinedDate}</span>
              <span>⭐ {profile.stats.rating}/5 ({profile.stats.reviews} reviews)</span>
            </div>
          </div>
          <div className="flex gap-3">
            <FollowButton
              targetUserId={profile.id}
              initialFollowing={isFollowing}
              onStateChange={(next) => {
                setIsFollowing(next);
                setFollowersCount((value) => Math.max(0, value + (next ? 1 : -1)));
              }}
            />
            <button className="rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
              Message
            </button>
            <ProfileSafetyActions targetUserId={profile.id} />
            <button className="rounded-full border border-white/20 bg-white/10 px-6 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
              Book Event
            </button>
          </div>
        </div>
      </section>

      {storySection}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{fmt(followersCount)}</div>
          <div className="text-sm text-white/60">Followers</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.eventsHosted}</div>
          <div className="text-sm text-white/60">Events Hosted</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.rating}</div>
          <div className="text-sm text-white/60">Rating</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{fmt(profile.stats.reviews)}</div>
          <div className="text-sm text-white/60">Reviews</div>
        </div>
      </section>

      {/* Upcoming Events */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <h2 className="text-2xl font-semibold text-white mb-6">Upcoming Events</h2>
        <div className="space-y-4">
          {(profile.upcomingEvents ?? []).map((event: any, index: number) => (
            <div key={index} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
              <div>
                <h3 className="font-semibold text-white">{event.name}</h3>
                <p className="text-sm text-violet-300">{event.date}</p>
              </div>
              <div className="text-right">
                <span className="text-sm text-white/60">Capacity: {event.capacity}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Amenities & Promotions */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {(profile.amenities ?? []).map((amenity: any) => (
              <span
                key={amenity}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200"
              >
                {amenity}
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Current Promotions</h2>
          <div className="space-y-2">
            {(profile.currentPromotions ?? []).map((promo: any, index: number) => (
              <div key={index} className="rounded-lg bg-violet-500/10 p-3">
                <p className="text-sm text-violet-200">{promo}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderEntertainerProfile = () => (
    <div className="space-y-8">
      {/* Header Section */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <div className="flex items-start gap-6">
          {renderProfileAvatar()}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
            <p className="text-violet-300">{profile.username}</p>
            <p className="mt-2 text-white/70">{profile.bio}</p>
            <div className="mt-4 flex items-center gap-4 text-sm text-white/60">
              <span>📍 {profile.location}</span>
              <span>📅 Joined {profile.joinedDate}</span>
              <span>⭐ {profile.stats.rating}/5 rating</span>
            </div>
          </div>
          <div className="flex gap-3">
            <FollowButton
              targetUserId={profile.id}
              initialFollowing={isFollowing}
              onStateChange={(next) => {
                setIsFollowing(next);
                setFollowersCount((value) => Math.max(0, value + (next ? 1 : -1)));
              }}
            />
            <button className="rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-violet-500">
              Message
            </button>
            <ProfileSafetyActions targetUserId={profile.id} />
            <button className="rounded-full border border-white/20 bg-white/10 px-6 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
              Book
            </button>
          </div>
        </div>
      </section>

      {storySection}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{fmt(followersCount)}</div>
          <div className="text-sm text-white/60">Followers</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.gigsPlayed}</div>
          <div className="text-sm text-white/60">Gigs Played</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.rating}</div>
          <div className="text-sm text-white/60">Rating</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4 text-center">
          <div className="text-2xl font-bold text-white">{profile.stats.tracks}</div>
          <div className="text-sm text-white/60">Tracks</div>
        </div>
      </section>

      {/* Upcoming Gigs */}
      <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
        <h2 className="text-2xl font-semibold text-white mb-6">Upcoming Gigs</h2>
        <div className="space-y-4">
          {(profile.upcomingGigs ?? []).map((gig: any, index: number) => (
            <div key={index} className="flex items-center justify-between rounded-2xl bg-white/5 p-4">
              <div>
                <h3 className="font-semibold text-white">{gig.venue} - {gig.event}</h3>
                <p className="text-sm text-violet-300">{gig.date}</p>
              </div>
              <div className="text-right">
                <span className="text-sm text-white/60">{gig.duration}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Genres & Achievements */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Genres</h2>
          <div className="flex flex-wrap gap-2">
            {(profile.genres ?? []).map((genre: any) => (
              <span
                key={genre}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200"
              >
                {genre}
              </span>
            ))}
          </div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Achievements</h2>
          <div className="space-y-2">
            {(profile.achievements ?? []).map((achievement: any, index: number) => (
              <div key={index} className="rounded-lg bg-violet-500/10 p-3">
                <p className="text-sm text-violet-200">🏆 {achievement}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {profile.type === 'user' && renderUserProfile()}
        {profile.type === 'business' && renderBusinessProfile()}
        {profile.type === 'entertainer' && renderEntertainerProfile()}
      </div>

      <StoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        createStoryRecord={storyState.createStoryRecord}
      />

      {viewerAuthorId ? (
        <StoryViewer
          groups={storyState.authorGroups}
          currentUserId={storyState.currentUserId}
          initialAuthorId={viewerAuthorId}
          onClose={() => setViewerAuthorId(null)}
          onRecordView={storyState.recordView}
          onAddReaction={storyState.addReaction}
          onDeleteStory={storyState.softDeleteStory}
        />
      ) : null}
    </main>
  );
}