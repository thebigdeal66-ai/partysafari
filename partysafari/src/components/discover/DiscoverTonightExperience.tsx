"use client";

import Link from "next/link";
import { memo } from "react";
import EventRsvpControls from "@/components/events/EventRsvpControls";
import SavedEventToggle from "@/components/SavedEventToggle";
import StoryRailSurface from "@/components/stories/StoryRailSurface";
import VenuePartyCard from "@/components/discover/VenuePartyCard";
import { toSafePartyScore } from "@/lib/partyScore";
import { useDiscoverTonightData } from "@/hooks/useDiscoverTonightData";

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) {
    return "Starting now";
  }
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function SectionShell({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/6 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function CardSkeleton() {
  return <div className="h-80 animate-pulse rounded-[28px] border border-white/10 bg-white/6" />;
}

function RowSkeleton() {
  return <div className="h-20 animate-pulse rounded-[24px] border border-white/10 bg-white/6" />;
}

function SectionError({ message }: { message: string }) {
  return <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{message}</div>;
}

const DiscoverTonightExperience = memo(function DiscoverTonightExperience() {
  const data = useDiscoverTonightData();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.15),transparent_24%),linear-gradient(180deg,#05060b_0%,#090510_48%,#06040a_100%)] px-4 py-5 text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(124,58,237,0.18),rgba(14,165,233,0.12)_45%,rgba(249,115,22,0.14))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_18%),radial-gradient(circle_at_80%_0%,rgba(244,114,182,0.18),transparent_26%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm uppercase tracking-[0.34em] text-violet-100/75">Discover Tonight</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white sm:text-6xl">🌆 Discover Tonight</h1>
              <p className="mt-4 max-w-2xl text-lg text-white/75">The nightlife is happening now.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatPill label="👥 People Out Tonight" value={data.peopleOutTonight.toLocaleString()} />
                <StatPill label="🎉 Live Events" value={data.liveEvents.toLocaleString()} />
                <StatPill label="📸 Active Stories" value={data.activeStories.toLocaleString()} />
                <StatPill label="🔥 Trending Venues" value={data.trendingVenues.toLocaleString()} />
                <StatPill label="🕒 Updated Just Now" value={data.updatedLabel.replace("Updated ", "")} />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-lg">
              <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70">Live pulse</p>
              <p className="mt-3 text-3xl font-semibold text-white">Realtime nightlife operating system</p>
              <p className="mt-3 text-sm text-white/65">Crowds, stories, events, and friends stay in sync using the existing PartySafari realtime pipeline.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/map" className="rounded-full border border-violet-300/35 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25">Open Live Map</Link>
                <Link href="/events" className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/12">Browse Events</Link>
              </div>
            </div>
          </div>
        </section>

        <SectionShell
          eyebrow="🔥 Hot Right Now"
          title="Top venues ranked by Party Score"
          description="Score updates animate live as check-ins, stories, events, and friend activity change."
          action={<Link href="/map" className="text-sm font-semibold text-violet-200">View map</Link>}
        >
          {data.sectionStates.hotRightNow.error ? <SectionError message={data.sectionStates.hotRightNow.error} /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {data.sectionStates.hotRightNow.loading && data.hotRightNow.length === 0 ? Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />) : null}
            {!data.sectionStates.hotRightNow.loading && data.hotRightNow.length === 0 ? <p className="text-sm text-white/60">No venues are active yet tonight.</p> : null}
            {data.hotRightNow.map((venue) => (
              <VenuePartyCard
                key={venue.id}
                venueHref={`/venues/${venue.slug}`}
                venueName={venue.name}
                venueType={venue.venueType}
                imageUrl={venue.imageUrl || venue.photoUrl}
                city={venue.city}
                state={venue.state}
                partyScore={venue.partyScore}
                currentEvent={venue.currentEvent}
                currentEntertainment={venue.currentEntertainment}
                distanceLabel={venue.distanceLabel}
                friendsHereCount={venue.friendsHereCount}
                storyCount={venue.storyCount}
                liveCheckins={venue.liveCheckins}
                openNow={venue.openNow}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          eyebrow="🎉 Events Starting Soon"
          title="Beginning within the next 3 hours"
          description="Quick RSVP and venue access without leaving the feed of tonight."
          action={<Link href="/events" className="text-sm font-semibold text-violet-200">See all events</Link>}
        >
          {data.sectionStates.eventsStartingSoon.error ? <SectionError message={data.sectionStates.eventsStartingSoon.error} /> : null}
          {data.sectionStates.eventsStartingSoon.loading && data.eventsStartingSoon.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <CardSkeleton key={index} />
              ))}
            </div>
          ) : null}
          {!data.sectionStates.eventsStartingSoon.loading && data.eventsStartingSoon.length === 0 ? (
            <p className="text-sm text-white/60">No events are starting soon right now.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.eventsStartingSoon.map((event) => (
                <article key={event.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
                  <div className="relative h-40 bg-[#120824]">
                    {event.imageUrl || event.venue?.imageUrl || event.venue?.photoUrl ? (
                      <img src={event.imageUrl || event.venue?.imageUrl || event.venue?.photoUrl || ""} alt={event.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#12061d_0%,#221137_60%,#0b1b33_100%)] text-sm uppercase tracking-[0.28em] text-violet-100/80">Tonight</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-violet-200/75">{event.venue?.name || "Venue"}</p>
                        <h3 className="mt-1 text-xl font-semibold text-white">{event.title}</h3>
                      </div>
                      <div className="rounded-2xl border border-orange-300/25 bg-orange-500/15 px-3 py-2 text-right text-sm font-semibold text-orange-100">
                        {formatCountdown(event.startTime)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">{event.rsvpCounts.going} RSVPs</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">{event.friendAttendees.length} friends attending</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">{event.storyCount} stories</span>
                    </div>
                    <p className="text-sm text-white/65">{formatDateLabel(event.startTime)} • {event.performerName || event.eventType || "Lineup TBA"}</p>
                    <EventRsvpControls eventId={event.id} eventTitle={event.title} compact={true} />
                    <div className="flex items-center justify-between gap-3">
                      <Link href={event.venue?.slug ? `/venues/${event.venue.slug}` : "/events"} className="rounded-full border border-violet-300/35 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25">Open Event</Link>
                      <SavedEventToggle eventId={event.id} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionShell>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionShell
            eyebrow="👥 Friends Out Tonight"
            title="Grouped by venue, then event"
            description="See where your people already are before you decide the move."
          >
            {data.sectionStates.friendsOutTonight.error ? <SectionError message={data.sectionStates.friendsOutTonight.error} /> : null}
            {data.sectionStates.friendsOutTonight.loading && data.friendsOutTonight.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </div>
            ) : null}
            {!data.sectionStates.friendsOutTonight.loading && data.friendsOutTonight.length === 0 ? (
              <p className="text-sm text-white/60">No friends are checked in or RSVP'd right now.</p>
            ) : (
              <div className="space-y-3">
                {data.friendsOutTonight.map((group) => (
                  <div key={group.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{group.title}</h3>
                        <p className="mt-1 text-sm text-white/60">{group.subtitle}</p>
                      </div>
                      <Link href={group.href} className="text-sm font-semibold text-violet-200">View {group.type === "venue" ? "Venue" : "Event"}</Link>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.people.map((person) => (
                        <div key={person.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85">
                          {person.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell
            eyebrow="📸 Live Stories"
            title="Nearby stories with active rings"
            description="Friend stories surface first, followed by distance and overall activity."
          >
            {data.sectionStates.liveStories.error ? <SectionError message={data.sectionStates.liveStories.error} /> : null}
            <div className="space-y-4">
              <StoryRailSurface />
              {data.sectionStates.liveStories.loading && data.liveStories.length === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <CardSkeleton key={index} />
                  ))}
                </div>
              ) : null}
              {!data.sectionStates.liveStories.loading && data.liveStories.length === 0 ? (
                <p className="text-sm text-white/60">No nearby stories are active yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.liveStories.map((story) => (
                    <article key={story.id} className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
                      <div className="h-36 bg-[#120824]">
                        {story.imageUrl ? <img src={story.imageUrl} alt={story.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#10061b_0%,#25123c_55%,#0b1931_100%)] text-sm uppercase tracking-[0.28em] text-violet-100/80">Live Story</div>}
                      </div>
                      <div className="space-y-2 p-4">
                        <h3 className="text-lg font-semibold text-white">{story.title}</h3>
                        <p className="text-sm text-white/60">{story.subtitle}</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">{story.storyCount} stories</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">{story.distanceLabel}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">Activity {story.activityScore}</span>
                        </div>
                        {story.venueHref ? <Link href={story.venueHref} className="inline-flex text-sm font-semibold text-violet-200">Open Venue</Link> : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </SectionShell>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionShell
            eyebrow="📈 Venues Heating Up"
            title="Momentum movers"
            description="Calculated from live stories, event timing, saved interest, and current traffic."
          >
            {data.sectionStates.heatingUp.error ? <SectionError message={data.sectionStates.heatingUp.error} /> : null}
            {data.sectionStates.heatingUp.loading && data.heatingUp.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </div>
            ) : null}
            {!data.sectionStates.heatingUp.loading && data.heatingUp.length === 0 ? (
              <p className="text-sm text-white/60">Momentum will appear as live data comes in.</p>
            ) : (
              <div className="space-y-3">
                {data.heatingUp.map((venue) => {
                  const safePartyScore = toSafePartyScore(venue.partyScore);
                  const trend = safePartyScore.trend ?? "stable";
                  const momentum = safePartyScore.momentum ?? 0;
                  const score = safePartyScore.score ?? 0;
                  return (
                    <div key={venue.id} className="flex items-center justify-between rounded-[24px] border border-white/10 bg-black/20 px-4 py-4">
                      <div>
                        <p className="text-lg font-semibold text-white">{venue.name}</p>
                        <p className="mt-1 text-sm text-white/60">{venue.currentEvent || venue.currentEntertainment || venue.distanceLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold text-emerald-200">{trend === "down" ? "▼" : trend === "stable" ? "■" : "▲"} {momentum > 0 ? "+" : ""}{momentum}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/45">Party Score {score}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionShell>

          <SectionShell
            eyebrow="🎧 Live Entertainment"
            title="Sorted by start time"
            description="DJs, bands, trivia, karaoke, comedy, and live music in one list."
          >
            {data.sectionStates.liveEntertainment.error ? <SectionError message={data.sectionStates.liveEntertainment.error} /> : null}
            {data.sectionStates.liveEntertainment.loading && data.liveEntertainment.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </div>
            ) : null}
            {!data.sectionStates.liveEntertainment.loading && data.liveEntertainment.length === 0 ? (
              <p className="text-sm text-white/60">No live entertainment has been posted yet.</p>
            ) : (
              <div className="space-y-3">
                {data.liveEntertainment.map((event) => (
                  <Link key={event.id} href={event.venue?.slug ? `/venues/${event.venue.slug}` : "/events"} className="flex items-center justify-between rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 transition hover:border-violet-300/30">
                    <div>
                      <p className="text-lg font-semibold text-white">{event.performerName || event.title}</p>
                      <p className="mt-1 text-sm text-white/60">{event.venue?.name || "Venue"} • {(event.eventType || "Live Entertainment").replace(/_/g, " ")}</p>
                    </div>
                    <div className="text-right text-sm text-white/75">{formatDateLabel(event.startTime)}</div>
                  </Link>
                ))}
              </div>
            )}
          </SectionShell>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionShell
            eyebrow="🍹 Happening Now"
            title="Specials, VIP, and cover signals"
            description="Drink specials and venue offers surfaced from live event and venue data."
          >
            {data.sectionStates.happeningNow.error ? <SectionError message={data.sectionStates.happeningNow.error} /> : null}
            {data.sectionStates.happeningNow.loading && data.happeningNow.length === 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </div>
            ) : null}
            {!data.sectionStates.happeningNow.loading && data.happeningNow.length === 0 ? (
              <p className="text-sm text-white/60">Nothing flagged right now for specials or VIP.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.happeningNow.map((item) => (
                  <Link key={item.id} href={item.href} className="rounded-[24px] border border-white/10 bg-black/20 p-4 transition hover:border-violet-300/30">
                    <p className="text-lg font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-white/60">{item.subtitle}</p>
                  </Link>
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell
            eyebrow="⭐ Recommended For You"
            title="Personalized tonight"
            description="Recommendations combine social proximity, history, genre patterns, story activity, and venue trend."
          >
            {data.sectionStates.recommendations.error ? <SectionError message={data.sectionStates.recommendations.error} /> : null}
            {data.sectionStates.recommendations.loading && data.recommendations.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </div>
            ) : null}
            {!data.sectionStates.recommendations.loading && data.recommendations.length === 0 ? (
              <p className="text-sm text-white/60">Use RSVPs, saves, and check-ins to teach PartySafari your taste.</p>
            ) : (
              <div className="space-y-3">
                {data.recommendations.map((entry) => {
                  const safePartyScore = toSafePartyScore(entry.venue.partyScore);
                  return (
                    <div key={entry.id} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-white">{entry.venue.name}</p>
                          <p className="mt-1 text-sm text-white/60">Party Score {safePartyScore.score ?? 0} • {entry.venue.distanceLabel}</p>
                        </div>
                        <Link href={`/venues/${entry.venue.slug}`} className="text-sm font-semibold text-violet-200">Open Venue</Link>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {entry.reasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80">{reason}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionShell>
        </div>
      </div>
    </main>
  );
});

export default DiscoverTonightExperience;