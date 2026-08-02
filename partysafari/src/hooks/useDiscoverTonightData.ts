"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser, resolveCurrentUserId } from "@/lib/supabaseClient";
import { emptyPartyScore, toSafePartyScore, type PartyScoreDetails } from "@/lib/partyScore";
import { explainVenue, type PsiExplanation } from "@/lib/psi";
import { usePartyScores } from "@/hooks/usePartyScore";
import { useLiveVenueMetrics } from "@/hooks/useLiveVenueMetrics";
import { useStories } from "@/components/stories/useStories";
import { logSupabaseQueryError, normalizeUnknownError } from "@/lib/supabaseDiagnostics";
import { getCrowdLevel, type CrowdLevel } from "@/lib/venueCheckInUtils";

type EventStatus = "going" | "interested" | "not_going";

type VenueRow = Record<string, unknown>;
type EventRow = Record<string, unknown>;

export type DiscoverFriend = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
};

export type DiscoverVenue = {
  id: string;
  slug: string;
  name: string;
  venueType: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  photoUrl: string | null;
  currentStatus: string | null;
  musicGenres: string[];
  drinkSpecials: string | null;
  description: string | null;
  vipAvailable: boolean;
  foodAvailable: boolean;
};

export type DiscoverEvent = {
  id: string;
  venueId: string | null;
  title: string;
  performerName: string | null;
  eventType: string | null;
  startTime: string;
  endTime: string | null;
  imageUrl: string | null;
  description: string | null;
  ticketUrl: string | null;
  drinkSpecials: string | null;
  coverCharge: number | null;
  status: string;
  featured: boolean;
  venue: DiscoverVenue | null;
  distanceMiles: number | null;
  friendAttendees: DiscoverFriend[];
  storyCount: number;
  rsvpCounts: Record<EventStatus, number>;
  myRsvp: EventStatus | null;
  isSoon: boolean;
  isNow: boolean;
};

export type DiscoverVenueCardData = DiscoverVenue & {
  /**
   * The engine's full result, not just the public `PartyScore` face of it. The
   * value assigned here has always been a `PartyScoreDetails`; naming the wider
   * type is what lets PSI read `signals` and `breakdown` without a second fetch.
   */
  partyScore: PartyScoreDetails;
  /** PSI's read on the room, derived from `partyScore` — no extra fetch. */
  psiExplanation: PsiExplanation;
  currentEvent: string | null;
  currentEntertainment: string | null;
  /**
   * Lowercased `events.event_type` for the events actually running at this
   * venue now. Real rows only — surfaces that key off programming (AI Discover
   * Cards) read this rather than guessing from the venue's genre tags.
   */
  liveEventTypes: string[];
  /** Performer or title of the running event, for surfaces that name it. */
  liveEventTitle: string | null;
  distanceMiles: number | null;
  distanceLabel: string;
  liveCheckins: number;
  activeStories: number;
  currentEvents: number;
  friendsHereCount: number;
  friendsHere: DiscoverFriend[];
  storyCount: number;
  openNow: boolean;
  goingRsvps: number;
  interestedRsvps: number;
};

export type DiscoverFriendGroup = {
  id: string;
  type: "venue" | "event";
  title: string;
  href: string;
  people: DiscoverFriend[];
  subtitle: string;
};

export type DiscoverStorySpotlight = {
  id: string;
  authorId: string;
  title: string;
  subtitle: string;
  venueHref: string | null;
  venueName: string | null;
  imageUrl: string | null;
  activityScore: number;
  friendBoost: number;
  distanceMiles: number | null;
  distanceLabel: string;
  storyCount: number;
};

export type DiscoverRecommendation = {
  id: string;
  venue: DiscoverVenueCardData;
  /** PSI reason sentences, flattened. Kept for callers that only want the text. */
  reasons: string[];
  /** The same reasons with the signal and value behind each one still attached. */
  explanation: PsiExplanation;
  recommendationScore: number;
};

