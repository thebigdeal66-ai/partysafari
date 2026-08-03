"use client";

import { useCallback, useMemo } from "react";
import FounderCalibrationControl from "@/components/discover/FounderCalibrationControl";
import { useCrowdPulse } from "@/hooks/useCrowdPulse";
import { usePartyScore } from "@/hooks/usePartyScore";
import { useVenuePsi } from "@/hooks/useVenuePsi";
import { useViewerFeatureContext } from "@/hooks/useViewerFeatureContext";
import { isFeatureEnabledForViewer } from "@/lib/featureFlags";
import {
  submitCalibrationFeedback,
  type CalibrationFeature,
  type CalibrationFeedbackDraft,
  type CalibrationSubmitOutcome,
} from "@/lib/calibrationFeedback";
import { type PartyScoreDetails } from "@/lib/partyScore";
import { describePartyScore, formatScoreUpdatedLabel, type PartyScorePresentation } from "@/lib/partyScorePresentation";
import type { CrowdPulseBucket, CrowdPulseResult } from "@/lib/crowdPulseTypes";
import type { PsiExplanation } from "@/lib/psi";

export type VenueOwnerCrowdPulseVenue = {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  current_status?: string | null;
  description?: string | null;
};

export type VenueOwnerCrowdPulseViewModel = {
  venueId: string;
  venueName: string;
  venueLocation: string | null;
  partyScore: PartyScoreDetails;
  partyScorePresentation: PartyScorePresentation;
  crowdPulseBucket: CrowdPulseBucket | null;
  crowdPulseLevel: CrowdPulseBucket["level"] | null;
  crowdPulseLevelLabel: string | null;
  crowdPulseTrendLabel: string | null;
  crowdPulseFreshnessLabel: string | null;
  crowdPulsePrivacyLabel: string | null;
  psi: PsiExplanation | null;
  psiHeadline: string;
  psiReasons: Array<{ id: string; text: string }>;
  psiReasonCodes: string[];
  psiCaveat: string | null;
  signalRows: Array<{ label: string; value: string; detail?: string }>;
  lowDataCopy: string | null;
  calibrationTargets: Array<{ feature: CalibrationFeature; label: string }>;
  calibratable: boolean;
};

export type FounderCrowdPulsePanelProps = {
  venue: VenueOwnerCrowdPulseVenue | null;
  programmedEventTitle?: string | null;
};

export type FounderCrowdPulsePanelContentProps = {
  loading: boolean;
  error: string | null;
  model: VenueOwnerCrowdPulseViewModel | null;
  onRetry: () => void;
  onSubmitCalibration: (feature: CalibrationFeature, judgment: { accurate: boolean; note: string | null }) => Promise<CalibrationSubmitOutcome>;
};

