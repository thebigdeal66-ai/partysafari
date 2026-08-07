"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SetStateAction } from "react";
import Link from "next/link";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { useLiveVenueMetrics } from "@/hooks/useLiveVenueMetrics";
import { usePartyScores } from "@/hooks/usePartyScore";
import { emptyPartyScore, toSafePartyScore, type PartyScoreDetails } from "@/lib/partyScore";
import { buildCrowdPulseSnapshot, type CrowdPulseSnapshot } from "@/lib/discoverCrowdPulse";
import { CrowdPulseCard } from "@/components/crowd-pulse";
import { getVenueStatusLabel, resolveCurrentVibe } from "@/lib/crowdPulsePresentation";
import VenueCheckInButton from "@/components/VenueCheckInButton";
import "leaflet/dist/leaflet.css";

type GeoPoint = {
  lat: number;
  lng: number;
};

type RadarVenue = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  venueType: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  currentStatus: string | null;
  musicGenres: string[];
  drinkSpecials: string | null;
  foodAvailable: boolean;
};

type RadarEvent = {
  id: string;
  venueId: string;
  title: string;
  performerName: string | null;
  eventType: string | null;
  startTime: string;
  endTime: string | null;
  status: string | null;
};

type RadarHotspotTier = "Quiet" | "Picking Up" | "Active" | "Busy" | "Hot" | "Legendary";

type RadarHotspot = RadarVenue & {
  crowdPulse: CrowdPulseSnapshot;
  partyScore: PartyScoreDetails;
  tier: RadarHotspotTier;
  liveCheckins: number;
  activeStories: number;
  currentEvents: number;
  friendsHere: number;
  currentEvent: string | null;
  currentEntertainment: string | null;
  currentEventId: string | null;
  currentEventType: string | null;
  distanceMiles: number | null;
  openNow: boolean;
};

type RadarCluster = {
  id: string;
  lat: number;
  lng: number;
  hotspots: RadarHotspot[];
};

type OverlayState = {
  friends: boolean;
  stories: boolean;
  events: boolean;
  happyHour: boolean;
  liveMusic: boolean;
  lateNightFood: boolean;
};

type FocusTarget = {
  lat: number;
  lng: number;
  zoom?: number;
} | null;

type MapTrackerProps = {
  onZoomChange: (zoom: number) => void;
};

const DEFAULT_CENTER: GeoPoint = { lat: 30.2672, lng: -97.7431 };

declare global {
  interface Window {
    __RADAR_TRACE__?: Array<Record<string, unknown>>;
    __RADAR_LAST_USER_INTERACTION__?: number;
  }
}