type DiscoverState = {
  currentUserId: string | null;
  loading: boolean;
  error: string | null;
  sectionStates: Record<
    "hotRightNow" | "eventsStartingSoon" | "friendsOutTonight" | "liveStories" | "heatingUp" | "liveEntertainment" | "happeningNow" | "recommendations",
    {
      loading: boolean;
      error: string | null;
    }
  >;
  updatedLabel: string;
  peopleOutTonight: number;
  liveEvents: number;
  activeStories: number;
  trendingVenues: number;
  hotRightNow: DiscoverVenueCardData[];
  heatingUp: DiscoverVenueCardData[];
  /**
   * Every loaded venue, score-sorted and unsliced. `hotRightNow` is the top of
   * this list; surfaces that classify rather than rank — the AI Discover Cards
   * look for hidden gems and out-of-town venues, which by definition are not at
   * the top — need the whole population, and re-deriving it would mean a second
   * copy of the composition above.
   */
  venueCards: DiscoverVenueCardData[];
  eventsStartingSoon: DiscoverEvent[];
  friendsOutTonight: DiscoverFriendGroup[];
  liveStories: DiscoverStorySpotlight[];
  liveEntertainment: DiscoverEvent[];
  happeningNow: Array<{ id: string; title: string; subtitle: string; href: string }>;
  recommendations: DiscoverRecommendation[];
  refresh: () => Promise<void>;
};

type BaseState = {
  currentUserId: string | null;
  venues: DiscoverVenue[];
  events: DiscoverEvent[];
  friendProfiles: Record<string, DiscoverFriend>;
  friendCheckinsByVenueId: Record<string, string[]>;
  savedEventIds: Set<string>;
  updatedAt: string;
};

type QueryErrors = {
  venues: string | null;
  events: string | null;
  friendships: string | null;
  profiles: string | null;
  friendCheckins: string | null;
  rsvps: string | null;
  savedEvents: string | null;
};

const DEFAULT_COORDS = { lat: 30.2672, lng: -97.7431 };

function parseText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [] as string[];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 0.621371 * earthRadiusKm * c;
}

function formatDistanceLabel(distanceMiles: number | null) {
  if (distanceMiles === null || !Number.isFinite(distanceMiles)) {
    return "Distance TBD";
  }
  if (distanceMiles < 0.15) {
    return "Walkable";
  }
  if (distanceMiles < 10) {
    return `${distanceMiles.toFixed(1)} mi away`;
  }
  return `${Math.round(distanceMiles)} mi away`;
}

function isActiveEventStatus(status: string | null) {
  return ["active", "published", "live", "scheduled"].includes((status || "").toLowerCase());
}

