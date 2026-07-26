"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import {
  type Story,
  type StoryAuthorSummary,
  type StoryEventSummary,
  type StoryGroup,
  type StoryMediaType,
  type StoryRecord,
  type StoryVenueSummary,
  type VenueStoryGroup,
  filterActiveStories,
  groupStoriesByAuthor,
  groupStoriesByVenue,
  sortStoryGroupsForRail,
} from "@/lib/stories";

type ViewCountRow = {
  story_id?: string;
  id?: string;
  view_count?: number;
  count?: number;
  views?: number;
};

type ReactionCountRow = {
  story_id?: string | null;
};

type UseStoriesOptions = {
  enabled?: boolean;
  authorId?: string;
  venueId?: string;
  eventId?: string;
  limit?: number;
  includeConnectionOrdering?: boolean;
  includeOwnViewCounts?: boolean;
  subscribeOwnStoryViewCounts?: boolean;
};

type CreateStoryInput = {
  authorId: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption?: string | null;
  venueId?: string | null;
  eventId?: string | null;
};

type UseStoriesState = {
  currentUserId: string | null;
  stories: Story[];
  authorGroups: StoryGroup[];
  venueGroups: VenueStoryGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  recordView: (storyId: string) => Promise<void>;
  addReaction: (storyId: string, emoji: string) => Promise<{ ok: boolean; duplicate: boolean; error: string | null }>;
  softDeleteStory: (storyId: string) => Promise<{ ok: boolean; error: string | null }>;
  createStoryRecord: (input: CreateStoryInput) => Promise<{ ok: boolean; story: Story | null; error: string | null }>;
};

function toMap<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("pgrst205") || (message.includes("relation") && message.includes("does not exist"));
}

function nextRealtimeTopicSuffix() {
  const globalRef = globalThis as typeof globalThis & {
    __partysafariRealtimeTopicCounter__?: number;
  };
  const next = (globalRef.__partysafariRealtimeTopicCounter__ || 0) + 1;
  globalRef.__partysafariRealtimeTopicCounter__ = next;
  return next;
}

async function loadProfiles(supabase: ReturnType<typeof createSupabaseBrowser>, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, StoryAuthorSummary>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, profile_type")
    .in("id", profileIds);

  if (error) {
    logSupabaseQueryError({
      scope: "useStories.loadProfiles",
      table: "profiles",
      queryName: "loadProfiles",
      query: "select id, full_name, username, avatar_url, profile_type by profile ids",
      error,
    });
  }

  return toMap(((data || []) as StoryAuthorSummary[]).filter((row) => typeof row.id === "string" && row.id.length > 0));
}

async function loadVenues(supabase: ReturnType<typeof createSupabaseBrowser>, venueIds: string[]) {
  if (venueIds.length === 0) {
    return new Map<string, StoryVenueSummary>();
  }

  const { data, error } = await supabase
    .from("venues")
    .select("id, slug, name")
    .in("id", venueIds);

  if (error) {
    logSupabaseQueryError({
      scope: "useStories.loadVenues",
      table: "venues",
      queryName: "loadVenues",
      query: "select id, slug, name by venue ids",
      error,
    });
  }

  return toMap(
    ((data || []) as StoryVenueSummary[])
      .filter((row) => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({ ...row, name: row.name || "Venue" }))
  );
}

async function loadEvents(supabase: ReturnType<typeof createSupabaseBrowser>, eventIds: string[]) {
  if (eventIds.length === 0) {
    return new Map<string, StoryEventSummary>();
  }

  const { data, error } = await supabase
    .from("events")
    .select("id, title")
    .in("id", eventIds);

  if (error) {
    logSupabaseQueryError({
      scope: "useStories.loadEvents",
      table: "events",
      queryName: "loadEvents",
      query: "select id, title by event ids",
      error,
    });
  }

  return toMap(
    ((data || []) as StoryEventSummary[])
      .filter((row) => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({ ...row, title: row.title || "Event" }))
  );
}