function radarTrace(source: string, event: string, detail: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    source,
    event,
    ...detail,
  };

  console.log(`[RadarTrace][${source}] ${event}`, payload);

  if (typeof window !== "undefined") {
    const bucket = window.__RADAR_TRACE__ || [];
    bucket.push(payload);
    window.__RADAR_TRACE__ = bucket;
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(from: GeoPoint, to: GeoPoint) {
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

function parseText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [] as string[];
}

function toTier(score: number): RadarHotspotTier {
  if (score <= 20) return "Quiet";
  if (score <= 40) return "Picking Up";
  if (score <= 60) return "Active";
  if (score <= 80) return "Busy";
  if (score <= 95) return "Hot";
  return "Legendary";
}

function toTierStyle(tier: RadarHotspotTier) {
  switch (tier) {
    case "Legendary":
      return { className: "radar-hotspot legendary", radius: 34, glowRadius: 300, haloColor: "#ef4444" };
    case "Hot":
      return { className: "radar-hotspot hot", radius: 30, glowRadius: 240, haloColor: "#f97316" };
    case "Busy":
      return { className: "radar-hotspot busy", radius: 26, glowRadius: 190, haloColor: "#fb923c" };
    case "Active":
      return { className: "radar-hotspot active", radius: 22, glowRadius: 150, haloColor: "#facc15" };
    case "Picking Up":
      return { className: "radar-hotspot picking", radius: 19, glowRadius: 95, haloColor: "#a3e635" };
    default:
      return { className: "radar-hotspot quiet", radius: 15, glowRadius: 70, haloColor: "#22c55e" };
  }
}

function formatMiles(distanceMiles: number | null) {
  if (distanceMiles === null || !Number.isFinite(distanceMiles)) {
    return "Distance TBD";
  }
  if (distanceMiles < 0.15) {
    return "Walkable";
  }
  if (distanceMiles < 10) {
    return `${distanceMiles.toFixed(1)} mi`;
  }
  return `${Math.round(distanceMiles)} mi`;
}

function isOpenNow(status: string | null) {
  const normalized = (status || "open").toLowerCase();
  return !normalized.includes("closed");
}

function isLiveMusicType(value: string | null) {
  const normalized = (value || "").toLowerCase();
  return ["live_music", "dj", "band", "karaoke", "comedy", "open_mic"].includes(normalized);
}

function hasHappyHour(hotspot: RadarHotspot) {
  const text = (hotspot.drinkSpecials || "").toLowerCase();
  return text.includes("happy") || text.includes("2-for") || text.includes("special");
}

function isLateNightFood(hotspot: RadarHotspot) {
  const text = (hotspot.drinkSpecials || "").toLowerCase();
  return hotspot.foodAvailable || text.includes("food") || text.includes("kitchen") || text.includes("late night");
}

function cityLabel(venue: RadarVenue) {
  const city = venue.city || "Unknown";
  const state = venue.state ? `, ${venue.state}` : "";
  return `${city}${state}`;
}

function clusterHotspots(hotspots: RadarHotspot[], zoom: number): RadarCluster[] {
  if (hotspots.length <= 1 || zoom >= 14) {
    return hotspots.map((hotspot) => ({
      id: hotspot.id,
      lat: hotspot.latitude,
      lng: hotspot.longitude,
      hotspots: [hotspot],
    }));
  }

  const cell = zoom >= 13 ? 0.02 : zoom >= 12 ? 0.035 : 0.06;
  const buckets = new Map<string, RadarHotspot[]>();

  for (const hotspot of hotspots) {
    const keyLat = Math.round(hotspot.latitude / cell);
    const keyLng = Math.round(hotspot.longitude / cell);
    const key = `${keyLat}:${keyLng}`;
    buckets.set(key, [...(buckets.get(key) || []), hotspot]);
  }

  return Array.from(buckets.entries()).map(([key, grouped]) => {
    const lat = grouped.reduce((sum, item) => sum + item.latitude, 0) / grouped.length;
    const lng = grouped.reduce((sum, item) => sum + item.longitude, 0) / grouped.length;
    return {
      id: key,
      lat,
      lng,
      hotspots: grouped,
    };
  });
}

function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {
  const style = toTierStyle(hotspot.tier);
  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));
  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));
  return L.divIcon({
    className: "",
    html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span></button>`,
    iconSize: [radius * 2, radius * 2],
    iconAnchor: [radius, radius],
  });
}

function createClusterIcon(hotspots: RadarHotspot[]) {
  const topScore = Math.max(...hotspots.map((item) => item.crowdPulse.pulseScore));
  const tier = toTier(topScore);
  const style = toTierStyle(tier);
  return L.divIcon({
    className: "",
    html: `<button class="radar-cluster ${style.className}"><span>${hotspots.length}</span></button>`,
    iconSize: [style.radius * 2, style.radius * 2],
    iconAnchor: [style.radius, style.radius],
  });
}

function MapTracker({ onZoomChange }: MapTrackerProps) {
  const map = useMapEvents({
    zoomend: () => {
      radarTrace("MapTracker", "zoomend", { line: 281, zoom: map.getZoom() });
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    radarTrace("MapTracker", "effect:initial-zoom-sync", {
      line: 286,
      deps: ["map", "onZoomChange"],
      zoom: map.getZoom(),
    });
    onZoomChange(map.getZoom());
    return () => {
      radarTrace("MapTracker", "cleanup:initial-zoom-sync", { line: 292 });
    };
  }, [map, onZoomChange]);

  return null;
}

function MapFocusController({ focus }: { focus: FocusTarget }) {
  const map = useMap();

  useEffect(() => {
    radarTrace("MapFocusController", "effect:focus-sync", {
      line: 300,
      deps: ["focus", "map"],
      focusLat: focus?.lat ?? null,
      focusLng: focus?.lng ?? null,
      focusZoom: focus?.zoom ?? null,
    });
    if (!focus) {
      return;
    }

    const targetZoom = focus.zoom ?? Math.max(map.getZoom(), 14);
    map.flyTo([focus.lat, focus.lng], targetZoom, {
      animate: true,
      duration: 0.75,
    });

    return () => {
      radarTrace("MapFocusController", "cleanup:focus-sync", { line: 317 });
    };
  }, [focus, map]);

  return null;
}

export default function SafariRadarExperience() {
  const isDev = process.env.NODE_ENV === "development";
  const effectRunCountsRef = useRef<Record<string, number>>({});
  const renderWindowRef = useRef<{ startMs: number; count: number }>({ startMs: Date.now(), count: 0 });
  const previousSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const stateDriverCountsRef = useRef<Record<string, number>>({});

  const logEffectRun = useCallback((name: string, line: number, dependencies: string[]) => {
    if (!isDev) {
      return;
    }

    const nextCount = (effectRunCountsRef.current[name] || 0) + 1;
    effectRunCountsRef.current[name] = nextCount;

    const lastInteraction = typeof window !== "undefined" ? (window.__RADAR_LAST_USER_INTERACTION__ || 0) : 0;
    const sinceInteractionMs = Date.now() - lastInteraction;
    radarTrace("SafariRadarExperience", `effect:${name}`, {
      line,
      count: nextCount,
      dependencies,
      sinceInteractionMs,
    });

    if (nextCount > 10 && sinceInteractionMs > 1500) {
      radarTrace("SafariRadarExperience", "probable-infinite-effect-loop", {
        line,
        effectName: name,
        count: nextCount,
        dependencies,
      });
    }
  }, [isDev]);

  const traceSetState = useCallback(<T,>(stateName: string, line: number, nextValue: SetStateAction<T>) => {
    if (!isDev) {
      return;
    }

    radarTrace("SafariRadarExperience", "setState", {
      line,
      state: stateName,
      updateKind: typeof nextValue === "function" ? "updater" : "value",
    });
  }, [isDev]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return;
    }

    const updateLastInteraction = () => {
      window.__RADAR_LAST_USER_INTERACTION__ = Date.now();
    };

    updateLastInteraction();
    window.addEventListener("pointerdown", updateLastInteraction);
    window.addEventListener("keydown", updateLastInteraction);

    radarTrace("SafariRadarExperience", "effect:user-interaction-tracker", {
      line: 371,
      deps: ["isDev"],
    });

    return () => {
      window.removeEventListener("pointerdown", updateLastInteraction);
      window.removeEventListener("keydown", updateLastInteraction);
      radarTrace("SafariRadarExperience", "cleanup:user-interaction-tracker", { line: 380 });
    };
  }, [isDev]);

  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [mapCenter, setMapCenter] = useState<GeoPoint>(DEFAULT_CENTER);
  const [venues, setVenues] = useState<RadarVenue[]>([]);
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedCity, setSelectedCity] = useState<string>("nearby");
  const [cityQuery, setCityQuery] = useState("");
  const [searchedCityCenter, setSearchedCityCenter] = useState<GeoPoint | null>(null);
  const [citySearchError, setCitySearchError] = useState<string | null>(null);
  const [citySearching, setCitySearching] = useState(false);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [mapZoom, setMapZoom] = useState(13);

  const [minScore, setMinScore] = useState(25);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(20);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [liveStoriesOnly, setLiveStoriesOnly] = useState(false);
  const [liveMusicOnly, setLiveMusicOnly] = useState(false);
  const [venueTypeFilter, setVenueTypeFilter] = useState("All");
  const [crowdFilter, setCrowdFilter] = useState<"All" | RadarHotspotTier>("All");

  const [overlays, setOverlays] = useState<OverlayState>({
    friends: false,
    stories: false,
    events: false,
    happyHour: false,
    liveMusic: false,
    lateNightFood: false,
  });

  if (isDev) {
    const nowMs = Date.now();
    if (nowMs - renderWindowRef.current.startMs > 5000) {
      renderWindowRef.current = { startMs: nowMs, count: 0 };
      stateDriverCountsRef.current = {};
    }

    renderWindowRef.current.count += 1;

    const snapshot: Record<string, unknown> = {
      loading,
      loadingEvents,
      geoError,
      venuesError,
      userLocation: userLocation ? `${userLocation.lat},${userLocation.lng}` : null,
      mapCenter: `${mapCenter.lat},${mapCenter.lng}`,
      venuesLength: venues.length,
      eventsLength: events.length,
      viewMode,
      selectedCity,
      selectedHotspotId,
      focusTarget: focusTarget ? `${focusTarget.lat},${focusTarget.lng},${focusTarget.zoom ?? "na"}` : null,
      showFilterSheet,
      mapZoom,
      minScore,
      maxDistanceMiles,
      friendsOnly,
      openNowOnly,
      liveStoriesOnly,
      liveMusicOnly,
      venueTypeFilter,
      crowdFilter,
      overlays: JSON.stringify(overlays),
    };

    if (previousSnapshotRef.current) {
      for (const [key, value] of Object.entries(snapshot)) {
        if (previousSnapshotRef.current[key] !== value) {
          stateDriverCountsRef.current[key] = (stateDriverCountsRef.current[key] || 0) + 1;
        }
      }
    }
    previousSnapshotRef.current = snapshot;

    radarTrace("SafariRadarExperience", "render", {
      line: 434,
      countInWindow: renderWindowRef.current.count,
      windowMs: nowMs - renderWindowRef.current.startMs,
      venuesLength: venues.length,
      eventsLength: events.length,
      mapZoom,
      selectedHotspotId,
    });

    if (renderWindowRef.current.count > 20) {
      const drivers = Object.entries(stateDriverCountsRef.current)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([state, changes]) => ({ state, changes }));

      radarTrace("SafariRadarExperience", "probable-render-loop", {
        line: 452,
        countInWindow: renderWindowRef.current.count,
        topStateDrivers: drivers,
      });
    }
  }

  const requestGeolocation = useCallback(() => {
    radarTrace("SafariRadarExperience", "callback:requestGeolocation", { line: 459 });
    if (!("geolocation" in navigator)) {
      traceSetState("geoError", 461, "Location is unavailable on this device. Showing fallback city.");
      setGeoError("Location is unavailable on this device. Showing fallback city.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        traceSetState("userLocation", 472, location);
        setUserLocation(location);
        traceSetState("geoError", 474, null);
        setGeoError(null);
      },
      () => {
        traceSetState("geoError", 478, "Location permission denied. You can still use city mode.");
        setGeoError("Location permission denied. You can still use city mode.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 90_000 }
    );
  }, []);

  useEffect(() => {
    logEffectRun("request-geolocation-on-mount", 486, ["requestGeolocation"]);
    requestGeolocation();
    return () => {
      radarTrace("SafariRadarExperience", "cleanup:request-geolocation-on-mount", { line: 489 });
    };
  }, [requestGeolocation]);

  const loadVenues = useCallback(async () => {
    radarTrace("SafariRadarExperience", "callback:loadVenues:start", { line: 493 });
    traceSetState("loading", 494, true);
    setLoading(true);
    traceSetState("venuesError", 495, null);
    setVenuesError(null);

    let data: Array<Record<string, unknown>>;

    try {
      const response = await fetch("/api/public/venues", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Venue lookup failed.");
      }
      data = (await response.json()) as Array<Record<string, unknown>>;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[SafariRadar] load venues failed", error);
      }
      traceSetState("venues", 514, []);
      setVenues([]);
      traceSetState("venuesError", 515, "Unable to load venues for radar right now.");
      setVenuesError("Unable to load venues for radar right now.");
      traceSetState("loading", 516, false);
      setLoading(false);
      return;
    }

    const mapped = data
      .map((row) => {
        const id = parseText(row.id);
        const latitude = parseNumber(row.latitude);
        const longitude = parseNumber(row.longitude);
        if (!id || latitude === null || longitude === null) {
          return null;
        }

        return {
          id,
          slug: parseText(row.slug) || id,
          name: parseText(row.name) || "Venue",
          city: parseText(row.city),
          state: parseText(row.state),
          venueType: parseText(row.venue_type),
          latitude,
          longitude,
          imageUrl: parseText(row.image_url) || parseText(row.photo_url),
          currentStatus: parseText(row.current_status),
          musicGenres: parseStringArray(row.music_genres),
          drinkSpecials: parseText(row.drink_specials),
          foodAvailable: Boolean(row.food_available),
        } as RadarVenue;
      })
      .filter((venue): venue is RadarVenue => Boolean(venue));

    traceSetState("venues", 548, mapped);
    setVenues(mapped);
    traceSetState("loading", 549, false);
    setLoading(false);
    radarTrace("SafariRadarExperience", "callback:loadVenues:complete", { line: 550, mappedCount: mapped.length });
  }, []);

  const loadEvents = useCallback(async () => {
    radarTrace("SafariRadarExperience", "callback:loadEvents:start", { line: 554 });
    traceSetState("loadingEvents", 555, true);
    setLoadingEvents(true);

    let data: Array<Record<string, unknown>>;

    try {
      const response = await fetch("/api/public/events", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Event lookup failed.");
      }
      data = (await response.json()) as Array<Record<string, unknown>>;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[SafariRadar] load events failed", error);
      }
      traceSetState("events", 573, []);
      setEvents([]);
      traceSetState("loadingEvents", 574, false);
      setLoadingEvents(false);
      return;
    }

    const mapped = data
      .map((row) => {
        const id = parseText(row.id);
        const venueId = parseText(row.venue_id);
        const startTime = parseText(row.start_time);
        if (!id || !venueId || !startTime) {
          return null;
        }

        return {
          id,
          venueId,
          title: parseText(row.title) || "Untitled Event",
          performerName: parseText(row.performer_name),
          eventType: parseText(row.event_type),
          startTime,
          endTime: parseText(row.end_time),
          status: parseText(row.status),
        } as RadarEvent;
      })
      .filter((event): event is RadarEvent => Boolean(event));

    traceSetState("events", 605, mapped);
    setEvents(mapped);
    traceSetState("loadingEvents", 606, false);
    setLoadingEvents(false);
    radarTrace("SafariRadarExperience", "callback:loadEvents:complete", { line: 607, mappedCount: mapped.length });
  }, []);

  useEffect(() => {
    logEffectRun("initial-load-and-event-subscription", 611, ["loadEvents", "loadVenues", "supabase"]);
    void loadVenues();
    void loadEvents();

    const channel = supabase.channel("safari-radar-events");
    radarTrace("SafariRadarExperience", "subscription:create", {
      line: 616,
      channel: "safari-radar-events",
      table: "events",
    });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
      radarTrace("SafariRadarExperience", "subscription:event", {
        line: 621,
        channel: "safari-radar-events",
        table: "events",
      });
      void loadEvents();
    });

    void channel.subscribe((status: string) => {
      radarTrace("SafariRadarExperience", "subscription:status", {
        line: 628,
        channel: "safari-radar-events",
        status,
      });
    });

    return () => {
      radarTrace("SafariRadarExperience", "cleanup:subscription", {
        line: 635,
        channel: "safari-radar-events",
      });
      void supabase.removeChannel(channel);
    };
  }, [loadEvents, loadVenues, supabase]);

  const cityOptions = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:cityOptions", { line: 642, venuesLength: venues.length });
    const citySet = new Set<string>();
    for (const venue of venues) {
      if (venue.city) {
        citySet.add(cityLabel(venue));
      }
    }
    return ["nearby", ...Array.from(citySet).sort((left, right) => left.localeCompare(right))];
  }, [venues]);

  const cityCenter = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:cityCenter", { line: 653, selectedCity, venuesLength: venues.length });
    if (selectedCity === "nearby") {
      return null;
    }

    if (searchedCityCenter) {
      return searchedCityCenter;
    }

    const inCity = venues.filter((venue) => cityLabel(venue) === selectedCity);
    if (inCity.length === 0) {
      return null;
    }

    const lat = inCity.reduce((sum, venue) => sum + venue.latitude, 0) / inCity.length;
    const lng = inCity.reduce((sum, venue) => sum + venue.longitude, 0) / inCity.length;
    return { lat, lng };
  }, [searchedCityCenter, selectedCity, venues]);

  const submitCitySearch = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = cityQuery.trim();
    if (query.length < 2) {
      setCitySearchError("Type a city and state, like Salisbury, MD.");
      return;
    }

    setCitySearchError(null);
    const localMatch = cityOptions.find(
      (option) => option !== "nearby" && option.toLowerCase() === query.toLowerCase()
    );

    if (localMatch) {
      setSelectedCity(localMatch);
      setCityQuery(localMatch);
      setSearchedCityCenter(null);
      setSelectedHotspotId(null);
      return;
    }

    setCitySearching(true);
    try {
      const response = await fetch(`/api/public/cities?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = (await response.json()) as Array<{ label: string; lat: number; lng: number }> | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error("City lookup failed.");
      }

      const match = payload[0];
      if (!match) {
        setCitySearchError("We couldn\'t find that city and state. Try a nearby city or check the spelling.");
        return;
      }

      const center = { lat: match.lat, lng: match.lng };
      setSelectedCity(match.label);
      setCityQuery(match.label);
      setSearchedCityCenter(center);
      setSelectedHotspotId(null);
      setFocusTarget({ ...center, zoom: 13 });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[SafariRadar] city search failed", error);
      }
      setCitySearchError("City search is temporarily unavailable. Please try again.");
    } finally {
      setCitySearching(false);
    }
  }, [cityOptions, cityQuery]);

  useEffect(() => {
    logEffectRun("sync-map-center", 669, ["cityCenter", "userLocation"]);
    const nextCenter = cityCenter || userLocation || DEFAULT_CENTER;
    setMapCenter((current) => {
      traceSetState("mapCenter", 672, nextCenter);
      if (current.lat === nextCenter.lat && current.lng === nextCenter.lng) {
        return current;
      }
      return nextCenter;
    });
    return () => {
      radarTrace("SafariRadarExperience", "cleanup:sync-map-center", { line: 679 });
    };
  }, [cityCenter, userLocation]);

  const mapCenterPosition = useMemo<[number, number]>(() => {
    radarTrace("SafariRadarExperience", "memo:mapCenterPosition", { line: 683, lat: mapCenter.lat, lng: mapCenter.lng });
    return [mapCenter.lat, mapCenter.lng];
  }, [mapCenter.lat, mapCenter.lng]);

  const allVenueIds = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:allVenueIds", { line: 687, venuesLength: venues.length });
    return venues.map((venue) => venue.id);
  }, [venues]);
  const liveMetrics = useLiveVenueMetrics({
    venueIds: allVenueIds,
    enabled: allVenueIds.length > 0,
    subscribeVisibleOnly: false,
  });
  const partyScores = usePartyScores({
    venueIds: allVenueIds,
    enabled: allVenueIds.length > 0,
    subscribeVisibleOnly: false,
  });

  const eventsByVenueId = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:eventsByVenueId", { line: 697, eventsLength: events.length });
    const byVenueId = new Map<string, RadarEvent[]>();
    for (const event of events) {
      byVenueId.set(event.venueId, [...(byVenueId.get(event.venueId) || []), event]);
    }
    return byVenueId;
  }, [events]);

  const hotspots = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:hotspots", {
      line: 705,
      venuesLength: venues.length,
      eventsLength: events.length,
      metricKeys: Object.keys(liveMetrics.metricsByVenueId).length,
      scoreKeys: Object.keys(partyScores.scoresByVenueId).length,
    });
    const now = Date.now();
    const from = selectedCity === "nearby" ? (userLocation || mapCenter) : mapCenter;

    return venues
      .map((venue) => {
        const metrics = liveMetrics.metricsByVenueId[venue.id];
        const score = toSafePartyScore(partyScores.scoresByVenueId[venue.id] || emptyPartyScore(venue.id));
        const venueEvents = (eventsByVenueId.get(venue.id) || []).filter((event) => {
          const status = (event.status || "").toLowerCase();
          if (!["active", "published", "live", "scheduled"].includes(status)) {
            return false;
          }

          const startMs = Date.parse(event.startTime);
          const endMs = event.endTime ? Date.parse(event.endTime) : Number.NaN;
          const activeStart = Number.isFinite(startMs) ? startMs <= now + 4 * 60 * 60 * 1000 : true;
          const notEnded = Number.isFinite(endMs) ? endMs > now : true;
          return activeStart && notEnded;
        });

        const currentEvent = venueEvents.find((event) => Date.parse(event.startTime) <= now) || venueEvents[0] || null;
        const distanceMiles = getDistanceMiles(from, { lat: venue.latitude, lng: venue.longitude });
        const liveCheckins = metrics?.liveCheckins || 0;
        const activeStories = metrics?.activeStories || 0;
        const currentEvents = metrics?.currentEvents || venueEvents.length;
        const friendsHere = metrics?.friendsHere || 0;
        const crowdPulse = buildCrowdPulseSnapshot({
          partyScore: {
            score: score.score,
            trend: score.trend,
            momentum: score.momentum,
            confidence: score.confidence,
            crowdLevel: score.crowdLevel,
          },
          liveCheckins,
          storyCount: activeStories,
          currentEvents,
          friendsHere,
        });
        const tier = toTier(crowdPulse.pulseScore);

        return {
          ...venue,
          crowdPulse,
          partyScore: {
            ...score,
            venueId: venue.id,
            signals: (partyScores.scoresByVenueId[venue.id] || emptyPartyScore(venue.id)).signals,
            breakdown: (partyScores.scoresByVenueId[venue.id] || emptyPartyScore(venue.id)).breakdown,
            placeholders: (partyScores.scoresByVenueId[venue.id] || emptyPartyScore(venue.id)).placeholders,
          },
          tier,
          liveCheckins,
          activeStories,
          currentEvents,
          friendsHere,
          currentEvent: currentEvent?.title || null,
          currentEntertainment: currentEvent?.performerName || currentEvent?.eventType || null,
          currentEventId: currentEvent?.id || null,
          currentEventType: currentEvent?.eventType || null,
          distanceMiles,
          openNow: isOpenNow(venue.currentStatus),
        } as RadarHotspot;
      })
      .sort((left, right) => right.crowdPulse.pulseScore - left.crowdPulse.pulseScore);
  }, [eventsByVenueId, liveMetrics.metricsByVenueId, mapCenter, partyScores.scoresByVenueId, selectedCity, userLocation, venues]);

  const venueTypeOptions = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:venueTypeOptions", { line: 758, hotspotsLength: hotspots.length });
    return ["All", ...Array.from(new Set(hotspots.map((hotspot) => hotspot.venueType || "Venue")))];
  }, [hotspots]);

  const filteredHotspots = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:filteredHotspots", {
      line: 763,
      hotspotsLength: hotspots.length,
      minScore,
      maxDistanceMiles,
      friendsOnly,
      openNowOnly,
      liveStoriesOnly,
      liveMusicOnly,
      venueTypeFilter,
      crowdFilter,
    });
    return hotspots.filter((hotspot) => {
      if (selectedCity !== "nearby" && cityLabel(hotspot).toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }
      if (hotspot.crowdPulse.pulseScore < minScore) {
        return false;
      }
      if (selectedCity === "nearby" && hotspot.distanceMiles !== null && hotspot.distanceMiles > maxDistanceMiles) {
        return false;
      }
      if (friendsOnly && hotspot.friendsHere <= 0) {
        return false;
      }
      if (openNowOnly && !hotspot.openNow) {
        return false;
      }
      if (liveStoriesOnly && hotspot.activeStories <= 0) {
        return false;
      }
      if (liveMusicOnly && !isLiveMusicType(hotspot.currentEventType)) {
        return false;
      }
      if (venueTypeFilter !== "All" && (hotspot.venueType || "Venue") !== venueTypeFilter) {
        return false;
      }
      if (crowdFilter !== "All" && hotspot.tier !== crowdFilter) {
        return false;
      }

      if (overlays.friends && hotspot.friendsHere <= 0) {
        return false;
      }
      if (overlays.stories && hotspot.activeStories <= 0) {
        return false;
      }
      if (overlays.events && hotspot.currentEvents <= 0) {
        return false;
      }
      if (overlays.happyHour && !hasHappyHour(hotspot)) {
        return false;
      }
      if (overlays.liveMusic && !isLiveMusicType(hotspot.currentEventType)) {
        return false;
      }
      if (overlays.lateNightFood && !isLateNightFood(hotspot)) {
        return false;
      }

      return true;
    });
  }, [crowdFilter, friendsOnly, hotspots, liveMusicOnly, liveStoriesOnly, maxDistanceMiles, minScore, openNowOnly, overlays, selectedCity, venueTypeFilter]);

  const clusteredHotspots = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:clusteredHotspots", {
      line: 813,
      filteredLength: filteredHotspots.length,
      mapZoom,
    });
    return clusterHotspots(filteredHotspots, mapZoom);
  }, [filteredHotspots, mapZoom]);

  const selectedHotspot = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:selectedHotspot", {
      line: 821,
      filteredLength: filteredHotspots.length,
      selectedHotspotId,
    });
    return filteredHotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  }, [filteredHotspots, selectedHotspotId]);

  const heatingUp = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:heatingUp", { line: 828, hotspotsLength: hotspots.length });
    return [...hotspots]
      .filter((hotspot) => hotspot.partyScore.momentum > 0)
      .sort((left, right) => right.partyScore.momentum - left.partyScore.momentum)
      .slice(0, 8);
  }, [hotspots]);

  const openHotspot = useCallback((hotspot: RadarHotspot) => {
    radarTrace("SafariRadarExperience", "callback:openHotspot", {
      line: 835,
      hotspotId: hotspot.id,
      hotspotName: hotspot.name,
    });
    traceSetState("selectedHotspotId", 840, hotspot.id);
    setSelectedHotspotId(hotspot.id);
    traceSetState("focusTarget", 841, { lat: hotspot.latitude, lng: hotspot.longitude, zoom: Math.max(mapZoom, 15) });
    setFocusTarget({ lat: hotspot.latitude, lng: hotspot.longitude, zoom: Math.max(mapZoom, 15) });
  }, [mapZoom]);

  const toggleOverlay = useCallback((key: keyof OverlayState) => {
    radarTrace("SafariRadarExperience", "callback:toggleOverlay", { line: 845, key });
    traceSetState("overlays", 846, "updater");
    setOverlays((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const expandSearchRadius = useCallback(() => {
    setMaxDistanceMiles((current) => Math.min(50, current + 10));
    setMinScore((current) => Math.max(0, current - 8));
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05060d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(240,108,0,0.17),transparent_35%),radial-gradient(circle_at_85%_14%,rgba(26,161,255,0.19),transparent_36%),radial-gradient(circle_at_35%_90%,rgba(242,58,102,0.14),transparent_45%)]" />

      <section className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 pb-3 pt-4 md:px-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/55">Signature Experience</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Safari Radar™</h1>
          <p className="mt-1 text-xs text-white/60 md:text-sm">Where is the party right now?</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${viewMode === "map" ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${viewMode === "list" ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
          >
            List
          </button>
        </div>
      </section>

      <section className="relative z-20 mx-auto flex w-full max-w-7xl items-center gap-2 px-4 pb-3 md:px-6">
        <button
          type="button"
          onClick={() => {
            setSelectedCity("nearby");
            setCityQuery("");
            setSearchedCityCenter(null);
            setSelectedHotspotId(null);
            setCitySearchError(null);
            requestGeolocation();
          }}
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-white/20"
        >
          Locate Me
        </button>

        <form onSubmit={submitCitySearch} className="flex min-w-[220px] flex-1 items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
            <span className="mr-2 shrink-0 text-white/65">City</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="address-level2"
              list="radar-city-options"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder={selectedCity === "nearby" ? "City, State" : selectedCity}
              aria-label="Search city and state"
              className="min-w-0 w-full bg-transparent text-white placeholder:text-white/55 outline-none"
            />
            <datalist id="radar-city-options">
              {cityOptions.filter((option) => option !== "nearby").map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <button
            type="submit"
            disabled={citySearching}
            className="shrink-0 rounded-full border border-cyan-300/45 bg-cyan-400/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/30 disabled:cursor-wait disabled:opacity-60"
          >
            {citySearching ? "..." : "Go"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowFilterSheet(true)}
          className="ml-auto rounded-full border border-orange-300/40 bg-orange-400/20 px-3 py-1.5 text-xs font-semibold text-orange-100 transition hover:bg-orange-400/30"
        >
          Filters
        </button>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-2 md:px-4">
        <div className="relative h-[70vh] overflow-hidden rounded-3xl border border-white/15 bg-black/50 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
          <MapContainer
            center={mapCenterPosition}
            zoom={13}
            minZoom={10}
            maxZoom={18}
            zoomControl
            scrollWheelZoom
            className="radar-map h-full w-full"
          >
            {isDev ? (radarTrace("SafariRadarExperience", "map:init", { line: 896, center: mapCenterPosition, zoom: 13 }), null) : null}
            <MapTracker onZoomChange={setMapZoom} />
            <MapFocusController focus={focusTarget} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {clusteredHotspots.map((cluster) => {
              radarTrace("SafariRadarExperience", "marker:cluster-or-venue-render", {
                line: 906,
                clusterId: cluster.id,
                venueCount: cluster.hotspots.length,
              });
              if (cluster.hotspots.length > 1) {
                return (
                  <Marker
                    key={`cluster:${cluster.id}`}
                    position={[cluster.lat, cluster.lng]}
                    icon={createClusterIcon(cluster.hotspots)}
                    eventHandlers={{
                      click: () => {
                        const top = [...cluster.hotspots].sort((left, right) => right.crowdPulse.pulseScore - left.crowdPulse.pulseScore)[0];
                        traceSetState("focusTarget", 920, { lat: cluster.lat, lng: cluster.lng, zoom: Math.min(mapZoom + 1, 17) });
                        setFocusTarget({ lat: cluster.lat, lng: cluster.lng, zoom: Math.min(mapZoom + 1, 17) });
                        traceSetState("selectedHotspotId", 921, top.id);
                        setSelectedHotspotId(top.id);
                      },
                    }}
                  />
                );
              }

              const hotspot = cluster.hotspots[0];
              const style = toTierStyle(hotspot.tier);
              const isSelected = selectedHotspotId === hotspot.id;

              return (
                <Marker
                  key={hotspot.id}
                  position={[hotspot.latitude, hotspot.longitude]}
                  icon={createHotspotIcon(hotspot, isSelected)}
                  eventHandlers={{
                    click: () => {
                      openHotspot(hotspot);
                    },
                  }}
                >
                  {(hotspot.tier === "Legendary" || hotspot.tier === "Busy" || hotspot.tier === "Hot") && (
                    <Circle
                      center={[hotspot.latitude, hotspot.longitude]}
                      radius={style.glowRadius}
                      pathOptions={{
                        color: style.haloColor,
                        opacity: 0.28,
                        fillColor: style.haloColor,
                        fillOpacity: 0.1,
                      }}
                    />
                  )}
                </Marker>
              );
            })}
          </MapContainer>

          {selectedHotspot && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[600] md:inset-x-auto md:left-4 md:w-[440px]">
              <div className="pointer-events-auto">
                <CrowdPulseCard
                  venueHref={selectedHotspot.currentEventId ? `/events/${selectedHotspot.currentEventId}` : `/venues/${selectedHotspot.slug}`}
                  venueName={selectedHotspot.name}
                  venueCategory={selectedHotspot.venueType}
                  statusLabel={getVenueStatusLabel({ openNow: selectedHotspot.openNow, currentStatus: selectedHotspot.currentStatus })}
                  distanceLabel={formatMiles(selectedHotspot.distanceMiles)}
                  pulse={selectedHotspot.crowdPulse}
                  friendsHereCount={selectedHotspot.friendsHere}
                  currentVibe={resolveCurrentVibe({
                    musicGenres: selectedHotspot.musicGenres,
                    liveEventTypes: selectedHotspot.currentEventType ? [selectedHotspot.currentEventType] : [],
                    venueType: selectedHotspot.venueType,
                  })}
                  imageUrl={selectedHotspot.imageUrl}
                  currentEvent={selectedHotspot.currentEvent}
                  currentEntertainment={selectedHotspot.currentEntertainment}
                  liveSignals={[
                    { key: "checkins", icon: "👥", label: "Live Check-ins", value: selectedHotspot.liveCheckins },
                    { key: "stories", icon: "📸", label: "Stories", value: selectedHotspot.activeStories },
                    { key: "lit", icon: "🔥", label: "Lit Activity", value: null },
                    { key: "saves", icon: "❤️", label: "Saves", value: null },
                  ]}
                  onJoinLabel={selectedHotspot.currentEventId ? "Join Party" : "View Venue"}
                  footerAction={
                    <VenueCheckInButton
                      venueId={selectedHotspot.id}
                      compact={false}
                      onCountChange={() => {
                        radarTrace("SafariRadarExperience", "callback:onCountChange", {
                          line: 1049,
                          venueId: selectedHotspot.id,
                        });
                        void liveMetrics.refresh([selectedHotspot.id]);
                        void partyScores.refresh([selectedHotspot.id], true);
                      }}
                      className="rounded-full border border-fuchsia-300/40 bg-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-fuchsia-100"
                    />
                  }
                  supplementalContent={
                    <div className="grid grid-cols-3 gap-2">
                      <Link href={`/venues/${selectedHotspot.slug}`} className="rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-center text-sm font-semibold text-white">View Venue</Link>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedHotspot.latitude},${selectedHotspot.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-center text-sm font-semibold text-white"
                      >
                        Directions
                      </a>
                      <Link href="/dashboard" className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100">View Stories</Link>
                    </div>
                  }
                />
              </div>
            </div>
          )}

          {filteredHotspots.length === 0 && !loading && (
            <div className="absolute inset-x-4 top-4 z-[650] rounded-2xl border border-white/20 bg-[#0a0f1f]/85 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-white">Nothing is trending nearby yet.</p>
              <p className="mt-1 text-xs text-white/70">Building tonight&apos;s pulse. We&apos;re collecting live check-ins, stories, events, and venue activity.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={expandSearchRadius}
                  className="rounded-full border border-cyan-300/35 bg-cyan-500/18 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                >
                  Expand Search Radius
                </button>
                <Link href="/events" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">Browse Events</Link>
                <Link href="/profiles" className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Explore Venues</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="relative z-20 mx-auto mt-3 w-full max-w-7xl px-4 md:px-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Overlays</p>
        <div className="flex flex-wrap gap-2">
          {([
            ["friends", "Friends"],
            ["stories", "Stories"],
            ["events", "Events"],
            ["happyHour", "Happy Hour"],
            ["liveMusic", "Live Music"],
            ["lateNightFood", "Late Night Food"],
          ] as Array<[keyof OverlayState, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleOverlay(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${overlays[key] ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100" : "border-white/20 bg-white/5 text-white/75 hover:bg-white/15"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="relative z-20 mx-auto mt-4 w-full max-w-7xl px-4 pb-28 md:px-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/60">🔥 Heating Up</p>
        <div className="flex snap-x gap-2 overflow-x-auto pb-2">
          {heatingUp.map((hotspot) => (
            <button
              key={hotspot.id}
              type="button"
              onClick={() => {
                setViewMode("map");
                openHotspot(hotspot);
              }}
              className="snap-start rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-left backdrop-blur transition hover:bg-white/20"
            >
              <p className="text-sm font-semibold text-white">{hotspot.name}</p>
              <p className="text-xs text-orange-200">▲ +{hotspot.partyScore.momentum}</p>
            </button>
          ))}
          {heatingUp.length === 0 ? <p className="text-sm text-white/60">Momentum updates will appear here shortly.</p> : null}
        </div>
      </section>

      {viewMode === "list" && (
        <section className="fixed inset-0 z-[700] overflow-y-auto bg-[#05060d]/95 px-4 pb-8 pt-20 backdrop-blur md:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Radar Live List</h2>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold"
              >
                Back to Map
              </button>
            </div>

            <div className="space-y-3">
              {filteredHotspots.map((hotspot) => (
                <div key={hotspot.id} className="w-full">
                  <CrowdPulseCard
                    venueHref={`/venues/${hotspot.slug}`}
                    venueName={hotspot.name}
                    venueCategory={hotspot.venueType}
                    statusLabel={getVenueStatusLabel({ openNow: hotspot.openNow, currentStatus: hotspot.currentStatus })}
                    distanceLabel={formatMiles(hotspot.distanceMiles)}
                    pulse={hotspot.crowdPulse}
                    friendsHereCount={hotspot.friendsHere}
                    currentVibe={resolveCurrentVibe({
                      musicGenres: hotspot.musicGenres,
                      liveEventTypes: hotspot.currentEventType ? [hotspot.currentEventType] : [],
                      venueType: hotspot.venueType,
                    })}
                    currentEvent={hotspot.currentEvent}
                    currentEntertainment={hotspot.currentEntertainment}
                    liveSignals={[
                      { key: "checkins", icon: "👥", label: "Live Check-ins", value: hotspot.liveCheckins },
                      { key: "stories", icon: "📸", label: "Stories", value: hotspot.activeStories },
                      { key: "lit", icon: "🔥", label: "Lit Activity", value: null },
                      { key: "saves", icon: "❤️", label: "Saves", value: null },
                    ]}
                    supplementalContent={
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("map");
                          openHotspot(hotspot);
                        }}
                        className="w-full rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
                      >
                        Open on Map
                      </button>
                    }
                    compact
                  />
                </div>
              ))}

              {filteredHotspots.length === 0 ? (
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-white/70">
                  <p className="font-semibold text-white">Nothing is trending nearby yet.</p>
                  <p className="mt-1 text-xs">Building tonight&apos;s pulse. We&apos;re collecting live check-ins, stories, events, and venue activity.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={expandSearchRadius}
                      className="rounded-full border border-cyan-300/35 bg-cyan-500/18 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                    >
                      Expand Search Radius
                    </button>
                    <Link href="/events" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">Browse Events</Link>
                    <Link href="/profiles" className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Explore Venues</Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {showFilterSheet && (
        <section className="fixed inset-0 z-[800] bg-black/55 backdrop-blur-sm" onClick={() => setShowFilterSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-white/20 bg-[#0a101d] p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/30" />
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Filters</h3>
                <button
                  type="button"
                  onClick={() => setShowFilterSheet(false)}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                >
                  Done
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-white/70">Crowd Pulse ≥ {minScore}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={minScore}
                    onChange={(event) => setMinScore(Number(event.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-white/70">Distance ≤ {maxDistanceMiles} mi</span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={maxDistanceMiles}
                    onChange={(event) => setMaxDistanceMiles(Number(event.target.value))}
                    className="w-full"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-white/70">Venue Type</span>
                  <select
                    value={venueTypeFilter}
                    onChange={(event) => setVenueTypeFilter(event.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white"
                  >
                    {venueTypeOptions.map((option) => (
                      <option key={option} value={option} className="bg-[#0a101d]">{option}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-white/70">Crowd</span>
                  <select
                    value={crowdFilter}
                    onChange={(event) => setCrowdFilter(event.target.value as "All" | RadarHotspotTier)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white"
                  >
                    {["All", "Quiet", "Picking Up", "Active", "Busy", "Hot", "Legendary"].map((option) => (
                      <option key={option} value={option} className="bg-[#0a101d]">{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <button type="button" onClick={() => setFriendsOnly((value) => !value)} className={`rounded-xl px-3 py-2 ${friendsOnly ? "bg-cyan-400/25 text-cyan-100" : "bg-white/10 text-white/75"}`}>Friends Here</button>
                <button type="button" onClick={() => setOpenNowOnly((value) => !value)} className={`rounded-xl px-3 py-2 ${openNowOnly ? "bg-cyan-400/25 text-cyan-100" : "bg-white/10 text-white/75"}`}>Open Now</button>
                <button type="button" onClick={() => setLiveStoriesOnly((value) => !value)} className={`rounded-xl px-3 py-2 ${liveStoriesOnly ? "bg-cyan-400/25 text-cyan-100" : "bg-white/10 text-white/75"}`}>Live Stories</button>
                <button type="button" onClick={() => setLiveMusicOnly((value) => !value)} className={`rounded-xl px-3 py-2 ${liveMusicOnly ? "bg-cyan-400/25 text-cyan-100" : "bg-white/10 text-white/75"}`}>Live Music</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {(loading || loadingEvents || liveMetrics.loading || partyScores.loading) && (
        <div className="pointer-events-none fixed right-4 top-20 z-[900] rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs text-white/75 backdrop-blur">
          Updating live radar…
        </div>
      )}

      {geoError ? (
        <div className="fixed left-4 top-20 z-[900] rounded-2xl border border-amber-300/35 bg-amber-400/15 px-3 py-2 text-xs text-amber-100 backdrop-blur">
          {geoError}
        </div>
      ) : null}

      {venuesError ? (
        <div className="fixed left-4 top-32 z-[900] rounded-2xl border border-rose-300/35 bg-rose-500/15 px-3 py-2 text-xs text-rose-100 backdrop-blur">
          {venuesError}
        </div>
      ) : null}

      {citySearchError ? (
        <div role="status" className="fixed left-4 top-44 z-[900] max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-300/35 bg-[#2b1905]/95 px-3 py-2 text-xs text-amber-100 backdrop-blur">
          {citySearchError}
        </div>
      ) : null}

      <style jsx global>{`
        .radar-map .leaflet-tile {
          filter: invert(100%) hue-rotate(180deg) brightness(62%) contrast(95%) saturate(80%);
        }

        .radar-map .leaflet-container {
          background: #05060d;
        }

        .radar-map .leaflet-control-zoom a {
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(6, 8, 15, 0.8);
          color: #dbeafe;
        }

        .radar-hotspot,
        .radar-cluster {
          border: 1px solid rgba(255, 255, 255, 0.48);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
          transform: translateZ(0);
        }

        .radar-hotspot span,
        .radar-cluster span {
          font-size: 12px;
          line-height: 1;
        }

        .radar-hotspot::after {
          content: "";
          position: absolute;
          inset: -9px;
          border-radius: inherit;
          border: 1px solid rgba(255, 255, 255, 0.24);
          animation: radar-pulse 2.4s ease-out infinite;
        }

        .radar-hotspot.quiet {
          background: radial-gradient(circle at 30% 25%, #4ade80, #15803d 65%);
        }

        .radar-hotspot.picking {
          background: radial-gradient(circle at 28% 24%, #a3e635, #65a30d 66%);
        }

        .radar-hotspot.active {
          background: radial-gradient(circle at 28% 24%, #fde047, #ca8a04 66%);
        }

        .radar-hotspot.busy {
          background: radial-gradient(circle at 28% 24%, #fb923c, #ea580c 66%);
          box-shadow: 0 0 24px rgba(249, 115, 22, 0.48), 0 12px 28px rgba(0, 0, 0, 0.45);
        }

        .radar-hotspot.hot {
          background: radial-gradient(circle at 28% 24%, #f97316, #dc2626 66%);
          box-shadow: 0 0 30px rgba(244, 63, 94, 0.52), 0 12px 28px rgba(0, 0, 0, 0.45);
        }

        .radar-hotspot.legendary {
          background: radial-gradient(circle at 28% 24%, #fb7185, #dc2626 66%);
          box-shadow: 0 0 36px rgba(239, 68, 68, 0.62), 0 12px 28px rgba(0, 0, 0, 0.45);
          animation: radar-legendary 1.6s ease-in-out infinite;
        }

        .radar-hotspot.selected {
          outline: 2px solid rgba(255, 255, 255, 0.95);
          outline-offset: 2px;
        }

        .radar-cluster {
          width: 56px;
          height: 56px;
          background: radial-gradient(circle at 28% 24%, #fbbf24, #f97316 66%);
        }

        @keyframes radar-pulse {
          0% {
            transform: scale(1);
            opacity: 0.75;
          }
          70% {
            transform: scale(1.28);
            opacity: 0;
          }
          100% {
            transform: scale(1.28);
            opacity: 0;
          }
        }

        @keyframes radar-legendary {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .radar-hotspot::after,
          .radar-hotspot.legendary {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
