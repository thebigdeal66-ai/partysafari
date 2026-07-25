"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { getCrowdLevel, getCrowdLevelColorClass, getCrowdLevelEmoji, getCrowdLevelDescription, formatCheckInCount } from "@/lib/venueCheckInUtils";
import VenueCheckInButton from "@/components/VenueCheckInButton";
import RSVPSection from "@/components/RSVPSection";
import VenueEventCard from "@/components/venue/VenueEventCard";
import FriendsHereSection from "@/components/social/FriendsHereSection";
import { toSafePartyScore } from "@/lib/partyScore";
import StoryGrid from "@/components/stories/StoryGrid";
import StoryViewer from "@/components/stories/StoryViewer";
import { usePartyScore } from "@/hooks/usePartyScore";
import { useStories } from "@/components/stories/useStories";
import { useLiveVenueMetrics } from "@/hooks/useLiveVenueMetrics";

type VenueRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  venue_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website_url: string | null;
  image_url: string | null;
  photo_url: string | null;
  music_genres: string[] | null;
  age_min: number | null;
  dress_code: string | null;
  food_available: boolean | null;
  vip_available: boolean | null;
  current_status: string | null;
  crowd_level: string | null;
  drink_specials: string | null;
  hours: Record<string, string> | string | null;
  verified: boolean | null;
};

type EventRow = Record<string, unknown> & {
  id: string;
};

function normalizeCrowdLevel(value: string | null) {
  if (!value) {
    return "Quiet";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("pack")) {
    return "Packed";
  }
  if (normalized.includes("high") || normalized.includes("busy") || normalized.includes("med")) {
    return "Busy";
  }
  return "Quiet";
}

function formatBoolean(value: boolean | null) {
  return value ? "Yes" : "No";
}

