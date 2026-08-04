"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import StoryRailSurface from "@/components/stories/StoryRailSurface";
import DiscoverHero from "@/components/discover/DiscoverHero";
import EventStartingSoonCard from "@/components/discover/EventStartingSoonCard";
import VenuePartyCard from "@/components/discover/VenuePartyCard";
import WhyThisVenue from "@/components/discover/WhyThisVenue";
import AiDiscoverCards from "@/components/discover/AiDiscoverCards";
import FounderCalibrationControl from "@/components/discover/FounderCalibrationControl";
import {
  CardSkeleton,
  EmptyState,
  RowSkeleton,
  SectionError,
  SectionLink,
  SectionShell,
} from "@/components/discover/DiscoverSection";
import { describePartyScore } from "@/lib/partyScorePresentation";
import { useAiDiscoverCards } from "@/hooks/useAiDiscoverCards";
import { useDiscoverTonightData } from "@/hooks/useDiscoverTonightData";
import { useVenueLit } from "@/hooks/useVenueLit";
import { litBoostPoints } from "@/lib/litSignals";
import { useViewerFeatureContext } from "@/hooks/useViewerFeatureContext";
import { isFeatureEnabledForViewer } from "@/lib/featureFlags";
import { submitCalibrationFeedback } from "@/lib/calibrationFeedback";
import {
  createCrowdPulseCalibrationDraft,
  hasMeaningfulCrowdPulseSignals,
  resolveCrowdPulseCalibrationAnchor,
} from "@/lib/discoverCrowdPulse";

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

function skeletons(count: number, Skeleton: () => React.JSX.Element) {
  return Array.from({ length: count }).map((_, index) => <Skeleton key={index} />);
}

