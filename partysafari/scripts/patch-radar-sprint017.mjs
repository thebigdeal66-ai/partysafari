import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const helperAnchor = "function estimatedTravelMinutes(distanceMiles: number | null) {";
const forecastHelpers = [
  "type PartyForecastSlot = { time: string; label: string; score: number };",
  "",
  "function recommendationConfidence(hotspot: RadarHotspot) {",
  "  const liveSignals = hotspot.liveCheckins + hotspot.activeStories + hotspot.currentEvents + hotspot.friendsHere;",
  "  const signalStrength = Math.min(28, liveSignals * 4);",
  "  const pulseStrength = Math.min(34, hotspot.crowdPulse.pulseScore * 0.34);",
  "  const momentumStrength = Math.min(16, Math.max(0, hotspot.partyScore.momentum) * 1.5);",
  "  const availabilityStrength = hotspot.openNow ? 12 : 2;",
  "  const distanceStrength = hotspot.distanceMiles === null ? 5 : Math.max(0, 10 - hotspot.distanceMiles * 0.25);",
  "  return Math.max(42, Math.min(96, Math.round(18 + signalStrength + pulseStrength + momentumStrength + availabilityStrength + distanceStrength)));",
  "}",
  "",
  "function buildPartyForecast(hotspot: RadarHotspot): PartyForecastSlot[] {",
  "  const now = new Date();",
  "  const baseHour = now.getHours();",
  "  const baseScore = hotspot.crowdPulse.pulseScore;",
  "  const momentum = Math.max(-8, Math.min(12, hotspot.partyScore.momentum));",
  "  const eventLift = hotspot.currentEvents > 0 ? 10 : 0;",
  "  const liveLift = Math.min(12, hotspot.liveCheckins * 2 + hotspot.activeStories);",
  "  const labels = [\"Now\", \"Building\", \"Expected peak\", \"Late night\"];",
  "  return [0, 1, 2, 3].map((step) => {",
  "    const forecastTime = new Date(now);",
  "    forecastTime.setHours(baseHour + step * 2, 0, 0, 0);",
  "    const curveLift = step === 0 ? 0 : step === 1 ? 7 : step === 2 ? 14 : 6;",
  "    const score = Math.max(5, Math.min(100, Math.round(baseScore + curveLift + eventLift + liveLift + momentum * step * 0.7)));",
  "    return {",
  "      time: step === 0 ? \"Now\" : forecastTime.toLocaleTimeString([], { hour: \"numeric\" }),",
  "      label: labels[step],",
  "      score,",
  "    };",
  "  });",
  "}",
  "",
].join("\n");

if (!source.includes("function buildPartyForecast")) {
  if (!source.includes(helperAnchor)) throw new Error("Venue intelligence helper anchor not found.");
  source = source.replace(helperAnchor, forecastHelpers + helperAnchor);
}

const reasonStateNeedle = "const [recommendationReason, setRecommendationReason] = useState<{ venueId: string; text: string } | null>(null);";
if (source.includes(reasonStateNeedle) && !source.includes("recommendationMatch, setRecommendationMatch")) {
  source = source.replace(reasonStateNeedle, reasonStateNeedle + "\n  const [recommendationMatch, setRecommendationMatch] = useState<{ venueId: string; confidence: number } | null>(null);");
}

const setReasonNeedle = "setRecommendationReason({ venueId: winner.id, text: reasonText });";
if (source.includes(setReasonNeedle) && !source.includes("setRecommendationMatch({ venueId: winner.id")) {
  source = source.replace(setReasonNeedle, setReasonNeedle + "\n    setRecommendationMatch({ venueId: winner.id, confidence: recommendationConfidence(winner) });");
}

const reasonHeading = '<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200">Why this venue</p>';
if (source.includes(reasonHeading) && !source.includes("Match confidence")) {
  source = source.replace(
    reasonHeading,
    reasonHeading + '\n            {recommendationMatch && recommendationMatch.venueId === selectedHotspotId ? (\n              <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">\n                <span className="text-xs font-semibold text-white/65">Match confidence</span>\n                <span className="text-sm font-bold text-cyan-200">{recommendationMatch.confidence}%</span>\n              </div>\n            ) : null}'
  );
}

const trendingBlock = '<div className="rounded-2xl border border-white/15 bg-black/20 p-3">\n                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Why it&apos;s trending</p>';
if (source.includes(trendingBlock) && !source.includes("Tonight&apos;s forecast")) {
  const forecastBlock = [
    '<div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-3">',
    '                        <div className="flex items-center justify-between">',
    '                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Tonight&apos;s forecast</p>',
    '                          <span className="text-[10px] text-white/45">Early estimate</span>',
    '                        </div>',
    '                        <div className="mt-3 grid grid-cols-4 gap-2">',
    '                          {buildPartyForecast(selectedHotspot).map((slot) => (',
    '                            <div key={`${slot.time}-${slot.label}`} className="rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-center">',
    '                              <p className="text-[10px] font-semibold text-white/55">{slot.time}</p>',
    '                              <p className="mt-1 text-sm font-bold text-white">{slot.score}</p>',
    '                              <p className="mt-1 truncate text-[9px] text-white/45">{slot.label}</p>',
    '                            </div>',
    '                          ))}',
    '                        </div>',
    '                      </div>',
    '                      ',
  ].join("\n");
  source = source.replace(trendingBlock, forecastBlock + trendingBlock);
}

await writeFile(target, source, "utf8");
console.log("Applied Sprint 017 recommendation confidence and Party Forecast.");