async function loadCountMaps(supabase: ReturnType<typeof createSupabaseBrowser>, storyIds: string[]) {
  const viewCounts = new Map<string, number>();
  const reactionCounts = new Map<string, number>();

  if (storyIds.length === 0) {
    return { viewCounts, reactionCounts };
  }

  const [viewsSettled, reactionsSettled] = await Promise.allSettled([
    supabase.from("story_views").select("story_id").in("story_id", storyIds),
    supabase.from("story_reactions").select("story_id").in("story_id", storyIds),
  ]);

  const viewResult = viewsSettled.status === "fulfilled"
    ? viewsSettled.value
    : { data: [] as ViewCountRow[], error: normalizeUnknownError(viewsSettled.reason, "Failed to fetch story views.") };
  const reactionResult = reactionsSettled.status === "fulfilled"
    ? reactionsSettled.value
    : { data: [] as ReactionCountRow[], error: normalizeUnknownError(reactionsSettled.reason, "Failed to fetch story reactions.") };

  if (viewResult.error) {
    logSupabaseQueryError({
      scope: "useStories.loadCountMaps",
      table: "story_views",
      queryName: "loadStoryViews",
      query: "select story_id by story ids",
      error: viewResult.error,
    });
  }
  if (reactionResult.error) {
    if (!isMissingTableError(reactionResult.error)) {
      logSupabaseQueryError({
        scope: "useStories.loadCountMaps",
        table: "story_reactions",
        queryName: "loadStoryReactions",
        query: "select story_id by story ids",
        error: reactionResult.error,
      });
    } else if (process.env.NODE_ENV === "development") {
      console.warn("[Supabase][useStories.loadCountMaps] loadStoryReactions skipped: story_reactions table missing.");
    }
  }

  for (const row of (viewResult.data || []) as ViewCountRow[]) {
    const storyId = row.story_id || row.id;
    if (!storyId) {
      continue;
    }

    viewCounts.set(storyId, (viewCounts.get(storyId) || 0) + 1);
  }

  const reactionRows = isMissingTableError(reactionResult.error)
    ? ([] as ReactionCountRow[])
    : ((reactionResult.data || []) as ReactionCountRow[]);

  for (const row of reactionRows) {
    const storyId = row.story_id || null;
    if (!storyId) {
      continue;
    }

    reactionCounts.set(storyId, (reactionCounts.get(storyId) || 0) + 1);
  }

  return { viewCounts, reactionCounts };
}

