import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const selectedStatePattern = /(const \[selectedHotspotId, setSelectedHotspotId\] = useState<[^;]+;)/;
if (!source.includes("recommendationReason, setRecommendationReason")) {
  if (!selectedStatePattern.test(source)) {
    throw new Error("Radar selected hotspot state was not found.");
  }
  source = source.replace(
    selectedStatePattern,
    `$1\n  const [recommendationReason, setRecommendationReason] = useState<{ venueId: string; text: string } | null>(null);`,
  );
}

const callbackAnchor = `  const toggleOverlay = useCallback((key: keyof OverlayState) => {`;
const callbackBlock = `  const takeMeToTheParty = useCallback(() => {
    const candidates = hotspots
      .filter((hotspot) => hotspot.distanceMiles === null || hotspot.distanceMiles <= maxDistanceMiles)
      .map((hotspot) => ({
        hotspot,
        recommendationScore:
          hotspot.crowdPulse.pulseScore +
          Math.min(18, hotspot.liveCheckins * 3) +
          Math.min(12, hotspot.activeStories * 2) +
          Math.min(14, hotspot.currentEvents * 4) +
          Math.min(10, hotspot.friendsHere * 5) +
          (hotspot.openNow ? 8 : -20) -
          Math.min(18, hotspot.distanceMiles || 0) * 0.35,
      }))
      .sort((left, right) => right.recommendationScore - left.recommendationScore);

    const winner = candidates[0]?.hotspot;
    if (!winner) {
      setRecommendationReason(null);
      setGeoError("No matching party destination is available yet. Try expanding the radius or changing filters.");
      return;
    }

    const reasons: string[] = [];
    if (winner.openNow) reasons.push("open now");
    if (winner.liveCheckins > 0) reasons.push(\`\${winner.liveCheckins} live check-in\${winner.liveCheckins === 1 ? "" : "s"}\`);
    if (winner.activeStories > 0) reasons.push(\`\${winner.activeStories} active stor\${winner.activeStories === 1 ? "y" : "ies"}\`);
    if (winner.currentEvents > 0) reasons.push(\`\${winner.currentEvents} active event\${winner.currentEvents === 1 ? "" : "s"}\`);
    if (winner.friendsHere > 0) reasons.push(\`\${winner.friendsHere} friend\${winner.friendsHere === 1 ? "" : "s"} here\`);
    if (winner.partyScore.momentum > 0) reasons.push("momentum is rising");

    const distanceText = winner.distanceMiles === null ? "within the selected area" : \`\${Math.round(winner.distanceMiles)} miles away\`;
    const reasonText = reasons.length > 0
      ? \`Radar chose \${winner.name} because it is \${reasons.slice(0, 3).join(", ")} and \${distanceText}.\`
      : \`Live activity is limited right now, so Radar chose \${winner.name} as the strongest available nightlife match \${distanceText} based on venue type, open status, Party Pulse, and distance.\`;

    setGeoError(null);
    setViewMode("map");
    openHotspot(winner);
    setRecommendationReason({ venueId: winner.id, text: reasonText });
  }, [hotspots, maxDistanceMiles, openHotspot]);

${callbackAnchor}`;

const oldCallbackStart = `  const takeMeToTheParty = useCallback(() => {`;
if (source.includes(oldCallbackStart)) {
  const start = source.indexOf(oldCallbackStart);
  const endMarker = `\n\n  const toggleOverlay = useCallback((key: keyof OverlayState) => {`;
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error("Existing Take Me to the Party callback end was not found.");
  source = source.slice(0, start) + callbackBlock + source.slice(end + 2 + callbackAnchor.length);
} else {
  if (!source.includes(callbackAnchor)) throw new Error("Radar toggleOverlay callback anchor was not found.");
  source = source.replace(callbackAnchor, callbackBlock);
}

const mapSectionAnchor = `      <section className="relative z-10 mx-auto w-full max-w-7xl px-2 md:px-4">`;
const recommendationCta = `      <section className="relative z-20 mx-auto w-full max-w-7xl px-4 pb-3 md:px-6">
        <button
          type="button"
          onClick={takeMeToTheParty}
          disabled={hotspots.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/35 bg-gradient-to-r from-fuchsia-500/25 via-orange-400/20 to-cyan-400/20 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_40px_rgba(217,70,239,0.16)] transition hover:border-fuchsia-200/60 hover:from-fuchsia-500/35 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-full sm:px-5 sm:py-2.5"
        >
          <span aria-hidden="true">🔥</span>
          Take Me to the Party
          <span className="text-xs font-medium text-white/60">Best nearby match</span>
        </button>
        {recommendationReason && recommendationReason.venueId === selectedHotspotId ? (
          <div className="mt-2 rounded-2xl border border-fuchsia-300/20 bg-black/45 px-4 py-3 text-sm text-white/75 backdrop-blur-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200">Why this venue</p>
            <p className="mt-1 leading-relaxed">{recommendationReason.text}</p>
          </div>
        ) : null}
      </section>

${mapSectionAnchor}`;

const existingCtaStart = `      <section className="relative z-20 mx-auto flex w-full max-w-7xl px-4 pb-3 md:px-6">\n        <button\n          type="button"\n          onClick={takeMeToTheParty}`;
if (source.includes(existingCtaStart)) {
  const start = source.indexOf(existingCtaStart);
  const end = source.indexOf(mapSectionAnchor, start);
  if (end === -1) throw new Error("Existing recommendation CTA end was not found.");
  source = source.slice(0, start) + recommendationCta + source.slice(end + mapSectionAnchor.length);
} else if (!source.includes("Why this venue")) {
  if (!source.includes(mapSectionAnchor)) throw new Error("Radar map section anchor was not found.");
  source = source.replace(mapSectionAnchor, recommendationCta);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar Take Me to the Party explanation flow.");
