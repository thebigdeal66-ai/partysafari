import type { CrowdPulseSnapshot } from "@/lib/discoverCrowdPulse";

export type CrowdPulseTone = "quiet" | "building" | "busy" | "packed" | "exploding";

export function getCrowdPulseTone(score: number): CrowdPulseTone {
  if (score >= 86) {
    return "exploding";
  }
  if (score >= 68) {
    return "packed";
  }
  if (score >= 48) {
    return "busy";
  }
  if (score >= 28) {
    return "building";
  }
  return "quiet";
}

export function getCrowdPulseToneClasses(score: number) {
  const tone = getCrowdPulseTone(score);

  switch (tone) {
    case "exploding":
      return {
        tone,
        glowClass: "shadow-[0_0_0_1px_rgba(248,113,113,0.2),0_20px_60px_rgba(220,38,38,0.28)]",
        borderClass: "border-rose-300/30",
        meterClass: "from-orange-400 via-rose-500 to-red-500",
        chipClass: "border-rose-300/30 bg-rose-500/12 text-rose-100",
        markerClass: "radar-hotspot legendary",
        haloColor: "#ef4444",
      };
    case "packed":
      return {
        tone,
        glowClass: "shadow-[0_0_0_1px_rgba(251,146,60,0.2),0_20px_60px_rgba(249,115,22,0.24)]",
        borderClass: "border-orange-300/28",
        meterClass: "from-yellow-300 via-orange-400 to-orange-500",
        chipClass: "border-orange-300/30 bg-orange-500/12 text-orange-100",
        markerClass: "radar-hotspot hot",
        haloColor: "#f97316",
      };
    case "busy":
      return {
        tone,
        glowClass: "shadow-[0_0_0_1px_rgba(253,224,71,0.18),0_18px_54px_rgba(202,138,4,0.22)]",
        borderClass: "border-yellow-300/25",
        meterClass: "from-lime-300 via-yellow-300 to-amber-400",
        chipClass: "border-yellow-300/30 bg-yellow-400/12 text-yellow-100",
        markerClass: "radar-hotspot busy",
        haloColor: "#facc15",
      };
    case "building":
      return {
        tone,
        glowClass: "shadow-[0_0_0_1px_rgba(134,239,172,0.16),0_18px_50px_rgba(34,197,94,0.2)]",
        borderClass: "border-emerald-300/22",
        meterClass: "from-cyan-300 via-emerald-300 to-green-400",
        chipClass: "border-emerald-300/30 bg-emerald-500/12 text-emerald-100",
        markerClass: "radar-hotspot active",
        haloColor: "#22c55e",
      };
    default:
      return {
        tone,
        glowClass: "shadow-[0_0_0_1px_rgba(125,211,252,0.14),0_18px_48px_rgba(14,165,233,0.18)]",
        borderClass: "border-sky-300/20",
        meterClass: "from-sky-300 via-cyan-400 to-blue-500",
        chipClass: "border-sky-300/25 bg-sky-500/10 text-sky-100",
        markerClass: "radar-hotspot quiet",
        haloColor: "#38bdf8",
      };
  }
}

export function getVenueStatusLabel(input: { openNow: boolean; currentStatus?: string | null }) {
  const normalized = (input.currentStatus || "").toLowerCase();
  if (!input.openNow || normalized.includes("closed")) {
    return "Closed";
  }
  if (normalized.includes("closing")) {
    return "Closing Soon";
  }
  return "Open";
}

const VIBE_LABELS: Record<string, string> = {
  hip_hop: "Hip Hop",
  hiphop: "Hip Hop",
  edm: "EDM",
  electronic: "EDM",
  country: "Country",
  latin: "Latin",
  reggaeton: "Latin",
  college: "College Crowd",
  college_bar: "College Crowd",
  young_professionals: "Young Professionals",
  professionals: "Young Professionals",
  tourist: "Tourists",
  tourists: "Tourists",
  locals: "Locals",
  sports: "Sports Crowd",
  sports_bar: "Sports Crowd",
  dj: "EDM",
  live_music: "Live Music",
  karaoke: "College Crowd",
  band: "Live Music",
};

export function resolveCurrentVibe(input: {
  musicGenres?: string[] | null;
  liveEventTypes?: string[] | null;
  venueType?: string | null;
}): string | null {
  const candidates = [
    ...(input.musicGenres || []),
    ...(input.liveEventTypes || []),
    input.venueType || "",
  ];

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized) {
      continue;
    }
    if (VIBE_LABELS[normalized]) {
      return VIBE_LABELS[normalized];
    }
    if (normalized.includes("hip")) {
      return "Hip Hop";
    }
    if (normalized.includes("latin")) {
      return "Latin";
    }
    if (normalized.includes("country")) {
      return "Country";
    }
    if (normalized.includes("edm") || normalized.includes("electronic")) {
      return "EDM";
    }
  }

  return null;
}

export function getTrendArrow(label: CrowdPulseSnapshot["trendLabel"]) {
  switch (label) {
    case "Rising Fast":
      return "⬆";
    case "Building":
      return "↗";
    case "Cooling":
      return "↘";
    case "Emptying":
      return "⬇";
    default:
      return "➡";
  }
}