async function loadRelationshipSets(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  currentUserId: string | null,
  enabled: boolean
) {
  const friendIds = new Set<string>();
  const followedIds = new Set<string>();

  if (!enabled || !currentUserId) {
    return { friendIds, followedIds };
  }

  const [followsSettled, friendshipsSettled] = await Promise.allSettled([
    supabase.from("follows").select("following_id").eq("follower_id", currentUserId),
    supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`),
  ]);

  const followsResult = followsSettled.status === "fulfilled"
    ? followsSettled.value
    : { data: [] as Array<{ following_id?: string | null }>, error: normalizeUnknownError(followsSettled.reason, "Failed to fetch follows.") };
  const friendshipsResult = friendshipsSettled.status === "fulfilled"
    ? friendshipsSettled.value
    : { data: [] as Array<{ user_id?: string | null; friend_id?: string | null }>, error: normalizeUnknownError(friendshipsSettled.reason, "Failed to fetch friendships.") };

  if (followsResult.error) {
    logSupabaseQueryError({
      scope: "useStories.loadRelationshipSets",
      table: "follows",
      queryName: "loadFollows",
      query: `select following_id where follower_id = ${currentUserId}`,
      error: followsResult.error,
    });
  }
  if (friendshipsResult.error) {
    logSupabaseQueryError({
      scope: "useStories.loadRelationshipSets",
      table: "friendships",
      queryName: "loadFriendships",
      query: `select user_id, friend_id where user_id = ${currentUserId} or friend_id = ${currentUserId}`,
      error: friendshipsResult.error,
    });
  }

  for (const row of (followsResult.data || []) as Array<{ following_id?: string | null }>) {
    if (row.following_id) {
      followedIds.add(row.following_id);
    }
  }

  for (const row of (friendshipsResult.data || []) as Array<{ user_id?: string | null; friend_id?: string | null }>) {
    if (row.user_id === currentUserId && row.friend_id) {
      friendIds.add(row.friend_id);
    }
    if (row.friend_id === currentUserId && row.user_id) {
      friendIds.add(row.user_id);
    }
  }

  return { friendIds, followedIds };
}

export function useStories(options: UseStoriesOptions = {}): UseStoriesState {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const viewedInSessionRef = useRef<Set<string>>(new Set());
  const isRefreshingRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  const normalizeStories = useCallback(
    async (rows: StoryRecord[], nextCurrentUserId: string | null) => {
      const activeRows = filterActiveStories(rows);
      const profileIds = Array.from(new Set(activeRows.map((row) => row.author_id).filter(Boolean)));
      const venueIds = Array.from(new Set(activeRows.map((row) => row.venue_id).filter((value): value is string => Boolean(value))));
      const eventIds = Array.from(new Set(activeRows.map((row) => row.event_id).filter((value): value is string => Boolean(value))));
      const storyIds = activeRows.map((row) => row.id);

      const [profilesSettled, venuesSettled, eventsSettled, relationshipsSettled, countsSettled, seenSettled] = await Promise.allSettled([
        loadProfiles(supabase, profileIds),
        loadVenues(supabase, venueIds),
        loadEvents(supabase, eventIds),
        loadRelationshipSets(supabase, nextCurrentUserId, Boolean(options.includeConnectionOrdering)),
        options.includeOwnViewCounts ? loadCountMaps(supabase, storyIds) : Promise.resolve({ viewCounts: new Map<string, number>(), reactionCounts: new Map<string, number>() }),
        nextCurrentUserId && storyIds.length > 0
          ? supabase.from("story_views").select("story_id").eq("viewer_id", nextCurrentUserId).in("story_id", storyIds)
          : Promise.resolve({ data: [] as Array<{ story_id: string }> }),
      ]);

      const profilesById = profilesSettled.status === "fulfilled" ? profilesSettled.value : new Map<string, StoryAuthorSummary>();
      const venuesById = venuesSettled.status === "fulfilled" ? venuesSettled.value : new Map<string, StoryVenueSummary>();
      const eventsById = eventsSettled.status === "fulfilled" ? eventsSettled.value : new Map<string, StoryEventSummary>();
      const relationshipSets = relationshipsSettled.status === "fulfilled"
        ? relationshipsSettled.value
        : { friendIds: new Set<string>(), followedIds: new Set<string>() };
      const countMaps = countsSettled.status === "fulfilled"
        ? countsSettled.value
        : { viewCounts: new Map<string, number>(), reactionCounts: new Map<string, number>() };
      const seenRowsResponse = seenSettled.status === "fulfilled"
        ? seenSettled.value
        : { data: [] as Array<{ story_id?: string | null }>, error: normalizeUnknownError(seenSettled.reason, "Failed to fetch seen story ids.") };

      if (profilesSettled.status === "rejected") {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "profiles",
          queryName: "loadProfiles",
          query: "loadProfiles helper",
          error: normalizeUnknownError(profilesSettled.reason, "Failed to load profiles."),
        });
      }
      if (venuesSettled.status === "rejected") {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "venues",
          queryName: "loadVenues",
          query: "loadVenues helper",
          error: normalizeUnknownError(venuesSettled.reason, "Failed to load venues."),
        });
      }
      if (eventsSettled.status === "rejected") {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "events",
          queryName: "loadEvents",
          query: "loadEvents helper",
          error: normalizeUnknownError(eventsSettled.reason, "Failed to load events."),
        });
      }
      if (relationshipsSettled.status === "rejected") {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "follows/friendships",
          queryName: "loadRelationshipSets",
          query: "loadRelationshipSets helper",
          error: normalizeUnknownError(relationshipsSettled.reason, "Failed to load relationship sets."),
        });
      }
      if (countsSettled.status === "rejected") {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "story_views/story_reactions",
          queryName: "loadStoryMetrics",
          query: "loadCountMaps helper",
          error: normalizeUnknownError(countsSettled.reason, "Failed to load story metrics."),
        });
      }
      if ("error" in seenRowsResponse && seenRowsResponse.error) {
        logSupabaseQueryError({
          scope: "useStories.normalizeStories",
          table: "story_views",
          queryName: "loadSeenStoryViews",
          query: "select story_id for current viewer and visible story ids",
          error: seenRowsResponse.error,
        });
      }

      const seenIds = new Set<string>(viewedInSessionRef.current);
      for (const row of ((seenRowsResponse.data || []) as Array<{ story_id?: string | null }>)) {
        if (row.story_id) {
          seenIds.add(row.story_id);
        }
      }

      const normalized = activeRows
        .map((row) => {
          const author = profilesById.get(row.author_id) || null;
          const venue = row.venue_id ? venuesById.get(row.venue_id) || null : null;
          const event = row.event_id ? eventsById.get(row.event_id) || null : null;

          return {
            ...row,
            author,
            venue,
            event,
            isSeen: seenIds.has(row.id),
            viewCount: countMaps.viewCounts.get(row.id) ?? 0,
            reactionCount: countMaps.reactionCounts.get(row.id) ?? 0,
          } as Story;
        })
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

      return {
        stories: normalized,
        friendIds: relationshipSets.friendIds,
        followedIds: relationshipSets.followedIds,
      };
    },
    [options.includeConnectionOrdering, options.includeOwnViewCounts, supabase]
  );

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    isRefreshingRef.current = true;

    try {
    if (options.enabled === false) {
      setStories([]);
      setFriendIds(new Set());
      setFollowedIds(new Set());
      setCurrentUserId(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const nextCurrentUserId = await resolveCurrentUserId();
    setCurrentUserId(nextCurrentUserId);

    let query = supabase
      .from("stories")
      .select("id, author_id, media_url, media_type, caption, venue_id, event_id, created_at, expires_at, deleted_at")
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (options.authorId) {
      query = query.eq("author_id", options.authorId);
    }
    if (options.venueId) {
      query = query.eq("venue_id", options.venueId);
    }
    if (options.eventId) {
      query = query.eq("event_id", options.eventId);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error: loadError } = await query;

    if (loadError) {
      logSupabaseQueryError({
        scope: "useStories.refresh",
        table: "stories",
        queryName: "loadStories",
        query: "select id, author_id, media_url, media_type, caption, venue_id, event_id, created_at, expires_at, deleted_at where deleted_at is null and expires_at > now",
        error: loadError,
      });
      setStories([]);
      setError(loadError.message || "Unable to load stories right now.");
      setLoading(false);
      return;
    }

    const normalized = await normalizeStories((data || []) as StoryRecord[], nextCurrentUserId);
    setFriendIds(normalized.friendIds);
    setFollowedIds(normalized.followedIds);
    setStories(normalized.stories);
    setLoading(false);
    } finally {
      isRefreshingRef.current = false;
      if (queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        void refresh();
      }
    }
  }, [normalizeStories, options.authorId, options.enabled, options.eventId, options.limit, options.venueId, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (options.enabled === false) {
      return;
    }

    const storiesTopic = `stories:${options.authorId || "all"}:${options.venueId || "all"}:${options.eventId || "all"}:${nextRealtimeTopicSuffix()}`;
    const channel = supabase.channel(storiesTopic);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "stories",
      },
      () => {
        void refresh();
      }
    );

    void channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[DiscoverTonight] stories subscription status", {
            channel: storiesTopic,
            status,
          });
        }
        window.setTimeout(() => {
          void refresh();
        }, 300);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [options.authorId, options.enabled, options.eventId, options.venueId, refresh, supabase]);

  useEffect(() => {
    if (!options.subscribeOwnStoryViewCounts) {
      return;
    }

    const storyIds = new Set(stories.map((story) => story.id));
    if (storyIds.size === 0) {
      return;
    }

    const storyMetricsTopic = `story-metrics:${options.authorId || "all"}:${options.venueId || "all"}:${options.eventId || "all"}:${nextRealtimeTopicSuffix()}`;
    const channel = supabase.channel(storyMetricsTopic);
    const handleMetricChange = (payload: { new?: { story_id?: string | null }; old?: { story_id?: string | null } }) => {
      const changedStoryId = payload.new?.story_id || payload.old?.story_id || null;
      if (!changedStoryId || !storyIds.has(changedStoryId)) {
        return;
      }

      void refresh();
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "story_views",
      },
      handleMetricChange
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "story_reactions",
      },
      handleMetricChange
    );

    void channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[DiscoverTonight] story metrics subscription status", {
            channel: storyMetricsTopic,
            status,
          });
        }
        window.setTimeout(() => {
          void refresh();
        }, 300);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [options.authorId, options.eventId, options.subscribeOwnStoryViewCounts, options.venueId, refresh, stories, supabase]);

  useEffect(() => {
    if (stories.length === 0) {
      return;
    }

    const futureExpirations = stories
      .map((story) => new Date(story.expires_at).getTime())
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right);

    if (futureExpirations.length === 0) {
      return;
    }

    const timeoutMs = Math.max(1000, futureExpirations[0] - Date.now() + 250);
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refresh, stories]);

  const recordView = useCallback(
    async (storyId: string) => {
      if (viewedInSessionRef.current.has(storyId)) {
        setStories((current) => current.map((story) => (story.id === storyId ? { ...story, isSeen: true } : story)));
        return;
      }

      viewedInSessionRef.current.add(storyId);
      setStories((current) =>
        current.map((story) =>
          story.id === storyId
            ? {
                ...story,
                isSeen: true,
                viewCount: (story.viewCount || 0) + (currentUserId ? 1 : 0),
              }
            : story
        )
      );

      if (!currentUserId) {
        return;
      }

      const { error: viewError } = await supabase.from("story_views").upsert(
        {
          story_id: storyId,
          viewer_id: currentUserId,
        },
        {
          onConflict: "story_id,viewer_id",
          ignoreDuplicates: true,
        }
      );

      if (viewError) {
        setStories((current) =>
          current.map((story) =>
            story.id === storyId
              ? {
                  ...story,
                  viewCount: Math.max(0, (story.viewCount || 1) - 1),
                }
              : story
          )
        );
      }
    },
    [currentUserId, supabase]
  );

  const addReaction = useCallback(
    async (storyId: string, emoji: string) => {
      if (!currentUserId) {
        return { ok: false, duplicate: false, error: "Sign in to react to stories." };
      }

      const reaction = emoji.trim();
      if (!reaction) {
        return { ok: false, duplicate: false, error: "Choose a reaction first." };
      }

      const { error: insertError } = await supabase.from("story_reactions").insert({
        story_id: storyId,
        reactor_id: currentUserId,
        reaction,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          return { ok: false, duplicate: true, error: null };
        }
        return { ok: false, duplicate: false, error: insertError.message || "Could not save reaction." };
      }

      setStories((current) =>
        current.map((story) =>
          story.id === storyId
            ? {
                ...story,
                reactionCount: (story.reactionCount || 0) + 1,
              }
            : story
        )
      );

      return { ok: true, duplicate: false, error: null };
    },
    [currentUserId, supabase]
  );

  const softDeleteStory = useCallback(
    async (storyId: string) => {
      const previous = stories;
      setStories((current) => current.filter((story) => story.id !== storyId));

      const { error: deleteError } = await supabase.rpc("soft_delete_story", {
        p_story_id: storyId,
      });

      if (deleteError) {
        setStories(previous);
        return { ok: false, error: deleteError.message || "Could not delete story." };
      }

      return { ok: true, error: null };
    },
    [stories, supabase]
  );

  const createStoryRecord = useCallback(
    async (input: CreateStoryInput) => {
      const payload = {
        author_id: input.authorId,
        media_url: input.mediaUrl,
        media_type: input.mediaType,
        caption: input.caption || null,
        venue_id: input.venueId || null,
        event_id: input.eventId || null,
      };

      const { data, error: insertError } = await supabase
        .from("stories")
        .insert(payload)
        .select("id, author_id, media_url, media_type, caption, venue_id, event_id, created_at, expires_at, deleted_at")
        .single();

      if (insertError || !data) {
        return {
          ok: false,
          story: null,
          error: insertError?.message || "Could not publish story.",
        };
      }

      const normalized = await normalizeStories([data as StoryRecord], currentUserId);
      const nextStory = normalized.stories[0] || null;

      if (nextStory) {
        setStories((current) => {
          const deduped = current.filter((story) => story.id !== nextStory.id);
          return [...deduped, nextStory].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
        });
      }

      return {
        ok: true,
        story: nextStory,
        error: null,
      };
    },
    [currentUserId, normalizeStories, supabase]
  );

  const authorGroups = useMemo(() => {
    const groups = groupStoriesByAuthor(stories);
    return sortStoryGroupsForRail(groups, currentUserId, friendIds, followedIds);
  }, [currentUserId, followedIds, friendIds, stories]);

  const venueGroups = useMemo(() => groupStoriesByVenue(stories), [stories]);

  return {
    currentUserId,
    stories,
    authorGroups,
    venueGroups,
    loading,
    error,
    refresh,
    recordView,
    addReaction,
    softDeleteStory,
    createStoryRecord,
  };
}