function toSentenceCase(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function formatFreshnessLabel(updatedAt: string | null | undefined) {
  if (!updatedAt) {
    return null;
  }

  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) {
    return "Updated just now";
  }
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays}d ago`;
}

function formatCount(value: number) {
  return String(Math.max(0, Math.round(value)));
}

function signalRowsFromPartyScore(partyScore: PartyScoreDetails) {
  const signals = partyScore.signals;
  const rows = [
    { label: "Live check-ins", value: formatCount(signals.liveCheckins) },
    { label: "Active stories", value: formatCount(signals.activeStories) },
    { label: "Active events", value: formatCount(signals.activeEvents) },
    { label: "Lit activity", value: formatCount(signals.litSignals), detail: signals.recentLitSignals > 0 ? `${signals.recentLitSignals} recent` : undefined },
    { label: "Recent activity", value: formatCount(signals.recentActivity) },
  ];

  return rows.filter((row) => Number(row.value) > 0 || typeof row.detail === "string");
}

function resolveVenueBucket(crowdPulse: CrowdPulseResult, venueId: string) {
  return crowdPulse.buckets.find((bucket) => bucket.venueIds.includes(venueId)) || null;
}

function hasCrowdPulseSignal(partyScore: PartyScoreDetails) {
  const signals = partyScore.signals;
  return [
    signals.liveCheckins,
    signals.activeStories,
    signals.storyReactions,
    signals.activeEvents,
    signals.friendPresence,
    signals.goingRsvps + signals.interestedRsvps,
    signals.recentActivity,
    signals.recentCheckins,
    signals.recentStories,
    signals.recentStoryReactions,
    signals.recentRsvpActivity,
    signals.recentEventActivity,
    signals.recentFriendActivity,
    signals.litSignals,
    signals.recentLitSignals,
  ].some((value) => value > 0);
}

export function shouldRenderFounderCrowdPulsePanel(input: {
  authenticated: boolean;
  viewerLoading: boolean;
  allowed: boolean;
  venueId: string | null;
  venueHasScope: boolean;
  overviewTabActive: boolean;
}): boolean {
  return (
    input.authenticated &&
    !input.viewerLoading &&
    input.allowed &&
    Boolean(input.venueId) &&
    input.venueHasScope &&
    input.overviewTabActive
  );
}

export function buildFounderCrowdPulseViewModel({
  venue,
  programmedEventTitle,
  partyScore,
  crowdPulse,
  psi,
}: {
  venue: VenueOwnerCrowdPulseVenue;
  programmedEventTitle?: string | null;
  partyScore: PartyScoreDetails;
  crowdPulse: CrowdPulseResult;
  psi: PsiExplanation | null;
}): VenueOwnerCrowdPulseViewModel {
  const partyScorePresentation = describePartyScore(partyScore, {
    liveCheckins: partyScore.signals.liveCheckins,
    storyCount: partyScore.signals.activeStories,
    friendsHereCount: partyScore.signals.friendPresence,
    hasProgrammedEvent: Boolean(programmedEventTitle),
  });
  const crowdPulseBucket = resolveVenueBucket(crowdPulse, venue.id);
  const pulseIsPublished = Boolean(crowdPulseBucket?.contributorFloorMet);
  const pulseLevel: CrowdPulseBucket["level"] | null = pulseIsPublished
    ? crowdPulseBucket?.level ?? null
    : crowdPulse.summary.hasSignal
      ? crowdPulse.summary.peakLevel
      : null;
  const pulseTrend = pulseIsPublished
    ? crowdPulseBucket?.trend ?? null
    : crowdPulse.summary.hasSignal
      ? crowdPulse.summary.trend
      : null;
  const pulseLabel = pulseLevel ? toSentenceCase(pulseLevel) : null;
  const pulseTrendLabel = pulseTrend ? `${toSentenceCase(pulseTrend) || pulseTrend} trend` : null;
  const freshnessLabel = formatFreshnessLabel(crowdPulse.summary.updatedAt || partyScore.updatedAt);
  const privacyLabel = crowdPulseBucket
    ? crowdPulseBucket.contributorFloorMet
      ? "Contributor floor met"
      : "Below privacy threshold"
    : crowdPulse.summary.hasSignal
      ? "Contributor floor met"
      : "Building tonight's pulse";

  const partyScoreRows = signalRowsFromPartyScore(partyScore);
  const psiHasEvidence = Boolean(psi?.hasEvidence);
  const psiReasons = psiHasEvidence ? (psi?.reasons || []).slice(0, 3).map((reason) => ({ id: reason.id, text: reason.text })) : [];
  const psiReasonCodes = psiReasons.map((reason) => reason.id);
  const lowDataCopy = hasCrowdPulseSignal(partyScore) || crowdPulse.summary.hasSignal
    ? null
    : "Crowd Pulse becomes more informative as check-ins, stories, events, and Lit activity arrive.";

  return {
    venueId: venue.id,
    venueName: venue.name || "Venue",
    venueLocation: [venue.city, venue.state].filter(Boolean).join(", ") || null,
    partyScore,
    partyScorePresentation,
    crowdPulseBucket,
    crowdPulseLevel: pulseLevel,
    crowdPulseLevelLabel: pulseLabel,
    crowdPulseTrendLabel: pulseTrendLabel,
    crowdPulseFreshnessLabel: freshnessLabel,
    crowdPulsePrivacyLabel: privacyLabel,
    psi,
    psiHeadline: psiHasEvidence ? psi?.headline || partyScorePresentation.headline : "Building tonight's pulse",
    psiReasons,
    psiReasonCodes,
    psiCaveat: psiHasEvidence ? psi?.caveat || null : lowDataCopy,
    signalRows: partyScoreRows,
    lowDataCopy,
    calibrationTargets: psiHasEvidence ? [{ feature: "crowdPulse", label: "Crowd Pulse" }] : [],
    calibratable: psiHasEvidence,
  };
}

export function buildFounderCrowdPulseCalibrationDraft({
  model,
  accurate,
  note,
}: {
  model: VenueOwnerCrowdPulseViewModel;
  accurate: boolean;
  note: string | null;
}): CalibrationFeedbackDraft {
  return {
    feature: "crowdPulse",
    venueId: model.venueId,
    recommendationCategory: model.partyScorePresentation.state,
    displayedPartyScore: model.partyScore.score,
    displayedPsiLabel: model.psiHeadline,
    crowdPulseLevel: model.crowdPulseLevel,
    reasonCodes: model.psiReasonCodes,
    accurate,
    note,
  };
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-36 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="h-4 w-32 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        <div className="mt-5 h-10 w-24 animate-pulse rounded-2xl bg-white/10 motion-reduce:animate-none" />
        <div className="mt-4 h-3 w-44 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        <div className="mt-2 h-3 w-36 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
      </div>
      <div className="h-36 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="h-4 w-28 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        <div className="mt-5 h-10 w-28 animate-pulse rounded-2xl bg-white/10 motion-reduce:animate-none" />
        <div className="mt-4 h-3 w-40 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function FounderCrowdPulsePanelContent({ loading, error, model, onRetry, onSubmitCalibration }: FounderCrowdPulsePanelContentProps) {
  if (!model) {
    return null;
  }

  return (
    <section
      aria-labelledby="founder-crowd-pulse-title"
      className="overflow-hidden rounded-3xl border border-violet-400/18 bg-[linear-gradient(180deg,rgba(18,9,31,0.98),rgba(12,7,21,0.96))] shadow-[0_24px_80px_rgba(11,5,20,0.45)]"
    >
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-violet-200/65">Crowd Pulse</p>
            <h2 id="founder-crowd-pulse-title" className="mt-1 text-2xl font-semibold text-white">
              Founder Preview
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              {model.venueName}
              {model.venueLocation ? <span className="text-white/45"> · {model.venueLocation}</span> : null}
            </p>
          </div>
          <div className="rounded-full border border-amber-300/15 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
            Founder only
          </div>
        </div>
        {model.lowDataCopy ? (
          <p className="mt-4 max-w-3xl text-sm text-white/75" role="status" aria-live="polite">
            {model.psiHeadline}
            <span className="ml-2 text-white/55">{model.lowDataCopy}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {loading ? <LoadingState /> : null}

        {error ? (
          <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-rose-200/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 motion-reduce:transition-none"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {!loading ? (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">Party Score</p>
              <div className="mt-4 flex items-end gap-3">
                <span className="text-5xl font-semibold leading-none text-white">{model.partyScore.score}</span>
                <div className="pb-1">
                  <p className="text-sm font-semibold text-violet-100">{model.partyScorePresentation.headline}</p>
                  <p className="mt-1 text-sm text-white/65">{model.partyScorePresentation.detail}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{model.partyScorePresentation.momentumLabel}</span>
                {model.partyScorePresentation.showConfidence ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    {model.partyScorePresentation.confidencePercent}% confidence
                  </span>
                ) : null}
                {formatScoreUpdatedLabel(model.partyScore.updatedAt) ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    {formatScoreUpdatedLabel(model.partyScore.updatedAt)}
                  </span>
                ) : null}
              </div>
            </article>

            <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">Crowd Pulse</p>
              <div className="mt-4 flex items-end gap-3">
                <span className="text-4xl font-semibold leading-none text-white">
                  {model.crowdPulseLevelLabel || "Building"}
                </span>
                <div className="pb-1">
                  <p className="text-sm font-semibold text-violet-100">
                    {model.crowdPulseTrendLabel || "Trend unavailable"}
                  </p>
                  <p className="mt-1 text-sm text-white/65">
                    {model.crowdPulsePrivacyLabel}
                    {model.crowdPulseFreshnessLabel ? <span className="text-white/45"> · {model.crowdPulseFreshnessLabel}</span> : null}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/65">
                {model.crowdPulseBucket?.contributorFloorMet
                  ? "Readable pulse published for this cell."
                  : model.lowDataCopy || "Activity is below the privacy threshold for a readable pulse."}
              </p>
            </article>

            <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">PSI</p>
              <h3 className="mt-4 text-xl font-semibold text-white">{model.psiHeadline}</h3>
              {model.psiReasons.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm text-white/75">
                  {model.psiReasons.map((reason) => (
                    <li key={reason.id} className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      {reason.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-white/65">{model.psiCaveat || "No readable interpretation yet."}</p>
              )}
              {model.psiCaveat && model.psiReasons.length > 0 ? (
                <p className="mt-4 text-xs text-white/50">{model.psiCaveat}</p>
              ) : null}
            </article>

            <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">Signal summary</p>
              {model.signalRows.length > 0 ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {model.signalRows.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      <dt className="text-xs uppercase tracking-[0.18em] text-white/45">{row.label}</dt>
                      <dd className="mt-1 text-lg font-semibold text-white">{row.value}</dd>
                      {row.detail ? <p className="mt-1 text-xs text-white/45">{row.detail}</p> : null}
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-white/65">
                  {model.lowDataCopy || "No live signals have landed yet. The panel will fill in as activity arrives."}
                </p>
              )}
            </article>
          </div>
        ) : null}

        {!loading && model.calibratable ? (
          <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">Calibration</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Founder calibration</h3>
                <p className="mt-1 max-w-2xl text-sm text-white/60">
                  Rate the interpretation against what the room actually looked like. The submission reuses the existing calibration feedback path.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                UUID-backed venue id
              </div>
            </div>
            <div className="mt-4">
              <FounderCalibrationControl
                targets={model.calibrationTargets}
                onSubmit={onSubmitCalibration}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function FounderCrowdPulsePanel({ venue, programmedEventTitle }: FounderCrowdPulsePanelProps) {
  const viewerContext = useViewerFeatureContext(["crowdPulse"]);
  const allowed = isFeatureEnabledForViewer("crowdPulse", {
    profileId: viewerContext.profileId,
    city: viewerContext.city,
  });

  const venueScope = venue?.city ? { city: venue.city, state: venue.state || null } : null;
  const shouldLoad = shouldRenderFounderCrowdPulsePanel({
    authenticated: Boolean(viewerContext.profileId),
    viewerLoading: viewerContext.loading,
    allowed,
    venueId: venue?.id || null,
    venueHasScope: Boolean(venueScope),
    overviewTabActive: true,
  });

  const partyScoreResult = usePartyScore(venue?.id || null, shouldLoad);
  const crowdPulseResult = useCrowdPulse({
    scope: venueScope,
    enabled: shouldLoad,
    bypassFeatureFlag: true,
  });

  const psi = useVenuePsi(shouldLoad ? partyScoreResult.partyScore : null, {
    programmedEvent: programmedEventTitle || null,
  });

  const model = useMemo(() => {
    if (!venue) {
      return null;
    }

    return buildFounderCrowdPulseViewModel({
      venue,
      programmedEventTitle,
      partyScore: partyScoreResult.partyScore,
      crowdPulse: crowdPulseResult,
      psi: psi.explanation,
    });
  }, [crowdPulseResult, partyScoreResult.partyScore, programmedEventTitle, psi.explanation, venue]);

  const submitCalibration = useCallback(
    async (_feature: CalibrationFeature, judgment: { accurate: boolean; note: string | null }): Promise<CalibrationSubmitOutcome> => {
      if (!model) {
        return { status: "error", message: "Calibration data is not ready yet." };
      }

      const draft = buildFounderCrowdPulseCalibrationDraft({ model, accurate: judgment.accurate, note: judgment.note });
      return submitCalibrationFeedback(draft);
    },
    [model]
  );

  const retry = useCallback(() => {
    void Promise.all([partyScoreResult.refresh(true), crowdPulseResult.refresh(true)]);
  }, [crowdPulseResult, partyScoreResult]);

  return (
    <FounderCrowdPulsePanelContent
      loading={viewerContext.loading || partyScoreResult.loading || crowdPulseResult.loading}
      error={partyScoreResult.error || crowdPulseResult.error}
      model={shouldLoad ? model : null}
      onRetry={retry}
      onSubmitCalibration={submitCalibration}
    />
  );
}