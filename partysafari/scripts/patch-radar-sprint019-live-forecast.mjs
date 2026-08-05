import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const selectedHotspotBlock = `  const selectedHotspot = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:selectedHotspot", {
      line: 821,
      filteredLength: filteredHotspots.length,
      selectedHotspotId,
    });
    return filteredHotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  }, [filteredHotspots, selectedHotspotId]);`;

const liveStateBlock = `  const selectedHotspot = useMemo(() => {
    radarTrace("SafariRadarExperience", "memo:selectedHotspot", {
      line: 821,
      filteredLength: filteredHotspots.length,
      selectedHotspotId,
    });
    return filteredHotspots.find((hotspot) => hotspot.id === selectedHotspotId) || null;
  }, [filteredHotspots, selectedHotspotId]);

  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(() => new Date());
  const [forecastPulseDelta, setForecastPulseDelta] = useState(0);
  const previousForecastSignalRef = useRef<{ venueId: string; fingerprint: string; pulse: number } | null>(null);

  useEffect(() => {
    if (!selectedHotspot) return;

    const fingerprint = [
      selectedHotspot.liveCheckins,
      selectedHotspot.activeStories,
      selectedHotspot.currentEvents,
      selectedHotspot.friendsHere,
      selectedHotspot.partyScore.momentum,
      selectedHotspot.crowdPulse.pulseScore,
    ].join(":");
    const previous = previousForecastSignalRef.current;

    if (!previous || previous.venueId !== selectedHotspot.id) {
      previousForecastSignalRef.current = {
        venueId: selectedHotspot.id,
        fingerprint,
        pulse: selectedHotspot.crowdPulse.pulseScore,
      };
      setForecastPulseDelta(0);
      setForecastUpdatedAt(new Date());
      return;
    }

    if (previous.fingerprint !== fingerprint) {
      setForecastPulseDelta(Math.round(selectedHotspot.crowdPulse.pulseScore - previous.pulse));
      setForecastUpdatedAt(new Date());
      previousForecastSignalRef.current = {
        venueId: selectedHotspot.id,
        fingerprint,
        pulse: selectedHotspot.crowdPulse.pulseScore,
      };
    }
  }, [selectedHotspot]);`;

if (!source.includes("previousForecastSignalRef")) {
  if (!source.includes(selectedHotspotBlock)) throw new Error("Selected hotspot anchor was not found.");
  source = source.replace(selectedHotspotBlock, liveStateBlock);
}

const oldFreshness = '<p className="mt-1 text-[10px] text-white/40">Updated just now</p>';
const newFreshness = '<p className="mt-1 text-[10px] text-white/40">Live update · {forecastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>';
if (source.includes(oldFreshness)) source = source.replace(oldFreshness, newFreshness);

const confidenceBadge = '<span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/65">{forecastConfidence(selectedHotspot)}% confidence</span>';
const enhancedConfidence = `<div className="flex items-center gap-2">
                            {forecastPulseDelta !== 0 ? (
                              <span className={\`rounded-full border px-2 py-1 text-[10px] font-bold \${forecastPulseDelta > 0 ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-red-300/30 bg-red-400/10 text-red-100"}\`}>
                                {forecastPulseDelta > 0 ? "+" : ""}{forecastPulseDelta}% live
                              </span>
                            ) : null}
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/65">{forecastConfidence(selectedHotspot)}% confidence</span>
                          </div>`;
if (source.includes(confidenceBadge) && !source.includes("forecastPulseDelta > 0")) {
  source = source.replace(confidenceBadge, enhancedConfidence);
}

const trendingHeading = '<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Why it&apos;s trending</p>';
const liveSignalsPanel = `<div className="mb-3 grid grid-cols-4 gap-2">
                          <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                            <p className="text-sm font-bold text-cyan-100">{selectedHotspot.liveCheckins}</p>
                            <p className="text-[9px] text-white/45">Check-ins</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                            <p className="text-sm font-bold text-fuchsia-100">{selectedHotspot.activeStories}</p>
                            <p className="text-[9px] text-white/45">Stories</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                            <p className="text-sm font-bold text-orange-100">{selectedHotspot.currentEvents}</p>
                            <p className="text-[9px] text-white/45">Events</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                            <p className="text-sm font-bold text-emerald-100">{selectedHotspot.friendsHere}</p>
                            <p className="text-[9px] text-white/45">Friends</p>
                          </div>
                        </div>
                        ${trendingHeading}`;
if (source.includes(trendingHeading) && !source.includes("<p className=\"text-[9px] text-white/45\">Check-ins</p>")) {
  source = source.replace(trendingHeading, liveSignalsPanel);
}

await writeFile(target, source, "utf8");
console.log("Applied Sprint 019 live-reactive Party Forecast updates.");
