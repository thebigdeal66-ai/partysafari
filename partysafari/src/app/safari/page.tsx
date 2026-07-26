"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type CrowdPreference = "any" | "quiet" | "busy" | "packed";

type VenueRecord = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  venueType: string;
  musicGenres: string[];
  crowdLevel: string;
  drinkSpecials: string | null;
  coverCharge: number | null;
  liveCount: number;
};

type EventRecord = {
  id: string;
  venueId: string | null;
  title: string;
  imageUrl: string | null;
  startsAt: string | null;
  coverCharge: number | null;
  musicGenres: string[];
  isPublished: boolean;
};

type SafariStop = {
  venue: VenueRecord;
  event: EventRecord | null;
  distanceFromPreviousMiles: number;
  plannedArrival: string;
  plannedDeparture: string;
};

type SafariPlanRow = {
  id: string;
  title: string | null;
  safari_date: string | null;
  status: string | null;
  created_at: string;
};

type SafariStopRow = {
  id: string;
  safari_plan_id: string;
  venue_id: string | null;
  event_id: string | null;
  stop_order: number | null;
  planned_arrival: string | null;
  planned_departure: string | null;
};

type SavedSafari = {
  plan: SafariPlanRow;
  stops: SafariStop[];
};

type Coordinates = {
  lat: number;
  lng: number;
};

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

const DEFAULT_CENTER: Coordinates = { lat: 30.2672, lng: -97.7431 };
const AVAILABLE_GENRES = ["EDM", "Hip Hop", "House", "Latin", "Afrobeats", "Top 40", "R&B", "Techno"];
const AVAILABLE_VENUE_TYPES = ["Club", "Rooftop", "Lounge", "Bar", "Live Music", "Speakeasy"];
const GENERATION_MESSAGES = [
  "Planning your night...",
  "Finding matching venues...",
  "Checking tonight's events...",
  "Comparing crowd energy...",
  "Building the best route...",
];

const SafariRouteMap = dynamic(() => import("@/components/safari/SafariRouteMap"), {
  ssr: false,
});

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = earthRadiusKm * c;
  return distanceKm * 0.621371;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
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

