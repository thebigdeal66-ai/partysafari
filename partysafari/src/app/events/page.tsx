"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type EventStatus = "going" | "interested" | "not_going";

type VenueLite = {
  id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  crowd_level: string | null;
  music_genres: string[];
  venue_type: string | null;
  city: string | null;
  state: string | null;
  image_url: string | null;
  photo_url: string | null;
};

type LiveEvent = {
  id: string;
  venue_id: string | null;
  title: string;
  description: string | null;
  event_type: string | null;
  performer_name: string | null;
  start_time: string;
  end_time: string | null;
  cover_charge: number | null;
  age_requirement: string | null;
  drink_specials: string | null;
  image_url: string | null;
  ticket_url: string | null;
  featured: boolean;
  status: string;
  created_at: string;
  venue: VenueLite | null;
  distanceMiles: number | null;
  liveCount: number;
  rsvpCounts: Record<EventStatus, number>;
  myRsvp: EventStatus | null;
};

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type EventRowRaw = Record<string, unknown>;

type VenueJoinRaw = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  crowd_level?: string | null;
  music_genres?: unknown;
  venue_type?: string | null;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
};

type EventRsvpCountRow = {
  event_id: string;
  status: EventStatus;
  count: number;
};

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const DEFAULT_COORDS = { lat: 30.2672, lng: -97.7431 };

function parseText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
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

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfLocalDayIso(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toISOString();
}

function endOfLocalDayIso(dateKey: string) {
  const date = new Date(`${dateKey}T23:59:59`);
  return date.toISOString();
}

function nowDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function sectionTitleToType(title: string) {
  return title.toLowerCase().replace(/\s+/g, "_");
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

function deriveStatus(row: Record<string, unknown>) {
  const status = parseText(row.status)?.toLowerCase();
  if (!status) {
    return "active";
  }
  return status;
}

function EventRsvpControl({
  event,
  onRsvp,
}: {
  event: LiveEvent;
  onRsvp: (eventId: string, status: EventStatus) => Promise<void>;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-2">
      <div className="mb-2 flex gap-1">
        {([
          ["going", "Going"],
          ["interested", "Interested"],
          ["not_going", "Not Going"],
        ] as Array<[EventStatus, string]>).map(([status, label]) => {
          const active = event.myRsvp === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => void onRsvp(event.id, status)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                active
                  ? "bg-violet-600 text-white"
                  : "border border-white/15 bg-white/5 text-white/70 hover:border-violet-300/40"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/65">
        {event.rsvpCounts.going || 0} going • {event.rsvpCounts.interested || 0} interested • {event.rsvpCounts.not_going || 0} not going
      </p>
    </div>
  );
}

export default function EventsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [searchText, setSearchText] = useState("");
  const [dateFilter, setDateFilter] = useState(nowDateKey());
  const [distanceFilter, setDistanceFilter] = useState(20);
  const [maxCoverFilter, setMaxCoverFilter] = useState(100);
  const [genreFilter, setGenreFilter] = useState("all");
  const [venueTypeFilter, setVenueTypeFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [crowdFilter, setCrowdFilter] = useState("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const pushToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const requestGeolocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setCoords(DEFAULT_COORDS);
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
      }
    );
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setCurrentUserId(session?.user?.id || null);

    const baseSelect = "*";

    const joinedSelect = `
      ${baseSelect},
      venues:venue_id (
        id,
        name,
        slug,
        latitude,
        longitude,
        crowd_level,
        music_genres,
        venue_type,
        city,
        state,
        image_url,
        photo_url
      )
    `;

    const primaryResult = await supabase
      .from("events")
      .select(joinedSelect)
      .order("created_at", { ascending: false })
      .limit(300);

    let data: EventRowRaw[] | null = (primaryResult.data as EventRowRaw[] | null) || null;
    let error: SupabaseErrorLike | null = (primaryResult.error as SupabaseErrorLike | null) || null;

    let venuesById = new Map<string, VenueLite>();

    if (error) {
      logSupabaseQueryError("events.events_with_venues", error as SupabaseErrorLike);

      const fallback = await supabase
        .from("events")
        .select(baseSelect)
        .order("created_at", { ascending: false })
        .limit(300);

      data = (fallback.data as EventRowRaw[] | null) || null;
      error = (fallback.error as SupabaseErrorLike | null) || null;

      if (error) {
        logSupabaseQueryError("events.events_base", error as SupabaseErrorLike);
      } else {
        const venueIds = Array.from(
          new Set(
            ((data || []) as EventRowRaw[])
              .map((row) => parseText(row.venue_id))
              .filter((id): id is string => Boolean(id))
          )
        );

        if (venueIds.length > 0) {
          const { data: venueRows, error: venueError } = await supabase
            .from("venues")
            .select("id, name, slug, latitude, longitude, crowd_level, music_genres, venue_type, city, state, image_url, photo_url")
            .in("id", venueIds);

          if (venueError) {
            logSupabaseQueryError("events.venues_lookup", venueError as SupabaseErrorLike);
          } else {
            for (const raw of (venueRows || []) as Array<Record<string, unknown>>) {
              const id = parseText(raw.id);
              if (!id) continue;
              venuesById.set(id, {
                id,
                name: parseText(raw.name) || "Venue",
                slug: parseText(raw.slug) || id,
                latitude: parseNumber(raw.latitude),
                longitude: parseNumber(raw.longitude),
                crowd_level: parseText(raw.crowd_level),
                music_genres: parseStringArray(raw.music_genres),
                venue_type: parseText(raw.venue_type),
                city: parseText(raw.city),
                state: parseText(raw.state),
                image_url: parseText(raw.image_url),
                photo_url: parseText(raw.photo_url),
              });
            }
          }
        }
      }
    }

    if (error) {
      setErrorMessage("Unable to load live events right now.");
      setEvents([]);
      setLoading(false);
      return;
    }

    const rawRows = (data || []) as EventRowRaw[];
    const eventIds = rawRows
      .map((row) => parseText(row.id))
      .filter((id): id is string => Boolean(id));

    const liveMap = new Map<string, number>();
    const { data: liveRows } = await supabase.rpc("get_venue_live_counts");
    for (const row of (liveRows || []) as Array<Record<string, unknown>>) {
      const venueId = parseText(row.venue_id) || parseText(row.id);
      if (!venueId) continue;
      const count = Number(row.live_count ?? row.count ?? row.checkins ?? 0);
      liveMap.set(venueId, Number.isFinite(count) ? count : 0);
    }

    const rsvpCountMap = new Map<string, Record<EventStatus, number>>();
    if (eventIds.length > 0) {
      const { data: countRows, error: countError } = await supabase.rpc("get_event_rsvp_counts", {
        p_event_ids: eventIds,
      });

      if (!countError && Array.isArray(countRows)) {
        for (const row of countRows as EventRsvpCountRow[]) {
          if (!rsvpCountMap.has(row.event_id)) {
            rsvpCountMap.set(row.event_id, { going: 0, interested: 0, not_going: 0 });
          }
          const current = rsvpCountMap.get(row.event_id)!;
          current[row.status] = Number(row.count || 0);
        }
      } else {
        const { data: fallbackRsvpRows } = await supabase
          .from("event_rsvps")
          .select("event_id, status")
          .in("event_id", eventIds);

        for (const row of (fallbackRsvpRows || []) as Array<{ event_id: string; status: EventStatus }>) {
          if (!rsvpCountMap.has(row.event_id)) {
            rsvpCountMap.set(row.event_id, { going: 0, interested: 0, not_going: 0 });
          }
          const current = rsvpCountMap.get(row.event_id)!;
          if (row.status in current) {
            current[row.status] += 1;
          }
        }
      }
    }

    const myRsvpMap = new Map<string, EventStatus>();
    if (session?.user?.id && eventIds.length > 0) {
      const { data: myRows } = await supabase
        .from("event_rsvps")
        .select("event_id, status")
        .eq("user_id", session.user.id)
        .in("event_id", eventIds);

      for (const row of (myRows || []) as Array<{ event_id: string; status: EventStatus }>) {
        myRsvpMap.set(row.event_id, row.status);
      }
    }

    const withVenue = rawRows
      .map((row) => {
        const id = parseText(row.id);
        const venueId = parseText(row.venue_id);
        const start = deriveStartTime(row);

        if (!id) {
          return null;
        }

        const venueRaw = (row.venues as VenueJoinRaw | VenueJoinRaw[] | null) || null;
        const venueObject = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw;
        const fallbackVenue = venueId ? venuesById.get(venueId) || null : null;

        const venue: VenueLite | null = venueObject
          ? {
              id: parseText(venueObject.id) || venueId || "",
              name: parseText(venueObject.name) || "Venue",
              slug: parseText(venueObject.slug) || parseText(venueObject.id) || "",
              latitude: parseNumber(venueObject.latitude),
              longitude: parseNumber(venueObject.longitude),
              crowd_level: parseText(venueObject.crowd_level),
              music_genres: parseStringArray(venueObject.music_genres),
              venue_type: parseText(venueObject.venue_type),
              city: parseText(venueObject.city),
              state: parseText(venueObject.state),
              image_url: parseText(venueObject.image_url),
              photo_url: parseText(venueObject.photo_url),
            }
          : fallbackVenue;

        const status = deriveStatus(row);
        if (!["active", "published", "live", "scheduled"].includes(status)) {
          return null;
        }

        const activeCoords = coords || DEFAULT_COORDS;
        const distanceMiles =
          venue && venue.latitude !== null && venue.longitude !== null
            ? getDistanceMiles(activeCoords, { lat: venue.latitude, lng: venue.longitude })
            : null;

        return {
          id,
          venue_id: venueId,
          title: parseText(row.title) || "Untitled Event",
          description: parseText(row.description),
          event_type: parseText(row.event_type) || parseText(row.genre),
          performer_name: parseText(row.performer_name),
          start_time: start,
          end_time: parseText(row.end_time),
          cover_charge: parseNumber(row.cover_charge),
          age_requirement: parseText(row.age_requirement) || parseText(row.age_min),
          drink_specials: parseText(row.drink_specials),
          image_url: parseText(row.image_url) || parseText(row.cover_image),
          ticket_url: parseText(row.ticket_url) || parseText(row.ticket_link),
          featured: Boolean(row.featured ?? row.is_featured),
          status,
          created_at: parseText(row.created_at) || new Date().toISOString(),
          venue,
          distanceMiles,
          liveCount: venueId ? liveMap.get(venueId) || 0 : 0,
          rsvpCounts: rsvpCountMap.get(id) || { going: 0, interested: 0, not_going: 0 },
          myRsvp: myRsvpMap.get(id) || null,
        } as LiveEvent;
      })
      .filter((row): row is LiveEvent => Boolean(row));

    setEvents(withVenue);
    setLoading(false);
  }, [coords, supabase]);

  useEffect(() => {
    requestGeolocation();
  }, [requestGeolocation]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const channel = supabase.channel("events-live-channel");
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => {
        void loadEvents();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, () => {
        void loadEvents();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, () => {
        void loadEvents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "event_rsvps" }, () => {
        void loadEvents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_checkins" }, () => {
        void loadEvents();
      });

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadEvents, supabase]);

  const onRsvp = useCallback(async (eventId: string, status: EventStatus) => {
    if (!currentUserId) {
      pushToast("Log in to RSVP.", "info");
      return;
    }

    const { error } = await supabase
      .from("event_rsvps")
      .upsert({ event_id: eventId, user_id: currentUserId, status }, { onConflict: "event_id,user_id" });

    if (error) {
      pushToast("Unable to save RSVP.", "error");
      return;
    }

    pushToast("RSVP updated.", "success");
    void loadEvents();
  }, [currentUserId, loadEvents, pushToast, supabase]);

  const shareEvent = useCallback(async (event: LiveEvent) => {
    const title = `${event.title} at ${event.venue?.name || "PartySafari Venue"}`;
    const text = `${title}\n${formatDateLabel(event.start_time)}\nBuilt with PartySafari`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // fallback below
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      pushToast("Event details copied.", "success");
    } catch {
      pushToast("Unable to share this event right now.", "error");
    }
  }, [pushToast]);

  const addToSafari = useCallback((event: LiveEvent) => {
    const target = `/safari?event=${event.id}`;
    window.location.href = target;
  }, []);

  const genres = useMemo(() => {
    const unique = new Set<string>();
    for (const event of events) {
      for (const genre of event.venue?.music_genres || []) {
        unique.add(genre);
      }
    }
    return ["all", ...Array.from(unique)];
  }, [events]);

  const venueTypes = useMemo(() => {
    const unique = new Set<string>();
    for (const event of events) {
      if (event.venue?.venue_type) unique.add(event.venue.venue_type);
    }
    return ["all", ...Array.from(unique)];
  }, [events]);

  const eventTypes = useMemo(() => {
    const unique = new Set<string>();
    for (const event of events) {
      if (event.event_type) unique.add(event.event_type);
    }
    return ["all", ...Array.from(unique)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = searchText.toLowerCase().trim();
    const startIso = startOfLocalDayIso(dateFilter);
    const endIso = endOfLocalDayIso(dateFilter);

    return events.filter((event) => {
      const starts = event.start_time;
      if (starts < startIso || starts > endIso) {
        return false;
      }

      if (event.distanceMiles !== null && event.distanceMiles > distanceFilter) {
        return false;
      }

      if (event.cover_charge !== null && event.cover_charge > maxCoverFilter) {
        return false;
      }

      if (freeOnly && (event.cover_charge || 0) > 0) {
        return false;
      }

      if (featuredOnly && !event.featured) {
        return false;
      }

      if (genreFilter !== "all") {
        const match = (event.venue?.music_genres || []).some((genre) => genre.toLowerCase() === genreFilter.toLowerCase());
        if (!match) return false;
      }

      if (venueTypeFilter !== "all" && (event.venue?.venue_type || "").toLowerCase() !== venueTypeFilter.toLowerCase()) {
        return false;
      }

      if (eventTypeFilter !== "all" && (event.event_type || "").toLowerCase() !== eventTypeFilter.toLowerCase()) {
        return false;
      }

      if (crowdFilter !== "all" && (event.venue?.crowd_level || "").toLowerCase() !== crowdFilter.toLowerCase()) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        event.title,
        event.description || "",
        event.performer_name || "",
        event.event_type || "",
        event.venue?.name || "",
        (event.venue?.music_genres || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [crowdFilter, dateFilter, distanceFilter, eventTypeFilter, events, featuredOnly, freeOnly, genreFilter, maxCoverFilter, searchText, venueTypeFilter]);

  const sectioned = useMemo(() => {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    const byEventType = (value: string) =>
      filteredEvents.filter((event) => (event.event_type || "").toLowerCase() === value.toLowerCase());

    const featuredTonight = filteredEvents.filter((event) => event.featured);
    const startingSoon = filteredEvents.filter((event) => event.start_time <= soonThreshold && event.start_time >= now.toISOString());
    const liveMusic = byEventType("live_music");
    const djs = byEventType("dj");
    const comedy = byEventType("comedy");
    const trivia = byEventType("trivia");
    const karaoke = byEventType("karaoke");
    const happyHour = byEventType("happy_hour");
    const freeEvents = filteredEvents.filter((event) => (event.cover_charge || 0) <= 0);
    const afterMidnight = filteredEvents.filter((event) => {
      const hour = new Date(event.start_time).getHours();
      return hour >= 0 && hour < 6;
    });

    return [
      { title: "Featured Tonight", items: featuredTonight },
      { title: "Starting Soon", items: startingSoon },
      { title: "Live Music", items: liveMusic },
      { title: "DJs", items: djs },
      { title: "Comedy", items: comedy },
      { title: "Trivia", items: trivia },
      { title: "Karaoke", items: karaoke },
      { title: "Happy Hour", items: happyHour },
      { title: "Free Events", items: freeEvents },
      { title: "After Midnight", items: afterMidnight },
    ]
      .map((section) => ({ ...section, id: sectionTitleToType(section.title) }))
      .filter((section) => section.items.length > 0);
  }, [filteredEvents]);

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">Live Events</h1>
              <p className="mt-2 text-white/70">Discover what is happening tonight around you.</p>
            </div>
            <Link href="/safari" className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500">
              Build My Safari
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search venue, performer, genre, type, keyword"
              className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none md:col-span-3 lg:col-span-2"
            />
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none"
            />
            <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none">
              {genres.map((genre) => (
                <option key={genre} value={genre}>{genre === "all" ? "All Genres" : genre}</option>
              ))}
            </select>
            <select value={venueTypeFilter} onChange={(event) => setVenueTypeFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none">
              {venueTypes.map((type) => (
                <option key={type} value={type}>{type === "all" ? "All Venue Types" : type}</option>
              ))}
            </select>
            <select value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none">
              {eventTypes.map((type) => (
                <option key={type} value={type}>{type === "all" ? "All Event Types" : type}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2 text-sm text-white/70">
              Distance: {distanceFilter} mi
              <input type="range" min={1} max={40} value={distanceFilter} onChange={(event) => setDistanceFilter(Number(event.target.value))} className="mt-2 w-full" />
            </label>
            <label className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2 text-sm text-white/70">
              Max Cover: ${maxCoverFilter}
              <input type="range" min={0} max={150} value={maxCoverFilter} onChange={(event) => setMaxCoverFilter(Number(event.target.value))} className="mt-2 w-full" />
            </label>
            <select value={crowdFilter} onChange={(event) => setCrowdFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-sm text-white outline-none">
              <option value="all">All Crowd Levels</option>
              <option value="quiet">Quiet</option>
              <option value="busy">Busy</option>
              <option value="packed">Packed</option>
            </select>
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2 text-sm">
              <input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} />
              Free only
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2 text-sm">
              <input type="checkbox" checked={featuredOnly} onChange={(event) => setFeaturedOnly(event.target.checked)} />
              Featured only
            </label>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">Loading live events...</section>
        ) : errorMessage ? (
          <section className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-200">{errorMessage}</section>
        ) : sectioned.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">No events match your filters.</section>
        ) : (
          <div className="space-y-8">
            {sectioned.map((section) => (
              <section key={section.id} className="space-y-4">
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((event) => {
                    const image = event.image_url || event.venue?.image_url || event.venue?.photo_url;
                    const directionsUrl =
                      event.venue && event.venue.latitude !== null && event.venue.longitude !== null
                        ? `https://www.google.com/maps/dir/?api=1&destination=${event.venue.latitude},${event.venue.longitude}`
                        : null;

                    return (
                      <article key={event.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f]">
                        <div className="h-44 bg-[#0d0920]">
                          {image ? (
                            <img src={image} alt={event.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-900/30 to-orange-800/30 text-sm uppercase tracking-[0.2em] text-violet-200">PartySafari Live</div>
                          )}
                        </div>
                        <div className="space-y-2 p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">{event.venue?.name || "Venue"}</p>
                          <h3 className="text-xl font-semibold text-white">{event.title}</h3>
                          <p className="text-sm text-white/70">{event.performer_name || "Featured performers"}</p>
                          <p className="text-sm text-white/70">{formatDateLabel(event.start_time)}</p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-violet-100">Cover: {event.cover_charge !== null ? `$${event.cover_charge}` : "TBA"}</span>
                            <span className="rounded-full border border-orange-400/20 bg-orange-500/10 px-2 py-1 text-orange-100">Crowd: {event.venue?.crowd_level || "Unknown"}</span>
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/75">Live: {event.liveCount}</span>
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/75">Distance: {event.distanceMiles !== null ? `${event.distanceMiles.toFixed(1)} mi` : "N/A"}</span>
                          </div>
                          <p className="text-sm text-white/65">Genres: {(event.venue?.music_genres || []).join(", ") || "Open format"}</p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={event.venue?.slug ? `/venues/${event.venue.slug}` : "/map"} className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100">
                              View Venue
                            </Link>
                            {directionsUrl ? (
                              <a href={directionsUrl} target="_blank" rel="noreferrer" className="rounded-full border border-orange-300/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-100">
                                Directions
                              </a>
                            ) : null}
                            <button type="button" onClick={() => addToSafari(event)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85">
                              Add To Safari
                            </button>
                            <button type="button" onClick={() => void shareEvent(event)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85">
                              Share
                            </button>
                          </div>

                          <EventRsvpControl event={event} onRsvp={onRsvp} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-100"
                : toast.type === "error"
                ? "border-rose-400/30 bg-rose-500/20 text-rose-100"
                : "border-white/20 bg-white/10 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
