import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const helperStart = "function buildPartyForecast(hotspot: RadarHotspot): PartyForecastSlot[] {";
const helperEnd = "\nfunction estimatedTravelMinutes(distanceMiles: number | null) {";
const helperIndex = source.indexOf(helperStart);
const helperEndIndex = source.indexOf(helperEnd, helperIndex);
if (helperIndex === -1 || helperEndIndex === -1) throw new Error("Sprint 017 forecast helper was not found.");

const upgradedHelpers = `function forecastEnergy(score: number) {
  if (score >= 82) return { label: "Hot", accent: "border-red-300/40 bg-red-400/12 text-red-100" };
  if (score >= 62) return { label: "Busy", accent: "border-orange-300/40 bg-orange-400/12 text-orange-100" };
  if (score >= 38) return { label: "Building", accent: "border-yellow-300/35 bg-yellow-400/10 text-yellow-100" };
  return { label: "Quiet", accent: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100" };
}

function forecastConfidence(hotspot: RadarHotspot) {
  const signals = hotspot.liveCheckins + hotspot.activeStories + hotspot.currentEvents + hotspot.friendsHere;
  const freshness = Math.min(24, signals * 4);
  const pulse = Math.min(28, hotspot.crowdPulse.pulseScore * 0.28);
  const momentum = Math.min(18, Math.abs(hotspot.partyScore.momentum) * 1.4);
  const eventBoost = hotspot.currentEvents > 0 ? 12 : 0;
  return Math.max(38, Math.min(94, Math.round(24 + freshness + pulse + momentum + eventBoost)));
}

function buildPartyForecast(hotspot: RadarHotspot): PartyForecastSlot[] {
  const now = new Date();
  const baseScore = hotspot.crowdPulse.pulseScore;
  const momentum = Math.max(-8, Math.min(12, hotspot.partyScore.momentum));
  const eventLift = hotspot.currentEvents > 0 ? 10 : 0;
  const liveLift = Math.min(12, hotspot.liveCheckins * 2 + hotspot.activeStories);
  const currentHour = now.getHours();
  const eveningStart = currentHour < 18 ? 18 : currentHour;
  const peakHour = currentHour >= 23 ? currentHour + 1 : Math.max(21, eveningStart + 2);
  const lateHour = Math.max(peakHour + 2, 24);
  const hours = [currentHour, eveningStart + 1, peakHour, lateHour];
  const labels = ["Now", "Building", "Expected peak", "Late night"];
  return hours.map((hour, step) => {
    const forecastTime = new Date(now);
    forecastTime.setHours(hour, 0, 0, 0);
    const curveLift = step === 0 ? 0 : step === 1 ? 8 : step === 2 ? 18 : 7;
    const score = Math.max(5, Math.min(100, Math.round(baseScore + curveLift + eventLift + liveLift + momentum * step * 0.7)));
    return {
      time: step === 0 ? "Now" : forecastTime.toLocaleTimeString([], { hour: "numeric" }),
      label: labels[step],
      score,
    };
  });
}
`;
source = source.slice(0, helperIndex) + upgradedHelpers + source.slice(helperEndIndex + 1);

const oldHeader = [
  '<div className="flex items-center justify-between">',
  '                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Tonight&apos;s forecast</p>',
  '                          <span className="text-[10px] text-white/45">Early estimate</span>',
  '                        </div>',
].join("\n");
const newHeader = [
  '<div className="flex items-center justify-between gap-3">',
  '                          <div>',
  '                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Tonight&apos;s forecast</p>',
  '                            <p className="mt-1 text-[10px] text-white/40">Updated just now</p>',
  '                          </div>',
  '                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/65">{forecastConfidence(selectedHotspot)}% confidence</span>',
  '                        </div>',
].join("\n");
if (!source.includes(oldHeader)) throw new Error("Forecast header anchor was not found.");
source = source.replace(oldHeader, newHeader);

const oldCards = [
  '{buildPartyForecast(selectedHotspot).map((slot) => (',
  '                            <div key={`${slot.time}-${slot.label}`} className="rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-center">',
  '                              <p className="text-[10px] font-semibold text-white/55">{slot.time}</p>',
  '                              <p className="mt-1 text-sm font-bold text-white">{slot.score}</p>',
  '                              <p className="mt-1 truncate text-[9px] text-white/45">{slot.label}</p>',
  '                            </div>',
  '                          ))}',
].join("\n");
const newCards = [
  '{buildPartyForecast(selectedHotspot).map((slot) => {',
  '                            const energy = forecastEnergy(slot.score);',
  '                            const isPeak = slot.label === "Expected peak";',
  '                            return (',
  '                              <div key={`${slot.time}-${slot.label}`} className={`relative rounded-xl border px-2 py-2 text-center ${energy.accent} ${isPeak ? "shadow-[0_0_24px_rgba(217,70,239,0.28)] ring-1 ring-fuchsia-300/35" : ""}`}>',
  '                                {isPeak ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">Peak</span> : null}',
  '                                <p className="text-[10px] font-semibold opacity-70">{slot.time}</p>',
  '                                <p className="mt-1 text-sm font-bold">{slot.score}%</p>',
  '                                <p className="mt-1 truncate text-[9px] opacity-70">{energy.label}</p>',
  '                              </div>',
  '                            );',
  '                          })}',
].join("\n");
if (!source.includes(oldCards)) throw new Error("Forecast card anchor was not found.");
source = source.replace(oldCards, newCards);

await writeFile(target, source, "utf8");
console.log("Applied Sprint 018 time-aware Party Forecast polish.");
