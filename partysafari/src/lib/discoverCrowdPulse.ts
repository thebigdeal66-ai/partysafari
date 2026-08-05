import type { CalibrationFeedbackDraft } from "@/lib/calibrationFeedback";
import { clamp, type PartyScoreTrend } from "@/lib/partyScore";
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

export type CrowdPulseSnapshot = {
  pulseScore: number;
  trendDirection: PartyScoreTrend;
  trendLabel: "Rising Fast" | "Building" | "Stable" | "Cooling" | "Emptying";
  momentum: number;
  confidenceScore: number;
  confidenceBand: "High" | "Medium" | "Low";
  stateLabel: string;
  energyLabel: "Low" | "Medium" | "High" | "Exploding";
  partyScore: number;
  source: "live" | "demo";
  activity: {
    checkins: number;
    stories: number;
    events: number;
    friends: number;
    lit: number;
    total: number;
  };
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

function finiteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function stateFromScore(score: number) {
  if (score >= 86) {
    return "Peak Pulse";
  }
  if (score >= 70) {
    return "High Pulse";
  }
  if (score >= 50) {
    return "Building Pulse";
  }
  if (score >= 30) {
    return "Early Pulse";
  }
  return "Low Pulse";
}

function trendLabel(trend: PartyScoreTrend, momentum: number): CrowdPulseSnapshot["trendLabel"] {
  if (trend === "up") {
    return momentum >= 8 ? "Rising Fast" : "Building";
  }
  if (trend === "down") {
    return momentum <= -8 ? "Emptying" : "Cooling";
  }
  return "Stable";
}

function confidenceBand(score: number): CrowdPulseSnapshot["confidenceBand"] {
  if (score >= 74) {
    return "High";
  }
  if (score >= 45) {
    return "Medium";
  }
  return "Low";
}

function energyLabel(score: number): CrowdPulseSnapshot["energyLabel"] {
  if (score >= 86) {
    return "Exploding";
  }
  if (score >= 66) {
    return "High";
  }
  if (score >= 42) {
    return "Medium";
  }
  return "Low";
}

export function buildCrowdPulseSnapshot(input: {
  partyScore?: {
    score?: number | null;
    trend?: PartyScoreTrend | null;
    momentum?: number | null;
    confidence?: number | null;
    crowdLevel?: string | null;
  } | null;
  liveCheckins?: number | null;
  storyCount?: number | null;
  currentEvents?: number | null;
  friendsHere?: number | null;
  litSignals?: number | null;
}): CrowdPulseSnapshot {
  const checkins = finiteCount(input.liveCheckins);
  const stories = finiteCount(input.storyCount);
  const events = finiteCount(input.currentEvents);
  const friends = finiteCount(input.friendsHere);
  const lit = finiteCount(input.litSignals);
  const total = checkins + stories + events + friends + lit;

  const weightedDemo = clamp(Math.round(checkins * 9 + stories * 7 + events * 14 + friends * 10 + lit * 11), 0, 100);
  const partyScore = finiteNumberOrNull(input.partyScore?.score) ?? 0;
  const pulseScore = partyScore > 0 ? partyScore : total > 0 ? weightedDemo : 22;

  const confidenceFromParty = finiteNumberOrNull(input.partyScore?.confidence);
  const signalKinds = [checkins, stories, events, friends, lit].filter((value) => value > 0).length;
  const confidenceScore = confidenceFromParty !== null
    ? clamp(Math.round(confidenceFromParty * 100), 0, 100)
    : clamp(Math.round((signalKinds / 5) * 55 + Math.min(total, 10) * 4 + (partyScore > 0 ? 15 : 0)), 15, 99);

  const momentum = finiteNumberOrNull(input.partyScore?.momentum) ?? 0;
  const trendDirection: PartyScoreTrend = input.partyScore?.trend || (momentum > 0 ? "up" : momentum < 0 ? "down" : "stable");
  const level = normalizedTextOrNull(input.partyScore?.crowdLevel);

  return {
    pulseScore,
    trendDirection,
    trendLabel: trendLabel(trendDirection, momentum),
    momentum,
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore),
    stateLabel: level || stateFromScore(pulseScore),
    energyLabel: energyLabel(pulseScore),
    partyScore,
    source: partyScore > 0 || total > 0 ? "live" : "demo",
    activity: {
      checkins,
      stories,
      events,
      friends,
      lit,
      total,
    },
  };
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