function parseText(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function parseTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function estimateTravelMinutes(distanceMiles: number) {
  const driveMinutes = (Math.max(distanceMiles, 0) / 20) * 60;
  return Math.max(4, Math.round(driveMinutes));
}

function crowdMatchScore(crowdLabel: string, preference: CrowdPreference) {
  if (preference === "any") {
    return 1;
  }

  const normalized = crowdLabel.toLowerCase();
  if (preference === "quiet") {
    if (normalized.includes("quiet")) return 1;
    if (normalized.includes("packed")) return 0;
    return 0.45;
  }

  if (preference === "busy") {
    if (normalized.includes("busy")) return 1;
    if (normalized.includes("quiet")) return 0.3;
    return 0.7;
  }

  if (normalized.includes("packed")) return 1;
  if (normalized.includes("quiet")) return 0.1;
  return 0.55;
}

export default function SafariPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [safariDate, setSafariDate] = useState(() => toIsoDate(new Date()));
  const [startTime, setStartTime] = useState("21:00");
  const [endTime, setEndTime] = useState("01:00");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(8);
  const [budget, setBudget] = useState(120);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["House", "EDM"]);
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<string[]>(["Club", "Rooftop"]);
  const [crowdPreference, setCrowdPreference] = useState<CrowdPreference>("busy");
  const [numberOfStops, setNumberOfStops] = useState(3);

  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generationMessageIndex, setGenerationMessageIndex] = useState(0);

  const [location, setLocation] = useState<Coordinates | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);

  const [venues, setVenues] = useState<VenueRecord[]>([]);
  const [eventsTonight, setEventsTonight] = useState<EventRecord[]>([]);

  const [generatedStops, setGeneratedStops] = useState<SafariStop[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [savedSafaris, setSavedSafaris] = useState<SavedSafari[]>([]);
  const [loadingSavedSafaris, setLoadingSavedSafaris] = useState(false);

  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [isSafariStarted, setIsSafariStarted] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(0);
  const [routeRevealSeed, setRouteRevealSeed] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const timelineStopRefs = useRef<Record<string, HTMLElement | null>>({});

  const pushToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const requestGeolocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeolocationError("Geolocation is not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeolocationError(null);
      },
      () => {
        setLocation(DEFAULT_CENTER);
        setGeolocationError("Location permission denied. Using a downtown default start point.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }, []);

  const loadAuth = useCallback(async () => {
    try {
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => {
          globalThis.setTimeout(() => resolve(null), 4000);
        }),
      ]);

      if (sessionResult === null) {
        setUserId(null);
        setAuthChecked(true);
        return;
      }

      const {
        data: { session },
      } = sessionResult;

      setUserId(session?.user?.id ?? null);
      setAuthChecked(true);
    } catch {
      setUserId(null);
      setAuthChecked(true);
    }
  }, [supabase]);

  const loadVenuesAndEvents = useCallback(async () => {
    setIsLoadingData(true);

    const { data: venueRows, error: venueError } = await supabase
      .from("venues")
      .select("*")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (venueError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Load venues failed:", venueError);
      }
      setVenues([]);
      setGenerationError("Unable to load venues right now.");
      setIsLoadingData(false);
      return;
    }

    const { data: liveRows } = await supabase.rpc("get_venue_live_counts");
    const liveCountMap = new Map<string, number>();

    for (const row of (liveRows || []) as Array<Record<string, unknown>>) {
      const venueId = parseText(row.venue_id) || parseText(row.id);
      if (!venueId) {
        continue;
      }

      const live = Number(row.live_count ?? row.count ?? row.checkins ?? 0);
      liveCountMap.set(venueId, Number.isFinite(live) ? live : 0);
    }

    const normalizedVenues = ((venueRows || []) as Array<Record<string, unknown>>)
      .map((row) => {
        const id = parseText(row.id);
        const latitude = parseNumber(row.latitude ?? row.lat);
        const longitude = parseNumber(row.longitude ?? row.lng);

        if (!id || latitude === null || longitude === null) {
          return null;
        }

        const name = parseText(row.name) || parseText(row.venue_name) || "Unnamed Venue";
        const slug = parseText(row.slug) || id;
        const genres = parseStringArray(row.music_genres ?? row.genres ?? row.genre);
        const venueType = parseText(row.venue_type) || parseText(row.type) || "Venue";
        const crowdLevel = parseText(row.crowd_level) || parseText(row.current_status) || "Unknown";
        const drinkSpecials = parseText(row.drink_specials);
        const coverCharge = parseNumber(row.cover_charge ?? row.entry_fee ?? row.price);
        const imageUrl =
          parseText(row.image_url) ||
          parseText(row.cover_image) ||
          parseText(row.photo_url) ||
          parseText(row.avatar_url);

        return {
          id,
          slug,
          name,
          imageUrl,
          latitude,
          longitude,
          venueType,
          musicGenres: genres,
          crowdLevel,
          drinkSpecials,
          coverCharge,
          liveCount: liveCountMap.get(id) || 0,
        } as VenueRecord;
      })
      .filter((item): item is VenueRecord => Boolean(item));

    setVenues(normalizedVenues);

    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (eventError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Load events failed:", eventError);
      }
      setEventsTonight([]);
      setIsLoadingData(false);
      return;
    }

    const tonightKey = safariDate;
    const normalizedEvents = ((eventRows || []) as Array<Record<string, unknown>>)
      .map((row) => {
        const id = parseText(row.id);
        if (!id) {
          return null;
        }

        const venueId = parseText(row.venue_id);
        const startsAt = parseText(row.start_time) || parseText(row.starts_at) || parseText(row.event_date);

        const maybeDateKey = startsAt ? new Date(startsAt).toISOString().slice(0, 10) : null;
        const rawStatus = parseText(row.status)?.toLowerCase();
        const published =
          typeof row.is_published === "boolean"
            ? row.is_published
            : !rawStatus || ["published", "active", "live", "scheduled"].includes(rawStatus);

        const title = parseText(row.title) || "Tonight Event";
        const coverCharge = parseNumber(row.cover_charge ?? row.ticket_price ?? row.price);
        const genres = parseStringArray(row.genre ?? row.music_genres ?? row.genres);
        const imageUrl = parseText(row.cover_image) || parseText(row.image_url);

        return {
          id,
          venueId,
          title,
          imageUrl,
          startsAt,
          coverCharge,
          musicGenres: genres,
          isPublished: published,
          dateKey: maybeDateKey,
        };
      })
      .filter((item): item is EventRecord & { dateKey: string | null } => Boolean(item))
      .filter((item) => item.isPublished)
      .filter((item) => item.dateKey === tonightKey)
      .map(({ dateKey: _dateKey, ...rest }) => rest);

    setEventsTonight(normalizedEvents);
    setIsLoadingData(false);
  }, [safariDate, supabase]);

  const loadSavedSafaris = useCallback(async () => {
    if (!userId) {
      setSavedSafaris([]);
      return;
    }

    setLoadingSavedSafaris(true);

    const { data: plansData, error: plansError } = await supabase
      .from("safari_plans")
      .select("id, title, safari_date, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (plansError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Load safari plans failed:", plansError);
      }
      setSavedSafaris([]);
      setLoadingSavedSafaris(false);
      return;
    }

    const plans = (plansData || []) as SafariPlanRow[];
    if (plans.length === 0) {
      setSavedSafaris([]);
      setLoadingSavedSafaris(false);
      return;
    }

    const planIds = plans.map((plan) => plan.id);
    const { data: stopRowsData, error: stopsError } = await supabase
      .from("safari_stops")
      .select("id, safari_plan_id, venue_id, event_id, stop_order, planned_arrival, planned_departure")
      .in("safari_plan_id", planIds)
      .order("stop_order", { ascending: true });

    if (stopsError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Load safari stops failed:", stopsError);
      }
      setSavedSafaris(plans.map((plan) => ({ plan, stops: [] })));
      setLoadingSavedSafaris(false);
      return;
    }

    const stopRows = (stopRowsData || []) as SafariStopRow[];
    const venueIds = Array.from(new Set(stopRows.map((row) => row.venue_id).filter(Boolean) as string[]));
    const eventIds = Array.from(new Set(stopRows.map((row) => row.event_id).filter(Boolean) as string[]));

    const venueMap = new Map<string, VenueRecord>();
    const eventMap = new Map<string, EventRecord>();

    if (venueIds.length > 0) {
      const { data: venueRows } = await supabase.from("venues").select("*").in("id", venueIds);
      for (const raw of (venueRows || []) as Array<Record<string, unknown>>) {
        const id = parseText(raw.id);
        const latitude = parseNumber(raw.latitude ?? raw.lat);
        const longitude = parseNumber(raw.longitude ?? raw.lng);
        if (!id || latitude === null || longitude === null) {
          continue;
        }

        venueMap.set(id, {
          id,
          slug: parseText(raw.slug) || id,
          name: parseText(raw.name) || parseText(raw.venue_name) || "Venue",
          imageUrl:
            parseText(raw.image_url) ||
            parseText(raw.cover_image) ||
            parseText(raw.photo_url) ||
            parseText(raw.avatar_url),
          latitude,
          longitude,
          venueType: parseText(raw.venue_type) || "Venue",
          musicGenres: parseStringArray(raw.music_genres ?? raw.genres),
          crowdLevel: parseText(raw.crowd_level) || "Unknown",
          drinkSpecials: parseText(raw.drink_specials),
          coverCharge: parseNumber(raw.cover_charge ?? raw.entry_fee),
          liveCount: 0,
        });
      }
    }

    if (eventIds.length > 0) {
      const { data: eventRows } = await supabase.from("events").select("*").in("id", eventIds);
      for (const raw of (eventRows || []) as Array<Record<string, unknown>>) {
        const id = parseText(raw.id);
        if (!id) {
          continue;
        }

        eventMap.set(id, {
          id,
          venueId: parseText(raw.venue_id),
          title: parseText(raw.title) || "Event",
          imageUrl: parseText(raw.cover_image) || parseText(raw.image_url),
          startsAt: parseText(raw.start_time) || parseText(raw.starts_at),
          coverCharge: parseNumber(raw.cover_charge ?? raw.ticket_price),
          musicGenres: parseStringArray(raw.genre ?? raw.music_genres),
          isPublished: true,
        });
      }
    }

    const stopsByPlanId = new Map<string, SafariStop[]>();

    for (const stopRow of stopRows) {
      if (!stopRow.safari_plan_id || !stopRow.venue_id) {
        continue;
      }

      const venue = venueMap.get(stopRow.venue_id);
      if (!venue) {
        continue;
      }

      const event = stopRow.event_id ? eventMap.get(stopRow.event_id) || null : null;
      const stop: SafariStop = {
        venue,
        event,
        distanceFromPreviousMiles: 0,
        plannedArrival: stopRow.planned_arrival || "",
        plannedDeparture: stopRow.planned_departure || "",
      };

      const collection = stopsByPlanId.get(stopRow.safari_plan_id) || [];
      collection.push(stop);
      stopsByPlanId.set(stopRow.safari_plan_id, collection);
    }

    setSavedSafaris(
      plans.map((plan) => {
        const stops = stopsByPlanId.get(plan.id) || [];
        const withDistance = stops.map((stop, index) => {
          if (index === 0) {
            return { ...stop, distanceFromPreviousMiles: 0 };
          }

          const previous = stops[index - 1];
          const distanceFromPreviousMiles = getDistanceMiles(
            { lat: previous.venue.latitude, lng: previous.venue.longitude },
            { lat: stop.venue.latitude, lng: stop.venue.longitude }
          );

          return { ...stop, distanceFromPreviousMiles };
        });

        return {
          plan,
          stops: withDistance,
        };
      })
    );

    setLoadingSavedSafaris(false);
  }, [supabase, userId]);

  const candidateEventsByVenue = useMemo(() => {
    const map = new Map<string, EventRecord>();

    for (const event of eventsTonight) {
      if (!event.venueId) {
        continue;
      }

      if (!map.has(event.venueId)) {
        map.set(event.venueId, event);
      }
    }

    return map;
  }, [eventsTonight]);

  const allScoredCandidates = useMemo(() => {
    const startPoint = location || DEFAULT_CENTER;

    return venues.map((venue) => {
      const distanceFromStart = getDistanceMiles(startPoint, {
        lat: venue.latitude,
        lng: venue.longitude,
      });

      const event = candidateEventsByVenue.get(venue.id) || null;

      const genreMatches =
        selectedGenres.length === 0
          ? 0
          : selectedGenres.filter((genre) => {
              const lowered = genre.toLowerCase();
              return venue.musicGenres.some((venueGenre) => venueGenre.toLowerCase().includes(lowered));
            }).length;

      const genreScore = selectedGenres.length > 0 ? (genreMatches / selectedGenres.length) * 36 : 12;

      const venueTypeMatch =
        selectedVenueTypes.length === 0 ||
        selectedVenueTypes.some((type) => venue.venueType.toLowerCase().includes(type.toLowerCase()));
      const venueTypeScore = venueTypeMatch ? 20 : -6;

      const crowd = venue.crowdLevel.toLowerCase();
      let crowdScore = 0;
      if (crowdPreference === "quiet") {
        crowdScore += crowd.includes("quiet") ? 24 : crowd.includes("packed") ? -10 : 2;
        crowdScore -= Math.min(venue.liveCount, 50) * 0.24;
      } else if (crowdPreference === "busy") {
        crowdScore += crowd.includes("busy") ? 24 : crowd.includes("quiet") ? -3 : 8;
        crowdScore += Math.min(venue.liveCount, 120) * 0.2;
      } else if (crowdPreference === "packed") {
        crowdScore += crowd.includes("packed") ? 24 : crowd.includes("quiet") ? -8 : 6;
        crowdScore += Math.min(venue.liveCount, 150) * 0.3;
      } else {
        crowdScore += 6;
      }

      const eventScore = event ? 18 : 0;

      const budgetTarget = budget > 0 ? budget / Math.max(1, numberOfStops) : 0;
      const coverCost = event?.coverCharge ?? venue.coverCharge ?? 0;
      let budgetScore = 0;
      if (budgetTarget > 0) {
        budgetScore = coverCost <= budgetTarget ? 10 : -Math.min(12, (coverCost - budgetTarget) / 3);
      }

      const distanceScore = distanceFromStart <= maxDistanceMiles ? 12 : -Math.min(30, (distanceFromStart - maxDistanceMiles) * 4);

      const totalScore = genreScore + venueTypeScore + crowdScore + eventScore + budgetScore + distanceScore;

      return {
        venue,
        event,
        score: totalScore,
        distanceFromStart,
      };
    });
  }, [budget, candidateEventsByVenue, crowdPreference, location, maxDistanceMiles, numberOfStops, selectedGenres, selectedVenueTypes, venues]);

  const recomputeDistances = useCallback((stops: SafariStop[]) => {
    if (stops.length === 0) {
      return stops;
    }

    return stops.map((stop, index) => {
      if (index === 0) {
        return {
          ...stop,
          distanceFromPreviousMiles: location
            ? getDistanceMiles(location, { lat: stop.venue.latitude, lng: stop.venue.longitude })
            : 0,
        };
      }

      const previous = stops[index - 1];
      return {
        ...stop,
        distanceFromPreviousMiles: getDistanceMiles(
          { lat: previous.venue.latitude, lng: previous.venue.longitude },
          { lat: stop.venue.latitude, lng: stop.venue.longitude }
        ),
      };
    });
  }, [location]);

  const generateRoute = useCallback(() => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessageIndex(0);

    const startedAt = Date.now();
    const minimumGenerationMs = 1600;

    if (venues.length === 0) {
      setGenerationError("No venues are available with valid coordinates yet.");
      setGeneratedStops([]);
      setIsGenerating(false);
      return;
    }

    const sortedCandidates = [...allScoredCandidates].sort((left, right) => right.score - left.score);
    const preferred = sortedCandidates.filter((candidate) => candidate.distanceFromStart <= maxDistanceMiles);
    const fallback = sortedCandidates.filter((candidate) => candidate.distanceFromStart > maxDistanceMiles);

    const targetCount = Math.min(5, Math.max(2, numberOfStops));
    const chosenCandidates = [...preferred, ...fallback].slice(0, targetCount);

    if (chosenCandidates.length === 0) {
      setGenerationError("No matching venues were found for these preferences.");
      setGeneratedStops([]);
      setIsGenerating(false);
      return;
    }

    const uniqueByVenue = new Map<string, (typeof chosenCandidates)[number]>();
    for (const candidate of chosenCandidates) {
      if (!uniqueByVenue.has(candidate.venue.id)) {
        uniqueByVenue.set(candidate.venue.id, candidate);
      }
    }

    const toOrder = Array.from(uniqueByVenue.values());
    const startPoint = location || DEFAULT_CENTER;

    const ordered: (typeof toOrder)[number][] = [];
    const pending = [...toOrder];
    let currentPoint = startPoint;

    while (pending.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index];
        const distance = getDistanceMiles(currentPoint, {
          lat: candidate.venue.latitude,
          lng: candidate.venue.longitude,
        });

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }

      const [nearest] = pending.splice(nearestIndex, 1);
      ordered.push(nearest);
      currentPoint = {
        lat: nearest.venue.latitude,
        lng: nearest.venue.longitude,
      };
    }

    const startAnchor = new Date(`${safariDate}T${startTime}:00`);
    const endAnchor = new Date(`${safariDate}T${endTime}:00`);

    if (endAnchor <= startAnchor) {
      endAnchor.setDate(endAnchor.getDate() + 1);
    }

    const totalMinutes = Math.max(60, Math.round((endAnchor.getTime() - startAnchor.getTime()) / 60000));
    const slotMinutes = Math.max(40, Math.round(totalMinutes / ordered.length));

    const stops = ordered.map((item, index) => {
      const arrival = new Date(startAnchor.getTime() + index * slotMinutes * 60000);
      const departure = new Date(arrival.getTime() + Math.round(slotMinutes * 0.85) * 60000);

      const previous = index === 0 ? null : ordered[index - 1];
      const distanceFromPreviousMiles = previous
        ? getDistanceMiles(
            { lat: previous.venue.latitude, lng: previous.venue.longitude },
            { lat: item.venue.latitude, lng: item.venue.longitude }
          )
        : location
          ? getDistanceMiles(location, { lat: item.venue.latitude, lng: item.venue.longitude })
          : 0;

      return {
        venue: item.venue,
        event: item.event,
        distanceFromPreviousMiles,
        plannedArrival: arrival.toISOString(),
        plannedDeparture: departure.toISOString(),
      } as SafariStop;
    });

    const finishGeneration = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < minimumGenerationMs) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, minimumGenerationMs - elapsed);
        });
      }

      setGeneratedStops(stops);
      setCurrentPlanId(null);
      setIsSafariStarted(false);
      setActiveStopIndex(0);
      setSelectedStopIndex(0);
      setRouteRevealSeed((current) => current + 1);
      setIsGenerating(false);
    };

    void finishGeneration();
  }, [allScoredCandidates, endTime, isGenerating, location, maxDistanceMiles, numberOfStops, safariDate, startTime, venues.length]);

  const replaceStop = useCallback((index: number) => {
    setGeneratedStops((current) => {
      if (index < 0 || index >= current.length) {
        return current;
      }

      const usedVenueIds = new Set(current.map((stop) => stop.venue.id));
      const replacement = allScoredCandidates.find((candidate) => !usedVenueIds.has(candidate.venue.id));

      if (!replacement) {
        pushToast("No alternate venue available right now.", "info");
        return current;
      }

      const updated = [...current];
      updated[index] = {
        ...updated[index],
        venue: replacement.venue,
        event: replacement.event,
      };

      return recomputeDistances(updated);
    });
  }, [allScoredCandidates, pushToast, recomputeDistances]);

  const removeStop = useCallback((index: number) => {
    setGeneratedStops((current) => {
      const next = current.filter((_, stopIndex) => stopIndex !== index);
      return recomputeDistances(next);
    });
  }, [recomputeDistances]);

  const moveStop = useCallback((index: number, direction: -1 | 1) => {
    setGeneratedStops((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }

      const copy = [...current];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return recomputeDistances(copy);
    });
  }, [recomputeDistances]);

  const saveSafariPlan = useCallback(async (status: "draft" | "active" = "draft") => {
    if (!userId) {
      pushToast("Sign in to save your safari.", "error");
      return null;
    }

    if (generatedStops.length === 0) {
      pushToast("Generate a safari before saving.", "error");
      return null;
    }

    setIsSaving(true);

    const planPayload = {
      user_id: userId,
      title: `${new Date(safariDate).toLocaleDateString()} Safari`,
      safari_date: safariDate,
      start_time: `${safariDate}T${startTime}:00`,
      end_time: `${safariDate}T${endTime}:00`,
      max_distance_miles: maxDistanceMiles,
      budget,
      preferred_genres: selectedGenres,
      preferred_venue_types: selectedVenueTypes,
      status,
      updated_at: new Date().toISOString(),
    };

    const { data: planInsert, error: planError } = await supabase
      .from("safari_plans")
      .insert(planPayload)
      .select("id")
      .single();

    if (planError || !planInsert?.id) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Save plan failed:", planError);
      }
      pushToast("Could not save safari plan.", "error");
      setIsSaving(false);
      return null;
    }

    const planId = String(planInsert.id);

    const stopPayload = generatedStops.map((stop, index) => ({
      safari_plan_id: planId,
      venue_id: stop.venue.id,
      event_id: stop.event?.id || null,
      stop_order: index + 1,
      planned_arrival: stop.plannedArrival,
      planned_departure: stop.plannedDeparture,
      notes: "",
    }));

    const { error: stopsError } = await supabase.from("safari_stops").insert(stopPayload);

    if (stopsError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[safari] Save stops failed:", stopsError);
      }
      await supabase.from("safari_plans").delete().eq("id", planId);
      pushToast("Saving stops failed, so the plan was rolled back.", "error");
      setIsSaving(false);
      return null;
    }

    setCurrentPlanId(planId);
    pushToast("Safari saved.", "success");
    setIsSaving(false);
    await loadSavedSafaris();
    return planId;
  }, [budget, endTime, generatedStops, loadSavedSafaris, maxDistanceMiles, pushToast, safariDate, selectedGenres, selectedVenueTypes, startTime, supabase, userId]);

  const startSafari = useCallback(async () => {
    if (generatedStops.length === 0) {
      pushToast("Generate a safari first.", "error");
      return;
    }

    if (!userId) {
      pushToast("Sign in to start a safari.", "error");
      return;
    }

    let planId = currentPlanId;
    if (!planId) {
      planId = await saveSafariPlan("active");
      if (!planId) {
        return;
      }
    } else {
      const { error } = await supabase
        .from("safari_plans")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", planId);

      if (error) {
        pushToast("Unable to mark safari active.", "error");
        return;
      }
    }

    setCurrentPlanId(planId);
    setIsSafariStarted(true);
    setActiveStopIndex(0);
    setSelectedStopIndex(0);
    pushToast("Safari started. Navigate to Stop 1.", "success");
    await loadSavedSafaris();
  }, [currentPlanId, generatedStops.length, loadSavedSafaris, pushToast, saveSafariPlan, supabase, userId]);

  const markPlanCompleted = useCallback(async (planId: string) => {
    const { error } = await supabase
      .from("safari_plans")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", planId);

    if (error) {
      pushToast("Could not mark safari completed.", "error");
      return;
    }

    if (currentPlanId === planId) {
      setIsSafariStarted(false);
    }

    pushToast("Safari marked completed.", "success");
    await loadSavedSafaris();
  }, [currentPlanId, loadSavedSafaris, pushToast, supabase]);

  const deleteDraftPlan = useCallback(async (planId: string) => {
    const { error } = await supabase.from("safari_plans").delete().eq("id", planId);

    if (error) {
      pushToast("Could not delete draft safari.", "error");
      return;
    }

    if (currentPlanId === planId) {
      setCurrentPlanId(null);
      setIsSafariStarted(false);
    }

    pushToast("Draft safari deleted.", "success");
    await loadSavedSafaris();
  }, [currentPlanId, loadSavedSafaris, pushToast, supabase]);

  const reopenSavedSafari = useCallback((saved: SavedSafari) => {
    setGeneratedStops(recomputeDistances(saved.stops));
    setCurrentPlanId(saved.plan.id);
    setIsSafariStarted(saved.plan.status === "active");
    setActiveStopIndex(0);
    setSelectedStopIndex(0);
    setRouteRevealSeed((current) => current + 1);

    if (saved.plan.safari_date) {
      setSafariDate(saved.plan.safari_date);
    }
  }, [recomputeDistances]);

  const shareSafari = useCallback(async () => {
    if (generatedStops.length === 0) {
      pushToast("Generate a safari before sharing.", "error");
      return;
    }

    const safariTitle = `${new Date(safariDate).toLocaleDateString()} Safari`;
    const orderedStopLines = generatedStops.map((stop, index) => {
      return `${index + 1}. ${stop.venue.name} - ${parseTimeLabel(stop.plannedArrival)}`;
    });

    const summaryText = [
      safariTitle,
      `Date: ${new Date(safariDate).toLocaleDateString()}`,
      "",
      ...orderedStopLines,
      "",
      "Built with PartySafari",
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({
          title: safariTitle,
          text: summaryText,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      pushToast("Safari route copied.", "success");
    } catch {
      pushToast("Sharing is unavailable. Please copy manually from Safari details.", "error");
    }
  }, [generatedStops, pushToast, safariDate]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationMessageIndex((current) => (current + 1) % GENERATION_MESSAGES.length);
    }, 420);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGenerating]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    applyPreference();
    mediaQuery.addEventListener("change", applyPreference);

    return () => {
      mediaQuery.removeEventListener("change", applyPreference);
    };
  }, []);

  useEffect(() => {
    if (generatedStops.length === 0) {
      setVisibleTimelineCount(0);
      return;
    }

    if (prefersReducedMotion) {
      setVisibleTimelineCount(generatedStops.length);
      return;
    }

    setVisibleTimelineCount(1);
    let nextCount = 1;
    const intervalId = window.setInterval(() => {
      nextCount += 1;
      setVisibleTimelineCount(Math.min(generatedStops.length, nextCount));
      if (nextCount >= generatedStops.length) {
        window.clearInterval(intervalId);
      }
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generatedStops.length, prefersReducedMotion, routeRevealSeed]);

  useEffect(() => {
    void loadAuth();
    requestGeolocation();
  }, [loadAuth, requestGeolocation]);

  useEffect(() => {
    if (authChecked) {
      void loadSavedSafaris();
    }
  }, [authChecked, loadSavedSafaris]);

  useEffect(() => {
    void loadVenuesAndEvents();
  }, [loadVenuesAndEvents]);

  useEffect(() => {
    const channel = supabase.channel("safari-live-checkins");
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "venue_checkins",
      },
      () => {
        void loadVenuesAndEvents();
      }
    );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadVenuesAndEvents, supabase]);

  const startPoint = location || DEFAULT_CENTER;

  const totalEstimatedCover = useMemo(() => {
    return generatedStops.reduce((sum, stop) => sum + (stop.event?.coverCharge ?? stop.venue.coverCharge ?? 0), 0);
  }, [generatedStops]);

  const totalRouteMiles = useMemo(() => {
    return generatedStops.reduce((sum, stop) => sum + stop.distanceFromPreviousMiles, 0);
  }, [generatedStops]);

  const safariScore = useMemo(() => {
    if (generatedStops.length === 0) {
      return {
        score: 0,
        label: "Worth Tweaking",
        reasons: ["Generate a route to calculate score"],
      };
    }

    const venueTypeMatches = generatedStops.filter((stop) =>
      selectedVenueTypes.length === 0
        ? true
        : selectedVenueTypes.some((type) => stop.venue.venueType.toLowerCase().includes(type.toLowerCase()))
    ).length;

    const stopCount = generatedStops.length;
    const stopsWithEvents = generatedStops.filter((stop) => Boolean(stop.event)).length;

    const genreMatchRatios = generatedStops.map((stop) => {
      const sourceGenres = stop.event?.musicGenres?.length ? stop.event.musicGenres : stop.venue.musicGenres;
      if (selectedGenres.length === 0) {
        return 1;
      }

      const matched = selectedGenres.filter((genre) =>
        sourceGenres.some((item) => item.toLowerCase().includes(genre.toLowerCase()))
      ).length;

      return matched / selectedGenres.length;
    });

    const averageGenreMatch =
      genreMatchRatios.reduce((sum, value) => sum + value, 0) / Math.max(genreMatchRatios.length, 1);

    const crowdMatchAverage =
      generatedStops.reduce((sum, stop) => sum + crowdMatchScore(stop.venue.crowdLevel, crowdPreference), 0) /
      Math.max(generatedStops.length, 1);

    const eventCoverage = stopsWithEvents / Math.max(stopCount, 1);

    const averageLeg = totalRouteMiles / Math.max(stopCount, 1);
    const distanceComponent = Math.max(0, Math.min(1, 1 - averageLeg / Math.max(maxDistanceMiles, 1)));

    const budgetComponent =
      budget <= 0
        ? 1
        : totalEstimatedCover <= budget
          ? 1
          : Math.max(0, 1 - (totalEstimatedCover - budget) / budget);

    const liveEnergyRaw =
      generatedStops.reduce((sum, stop) => sum + Math.min(1, stop.venue.liveCount / 60), 0) /
      Math.max(stopCount, 1);

    const genrePoints = averageGenreMatch * 25;
    const venueTypePoints = (venueTypeMatches / Math.max(stopCount, 1)) * 15;
    const crowdPoints = crowdMatchAverage * 15;
    const eventPoints = eventCoverage * 15;
    const routePoints = distanceComponent * 15;
    const budgetPoints = budgetComponent * 10;
    const livePoints = liveEnergyRaw * 5;

    const weightedScore =
      genrePoints +
      venueTypePoints +
      crowdPoints +
      eventPoints +
      routePoints +
      budgetPoints +
      livePoints;

    const score = Math.max(0, Math.min(100, Math.round(weightedScore)));

    const reasons: string[] = [];
    if (genrePoints >= 17) reasons.push("Great music match");
    if (eventPoints >= 8 && stopsWithEvents > 0) reasons.push(`Live entertainment at ${stopsWithEvents} stops`);
    if (routePoints >= 10) reasons.push("Short travel route");
    if (budgetPoints >= 8) reasons.push("Within budget");
    if (crowdPoints >= 10) reasons.push("Strong crowd energy");
    if (livePoints >= 3.2) reasons.push("Strong live check-in activity");
    if (reasons.length < 3 && routePoints < 7) reasons.push("Longer travel between stops");
    if (reasons.length < 3 && budgetPoints < 5) reasons.push("Estimated cost may exceed budget");
    if (reasons.length < 3) reasons.push(`${stopCount} stops selected`);

    const label = score >= 90 ? "Legendary Safari" : score >= 75 ? "Hot Route" : score >= 60 ? "Solid Night" : "Worth Tweaking";

    return {
      score,
      label,
      reasons: reasons.slice(0, 5),
    };
  }, [budget, crowdPreference, generatedStops, maxDistanceMiles, selectedGenres, selectedVenueTypes, totalEstimatedCover, totalRouteMiles]);

  const nextStop = generatedStops[Math.min(activeStopIndex + 1, generatedStops.length - 1)] || null;

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[#120625] via-[#10061f] to-[#0a0516] p-6 shadow-[0_20px_50px_rgba(66,0,122,0.24)]">
          <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Safari Mode</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-5xl">Build Tonight&apos;s Safari</h1>
          <p className="mt-3 max-w-3xl text-white/75">
            PartySafari builds a nightlife route tailored to your preferences, live crowd energy, and tonight&apos;s events so you can move venue-to-venue with less guesswork.
          </p>
          {geolocationError ? (
            <div className="mt-4 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
              {geolocationError}
            </div>
          ) : null}
        </section>

        {!authChecked ? (
          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">Checking session...</div>
        ) : !userId ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-xl font-semibold text-white">Sign in to save and start safaris</h2>
            <p className="mt-2 text-white/70">You can still generate a sample route, but account actions are disabled until you log in.</p>
            <div className="mt-4">
              <Link
                href="/login"
                className="inline-flex rounded-full border border-violet-400/40 bg-violet-500/20 px-5 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30"
              >
                Go to Login
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="order-1 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-5">
              <button
                type="button"
                className="mb-4 inline-flex rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200 md:hidden"
                onClick={() => setPreferencesOpen((open) => !open)}
              >
                {preferencesOpen ? "Hide Preferences" : "Show Preferences"}
              </button>

              <div className={preferencesOpen ? "space-y-4" : "hidden space-y-4 md:block"}>
                <h2 className="text-2xl font-semibold text-white">Safari Preferences</h2>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-white/75">
                    Date
                    <input
                      type="date"
                      value={safariDate}
                      onChange={(event) => setSafariDate(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm text-white/75">
                    Maximum Distance (miles)
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={maxDistanceMiles}
                      onChange={(event) => setMaxDistanceMiles(Math.max(1, Number(event.target.value || 1)))}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm text-white/75">
                    Start Time
                    <input
                      type="time"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm text-white/75">
                    End Time
                    <input
                      type="time"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm text-white/75">
                    Budget (total)
                    <input
                      type="number"
                      min={0}
                      max={2000}
                      value={budget}
                      onChange={(event) => setBudget(Math.max(0, Number(event.target.value || 0)))}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm text-white/75">
                    Number of Stops (2-5)
                    <input
                      type="number"
                      min={2}
                      max={5}
                      value={numberOfStops}
                      onChange={(event) => setNumberOfStops(Math.min(5, Math.max(2, Number(event.target.value || 2))))}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-3 py-2.5 text-white outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b0717] p-3 text-sm text-white/70">
                  Starting Location: {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Locating..."}
                  <button
                    type="button"
                    onClick={requestGeolocation}
                    className="ml-3 rounded-full border border-orange-400/40 bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-100"
                  >
                    Refresh Location
                  </button>
                </div>

                <div>
                  <p className="mb-2 text-sm text-white/75">Music Genres</p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_GENRES.map((genre) => {
                      const selected = selectedGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => {
                            setSelectedGenres((current) =>
                              current.includes(genre)
                                ? current.filter((item) => item !== genre)
                                : [...current, genre]
                            );
                          }}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            selected
                              ? "border border-violet-400/50 bg-violet-500/20 text-violet-100"
                              : "border border-white/15 bg-white/5 text-white/70"
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-white/75">Venue Types</p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_VENUE_TYPES.map((type) => {
                      const selected = selectedVenueTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setSelectedVenueTypes((current) =>
                              current.includes(type)
                                ? current.filter((item) => item !== type)
                                : [...current, type]
                            );
                          }}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            selected
                              ? "border border-orange-300/60 bg-orange-500/20 text-orange-100"
                              : "border border-white/15 bg-white/5 text-white/70"
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm text-white/75">Crowd Preference</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Quiet", value: "quiet" as CrowdPreference },
                      { label: "Busy", value: "busy" as CrowdPreference },
                      { label: "Packed", value: "packed" as CrowdPreference },
                      { label: "Any", value: "any" as CrowdPreference },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCrowdPreference(option.value)}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${
                          crowdPreference === option.value
                            ? "border border-violet-400/50 bg-violet-500/25 text-violet-100"
                            : "border border-white/15 bg-white/5 text-white/70"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isGenerating ? (
                  <div className="w-full rounded-2xl border border-violet-300/35 bg-violet-500/12 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-orange-300"
                        aria-hidden="true"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-violet-100">
                          {GENERATION_MESSAGES[generationMessageIndex]}
                          <span className="inline-flex align-middle">
                            <span className="animate-pulse">.</span>
                            <span className="animate-pulse [animation-delay:160ms]">.</span>
                            <span className="animate-pulse [animation-delay:320ms]">.</span>
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isLoadingData}
                    onClick={generateRoute}
                    className="w-full rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Generate My Safari
                  </button>
                )}
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-[#10061f] p-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">Safari Timeline</h3>
                  <p className="text-sm text-white/70">Stops: {generatedStops.length} • Est. Cover: ${totalEstimatedCover.toFixed(0)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={generateRoute}
                    disabled={isGenerating || isLoadingData}
                    className="rounded-full border border-violet-400/40 bg-violet-500/20 px-3 py-2 text-sm font-semibold text-violet-100"
                  >
                    Regenerate Route
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareSafari()}
                    disabled={generatedStops.length === 0}
                    className="rounded-full border border-violet-300/40 bg-white/5 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Share My Safari
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSafariPlan("draft")}
                    disabled={isSaving || generatedStops.length === 0 || !userId}
                    className="rounded-full border border-orange-300/50 bg-orange-500/20 px-3 py-2 text-sm font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Safari"}
                  </button>
                </div>
              </div>

              {generatedStops.length > 0 ? (
                <div className="rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-orange-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-violet-300">Safari Score</p>
                      <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white">{safariScore.score}</p>
                        <p className="pb-1 text-sm font-semibold text-white/70">/ 100</p>
                      </div>
                      <p className="text-sm font-semibold text-orange-200">{safariScore.label}</p>
                    </div>
                    <div className="max-w-xl flex flex-wrap gap-2 text-sm text-white/90">
                      {safariScore.reasons.slice(0, 5).map((reason) => (
                        <span key={reason} className="rounded-full border border-violet-300/25 bg-white/5 px-3 py-1 text-xs">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {generationError ? (
                <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{generationError}</div>
              ) : null}

              {isLoadingData ? (
                <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-center text-white/70">Loading live venues and events...</div>
              ) : null}

              {generatedStops.length === 0 && !isLoadingData ? (
                <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">No route generated yet. Set preferences and generate your safari.</div>
              ) : (
                <div className="relative space-y-4 before:absolute before:bottom-4 before:left-[1.08rem] before:top-4 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-violet-400/90 before:via-violet-500/40 before:to-orange-400/60 before:shadow-[0_0_18px_rgba(167,139,250,0.65)]">
                  {generatedStops.map((stop, index) => {
                    const stopKey = `${stop.venue.id}-${index}`;
                    const isActive = isSafariStarted && index === activeStopIndex;
                    const isSelected = index === selectedStopIndex;
                    const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${stop.venue.latitude},${stop.venue.longitude}`;
                    const travelMinutes = estimateTravelMinutes(stop.distanceFromPreviousMiles);
                    const arrivalLabel = parseTimeLabel(stop.plannedArrival);
                    const stopGenres = stop.event?.musicGenres?.length ? stop.event.musicGenres : stop.venue.musicGenres;

                    return (
                      <article
                        key={stopKey}
                        ref={(element) => {
                          timelineStopRefs.current[stopKey] = element;
                        }}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedStopIndex(index)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedStopIndex(index);
                          }
                        }}
                        aria-label={`Stop ${index + 1}, ${stop.venue.name}`}
                        className={`relative ml-2 overflow-hidden rounded-3xl border p-4 pl-14 shadow-[0_10px_26px_rgba(0,0,0,0.3)] transition focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                          prefersReducedMotion
                            ? "opacity-100"
                            : index < visibleTimelineCount
                              ? "translate-y-0 opacity-100 duration-300"
                              : "translate-y-2 opacity-0 duration-150"
                        } ${
                          isActive || isSelected
                            ? "border-orange-300/70 bg-orange-500/10 ring-2 ring-orange-400/40"
                            : "border-white/10 bg-[#10061f]"
                        }`}
                      >
                        <div className="absolute left-[0.25rem] top-6 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-[#7c3aed] text-sm font-bold text-white shadow-[0_0_15px_rgba(124,58,237,0.65)]">
                          {index + 1}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">
                            Arrive {arrivalLabel}
                          </p>
                          <div className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                            {stop.distanceFromPreviousMiles.toFixed(1)} mi from previous
                          </div>
                        </div>

                        <p className="mt-1 text-xs text-white/55">Estimated travel: {travelMinutes} min</p>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          {stop.venue.imageUrl ? (
                            <img
                              src={stop.venue.imageUrl}
                              alt={stop.venue.name}
                              className="h-28 w-full rounded-2xl border border-white/10 object-cover sm:w-44"
                            />
                          ) : (
                            <div className="relative h-28 w-full overflow-hidden rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-500/35 via-[#2b0d46] to-orange-500/25 sm:w-44">
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.22),transparent_60%)]" />
                              <div className="relative flex h-full flex-col justify-center px-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-100">PartySafari</p>
                                <p className="mt-1 text-lg text-violet-100">🔥</p>
                                <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{stop.venue.name}</p>
                                <p className="text-xs text-violet-100/85">{stop.venue.venueType}</p>
                              </div>
                            </div>
                          )}

                          <div className="flex-1">
                            <h4 className="text-xl font-semibold text-white">{stop.venue.name}</h4>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/70">
                              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1">{stop.venue.venueType}</span>
                              <span className="rounded-full border border-orange-300/20 bg-orange-500/10 px-2 py-1">Crowd: {stop.venue.crowdLevel}</span>
                              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">Live Check-ins: {stop.venue.liveCount}</span>
                            </div>

                            <p className="mt-3 text-sm text-white/70">
                              Tonight&apos;s Event: {stop.event?.title || "No event listed"}
                            </p>
                            <p className="mt-1 text-sm text-white/70">
                              Cover: ${(stop.event?.coverCharge ?? stop.venue.coverCharge) !== null ? Number(stop.event?.coverCharge ?? stop.venue.coverCharge ?? 0).toFixed(0) : "N/A"}
                            </p>
                            <p className="mt-1 text-sm text-white/70">
                              Genres: {stopGenres.join(", ") || "Open format"}
                            </p>
                            <p className="mt-1 text-sm text-white/70">Drink Specials: {stop.venue.drinkSpecials || "Not listed"}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-orange-300/50 bg-orange-500/20 px-3 py-2 text-xs font-semibold text-orange-100"
                          >
                            Directions
                          </Link>
                          <Link
                            href={`/venues/${stop.venue.slug}`}
                            className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100"
                          >
                            View Venue
                          </Link>
                          <button
                            type="button"
                            onClick={() => replaceStop(index)}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85"
                          >
                            Replace Stop
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(index, -1)}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85"
                          >
                            Move Up
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(index, 1)}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85"
                          >
                            Move Down
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStop(index)}
                            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200"
                          >
                            Remove Stop
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">My Safaris</h3>
                {loadingSavedSafaris ? <span className="text-sm text-white/60">Loading...</span> : null}
              </div>

              {savedSafaris.length === 0 ? (
                <p className="text-sm text-white/65">No saved safaris yet.</p>
              ) : (
                <div className="space-y-3">
                  {savedSafaris.map((saved) => (
                    <div key={saved.plan.id} className="rounded-2xl border border-white/10 bg-[#0b0717] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{saved.plan.title || "Safari Plan"}</p>
                          <p className="text-xs text-white/60">
                            {saved.plan.safari_date || "Date TBD"} • {saved.stops.length} stops • Status: {saved.plan.status || "draft"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => reopenSavedSafari(saved)}
                            className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100"
                          >
                            Open
                          </button>
                          {(saved.plan.status || "draft") === "draft" ? (
                            <button
                              type="button"
                              onClick={() => void deleteDraftPlan(saved.plan.id)}
                              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
                            >
                              Delete Draft
                            </button>
                          ) : null}
                          {(saved.plan.status || "") === "active" ? (
                            <button
                              type="button"
                              onClick={() => void markPlanCompleted(saved.plan.id)}
                              className="rounded-full border border-orange-300/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-100"
                            >
                              Mark Completed
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>

          <section className="order-2 space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4">
              <h3 className="mb-3 text-xl font-semibold text-white">Safari Map</h3>
              <div className="h-[320px] overflow-hidden rounded-2xl border border-white/10 md:h-[420px]">
                <SafariRouteMap
                  startPoint={startPoint}
                  stops={generatedStops.map((stop) => ({
                    venue: {
                      latitude: stop.venue.latitude,
                      longitude: stop.venue.longitude,
                      name: stop.venue.name,
                    },
                  }))}
                  activeStopIndex={activeStopIndex}
                  highlightedStopIndex={selectedStopIndex}
                  isSafariStarted={isSafariStarted}
                  prefersReducedMotion={prefersReducedMotion}
                  revealSeed={routeRevealSeed}
                  onMarkerSelect={(index) => {
                    setSelectedStopIndex(index);
                    const stop = generatedStops[index];
                    if (!stop) {
                      return;
                    }

                    const key = `${stop.venue.id}-${index}`;
                    const element = timelineStopRefs.current[key];
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-4">
              <h3 className="text-xl font-semibold text-white">Start Controls</h3>
              {generatedStops.length === 0 ? (
                <p className="mt-2 text-sm text-white/70">Generate a route to enable safari controls.</p>
              ) : (
                <>
                  <div className="mt-2 text-sm text-white/70">
                    {isSafariStarted
                      ? `Active stop: ${activeStopIndex + 1} of ${generatedStops.length}`
                      : "Safari not started yet."}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void startSafari()}
                      disabled={generatedStops.length === 0}
                      className="rounded-full bg-gradient-to-r from-orange-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Start Safari
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareSafari()}
                      disabled={generatedStops.length === 0}
                      className="rounded-full border border-violet-300/40 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Share My Safari
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStopIndex((current) => {
                          const nextIndex = Math.min(current + 1, generatedStops.length - 1);
                          setSelectedStopIndex(nextIndex);
                          return nextIndex;
                        });
                      }}
                      disabled={!isSafariStarted || activeStopIndex >= generatedStops.length - 1}
                      className="rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next Stop
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveStopIndex((current) => {
                          const nextIndex = Math.max(current - 1, 0);
                          setSelectedStopIndex(nextIndex);
                          return nextIndex;
                        });
                      }}
                      disabled={!isSafariStarted || activeStopIndex <= 0}
                      className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous Stop
                    </button>
                  </div>

                  {isSafariStarted && generatedStops[activeStopIndex] ? (
                    <div className="mt-4 rounded-2xl border border-orange-300/30 bg-orange-500/10 p-3">
                      <p className="text-sm font-semibold text-orange-100">Navigate to Stop {activeStopIndex + 1}</p>
                      <p className="text-sm text-orange-50/90">{generatedStops[activeStopIndex].venue.name}</p>
                      <Link
                        href={`https://www.google.com/maps/dir/?api=1&destination=${generatedStops[activeStopIndex].venue.latitude},${generatedStops[activeStopIndex].venue.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex rounded-full border border-orange-300/50 bg-orange-500/20 px-3 py-1.5 text-xs font-semibold text-orange-100"
                      >
                        Navigate to Stop {activeStopIndex + 1}
                      </Link>
                      {nextStop ? (
                        <p className="mt-2 text-xs text-orange-50/80">Up next: {nextStop.venue.name}</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {generatedStops.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0f071f]/95 p-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => void startSafari()}
            className="w-full rounded-full bg-gradient-to-r from-orange-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Start Safari
          </button>
        </div>
      ) : null}

      <div className="pointer-events-none fixed right-4 top-20 z-30 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-2 text-sm shadow-xl ${
              toast.type === "success"
                ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                : toast.type === "error"
                  ? "border-rose-300/40 bg-rose-500/20 text-rose-100"
                  : "border-violet-300/40 bg-violet-500/20 text-violet-100"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
