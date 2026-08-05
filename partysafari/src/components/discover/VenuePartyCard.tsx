"use client";

import { DEFAULT_PARTY_SCORE, type PartyScore } from "@/lib/partyScore";
import { buildCrowdPulseSnapshot } from "@/lib/discoverCrowdPulse";
import { describePartyScore, formatScoreUpdatedLabel } from "@/lib/partyScorePresentation";
import { CrowdPulseCard } from "@/components/crowd-pulse";
import { getVenueStatusLabel, resolveCurrentVibe } from "@/lib/crowdPulsePresentation";
import LitButton from "@/components/discover/LitButton";
import WhyThisVenue from "@/components/discover/WhyThisVenue";
import type { PsiExplanation } from "@/lib/psi";

type VenuePartyCardProps = {
  /** Needed for the Lit write. Optional so the card still renders where lit is not wired. */
  venueId?: string;
  venueHref: string;
  venueName: string;
  venueType: string | null;
  imageUrl: string | null;
  city: string | null;
  state: string | null;
  currentStatus?: string | null;
  partyScore?: Partial<PartyScore> | null;
  currentEvent: string | null;
  currentEntertainment: string | null;
  distanceLabel: string;
  friendsHereCount: number;
  storyCount: number;
  liveCheckins: number;
  currentEvents?: number;
  openNow: boolean;
  musicGenres?: string[];
  liveEventTypes?: string[];
  interestedRsvps?: number;
  onJoinLabel?: string;
  /** Active endorsements at this venue right now. */
  litCount?: number;
  /** Whether the signed-in user holds a live endorsement here. */
  litHasViewer?: boolean;
  /** Seconds until this user may endorse again. */
  litCooldownSeconds?: number;
  /** Momentum points the current endorsements are contributing. Decays; not part of the base score. */
  litBoost?: number;
  litPending?: boolean;
  /** False when db/020 is undeployed — the button is hidden rather than offered and refused. */
  litAvailable?: boolean;
  /** False when the viewer has no recent check-in here, is cooling down, or is over the nightly ceiling. */
  litEligible?: boolean;
  /** Why the button is locked, rendered beneath it so the lock is never silent. */
  litMessage?: string | null;
  onLit?: (venueId: string) => void | Promise<unknown>;
  /** PSI read on this venue. Omitted where PSI is not wired; the card renders without it. */
  psiExplanation?: PsiExplanation | null;
};

export default function VenuePartyCard({
  venueId,
  venueHref,
  venueName,
  venueType,
  imageUrl,
  currentStatus = null,
  partyScore,
  currentEvent,
  currentEntertainment,
  distanceLabel,
  friendsHereCount,
  storyCount,
  liveCheckins,
  currentEvents = 0,
  openNow,
  musicGenres = [],
  liveEventTypes = [],
  interestedRsvps,
  onJoinLabel = "Join Party",
  litCount = 0,
  litHasViewer = false,
  litCooldownSeconds = 0,
  litBoost = 0,
  litPending = false,
  litAvailable = false,
  litEligible = false,
  litMessage = null,
  onLit,
  psiExplanation = null,
}: VenuePartyCardProps) {
  const score = describePartyScore(partyScore ?? DEFAULT_PARTY_SCORE, {
    liveCheckins,
    storyCount,
    friendsHereCount,
    hasProgrammedEvent: Boolean(currentEvent || currentEntertainment),
  });
  const updatedLabel = formatScoreUpdatedLabel(score.updatedAt);
  const pulse = buildCrowdPulseSnapshot({
    partyScore: {
      score: score.score,
      trend: score.trend,
      momentum: score.momentum,
      confidence: score.confidence,
      crowdLevel: score.crowdLevel,
    },
    liveCheckins,
    storyCount,
    currentEvents,
    friendsHere: friendsHereCount,
    litSignals: litCount,
  });
  const statusLabel = getVenueStatusLabel({ openNow, currentStatus });
  const currentVibe = resolveCurrentVibe({
    musicGenres,
    liveEventTypes,
    venueType,
  });

  return (
    <CrowdPulseCard
      venueHref={venueHref}
      venueName={venueName}
      venueCategory={venueType}
      statusLabel={statusLabel}
      distanceLabel={distanceLabel}
      pulse={pulse}
      friendsHereCount={friendsHereCount}
      currentVibe={currentVibe}
      imageUrl={imageUrl}
      currentEvent={currentEvent}
      currentEntertainment={currentEntertainment}
      liveSignals={[
        { key: "checkins", icon: "👥", label: "Live Check-ins", value: liveCheckins },
        { key: "stories", icon: "📸", label: "Stories", value: storyCount },
        { key: "lit", icon: "🔥", label: "Lit Activity", value: litCount },
        { key: "saves", icon: "❤️", label: "Saves", value: interestedRsvps ?? null },
      ]}
      updatedLabel={updatedLabel ? `Updated ${updatedLabel}` : "Live signals updating"}
      onJoinLabel={onJoinLabel}
      footerAction={
        litAvailable && venueId ? (
          <LitButton
            venueId={venueId}
            litCount={litCount}
            hasLit={litHasViewer}
            cooldownSecondsRemaining={litCooldownSeconds}
            pending={litPending}
            disabled={!litEligible}
            message={litMessage}
            onLit={onLit}
          />
        ) : null
      }
      insight={psiExplanation ? <WhyThisVenue explanation={psiExplanation} /> : null}
    />
  );
}