function isOpenNow(currentStatus: string | null) {
  const status = (currentStatus || "open").toLowerCase();
  return !status.includes("closed");
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function combineErrors(values: Array<string | null | undefined>) {
  const unique = Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
  return unique.length > 0 ? unique.join(" | ") : null;
}

function getErrorMessage(error: { message?: string | null } | null | undefined, fallback: string) {
  return error?.message?.trim() ? error.message.trim() : fallback;
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("42703") || (message.includes("column") && message.includes("does not exist"));
}

export function useDiscoverTonightData(): DiscoverState {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [baseState, setBaseState] = useState<BaseState>({
    currentUserId: null,
    venues: [],
    events: [],
    friendProfiles: {},
    friendCheckinsByVenueId: {},
    savedEventIds: new Set<string>(),
    updatedAt: new Date().toISOString(),
  });
  const [loadingBase, setLoadingBase] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryErrors, setQueryErrors] = useState<QueryErrors>({
    venues: null,
    events: null,
    friendships: null,
    profiles: null,
    friendCheckins: null,
    rsvps: null,
    savedEvents: null,
  });
  const isRefreshingRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setCoords(DEFAULT_COORDS);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
    );
  }, []);

  const storyState = useStories({
    includeConnectionOrdering: true,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });

  const venueIds = useMemo(() => baseState.venues.map((venue) => venue.id), [baseState.venues]);

  const liveMetrics = useLiveVenueMetrics({
    venueIds,
    enabled: venueIds.length > 0,
    subscribeVisibleOnly: false,
  });
  const partyScores = usePartyScores({
    venueIds,
    enabled: venueIds.length > 0,
    subscribeVisibleOnly: false,
  });

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    isRefreshingRef.current = true;
    setLoadingBase(true);
    setError(null);
    setQueryErrors({
      venues: null,
      events: null,
      friendships: null,
      profiles: null,
      friendCheckins: null,
      rsvps: null,
      savedEvents: null,
    });

    try {
      const currentUserId = await resolveCurrentUserId();
    const nowIso = new Date().toISOString();
    const dayAheadIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const activeCoords = coords || DEFAULT_COORDS;

    const loadEvents = async () => {
      const primary = await supabase
        .from("events")
        .select("id, venue_id, title, description, event_type, performer_name, start_time, end_time, image_url, cover_image, ticket_url, ticket_link, drink_specials, cover_charge, featured, status")
        .gte("start_time", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .lte("start_time", dayAheadIso)
        .order("start_time", { ascending: true })
        .limit(240);

      if (!primary.error || !isMissingColumnError(primary.error)) {
        return primary;
      }

      const fallback = await supabase
        .from("events")
        .select("id, venue_id, title, description, start_time, end_time, image_url, cover_image, ticket_url, ticket_link, cover_charge, status")
        .gte("start_time", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .lte("start_time", dayAheadIso)
        .order("start_time", { ascending: true })
        .limit(240);

      if (!fallback.error && process.env.NODE_ENV === "development") {
        console.warn("[Supabase][useDiscoverTonightData.refresh.base] loadEvents fallback succeeded after missing-column error");
      }

      return fallback.error ? primary : fallback;
    };

    const [venuesSettled, eventsSettled, friendshipsSettled] = await Promise.allSettled([
      supabase
        .from("venues")
        .select("id, slug, name, venue_type, city, state, latitude, longitude, image_url, photo_url, current_status, music_genres, drink_specials, description, vip_available, food_available")
        .limit(48),
      loadEvents(),
      currentUserId
        ? supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        : Promise.resolve({ data: [] as Array<{ user_id: string; friend_id: string }>, error: null }),
    ]);

    const venuesResult = venuesSettled.status === "fulfilled"
      ? venuesSettled.value
      : { data: [] as VenueRow[], error: normalizeUnknownError(venuesSettled.reason, "Failed to fetch venues.") };
    const eventsResult = eventsSettled.status === "fulfilled"
      ? eventsSettled.value
      : { data: [] as EventRow[], error: normalizeUnknownError(eventsSettled.reason, "Failed to fetch events.") };
    const friendshipsResult = friendshipsSettled.status === "fulfilled"
      ? friendshipsSettled.value
      : { data: [] as Array<{ user_id: string; friend_id: string }>, error: normalizeUnknownError(friendshipsSettled.reason, "Failed to fetch friendships.") };

    if (venuesResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.base",
        table: "venues",
        queryName: "loadVenues",
        query: "select id, slug, name, venue_type, city, state, latitude, longitude, image_url, photo_url, current_status, music_genres, drink_specials, description, vip_available, food_available limit 48",
        error: venuesResult.error,
      });
    }

    if (eventsResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.base",
        table: "events",
        queryName: "loadEvents",
        query: "select id, venue_id, title, description, event_type, performer_name, start_time, end_time, image_url, cover_image, ticket_url, ticket_link, drink_specials, cover_charge, featured, status filtered by start_time range",
        error: eventsResult.error,
      });
    }

    if (friendshipsResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.base",
        table: "friendships",
        queryName: "loadFriendships",
        query: `select user_id, friend_id where user_id = ${currentUserId} or friend_id = ${currentUserId}`,
        error: friendshipsResult.error,
      });
    }

    setQueryErrors((current) => ({
      ...current,
      venues: venuesResult.error ? getErrorMessage(venuesResult.error, "Failed to load venues.") : null,
      events: eventsResult.error ? getErrorMessage(eventsResult.error, "Failed to load events.") : null,
      friendships: friendshipsResult.error ? getErrorMessage(friendshipsResult.error, "Failed to load friendships.") : null,
    }));

    const venues = ((venuesResult.data || []) as VenueRow[])
      .map((row) => ({
        id: parseText(row.id) || "",
        slug: parseText(row.slug) || parseText(row.id) || "",
        name: parseText(row.name) || "Venue",
        venueType: parseText(row.venue_type),
        city: parseText(row.city),
        state: parseText(row.state),
        latitude: parseNumber(row.latitude),
        longitude: parseNumber(row.longitude),
        imageUrl: parseText(row.image_url),
        photoUrl: parseText(row.photo_url),
        currentStatus: parseText(row.current_status),
        musicGenres: parseStringArray(row.music_genres),
        drinkSpecials: parseText(row.drink_specials),
        description: parseText(row.description),
        vipAvailable: Boolean(row.vip_available),
        foodAvailable: Boolean(row.food_available),
      }))
      .filter((venue) => venue.id.length > 0);

    const venueById = new Map(venues.map((venue) => [venue.id, venue]));
    const friendIds = uniqueIds(
      (((friendshipsResult.data || []) as Array<{ user_id?: string | null; friend_id?: string | null }>)
        .map((row) => (row.user_id === currentUserId ? row.friend_id : row.user_id))
        .filter((value): value is string => typeof value === "string" && value.length > 0))
    );

    const eventRows = (eventsResult.data || []) as EventRow[];
    const eventIds = uniqueIds(eventRows.map((row) => parseText(row.id) || ""));

    const [profilesSettled, friendCheckinsSettled, rsvpsSettled, savedEventsSettled] = await Promise.allSettled([
      friendIds.length > 0
        ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", friendIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      friendIds.length > 0
        ? supabase.from("venue_checkins").select("venue_id, profile_id").in("profile_id", friendIds).gt("expires_at", nowIso)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      eventIds.length > 0
        ? supabase.from("event_rsvps").select("event_id, user_id, status").in("event_id", eventIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      currentUserId
        ? supabase.from("saved_events").select("event_id").eq("user_id", currentUserId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    ]);

    const profilesResult = profilesSettled.status === "fulfilled"
      ? profilesSettled.value
      : { data: [] as Array<Record<string, unknown>>, error: normalizeUnknownError(profilesSettled.reason, "Failed to fetch profiles.") };
    const friendCheckinsResult = friendCheckinsSettled.status === "fulfilled"
      ? friendCheckinsSettled.value
      : { data: [] as Array<Record<string, unknown>>, error: normalizeUnknownError(friendCheckinsSettled.reason, "Failed to fetch venue check-ins.") };
    const rsvpsResult = rsvpsSettled.status === "fulfilled"
      ? rsvpsSettled.value
      : { data: [] as Array<Record<string, unknown>>, error: normalizeUnknownError(rsvpsSettled.reason, "Failed to fetch event RSVPs.") };
    const savedEventsResult = savedEventsSettled.status === "fulfilled"
      ? savedEventsSettled.value
      : { data: [] as Array<Record<string, unknown>>, error: normalizeUnknownError(savedEventsSettled.reason, "Failed to fetch saved events.") };

    if (profilesResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.enrichment",
        table: "profiles",
        queryName: "loadProfiles",
        query: "select id, full_name, username, avatar_url by friend ids",
        error: profilesResult.error,
      });
    }

    if (friendCheckinsResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.enrichment",
        table: "venue_checkins",
        queryName: "loadCheckIns",
        query: "select venue_id, profile_id by friend ids where expires_at > now",
        error: friendCheckinsResult.error,
      });
    }

    if (rsvpsResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.enrichment",
        table: "event_rsvps",
        queryName: "loadRSVPs",
        query: "select event_id, user_id, status by event ids",
        error: rsvpsResult.error,
      });
    }

    if (savedEventsResult.error) {
      logSupabaseQueryError({
        scope: "useDiscoverTonightData.refresh.enrichment",
        table: "saved_events",
        queryName: "loadSavedEvents",
        query: `select event_id where user_id = ${currentUserId}`,
        error: savedEventsResult.error,
      });
    }

    setQueryErrors((current) => ({
      ...current,
      profiles: profilesResult.error ? getErrorMessage(profilesResult.error, "Failed to load friend profiles.") : null,
      friendCheckins: friendCheckinsResult.error ? getErrorMessage(friendCheckinsResult.error, "Failed to load friend check-ins.") : null,
      rsvps: rsvpsResult.error ? getErrorMessage(rsvpsResult.error, "Failed to load event RSVP data.") : null,
      savedEvents: savedEventsResult.error ? getErrorMessage(savedEventsResult.error, "Failed to load saved events.") : null,
    }));

    const friendProfiles: Record<string, DiscoverFriend> = {};
    for (const row of (profilesResult.data || []) as Array<Record<string, unknown>>) {
      const id = parseText(row.id);
      if (!id) {
        continue;
      }
      const username = parseText(row.username);
      friendProfiles[id] = {
        id,
        name: parseText(row.full_name) || username || "Friend",
        username: username ? (username.startsWith("@") ? username : `@${username}`) : "",
        avatarUrl: parseText(row.avatar_url),
      };
    }

    const friendCheckinsByVenueId: Record<string, string[]> = {};
    for (const row of (friendCheckinsResult.data || []) as Array<Record<string, unknown>>) {
      const venueId = parseText(row.venue_id);
      const profileId = parseText(row.profile_id);
      if (!venueId || !profileId) {
        continue;
      }
      friendCheckinsByVenueId[venueId] = [...(friendCheckinsByVenueId[venueId] || []), profileId];
    }

    const rsvpCountsByEventId = new Map<string, Record<EventStatus, number>>();
    const friendAttendeesByEventId = new Map<string, DiscoverFriend[]>();
    const myRsvpByEventId = new Map<string, EventStatus>();
    for (const row of (rsvpsResult.data || []) as Array<Record<string, unknown>>) {
      const eventId = parseText(row.event_id);
      const userId = parseText(row.user_id);
      const status = parseText(row.status) as EventStatus | null;
      if (!eventId || !status) {
        continue;
      }

      if (!rsvpCountsByEventId.has(eventId)) {
        rsvpCountsByEventId.set(eventId, { going: 0, interested: 0, not_going: 0 });
      }
      const currentCounts = rsvpCountsByEventId.get(eventId)!;
      if (status in currentCounts) {
        currentCounts[status] += 1;
      }

      if (userId && currentUserId && userId === currentUserId) {
        myRsvpByEventId.set(eventId, status);
      }

      if (userId && friendProfiles[userId] && status === "going") {
        friendAttendeesByEventId.set(eventId, [...(friendAttendeesByEventId.get(eventId) || []), friendProfiles[userId]]);
      }
    }

    const savedEventIds = new Set<string>();
    for (const row of (savedEventsResult.data || []) as Array<Record<string, unknown>>) {
      const eventId = parseText(row.event_id);
      if (eventId) {
        savedEventIds.add(eventId);
      }
    }

    const storyCountByEventId = new Map<string, number>();
    for (const story of storyState.stories) {
      if (story.event_id) {
        storyCountByEventId.set(story.event_id, (storyCountByEventId.get(story.event_id) || 0) + 1);
      }
    }

    const events = eventRows
      .map((row) => {
        const id = parseText(row.id);
        if (!id) {
          return null;
        }
        const venueId = parseText(row.venue_id);
        const venue = venueId ? venueById.get(venueId) || null : null;
        const startTime = parseText(row.start_time) || nowIso;
        const endTime = parseText(row.end_time);
        const distanceMiles =
          venue && venue.latitude !== null && venue.longitude !== null
            ? getDistanceMiles(activeCoords, { lat: venue.latitude, lng: venue.longitude })
            : null;
        const counts = rsvpCountsByEventId.get(id) || { going: 0, interested: 0, not_going: 0 };
        const eventStartMs = new Date(startTime).getTime();
        const nowMs = Date.now();
        return {
          id,
          venueId,
          title: parseText(row.title) || "Untitled Event",
          performerName: parseText(row.performer_name),
          eventType: parseText(row.event_type),
          startTime,
          endTime,
          imageUrl: parseText(row.image_url) || parseText(row.cover_image),
          description: parseText(row.description),
          ticketUrl: parseText(row.ticket_url) || parseText(row.ticket_link),
          drinkSpecials: parseText(row.drink_specials),
          coverCharge: parseNumber(row.cover_charge),
          status: parseText(row.status) || "active",
          featured: Boolean(row.featured),
          venue,
          distanceMiles,
          friendAttendees: friendAttendeesByEventId.get(id) || [],
          storyCount: storyCountByEventId.get(id) || 0,
          rsvpCounts: counts,
          myRsvp: myRsvpByEventId.get(id) || null,
          isSoon: eventStartMs >= nowMs && eventStartMs <= nowMs + 3 * 60 * 60 * 1000,
          isNow: eventStartMs <= nowMs && (!endTime || new Date(endTime).getTime() > nowMs),
        } as DiscoverEvent;
      })
      .filter((event): event is DiscoverEvent => Boolean(event && isActiveEventStatus(event.status)));

    setBaseState({
      currentUserId,
      venues,
      events,
      friendProfiles,
      friendCheckinsByVenueId,
      savedEventIds,
      updatedAt: new Date().toISOString(),
    });

    const baseFailureSummary = combineErrors([
      venuesResult.error ? getErrorMessage(venuesResult.error, "Failed to load venues.") : null,
      eventsResult.error ? getErrorMessage(eventsResult.error, "Failed to load events.") : null,
    ]);
    setError(baseFailureSummary);
    setLoadingBase(false);
    } finally {
      isRefreshingRef.current = false;
      if (queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        void refresh();
      }
    }
  }, [coords, storyState.stories, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel("discover-tonight-base");
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_events" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_checkins" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void refresh();
      });

    void channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (process.env.NODE_ENV === "development") {
          console.warn("[DiscoverTonight] realtime channel status", {
            channel: "discover-tonight-base",
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
  }, [refresh, supabase]);

  const derived = useMemo(() => {
    const eventsByVenueId = new Map<string, DiscoverEvent[]>();
    const storyCountByVenueId = new Map<string, number>();
    const storySpotlights: DiscoverStorySpotlight[] = [];
    const eventGroupedFriendIds = new Set<string>();

    for (const venueGroup of storyState.venueGroups) {
      storyCountByVenueId.set(venueGroup.venueId, venueGroup.stories.length);
    }

    for (const event of baseState.events) {
      if (!event.venueId) {
        continue;
      }
      eventsByVenueId.set(event.venueId, [...(eventsByVenueId.get(event.venueId) || []), event]);
    }

    const hotRightNow = baseState.venues
      .map((venue) => {
        const metrics = liveMetrics.metricsByVenueId[venue.id];
        const partyScore = partyScores.scoresByVenueId[venue.id] || emptyPartyScore(venue.id);
        const venueEvents = eventsByVenueId.get(venue.id) || [];
        const primaryEvent = venueEvents.find((event) => event.isNow) || venueEvents[0] || null;
        const friendIds = baseState.friendCheckinsByVenueId[venue.id] || [];
        const friendsHere = friendIds.map((id) => baseState.friendProfiles[id]).filter(Boolean);
        const storyCount = storyCountByVenueId.get(venue.id) || 0;
        const liveCheckins = metrics?.liveCheckins || 0;
        const activeStories = metrics?.activeStories || storyCount;
        const currentEvents = metrics?.currentEvents || venueEvents.filter((event) => event.isNow).length;
        const friendsHereCount = metrics?.friendsHere || friendsHere.length;
        const distanceMiles =
          venue.latitude !== null && venue.longitude !== null && (coords || DEFAULT_COORDS)
            ? getDistanceMiles(coords || DEFAULT_COORDS, { lat: venue.latitude, lng: venue.longitude })
            : null;

        const currentEvent = primaryEvent?.title || null;
        const currentEntertainment = primaryEvent?.performerName || primaryEvent?.eventType || null;
        const runningEvents = venueEvents.filter((event) => event.isNow);
        const liveEventTypes = runningEvents
          .map((event) => (event.eventType || "").trim().toLowerCase())
          .filter((type) => type.length > 0);
        const runningEvent = runningEvents[0] || null;

        return {
          ...venue,
          partyScore,
          // Room-level read only. The recommendations block builds a second,
          // personalized explanation once the viewer's saves and genres are known.
          psiExplanation: explainVenue(partyScore, {
            distanceMiles,
            programmedEvent: currentEvent || currentEntertainment,
          }),
          currentEvent,
          currentEntertainment,
          liveEventTypes,
          liveEventTitle: runningEvent?.performerName || runningEvent?.title || null,
          distanceMiles,
          distanceLabel: formatDistanceLabel(distanceMiles),
          liveCheckins,
          activeStories,
          currentEvents,
          friendsHereCount,
          friendsHere,
          storyCount,
          openNow: isOpenNow(venue.currentStatus),
          goingRsvps: venueEvents.reduce((sum, event) => sum + event.rsvpCounts.going, 0),
          interestedRsvps: venueEvents.reduce((sum, event) => sum + event.rsvpCounts.interested, 0),
        } as DiscoverVenueCardData;
      })
      .sort((left, right) => (right.partyScore?.score ?? 0) - (left.partyScore?.score ?? 0));

    for (const group of storyState.authorGroups) {
      const latestStory = group.stories[group.stories.length - 1];
      const venueName = latestStory?.venue?.name || group.venue?.name || null;
      const venueHref = latestStory?.venue?.slug ? `/venues/${latestStory.venue.slug}` : null;
      const distanceMiles = venueHref && latestStory?.venue_id
        ? hotRightNow.find((venue) => venue.id === latestStory.venue_id)?.distanceMiles ?? null
        : null;
      const friendBoost = group.authorId in baseState.friendProfiles ? 30 : 0;
      storySpotlights.push({
        id: group.authorId,
        authorId: group.authorId,
        title: group.author?.full_name || group.author?.username || "PartySafari Story",
        subtitle: venueName || "Live story nearby",
        venueHref,
        venueName,
        imageUrl: latestStory?.media_type === "image" ? latestStory.media_url : null,
        activityScore: group.stories.reduce((sum, story) => sum + (story.viewCount || 0) + (story.reactionCount || 0), 0),
        friendBoost,
        distanceMiles,
        distanceLabel: formatDistanceLabel(distanceMiles),
        storyCount: group.stories.length,
      });
    }

    const eventsStartingSoon = baseState.events
      .filter((event) => event.isSoon)
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
      .slice(0, 8);

    const friendsOutTonight: DiscoverFriendGroup[] = [];
    for (const venue of hotRightNow) {
      if (venue.friendsHere.length === 0) {
        continue;
      }
      for (const person of venue.friendsHere) {
        eventGroupedFriendIds.add(person.id);
      }
      friendsOutTonight.push({
        id: `venue:${venue.id}`,
        type: "venue",
        title: venue.name,
        href: `/venues/${venue.slug}`,
        people: venue.friendsHere,
        subtitle: venue.currentEvent || venue.currentEntertainment || "Live at this venue",
      });
    }

    for (const event of baseState.events) {
      const people = event.friendAttendees.filter((friend) => !eventGroupedFriendIds.has(friend.id));
      if (people.length === 0) {
        continue;
      }
      friendsOutTonight.push({
        id: `event:${event.id}`,
        type: "event",
        title: event.title,
        href: event.venue?.slug ? `/venues/${event.venue.slug}` : "/events",
        people,
        subtitle: event.venue?.name || "Friends are attending",
      });
    }

    const liveEntertainment = baseState.events
      .filter((event) => ["dj", "band", "trivia", "karaoke", "comedy", "live_music"].includes((event.eventType || "").toLowerCase()))
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
      .slice(0, 8);

    const happeningNow = [
      ...baseState.events
        .filter((event) => event.isNow && Boolean(event.drinkSpecials))
        .slice(0, 4)
        .map((event) => ({
          id: `special:${event.id}`,
          title: event.drinkSpecials || "Specials live now",
          subtitle: `${event.venue?.name || "Venue"} • ${event.coverCharge !== null ? `$${event.coverCharge} cover` : "Cover TBA"}`,
          href: event.venue?.slug ? `/venues/${event.venue.slug}` : "/events",
        })),
      ...hotRightNow
        .filter((venue) => venue.drinkSpecials || venue.vipAvailable || venue.foodAvailable)
        .slice(0, 4)
        .map((venue) => ({
          id: `venue-special:${venue.id}`,
          title: venue.drinkSpecials || (venue.vipAvailable ? "VIP experience live now" : "Food specials available"),
          subtitle: `${venue.name} • ${venue.vipAvailable ? "VIP" : venue.foodAvailable ? "Food" : "Specials"}`,
          href: `/venues/${venue.slug}`,
        })),
    ].slice(0, 8);

    const savedVenueIds = new Set(
      baseState.events.filter((event) => baseState.savedEventIds.has(event.id) && event.venueId).map((event) => event.venueId as string)
    );
    const genrePreferenceCounts = new Map<string, number>();
    for (const event of baseState.events) {
      if (!baseState.savedEventIds.has(event.id) && !event.myRsvp) {
        continue;
      }
      for (const genre of event.venue?.musicGenres || []) {
        genrePreferenceCounts.set(genre.toLowerCase(), (genrePreferenceCounts.get(genre.toLowerCase()) || 0) + 1);
      }
    }

    const recommendations = hotRightNow
      .map((venue) => {
        // Ranking stays where it was: these weights order the list. What a user
        // is *told* comes from PSI, so the explanation is traceable to the same
        // signals the Party Score used rather than restated here.
        let recommendationScore = venue.partyScore?.score ?? 0;
        const matchingGenres = venue.musicGenres.filter((genre) => (genrePreferenceCounts.get(genre.toLowerCase()) || 0) > 0);
        if (venue.friendsHereCount > 0) {
          recommendationScore += venue.friendsHereCount * 10;
        }
        if (savedVenueIds.has(venue.id)) {
          recommendationScore += 18;
        }
        if (matchingGenres.length > 0) {
          recommendationScore += Math.min(14, matchingGenres.length * 5);
        }
        if (venue.storyCount >= 3) {
          recommendationScore += 10;
        }
        if ((venue.partyScore?.trend ?? "stable") === "up") {
          recommendationScore += 8;
        }

        const explanation = explainVenue(venue.partyScore, {
          distanceMiles: venue.distanceMiles,
          programmedEvent: venue.currentEvent || venue.currentEntertainment,
          savedEvent: savedVenueIds.has(venue.id),
          matchingGenres,
        });

        return {
          id: venue.id,
          venue,
          reasons: explanation.reasons.map((reason) => reason.text),
          explanation,
          recommendationScore,
        };
      })
      .filter((entry) => entry.explanation.hasEvidence)
      .sort((left, right) => right.recommendationScore - left.recommendationScore)
      .slice(0, 6);

    return {
      peopleOutTonight: hotRightNow.reduce((sum, venue) => sum + venue.liveCheckins, 0),
      liveEvents: baseState.events.filter((event) => event.isNow || event.isSoon).length,
      activeStories: storyState.stories.length,
      trendingVenues: hotRightNow.filter((venue) => (venue.partyScore?.trend ?? "stable") === "up").length,
      hotRightNow: hotRightNow.slice(0, 8),
      venueCards: hotRightNow,
      heatingUp: [...hotRightNow]
        .sort((left, right) => {
          const rightScore = toSafePartyScore(right.partyScore);
          const leftScore = toSafePartyScore(left.partyScore);
          return (rightScore.momentum ?? 0) - (leftScore.momentum ?? 0);
        })
        .slice(0, 6),
      eventsStartingSoon,
      friendsOutTonight: friendsOutTonight.slice(0, 8),
      liveStories: storySpotlights
        .sort((left, right) => (right.friendBoost + right.activityScore) - (left.friendBoost + left.activityScore))
        .slice(0, 8),
      liveEntertainment,
      happeningNow,
      recommendations,
    };
  }, [baseState, coords, liveMetrics.metricsByVenueId, partyScores.scoresByVenueId, storyState.authorGroups, storyState.stories, storyState.venueGroups]);

  const updatedLabel = useMemo(() => {
    const updatedAt = new Date(baseState.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      return "Updated just now";
    }
    return `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, [baseState.updatedAt]);

  return {
    currentUserId: baseState.currentUserId,
    loading: loadingBase || storyState.loading || liveMetrics.loading || partyScores.loading,
    error: combineErrors([error, storyState.error, liveMetrics.error, partyScores.error]),
    sectionStates: {
      hotRightNow: {
        loading: loadingBase || liveMetrics.loading || partyScores.loading,
        error: combineErrors([queryErrors.venues, liveMetrics.error, partyScores.error]),
      },
      eventsStartingSoon: {
        loading: loadingBase,
        error: queryErrors.events,
      },
      friendsOutTonight: {
        loading: loadingBase,
        error: combineErrors([queryErrors.friendships, queryErrors.profiles, queryErrors.friendCheckins, queryErrors.rsvps]),
      },
      liveStories: {
        loading: storyState.loading,
        error: storyState.error,
      },
      heatingUp: {
        loading: loadingBase || liveMetrics.loading || partyScores.loading,
        error: combineErrors([queryErrors.venues, liveMetrics.error, partyScores.error]),
      },
      liveEntertainment: {
        loading: loadingBase,
        error: queryErrors.events,
      },
      happeningNow: {
        loading: loadingBase,
        error: combineErrors([queryErrors.events, queryErrors.venues]),
      },
      recommendations: {
        loading: loadingBase || partyScores.loading,
        error: combineErrors([queryErrors.events, queryErrors.venues, queryErrors.savedEvents, partyScores.error]),
      },
    },
    updatedLabel,
    peopleOutTonight: derived.peopleOutTonight,
    liveEvents: derived.liveEvents,
    activeStories: derived.activeStories,
    trendingVenues: derived.trendingVenues,
    hotRightNow: derived.hotRightNow,
    venueCards: derived.venueCards,
    heatingUp: derived.heatingUp,
    eventsStartingSoon: derived.eventsStartingSoon,
    friendsOutTonight: derived.friendsOutTonight,
    liveStories: derived.liveStories,
    liveEntertainment: derived.liveEntertainment,
    happeningNow: derived.happeningNow,
    recommendations: derived.recommendations,
    refresh,
  };
}