const DiscoverTonightExperience = memo(function DiscoverTonightExperience() {
  const data = useDiscoverTonightData();
  const states = data.sectionStates;

  const hotVenueIds = useMemo(() => data.hotRightNow.map((venue) => venue.id), [data.hotRightNow]);
  const lit = useVenueLit({ venueIds: hotVenueIds });
  const aiCards = useAiDiscoverCards(data.venueCards);
  const viewer = useViewerFeatureContext(["crowdPulse"]);
  const founderCrowdPulseAccess = !viewer.loading && isFeatureEnabledForViewer("crowdPulse", viewer);
  const calibrationAnchor = useMemo(() => resolveCrowdPulseCalibrationAnchor(data.hotRightNow), [data.hotRightNow]);
  const hasSignals = useMemo(() => hasMeaningfulCrowdPulseSignals(data.hotRightNow), [data.hotRightNow]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.15),transparent_24%),linear-gradient(180deg,#05060b_0%,#090510_48%,#06040a_100%)] px-3 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <DiscoverHero
          peopleOutTonight={data.peopleOutTonight}
          liveEvents={data.liveEvents}
          activeStories={data.activeStories}
          trendingVenues={data.trendingVenues}
          updatedLabel={data.updatedLabel}
        />

        {aiCards.enabled ? (
          <AiDiscoverCards
            cards={aiCards.result.cards}
            crowdPulseAvailable={aiCards.result.crowdPulseAvailable}
          />
        ) : null}

        <SectionShell
          eyebrow="⚡ Crowd Pulse"
          title="Crowd Pulse"
          description="See where tonight's energy is building in real time."
          action={<SectionLink href="/map">View Crowd Pulse</SectionLink>}
        >
          {founderCrowdPulseAccess ? (
            <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-200/75">Founder-only detail</p>
              <p className="mt-1 text-sm text-white/75">
                Canonical Party Score ranking and PSI evidence are shown as rendered so calibration stays tied to real venues only.
              </p>
              {!hasSignals ? (
                <div className="mt-2 space-y-1 text-xs text-white/65">
                  <p>Building tonight&apos;s pulse</p>
                  <p>Live check-ins, stories, events, and Lit activity will shape this venue&apos;s pulse as the night develops.</p>
                  <p>Activity is currently below the privacy threshold.</p>
                </div>
              ) : null}
              {calibrationAnchor ? (
                <FounderCalibrationControl
                  targets={[{ feature: "crowdPulse", label: calibrationAnchor.label }]}
                  onSubmit={async (_feature, judgment) =>
                    submitCalibrationFeedback(
                      createCrowdPulseCalibrationDraft({
                        anchor: calibrationAnchor,
                        accurate: judgment.accurate,
                        note: judgment.note,
                      })
                    )
                  }
                />
              ) : null}
            </div>
          ) : null}
          {states.hotRightNow.error ? <SectionError message={states.hotRightNow.error} /> : null}
          {states.hotRightNow.loading && data.hotRightNow.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">{skeletons(4, CardSkeleton)}</div>
          ) : null}
          {!states.hotRightNow.loading && data.hotRightNow.length === 0 ? (
            <EmptyState
              icon="🌙"
              title="Building tonight's pulse"
              message="Live check-ins, stories, events, and Lit activity will shape this venue's pulse as the night develops."
              action={<SectionLink href="/map">View Crowd Pulse</SectionLink>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.hotRightNow.map((venue) => (
                <VenuePartyCard
                  key={venue.id}
                  venueId={venue.id}
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
                  litCount={lit.litByVenueId[venue.id]?.litCount ?? 0}
                  litHasViewer={lit.litByVenueId[venue.id]?.viewerHasLit ?? false}
                  litCooldownSeconds={Math.ceil((lit.cooldownMsByVenueId[venue.id] ?? 0) / 1000)}
                  litBoost={litBoostPoints(lit.litByVenueId[venue.id]?.decayWeight ?? 0)}
                  litPending={lit.pendingVenueIds.has(venue.id)}
                  litAvailable={lit.available}
                  litEligible={lit.eligibilityByVenueId[venue.id]?.canLit ?? false}
                  litMessage={lit.messageByVenueId[venue.id] ?? null}
                  onLit={lit.submitLit}
                  psiExplanation={venue.psiExplanation}
                />
              ))}
            </div>
          )}
        </SectionShell>

        <SectionShell
          eyebrow="🎉 Events Starting Soon"
          title="Beginning within the next 3 hours"
          description="Quick RSVP and venue access without leaving the feed of tonight."
          action={<SectionLink href="/events">See all events</SectionLink>}
        >
          {states.eventsStartingSoon.error ? <SectionError message={states.eventsStartingSoon.error} /> : null}
          {states.eventsStartingSoon.loading && data.eventsStartingSoon.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{skeletons(6, CardSkeleton)}</div>
          ) : null}
          {!states.eventsStartingSoon.loading && data.eventsStartingSoon.length === 0 ? (
            <EmptyState
              icon="🎟️"
              title="Nothing kicks off in the next 3 hours"
              message="The early slot is quiet. Browse everything else on tonight's schedule instead."
              action={<SectionLink href="/events">Browse Events</SectionLink>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.eventsStartingSoon.map((event) => (
                <EventStartingSoonCard
                  key={event.id}
                  event={event}
                  countdownLabel={formatCountdown(event.startTime)}
                  scheduleLabel={formatDateLabel(event.startTime)}
                />
              ))}
            </div>
          )}
        </SectionShell>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionShell
            eyebrow="👥 Friends Out Tonight"
            title="Grouped by venue, then event"
            description="See where your people already are before you decide the move."
          >
            {states.friendsOutTonight.error ? <SectionError message={states.friendsOutTonight.error} /> : null}
            {states.friendsOutTonight.loading && data.friendsOutTonight.length === 0 ? (
              <div className="space-y-3">{skeletons(4, RowSkeleton)}</div>
            ) : null}
            {!states.friendsOutTonight.loading && data.friendsOutTonight.length === 0 ? (
              <EmptyState
                icon="👋"
                title="Your crew hasn't checked in yet"
                message="Nobody you follow is out right now. Start the night and they will see you on the board."
                action={<SectionLink href="/friends">Find Friends</SectionLink>}
              />
            ) : (
              <div className="space-y-3">
                {data.friendsOutTonight.map((group) => (
                  <div key={group.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-white sm:text-lg">{group.title}</h3>
                        <p className="mt-1 text-sm text-white/60">{group.subtitle}</p>
                      </div>
                      <SectionLink href={group.href}>View {group.type === "venue" ? "Venue" : "Event"}</SectionLink>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.people.map((person) => (
                        <span
                          key={person.id}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/85"
                        >
                          {person.name}
                        </span>
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
            {states.liveStories.error ? <SectionError message={states.liveStories.error} /> : null}
            <div className="space-y-4">
              <StoryRailSurface />
              {states.liveStories.loading && data.liveStories.length === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">{skeletons(4, CardSkeleton)}</div>
              ) : null}
              {!states.liveStories.loading && data.liveStories.length === 0 ? (
                <EmptyState
                  icon="📸"
                  title="No stories in the last hour"
                  message="Nothing nearby is live yet. Post the first story from wherever you land tonight."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.liveStories.map((story) => (
                    <article key={story.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                      <div className="h-32 bg-[#120824] sm:h-36">
                        {story.imageUrl ? (
                          <img src={story.imageUrl} alt={story.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#10061b_0%,#25123c_55%,#0b1931_100%)] text-xs uppercase tracking-[0.28em] text-violet-100/80">
                            Live Story
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-4">
                        <h3 className="text-base font-semibold text-white sm:text-lg">{story.title}</h3>
                        <p className="text-sm text-white/60">{story.subtitle}</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">
                            {story.storyCount} stories
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">
                            {story.distanceLabel}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">
                            Activity {story.activityScore}
                          </span>
                        </div>
                        {story.venueHref ? (
                          <Link
                            href={story.venueHref}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-200 hover:text-violet-100"
                          >
                            Open Venue
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </SectionShell>
        </div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
          <SectionShell
            eyebrow="📈 Venues Heating Up"
            title="Momentum movers"
            description="Calculated from live stories, event timing, saved interest, and current traffic."
          >
            {states.heatingUp.error ? <SectionError message={states.heatingUp.error} /> : null}
            {states.heatingUp.loading && data.heatingUp.length === 0 ? (
              <div className="space-y-3">{skeletons(4, RowSkeleton)}</div>
            ) : null}
            {!states.heatingUp.loading && data.heatingUp.length === 0 ? (
              <EmptyState
                icon="📈"
                title="Building Momentum"
                message="Movers appear here as check-ins, stories, and RSVPs start landing tonight."
              />
            ) : (
              <div className="space-y-3">
                {data.heatingUp.map((venue) => {
                  const score = describePartyScore(venue.partyScore, {
                    liveCheckins: venue.liveCheckins,
                    storyCount: venue.storyCount,
                    friendsHereCount: venue.friendsHereCount,
                    hasProgrammedEvent: Boolean(venue.currentEvent || venue.currentEntertainment),
                  });
                  const momentumTone =
                    score.trend === "up" ? "text-emerald-200" : score.trend === "down" ? "text-rose-200" : "text-white/80";

                  return (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-white sm:text-lg">{venue.name}</p>
                        <p className="mt-1 truncate text-sm text-white/60">
                          {venue.currentEvent || venue.currentEntertainment || venue.distanceLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {score.showScore ? (
                          <>
                            <p className={`text-xl font-semibold tabular-nums sm:text-2xl ${momentumTone}`}>
                              <span aria-hidden="true">
                                {score.trend === "down" ? "▼" : score.trend === "stable" ? "■" : "▲"}
                              </span>{" "}
                              {score.momentum > 0 ? "+" : ""}
                              {score.momentum}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                              Party Score {score.score}
                            </p>
                          </>
                        ) : (
                          <span className="inline-flex rounded-full border border-violet-300/25 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-100">
                            {score.headline}
                          </span>
                        )}
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
            {states.liveEntertainment.error ? <SectionError message={states.liveEntertainment.error} /> : null}
            {states.liveEntertainment.loading && data.liveEntertainment.length === 0 ? (
              <div className="space-y-3">{skeletons(5, RowSkeleton)}</div>
            ) : null}
            {!states.liveEntertainment.loading && data.liveEntertainment.length === 0 ? (
              <EmptyState
                icon="🎧"
                title="No lineups posted yet"
                message="DJs, bands, karaoke, and comedy show up here the moment venues publish them."
                action={<SectionLink href="/events">Browse Events</SectionLink>}
              />
            ) : (
              <div className="space-y-3">
                {data.liveEntertainment.map((event) => (
                  <Link
                    key={event.id}
                    href={event.venue?.slug ? `/venues/${event.venue.slug}` : "/events"}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 transition hover:border-violet-300/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white sm:text-lg">
                        {event.performerName || event.title}
                      </p>
                      <p className="mt-1 truncate text-sm text-white/60">
                        {event.venue?.name || "Venue"} • {(event.eventType || "Live Entertainment").replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm text-white/75">{formatDateLabel(event.startTime)}</div>
                  </Link>
                ))}
              </div>
            )}
          </SectionShell>
        </div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
          <SectionShell
            eyebrow="🍹 Happening Now"
            title="Specials, VIP, and cover signals"
            description="Drink specials and venue offers surfaced from live event and venue data."
          >
            {states.happeningNow.error ? <SectionError message={states.happeningNow.error} /> : null}
            {states.happeningNow.loading && data.happeningNow.length === 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">{skeletons(4, RowSkeleton)}</div>
            ) : null}
            {!states.happeningNow.loading && data.happeningNow.length === 0 ? (
              <EmptyState
                icon="🍹"
                title="No specials flagged right now"
                message="Venues post drink specials, cover, and VIP details here as the night gets going."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.happeningNow.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-violet-300/30"
                  >
                    <p className="text-base font-semibold text-white sm:text-lg">{item.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{item.subtitle}</p>
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
            {states.recommendations.error ? <SectionError message={states.recommendations.error} /> : null}
            {states.recommendations.loading && data.recommendations.length === 0 ? (
              <div className="space-y-3">{skeletons(4, RowSkeleton)}</div>
            ) : null}
            {!states.recommendations.loading && data.recommendations.length === 0 ? (
              <EmptyState
                icon="⭐"
                title="Teach PartySafari your taste"
                message="RSVP, save, and check in a few times tonight and your personalized picks start showing up here."
              />
            ) : (
              <div className="space-y-3">
                {data.recommendations.map((entry) => {
                  const score = describePartyScore(entry.venue.partyScore, {
                    liveCheckins: entry.venue.liveCheckins,
                    storyCount: entry.venue.storyCount,
                    friendsHereCount: entry.venue.friendsHereCount,
                    hasProgrammedEvent: Boolean(entry.venue.currentEvent || entry.venue.currentEntertainment),
                  });

                  return (
                    <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white sm:text-lg">{entry.venue.name}</p>
                          <p className="mt-1 text-sm text-white/60">
                            {score.showScore ? `Party Score ${score.score}` : score.headline} • {entry.venue.distanceLabel}
                          </p>
                        </div>
                        <SectionLink href={`/venues/${entry.venue.slug}`}>Open Venue</SectionLink>
                      </div>
                      <WhyThisVenue explanation={entry.explanation} defaultOpen className="mt-4" />
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