function formatEventTime(event: EventRow) {
  const rawTime = event.start_time || event.starts_at || event.event_date;
  if (!rawTime || typeof rawTime !== "string") {
    return "Time TBA";
  }

  const parsed = new Date(rawTime);
  if (Number.isNaN(parsed.getTime())) {
    return rawTime;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCoverCharge(event: EventRow) {
  const value = event.cover_charge || event.cover || event.cover_price;
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number") {
    return `$${value}`;
  }
  return "Varies";
}

function getAgeMinimum(event: EventRow) {
  const value = event.age_min || event.age_minimum || event.age_requirement;
  if (typeof value === "number") {
    return `${value}+`;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "21+";
}

function getEventImage(event: EventRow) {
  const value = event.cover_image || event.image_url || event.photo_url;
  return typeof value === "string" && value.trim() ? value : null;
}

function getEventTicketLink(event: EventRow) {
  const value = event.ticket_link || event.ticket_url || event.tickets_url;
  return typeof value === "string" && value.trim() ? value : null;
}

function getEventTitle(event: EventRow) {
  return typeof event.title === "string" && event.title.trim() ? event.title : "Untitled Event";
}

function getEventPerformer(event: EventRow) {
  const value = event.performer_name || event.dj_name || event.artist_name;
  return typeof value === "string" && value.trim() ? value : "Featured performers";
}

function getEventDrinkSpecials(event: EventRow) {
  const value = event.drink_specials;
  return typeof value === "string" && value.trim() ? value : null;
}

function getCountdownLabel(event: EventRow) {
  const rawTime = event.start_time || event.starts_at || event.event_date;
  if (!rawTime || typeof rawTime !== "string") {
    return "Time TBA";
  }

  const startsAt = new Date(rawTime);
  if (Number.isNaN(startsAt.getTime())) {
    return "Time TBA";
  }

  const ms = startsAt.getTime() - Date.now();
  if (ms <= 0) {
    return "Happening now";
  }

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes}m to start`;
  }

  return `${hours}h ${remainingMinutes}m to start`;
}

function formatHours(hours: VenueRow["hours"]) {
  if (!hours) {
    return [] as Array<{ day: string; value: string }>;
  }

  if (typeof hours === "string") {
    return [{ day: "Hours", value: hours }];
  }

  return Object.entries(hours).map(([day, value]) => ({
    day,
    value: String(value),
  }));
}

export default function VenuePage() {
  const params = useParams();
  const slug = params.slug as string;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [venue, setVenue] = useState<VenueRow | null>(null);
  const [tonightEvents, setTonightEvents] = useState<EventRow[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);
  const storyState = useStories({
    enabled: Boolean(venue?.id),
    venueId: venue?.id || undefined,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });
  const liveMetrics = useLiveVenueMetrics({
    enabled: Boolean(venue?.id),
    venueIds: venue?.id ? [venue.id] : [],
    visibleVenueIds: venue?.id ? [venue.id] : [],
    subscribeVisibleOnly: true,
  });
  const { partyScore } = usePartyScore(venue?.id || null, Boolean(venue?.id));

  const loadEvents = useCallback(async (venueId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("venue_id", venueId)
      .order("start_time", { ascending: true });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[venues] Events query failed:", error);
      }
      setTonightEvents([]);
      setUpcomingEvents([]);
      return;
    }

    const rows = (data || []) as EventRow[];
    const publishedEvents = rows.filter((event) => {
      const isPublished = event.is_published;
      const status = event.status;

      if (typeof isPublished === "boolean") {
        return isPublished;
      }

      if (typeof status === "string") {
        return ["published", "active", "live", "scheduled"].includes(status.toLowerCase());
      }

      return true;
    });

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    const tonight: EventRow[] = [];
    const upcoming: EventRow[] = [];

    for (const event of publishedEvents) {
      const rawTime = event.start_time || event.starts_at || event.event_date;
      if (!rawTime || typeof rawTime !== "string") {
        upcoming.push(event);
        continue;
      }

      const eventDate = new Date(rawTime);
      if (Number.isNaN(eventDate.getTime())) {
        upcoming.push(event);
        continue;
      }

      const eventDayKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (eventDayKey === todayKey) {
        tonight.push(event);
      } else if (eventDate.getTime() > now.getTime()) {
        upcoming.push(event);
      }
    }

    setTonightEvents(tonight);
    setUpcomingEvents(upcoming);
  }, [supabase]);

  useEffect(() => {
    if (!slug) {
      return;
    }

    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error || !data) {
        setErrorMessage("Venue not found.");
        setVenue(null);
        setLoading(false);
        return;
      }

      const venueData = data as VenueRow;
      setVenue(venueData);
      await loadEvents(venueData.id);
      setLoading(false);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadEvents, slug, supabase]);

  useEffect(() => {
    if (!venue?.id) {
      return;
    }

    const channel = supabase.channel(`venue-events-${venue.id}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `venue_id=eq.${venue.id}`,
        },
        () => {
          void loadEvents(venue.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_rsvps",
        },
        () => {
          void loadEvents(venue.id);
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEvents, supabase, venue?.id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#10061f] p-8 text-white/70">
          Loading venue details...
        </div>
      </main>
    );
  }

  if (!venue || errorMessage) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#10061f] p-8 text-rose-300">
          {errorMessage || "Venue not found."}
        </div>
      </main>
    );
  }

  const heroImage = venue.image_url || venue.photo_url;
  const venueAddress = [venue.address, venue.city, venue.state, venue.postal_code]
    .filter(Boolean)
    .join(", ");
  const hoursList = formatHours(venue.hours);
  const heroTonightEvent = tonightEvents[0] || null;
  const heroEventImage = heroTonightEvent ? getEventImage(heroTonightEvent) : null;
  const heroEventTicket = heroTonightEvent ? getEventTicketLink(heroTonightEvent) : null;
  const venueStories = [...storyState.stories].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const metrics = venue ? liveMetrics.metricsByVenueId[venue.id] || null : null;
  const liveCount = metrics?.liveCheckins || 0;
  const liveCrowdLevel = metrics?.crowdLevel || normalizeCrowdLevel(venue.crowd_level);
  const safePartyScore = toSafePartyScore(partyScore);
  const trendLabel = safePartyScore.trend === "up" ? "Up" : safePartyScore.trend === "down" ? "Down" : "Stable";
  const updatedAtDate = safePartyScore.updatedAt ? new Date(safePartyScore.updatedAt) : null;
  const updatedAtLabel = updatedAtDate && !Number.isNaN(updatedAtDate.getTime())
    ? updatedAtDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "--";

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/60 via-[#170d28] to-orange-900/40" />
        {heroImage ? (
          <img src={heroImage} alt={venue.name} className="h-[340px] w-full object-cover opacity-45" />
        ) : (
          <div className="h-[340px] w-full bg-[#120824]" />
        )}

        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-end px-6 pb-8">
          <Link href="/map" className="mb-4 inline-flex w-fit rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm text-white/90">
            Back to Map
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-bold text-white">{venue.name}</h1>
            {venue.verified ? (
              <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                Verified
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-white/80">
            {(venue.venue_type || "Venue")} • {[venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-violet-500/25 px-3 py-1 text-sm text-violet-100">Status: {venue.current_status || "Open"}</span>
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${getCrowdLevelColorClass(liveCrowdLevel as any)}`}>
              {getCrowdLevelEmoji(liveCrowdLevel as any)} {liveCrowdLevel} • {formatCheckInCount(liveCount)} Here
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Stories: {metrics?.activeStories || 0}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Events: {metrics?.currentEvents || 0}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Friends: {metrics?.friendsHere || 0}</span>
            <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm text-orange-100">Party Score: {safePartyScore.score ?? 0}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Trend: {trendLabel}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Momentum: {safePartyScore.momentum ?? 0}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-xl font-semibold">About</h2>
            <p className="mt-3 text-white/75">{venue.description || "No description yet."}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Live Stories</h2>
              <p className="mt-1 text-sm text-white/65">Stories tagged at {venue.name}, most recent first.</p>
            </div>
            <StoryGrid
              stories={venueStories}
              emptyMessage="No live stories tagged at this venue right now."
              showAuthor={true}
              onOpenStory={(story) => setViewerAuthorId(story.author_id)}
            />
          </div>

          {heroTonightEvent ? (
            <div className="overflow-hidden rounded-3xl border border-orange-300/30 bg-[#120824]">
              <div className="relative h-64">
                {heroEventImage ? (
                  <img src={heroEventImage} alt={getEventTitle(heroTonightEvent)} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-orange-700/25 via-violet-800/35 to-[#120824]" />
                )}
                <div className="absolute inset-0 bg-black/45" />
                <div className="absolute inset-0 flex flex-col justify-end p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-orange-200">Tonight Featured Event</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">{getEventTitle(heroTonightEvent)}</h2>
                  <p className="text-sm text-orange-100/95">{getEventPerformer(heroTonightEvent)}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-orange-500/20 px-3 py-1 text-orange-100">{getCountdownLabel(heroTonightEvent)}</span>
                    <span className="rounded-full bg-violet-500/20 px-3 py-1 text-violet-100">{formatEventTime(heroTonightEvent)}</span>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-white">Cover: {getCoverCharge(heroTonightEvent)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <p className="text-sm text-white/75">{getEventDrinkSpecials(heroTonightEvent) || venue.drink_specials || "No specials listed yet."}</p>
                <div className="flex flex-wrap gap-2">
                  {heroEventTicket ? (
                    <a href={heroEventTicket} target="_blank" rel="noreferrer" className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400">
                      Tickets
                    </a>
                  ) : null}
                  <Link href={`/safari?event=${String(heroTonightEvent.id)}`} className="rounded-full border border-violet-300/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100">
                    Add to Safari
                  </Link>
                </div>
                <RSVPSection eventId={String(heroTonightEvent.id)} eventTitle={getEventTitle(heroTonightEvent)} />
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-xl font-semibold">Tonight</h2>
            {tonightEvents.length === 0 ? (
              <p className="mt-3 text-white/70">No published events scheduled for tonight.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {tonightEvents.map((event) => (
                  <VenueEventCard
                    key={String(event.id)}
                    eventId={String(event.id)}
                    title={typeof event.title === "string" ? event.title : "Untitled Event"}
                    timeLabel={formatEventTime(event)}
                    imageUrl={getEventImage(event)}
                    coverCharge={getCoverCharge(event)}
                    ageMinimum={getAgeMinimum(event)}
                    ticketLink={getEventTicketLink(event)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-xl font-semibold">Upcoming Events</h2>
            {upcomingEvents.length === 0 ? (
              <p className="mt-3 text-white/70">No upcoming published events yet.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {upcomingEvents.map((event) => (
                  <VenueEventCard
                    key={String(event.id)}
                    eventId={String(event.id)}
                    title={typeof event.title === "string" ? event.title : "Untitled Event"}
                    timeLabel={formatEventTime(event)}
                    imageUrl={getEventImage(event)}
                    coverCharge={getCoverCharge(event)}
                    ageMinimum={getAgeMinimum(event)}
                    ticketLink={getEventTicketLink(event)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-6">
            <h2 className="text-xl font-semibold">Live Right Now</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-5xl font-bold text-white">{formatCheckInCount(liveCount)}</p>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${getCrowdLevelColorClass(liveCrowdLevel as any)}`}>
                  {getCrowdLevelEmoji(liveCrowdLevel as any)} {liveCrowdLevel}
                </span>
              </div>
              <p className="text-sm text-white/75">{getCrowdLevelDescription(liveCrowdLevel as any)}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Active Stories</p>
                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.activeStories || 0}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Current Events</p>
                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.currentEvents || 0}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Friends Here</p>
                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.friendsHere || 0}</p>
                </div>
                <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-orange-200">Party Score</p>
                  <p className="mt-1 text-xl font-semibold text-orange-100">{safePartyScore.score ?? 0}</p>
                </div>
              </div>
              <p className="text-xs text-white/55">Last updated: {updatedAtLabel} • Confidence {Math.round((safePartyScore.confidence ?? 0) * 100)}%</p>
              <div className="mt-4 pt-4 border-t border-white/10">
                <VenueCheckInButton
                  venueId={venue.id}
                  onCountChange={() => {
                    void liveMetrics.refresh([venue.id]);
                  }}
                  showCount={true}
                />
              </div>
              <FriendsHereSection venueId={venue.id} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h3 className="text-lg font-semibold">Venue Details</h3>
            <div className="mt-3 space-y-2 text-sm text-white/80">
              <p><span className="text-violet-300">Music:</span> {(venue.music_genres || []).join(", ") || "Open format"}</p>
              <p><span className="text-violet-300">Age:</span> {venue.age_min ? `${venue.age_min}+` : "21+"}</p>
              <p><span className="text-violet-300">Dress Code:</span> {venue.dress_code || "Casual"}</p>
              <p><span className="text-violet-300">Food:</span> {formatBoolean(venue.food_available)}</p>
              <p><span className="text-violet-300">VIP:</span> {formatBoolean(venue.vip_available)}</p>
              <p><span className="text-violet-300">Drink Specials:</span> {venue.drink_specials || "None listed"}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h3 className="text-lg font-semibold">Hours</h3>
            {hoursList.length === 0 ? (
              <p className="mt-2 text-sm text-white/70">Hours not provided.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-white/80">
                {hoursList.map((entry) => (
                  <p key={entry.day}>
                    <span className="text-violet-300">{entry.day}:</span> {entry.value}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h3 className="text-lg font-semibold">Contact</h3>
            <div className="mt-3 space-y-2 text-sm text-white/80">
              <p><span className="text-violet-300">Phone:</span> {venue.phone || "Not listed"}</p>
              <p><span className="text-violet-300">Website:</span> {venue.website_url ? <a href={venue.website_url} target="_blank" rel="noreferrer" className="text-violet-200 underline">Visit</a> : "Not listed"}</p>
              <p><span className="text-violet-300">Address:</span> {venueAddress || "Not listed"}</p>
            </div>
            {typeof venue.latitude === "number" && typeof venue.longitude === "number" ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-full bg-orange-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500"
              >
                Directions
              </a>
            ) : null}
          </div>
        </aside>
      </div>

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
