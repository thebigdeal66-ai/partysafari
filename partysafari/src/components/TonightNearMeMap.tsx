"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { usePartyScores } from "@/hooks/usePartyScore";
import { getCrowdLevel, getCrowdLevelColorClass, getCrowdLevelEmoji, getCrowdLevelDescription, formatCheckInCount, getCrowdGlowClass } from "@/lib/venueCheckInUtils";
import VenueCheckInButton from "@/components/VenueCheckInButton";
import FriendsHereSection from "@/components/social/FriendsHereSection";
import { useLiveVenueMetrics } from "@/hooks/useLiveVenueMetrics";
import "leaflet/dist/leaflet.css";

type Venue = {
  id: string;
  slug: string;
  venueName: string;
  latitude: number;
  longitude: number;
  venueType: string;
  musicGenres: string[];
  crowdLevel: string | null;
  drinkSpecials: string | null;
  currentStatus: string | null;
  liveCount: number;
};

type VenueQueryRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  venue_type?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  music_genres?: unknown;
  crowd_level?: string | null;
  drink_specials?: string | null;
  current_status?: string | null;
};

type GeoPoint = {
  lat: number;
  lng: number;
};

const DEFAULT_CENTER: GeoPoint = { lat: 30.2672, lng: -97.7431 };

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(from: GeoPoint, to: GeoPoint) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function getVenueEmoji(type: Venue["venueType"]) {
  const normalized = type.toLowerCase();
  if (normalized.includes("club")) return "🎧";
  if (normalized.includes("bar")) return "🍸";
  if (normalized.includes("roof")) return "🌃";
  if (normalized.includes("lounge")) return "🛋️";
  return "🎸";
}

