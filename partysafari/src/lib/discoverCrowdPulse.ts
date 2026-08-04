import type { CalibrationFeedbackDraft } from "@/lib/calibrationFeedback";
import type { PsiExplanation } from "@/lib/psi";

type CrowdPulseVenueLike = {
  id: string;
  name: string;
  liveCheckins: number;
  storyCount: number;
  currentEvents: number;
  partyScore?: {
    score?: number | null;
    crowdLevel?: string | null;
  } | null;
  psiExplanation?: PsiExplanation | null;
};

export type CrowdPulseCalibrationAnchor = {
  venueId: string;
  label: string;
  displayedPartyScore: number | null;
  displayedPsiLabel: string | null;
  crowdPulseLevel: string | null;
  reasonCodes: string[];
};

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCrowdPulseCalibrationAnchor(
  venues: readonly CrowdPulseVenueLike[]
): CrowdPulseCalibrationAnchor | null {
  const first = venues.find((venue) => typeof venue.id === "string" && venue.id.trim().length > 0);
  if (!first) {
    return null;
  }

  const reasonCodes = (first.psiExplanation?.reasons || [])
    .map((reason) => reason.id)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 10);

  return {
    venueId: first.id,
    label: first.name,
    displayedPartyScore: finiteNumberOrNull(first.partyScore?.score),
    displayedPsiLabel: normalizedTextOrNull(first.psiExplanation?.headline),
    crowdPulseLevel: normalizedTextOrNull(first.partyScore?.crowdLevel),
    reasonCodes,
  };
}

export function createCrowdPulseCalibrationDraft(input: {
  anchor: CrowdPulseCalibrationAnchor;
  accurate: boolean;
  note: string | null;
}): CalibrationFeedbackDraft {
  return {
    feature: "crowdPulse",
    venueId: input.anchor.venueId,
    recommendationCategory: "discover-crowd-pulse",
    displayedPartyScore: input.anchor.displayedPartyScore,
    displayedPsiLabel: input.anchor.displayedPsiLabel,
    crowdPulseLevel: input.anchor.crowdPulseLevel,
    reasonCodes: input.anchor.reasonCodes,
    accurate: input.accurate,
    note: input.note,
  };
}

export function hasMeaningfulCrowdPulseSignals(venues: readonly CrowdPulseVenueLike[]): boolean {
  return venues.some((venue) => venue.liveCheckins > 0 || venue.storyCount > 0 || venue.currentEvents > 0);
}