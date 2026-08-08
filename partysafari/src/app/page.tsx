"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePartyScores } from "@/hooks/usePartyScore";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import StoryRailSurface from "@/components/stories/StoryRailSurface";

type VenueLite = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  venue_type: string | null;
  crowd_level: string | null;
  music_genres: string[];
  image_url: string | null;
  photo_url: string | null;
};

type EventLite = {
  id: string;
  title: string;
  performer_name: string | null;
  event_type: string | null;
  start_time: string;
  cover_charge: number | null;
  featured: boolean;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  venue: VenueLite | null;
  liveCount: number;
};

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function parseText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function startIsoNow() {
  return new Date().toISOString();
}

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function logSupabaseQueryError(scope: string, error: SupabaseErrorLike | null) {
  if (!error) {
    return;
  }

  console.log("supabase_query_error", {
    scope,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function deriveStartTime(row: Record<string, unknown>) {
  return parseText(row.start_time) || parseText(row.event_date) || parseText(row.created_at) || new Date().toISOString();
}

function isWithinNextDay(isoString: string) {
  const value = new Date(isoString);
  if (Number.isNaN(value.getTime())) {
    return false;
  }

  const now = new Date(startIsoNow());
  const tomorrow = new Date(tomorrowIso());
  return value >= now && value <= tomorrow;
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => {
            globalThis.setTimeout(() => resolve(null), 4000);
          }),
        ]);

        if (!mounted) {
          return;
        }

        if (sessionResult === null) {
          setAuthChecked(true);
          return;
        }

        setAuthChecked(true);
      } catch {
        if (!mounted) {
          return;
        }

        setAuthChecked(true);
      }
    };

    void checkSession();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const loadHomeData = useCallback(async () => {
    if (!authChecked) {
      return;
    }

    setLoading(true);
    setError(null);

    const baseSelect = "*";

    const joinedSelect = `
      ${baseSelect},
      venues:venue_id (
        id,
        slug,
        name,
        city,
        state,
        venue_type,
        crowd_level,
        music_genres,
        image_url,
        photo_url
      )
    `;

    const primaryResult = await supabase
      .from("events")
      .select(joinedSelect)
      .order("created_at", { ascending: false })
      .limit(120);

    let data: Array<Record<string, unknown>> | null = (primaryResult.data as Array<Record<string, unknown>> | null) || null;
    let eventsError: SupabaseErrorLike | null = (primaryResult.error as SupabaseErrorLike | null) || null;

    let venuesById = new Map<string, VenueLite>();

    if (eventsError) {
      logSupabaseQueryError("home.events_with_venues", eventsError as SupabaseErrorLike);

      const fallback = await supabase
        .from("events")
        .select(baseSelect)
        .order("created_at", { ascending: false })
        .limit(120);

      data = (fallback.data as Array<Record<string, unknown>> | null) || null;
      eventsError = (fallback.error as SupabaseErrorLike | null) || null;

      if (eventsError) {
        logSupabaseQueryError("home.events_base", eventsError as SupabaseErrorLike);
      } else {
        const venueIds = Array.from(
          new Set(
            ((data || []) as Array<Record<string, unknown>>)
              .map((row) => parseText(row.venue_id))
              .filter((id): id is string => Boolean(id))
          )
        );

        if (venueIds.length > 0) {
          const { data: venueRows, error: venueError } = await supabase
            .from("venues")
            .select("id, slug, name, city, state, venue_type, crowd_level, music_genres, image_url, photo_url")
            .in("id", venueIds);

          if (venueError) {
            logSupabaseQueryError("home.venues_lookup", venueError as SupabaseErrorLike);
          } else {
            for (const raw of (venueRows || []) as Array<Record<string, unknown>>) {
              const id = parseText(raw.id);
              if (!id) continue;
              venuesById.set(id, {
                id,
                slug: parseText(raw.slug) || id,
                name: parseText(raw.name) || "Venue",
                city: parseText(raw.city),
                state: parseText(raw.state),
                venue_type: parseText(raw.venue_type),
                crowd_level: parseText(raw.crowd_level),
                music_genres: parseStringArray(raw.music_genres),
                image_url: parseText(raw.image_url),
                photo_url: parseText(raw.photo_url),
              });
            }
          }
        }
      }
    }

    if (eventsError) {
      setError("Unable to load live nightlife data right now.");
      setEvents([]);
      setLoading(false);
      return;
    }

    const liveMap = new Map<string, number>();
    const { data: liveRows } = await supabase.rpc("get_venue_live_counts");
    for (const row of (liveRows || []) as Array<Record<string, unknown>>) {
      const venueId = parseText(row.venue_id) || parseText(row.id);
      if (!venueId) continue;
      liveMap.set(venueId, Number(row.live_count ?? row.count ?? row.checkins ?? 0));
    }

    const normalized = ((data || []) as Array<Record<string, unknown>>).map((row) => {
      const venueRaw = (row.venues as Record<string, unknown> | Array<Record<string, unknown>> | null) || null;
      const v = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw;
      const fallbackVenueId = parseText(row.venue_id);
      const fallbackVenue = fallbackVenueId ? venuesById.get(fallbackVenueId) || null : null;
      const venue: VenueLite | null = v
        ? {
            id: parseText(v.id) || "",
            slug: parseText(v.slug) || "",
            name: parseText(v.name) || "Venue",
            city: parseText(v.city),
            state: parseText(v.state),
            venue_type: parseText(v.venue_type),
            crowd_level: parseText(v.crowd_level),
            music_genres: parseStringArray(v.music_genres),
            image_url: parseText(v.image_url),
            photo_url: parseText(v.photo_url),
          }
        : fallbackVenue;

      const rawStatus = parseText(row.status)?.toLowerCase();
      if (rawStatus === "cancelled") {
        return null;
      }

      const startsAt = deriveStartTime(row);
      if (!isWithinNextDay(startsAt)) {
        return null;
      }

      const derivedEventType = parseText(row.event_type) || parseText(row.genre);
      const derivedPerformer = parseText(row.performer_name);
      const featured = Boolean(row.featured ?? row.is_featured);

      return {
        id: parseText(row.id) || "",
        title: parseText(row.title) || "Untitled Event",
        performer_name: derivedPerformer,
        event_type: derivedEventType,
        start_time: startsAt,
        cover_charge: parseNumber(row.cover_charge),
        featured,
        venue_name: parseText(row.venue_name),
        city: parseText(row.city),
        state: parseText(row.state),
        venue,
        liveCount: venue?.id ? liveMap.get(venue.id) || 0 : 0,
      } as EventLite;
    }).filter((event): event is EventLite => Boolean(event && event.id));

    setEvents(normalized);
    setLoading(false);
  }, [authChecked, supabase]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    void loadHomeData();
  }, [authChecked, loadHomeData]);

  const venueIds = useMemo(
    () => Array.from(new Set(events.map((event) => event.venue?.id).filter((value): value is string => Boolean(value)))),
    [events]
  );
  const partyScores = usePartyScores({
    venueIds,
    enabled: authChecked && venueIds.length > 0,
    subscribeVisibleOnly: false,
  });

  const trendingTonight = useMemo(() => {
    return [...events]
      .sort((a, b) => {
        const left = a.venue?.id ? partyScores.scoresByVenueId[a.venue.id]?.score || 0 : 0;
        const right = b.venue?.id ? partyScores.scoresByVenueId[b.venue.id]?.score || 0 : 0;
        if (right !== left) {
          return right - left;
        }
        return b.liveCount - a.liveCount;
      })
      .slice(0, 6);
  }, [events, partyScores.scoresByVenueId]);

  const featuredEvents = useMemo(() => events.filter((event) => event.featured).slice(0, 6), [events]);

  const startingSoon = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return events.filter((event) => {
      const at = new Date(event.start_time);
      return at >= now && at <= end;
    }).slice(0, 6);
  }, [events]);

  const popularVenues = useMemo(() => {
    const map = new Map<string, { venue: VenueLite; score: number }>();
    for (const event of events) {
      if (!event.venue?.id) continue;
      const partyScore = partyScores.scoresByVenueId[event.venue.id]?.score || 0;
      const current = map.get(event.venue.id);
      if (!current) {
        map.set(event.venue.id, { venue: event.venue, score: partyScore || event.liveCount + 1 });
      } else {
        current.score = Math.max(current.score, partyScore || 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 6);
  }, [events, partyScores.scoresByVenueId]);

  const upcomingDjs = useMemo(() => {
    return events
      .filter((event) => (event.event_type || "").toLowerCase() === "dj" || (event.performer_name || "").toLowerCase().includes("dj"))
      .slice(0, 6);
  }, [events]);

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-7xl animate-pulse rounded-3xl border border-white/10 bg-[#10061f] p-8 text-white/65">
          Checking PartySafari session...
        </div>
      </main>
    );
  }

  const renderEventCard = (event: EventLite) => {
    const image = event.venue?.image_url || event.venue?.photo_url;
    const venueLabel = event.venue?.name || event.venue_name || "Venue TBA";
    const detailsHref = event.venue?.slug ? `/venues/${event.venue.slug}` : `/events/${event.id}`;
    const detailsLabel = event.venue?.slug ? "View Venue" : "View Event";
    return (
      <article key={event.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f]">
        <div className="h-36 bg-[#120824]">
          {image ? (
            <img src={image} alt={event.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-900/30 to-orange-800/30 text-sm uppercase tracking-[0.2em] text-violet-100">
              PartySafari
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">{venueLabel}</p>
          <h3 className="text-xl font-semibold text-white">{event.title}</h3>
          <p className="text-sm text-white/70">{event.performer_name || "Featured lineup"}</p>
          <p className="text-sm text-white/70">{formatDate(event.start_time)}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/80">Live: {event.liveCount}</span>
            <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-violet-100">Cover: {event.cover_charge !== null ? `$${event.cover_charge}` : "TBA"}</span>
          </div>
          <Link href={detailsHref} className="inline-flex rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100">
            {detailsLabel}
          </Link>
        </div>
      </article>
    );
  };

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <section className="bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.22),_transparent_35%),linear-gradient(180deg,#09030f_0%,#040205_100%)] px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-violet-300/70">Tonight in your area</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white sm:text-6xl">Find trending nightlife, featured events, and your next safari route.</h1>
              <p className="mt-5 max-w-2xl text-lg text-white/75">Live event data, crowd signals, and venue momentum all in one place.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/events" className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500">Explore Live Events</Link>
                <Link href="/safari" className="rounded-full border border-violet-500/50 bg-white/5 px-6 py-3 text-sm font-semibold text-violet-200 transition hover:border-violet-300/70 hover:text-white">Build Your Safari</Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.32em] text-violet-300">Trending tonight</p>
              <div className="mt-3 space-y-3">
                {(trendingTonight.length ? trendingTonight : events.slice(0, 3)).map((event) => (
                  <div key={event.id} className="rounded-2xl bg-[#0f0522] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-violet-300">{event.venue?.name || event.venue_name || "Venue TBA"}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{event.title}</p>
                    <p className="text-sm text-white/65">{formatDate(event.start_time)}</p>
                  </div>
                ))}
                {!loading && events.length === 0 ? <p className="text-sm text-white/65">No upcoming events found.</p> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <StoryRailSurface />
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200">{error}</div> : null}

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-3xl font-semibold">Featured Events</h2>
            <Link href="/events" className="text-sm font-semibold text-violet-200">View all</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(featuredEvents.length ? featuredEvents : events.slice(0, 6)).map(renderEventCard)}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-semibold">Starting Soon</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(startingSoon.length ? startingSoon : events.slice(0, 6)).map(renderEventCard)}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-semibold">Trending Tonight</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {trendingTonight.map(renderEventCard)}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-semibold">Popular Venues</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {popularVenues.map((item) => (
              <article key={item.venue.id} className="rounded-3xl border border-white/10 bg-[#10061f] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-300">{item.venue.venue_type || "Venue"}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{item.venue.name}</h3>
                <p className="mt-1 text-sm text-white/70">{[item.venue.city, item.venue.state].filter(Boolean).join(", ") || "Location TBA"}</p>
                <p className="mt-3 text-sm text-white/70">Crowd: {item.venue.crowd_level || "Unknown"}</p>
                <Link href={item.venue.slug ? `/venues/${item.venue.slug}` : "/events"} className="mt-4 inline-flex rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100">
                  View Venue
                </Link>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-orange-400/20 bg-gradient-to-r from-orange-500/10 to-violet-600/10 p-6">
          <h2 className="text-3xl font-semibold">Build Your Safari</h2>
          <p className="mt-2 max-w-2xl text-white/75">Auto-generate a route from live venues and events based on your vibe, distance, and timing.</p>
          <Link href="/safari" className="mt-4 inline-flex rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400">Launch Safari Mode</Link>
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-semibold">Upcoming DJs</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(upcomingDjs.length ? upcomingDjs : events.slice(0, 6)).map(renderEventCard)}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="fixed bottom-4 right-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/80">
          Syncing live nightlife data...
        </div>
      ) : null}
    </main>
  );
}