function getVenueIcon(type: Venue["venueType"]) {
  return L.divIcon({
    className: "party-venue-icon",
    html: `<div data-type="${type}">${getVenueEmoji(type)}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -30],
  });
}

function MapAutoCenter({ center }: { center: GeoPoint }) {
  const map = useMap();

  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

export default function TonightNearMeMap() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [mapCenter, setMapCenter] = useState<GeoPoint>(DEFAULT_CENTER);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);

  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [genreFilter, setGenreFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const requestGeolocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(nextLocation);
        setMapCenter(nextLocation);
        setGeoError(null);
      },
      () => {
        setGeoError("Location access denied. Showing nightlife near downtown.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }, []);

  useEffect(() => {
    requestGeolocation();
  }, [requestGeolocation]);

  const loadVenues = useCallback(async () => {
    setLoadingVenues(true);
    setVenuesError(null);

    const { data, error } = await supabase
      .from("venues")
      .select("id, slug, name, venue_type, latitude, longitude, music_genres, crowd_level, drink_specials, current_status")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[TonightNearMeMap] Venues query failed:", error);
      }
      setVenuesError("Could not load venues right now.");
      setVenues([]);
      setLoadingVenues(false);
      return;
    }
    const mappedVenues = ((data || []) as VenueQueryRow[])
      .map((venue) => {
        const latitude = Number(venue.latitude);
        const longitude = Number(venue.longitude);

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
          return null;
        }

        return {
          id: String(venue.id),
          slug: venue.slug || String(venue.id),
          venueName: venue.name || "Unnamed Venue",
          latitude,
          longitude,
          venueType: venue.venue_type || "Venue",
          musicGenres: Array.isArray(venue.music_genres) ? venue.music_genres.filter(Boolean) : [],
          crowdLevel: venue.crowd_level || null,
          drinkSpecials: venue.drink_specials || null,
          currentStatus: venue.current_status || null,
          liveCount: 0,
        } as Venue;
      })
      .filter((venue): venue is Venue => Boolean(venue));

    setVenues(mappedVenues);
    setSelectedVenue((previous) => {
      if (!previous) {
        return null;
      }

      return mappedVenues.find((item: Venue) => item.id === previous.id) || null;
    });
    setLoadingVenues(false);
  }, [supabase]);

  useEffect(() => {
    void loadVenues();
  }, [loadVenues]);

  const typeOptions = useMemo(() => ["All", ...new Set(venues.map((venue) => venue.venueType))], [venues]);
  const genreOptions = useMemo(() => {
    return ["All", ...new Set(venues.flatMap((venue) => venue.musicGenres))];
  }, [venues]);
  const statusOptions = useMemo(() => ["All", ...new Set(venues.map((venue) => venue.currentStatus).filter(Boolean) as string[])], [venues]);

  const filteredVenues = useMemo(() => {
    return venues.filter((venue) => {
      const matchesType = typeFilter === "All" || venue.venueType === typeFilter;
      const matchesGenre = genreFilter === "All" || venue.musicGenres.includes(genreFilter);
      const matchesStatus = statusFilter === "All" || venue.currentStatus === statusFilter;
      return matchesType && matchesGenre && matchesStatus;
    });
  }, [genreFilter, statusFilter, typeFilter, venues]);

  const allVenueIds = useMemo(() => venues.map((venue) => venue.id), [venues]);
  const visibleVenueIds = useMemo(() => filteredVenues.map((venue) => venue.id), [filteredVenues]);
  const liveMetrics = useLiveVenueMetrics({
    venueIds: allVenueIds,
    visibleVenueIds,
    subscribeVisibleOnly: true,
    enabled: allVenueIds.length > 0,
  });
  const partyScores = usePartyScores({
    venueIds: allVenueIds,
    visibleVenueIds,
    subscribeVisibleOnly: true,
    enabled: allVenueIds.length > 0,
  });

  const getVenueLive = useCallback(
    (venueId: string) => {
      return liveMetrics.metricsByVenueId[venueId] || null;
    },
    [liveMetrics.metricsByVenueId]
  );

  const selectedDistanceText = useMemo(() => {
    if (!selectedVenue) return "-";

    const from = userLocation || mapCenter;
    const distance = getDistanceKm(from, {
      lat: selectedVenue.latitude,
      lng: selectedVenue.longitude,
    });

    return `${distance.toFixed(1)} km`;
  }, [mapCenter, selectedVenue, userLocation]);

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-3xl border border-violet-500/20 bg-violet-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Tonight Near Me</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Find the hottest spots right now</h1>
          <p className="mt-2 text-sm text-white/70">
            Tap a marker to preview crowd energy, entertainment, specials, and instant directions.
          </p>
          {geoError ? <p className="mt-2 text-sm text-amber-300">{geoError}</p> : null}
          {venuesError ? <p className="mt-2 text-sm text-rose-300">{venuesError}</p> : null}
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0813]">
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={14}
            minZoom={11}
            maxZoom={18}
            scrollWheelZoom
            className="party-map h-[72vh] w-full"
          >
            <MapAutoCenter center={mapCenter} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredVenues.map((venue) => {
              const live = getVenueLive(venue.id);
              const partyScore = partyScores.scoresByVenueId[venue.id];
              const liveCount = live?.liveCheckins || 0;
              const crowdLevel = live?.crowdLevel || getCrowdLevel(liveCount);
              const distance = getDistanceKm(userLocation || mapCenter, {
                lat: venue.latitude,
                lng: venue.longitude,
              });

              return (
                <Marker
                  key={venue.id}
                  position={[venue.latitude, venue.longitude]}
                  icon={getVenueIcon(venue.venueType)}
                  eventHandlers={{
                    click: () => {
                      setSelectedVenue(venue);
                    },
                  }}
                >
                  <Popup>
                    <div className="min-w-[240px] text-[#14091f]">
                      <h3 className="text-base font-bold text-[#2f1450]">{venue.venueName}</h3>
                      <p className="mt-1 text-xs text-[#5c3f7d]">Distance: {distance.toFixed(1)} km</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#2f1450]">Crowd:</span>
                        <span className="text-sm font-semibold text-orange-600">{getCrowdLevelEmoji(crowdLevel as any)} {crowdLevel}</span>
                      </div>
                      <p className="mt-1 text-sm"><strong>Live Check-ins:</strong> {formatCheckInCount(liveCount)}</p>
                      <p className="text-sm"><strong>Active Stories:</strong> {live?.activeStories || 0}</p>
                      <p className="text-sm"><strong>Current Events:</strong> {live?.currentEvents || 0}</p>
                      <p className="text-sm"><strong>Friends Here:</strong> {live?.friendsHere || 0}</p>
                      <p className="text-sm"><strong>Party Score:</strong> {partyScore?.score || 0}</p>
                      <p className="text-sm"><strong>Trend:</strong> {partyScore?.trend || "stable"} • Momentum {partyScore?.momentum || 0}</p>
                      <p className="text-xs text-[#5c3f7d]"><strong>Updated:</strong> {live?.lastUpdated ? new Date(live.lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-"}</p>
                      <p className="text-sm"><strong>Genres:</strong> {venue.musicGenres.join(", ") || "Open format"}</p>
                      <p className="text-sm"><strong>Specials:</strong> {venue.drinkSpecials || "No specials listed"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/venues/${venue.slug}`} className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">View Venue</Link>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-[#2f1450] px-3 py-1 text-xs font-semibold text-white"
                        >
                          Directions
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          <aside className="absolute left-4 top-4 z-[500] w-[min(92vw,320px)] rounded-2xl border border-violet-400/25 bg-[#12091c]/95 p-4 shadow-[0_20px_45px_rgba(30,8,58,0.55)] backdrop-blur">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Filters</p>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-white/70">Venue Type</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0c0714] px-3 py-2 text-white outline-none focus:border-violet-400"
                >
                  {typeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-white/70">Music Genre</span>
                <select
                  value={genreFilter}
                  onChange={(event) => setGenreFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0c0714] px-3 py-2 text-white outline-none focus:border-violet-400"
                >
                  {genreOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-white/70">Current Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0c0714] px-3 py-2 text-white outline-none focus:border-violet-400"
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs text-white/60">Showing {filteredVenues.length} venues tonight</p>
            {loadingVenues ? <p className="mt-2 text-xs text-white/60">Refreshing map venues...</p> : null}
          </aside>

          <button
            type="button"
            onClick={requestGeolocation}
            className="absolute right-4 top-4 z-[500] rounded-full border border-violet-400/35 bg-violet-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-500"
          >
            Locate Me
          </button>

          {selectedVenue ? (
            <section className="absolute bottom-4 left-4 right-4 z-[500] rounded-2xl border border-violet-400/30 bg-[#130a1f]/95 p-4 shadow-[0_20px_40px_rgba(29,8,57,0.6)] backdrop-blur md:max-w-xl">
              {(() => {
                const live = getVenueLive(selectedVenue.id);
                const partyScore = partyScores.scoresByVenueId[selectedVenue.id];
                const liveCount = live?.liveCheckins || 0;
                const crowdLevel = live?.crowdLevel || getCrowdLevel(liveCount);
                return (
                  <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white">{selectedVenue.venueName}</h2>
                <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs text-violet-200">{selectedVenue.venueType}</span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/70">{selectedDistanceText} away</span>
              </div>
              <div className="mt-2 grid gap-2 text-sm text-white/80 md:grid-cols-2">
                <p><span className="text-violet-200">Crowd:</span> {getCrowdLevelEmoji(crowdLevel as any)} {crowdLevel}</p>
                <p><span className="text-violet-200">Live Here:</span> {formatCheckInCount(liveCount)}</p>
                <p><span className="text-violet-200">Active Stories:</span> {live?.activeStories || 0}</p>
                <p><span className="text-violet-200">Current Events:</span> {live?.currentEvents || 0}</p>
                <p><span className="text-violet-200">Friends Here:</span> {live?.friendsHere || 0}</p>
                <p><span className="text-violet-200">Party Score:</span> {partyScore?.score || 0}</p>
                <p><span className="text-violet-200">Trend:</span> {partyScore?.trend || "stable"} • {partyScore?.momentum || 0}</p>
                <p><span className="text-violet-200">Genres:</span> {selectedVenue.musicGenres.join(", ") || "Open format"}</p>
                <p><span className="text-violet-200">Status:</span> {selectedVenue.currentStatus || "Open"}</p>
                <p className="md:col-span-2"><span className="text-violet-200">Drinks:</span> {selectedVenue.drinkSpecials || "No specials listed"}</p>
                <p className="md:col-span-2 text-xs text-white/55"><span className="text-violet-200">Updated:</span> {live?.lastUpdated ? new Date(live.lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-"}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/venues/${selectedVenue.slug}`} className="rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white">View Venue</Link>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVenue.latitude},${selectedVenue.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#2f1450] px-3 py-2 text-xs font-semibold text-white"
                >
                  Directions
                </a>
                <VenueCheckInButton
                  venueId={selectedVenue.id}
                  onCountChange={() => {
                    void liveMetrics.refresh([selectedVenue.id]);
                  }}
                  className="rounded-full border border-orange-300/40 bg-orange-500/20 px-3 py-2 text-xs font-semibold text-orange-100 transition hover:bg-orange-500/30"
                  compact={true}
                />
              </div>
                  </>
                );
              })()}
            </section>
          ) : null}

          {selectedVenue ? (
            <section className="fixed inset-x-0 bottom-0 z-[600] rounded-t-3xl border border-violet-400/25 bg-[#140a22] p-4 pb-5 shadow-[0_-20px_60px_rgba(35,10,61,0.7)] md:hidden">
              {(() => {
                const live = getVenueLive(selectedVenue.id);
                const partyScore = partyScores.scoresByVenueId[selectedVenue.id];
                const liveCount = live?.liveCheckins || 0;
                const crowdLevel = live?.crowdLevel || getCrowdLevel(liveCount);
                return (
                  <>
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{selectedVenue.venueName}</h3>
                  <p className="text-xs text-white/60">{selectedDistanceText} away • {formatCheckInCount(liveCount)} checked in • Score {partyScore?.score || 0}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${getCrowdLevelColorClass(crowdLevel as any)}`}>{getCrowdLevelEmoji(crowdLevel as any)} {crowdLevel}</span>
              </div>
              <p className="mt-2 text-sm text-white/75">{selectedVenue.musicGenres.join(" • ") || "Open format music"}</p>
              <p className="mt-1 text-xs text-white/60">Stories {live?.activeStories || 0} • Events {live?.currentEvents || 0} • Friends {live?.friendsHere || 0} • {partyScore?.trend || "stable"} {partyScore?.momentum || 0}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/venues/${selectedVenue.slug}`} className="rounded-xl bg-violet-600 px-3 py-2 text-center text-sm font-semibold text-white">View Venue</Link>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVenue.latitude},${selectedVenue.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-[#2f1450] px-3 py-2 text-center text-sm font-semibold text-white"
                >
                  Directions
                </a>
                <VenueCheckInButton
                  venueId={selectedVenue.id}
                  onCountChange={() => {
                    void liveMetrics.refresh([selectedVenue.id]);
                  }}
                  className="col-span-2 rounded-xl border border-orange-300/40 bg-orange-500/20 px-3 py-2 text-sm font-semibold text-orange-100"
                  compact={false}
                />
              </div>
              <div className="mt-3">
                <FriendsHereSection venueId={selectedVenue.id} />
              </div>
                  </>
                );
              })()}
            </section>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        .party-map .leaflet-tile {
          filter: invert(100%) hue-rotate(180deg) brightness(70%) contrast(86%) saturate(74%);
        }

        .party-map .leaflet-container {
          background: #0b0813;
        }

        .party-map .leaflet-control-zoom a {
          background: #1a0f28;
          color: #c8a4ff;
          border-color: rgba(168, 85, 247, 0.35);
        }

        .party-map .leaflet-popup-content-wrapper {
          border-radius: 16px;
          border: 1px solid rgba(168, 85, 247, 0.28);
          background: #f7f2ff;
        }

        .party-map .leaflet-popup-tip {
          background: #f7f2ff;
        }

        .party-venue-icon div {
          height: 36px;
          width: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          font-size: 17px;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.95), rgba(91, 33, 182, 0.95));
        }

        .party-venue-icon div[data-type="Bar"] {
          background: linear-gradient(135deg, rgba(217, 70, 239, 0.95), rgba(126, 34, 206, 0.95));
        }

        .party-venue-icon div[data-type="Rooftop"] {
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(37, 99, 235, 0.95));
        }

        .party-venue-icon div[data-type="Lounge"] {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.95), rgba(16, 185, 129, 0.95));
        }

        .party-venue-icon div[data-type="Live Music"] {
          background: linear-gradient(135deg, rgba(251, 146, 60, 0.95), rgba(234, 88, 12, 0.95));
        }
      `}</style>
    </main>
  );
}
