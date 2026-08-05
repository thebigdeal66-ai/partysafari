import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

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
      setGeoError("No matching party destination is available yet. Try expanding the radius or changing filters.");
      return;
    }

    setGeoError(null);
    setViewMode("map");
    openHotspot(winner);
  }, [hotspots, maxDistanceMiles, openHotspot]);

${callbackAnchor}`;

if (!source.includes("const takeMeToTheParty = useCallback")) {
  if (!source.includes(callbackAnchor)) {
    throw new Error("Radar toggleOverlay callback anchor was not found.");
  }
  source = source.replace(callbackAnchor, callbackBlock);
}

const mapSectionAnchor = `      <section className="relative z-10 mx-auto w-full max-w-7xl px-2 md:px-4">`;
const recommendationCta = `      <section className="relative z-20 mx-auto flex w-full max-w-7xl px-4 pb-3 md:px-6">
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
      </section>

${mapSectionAnchor}`;

if (!source.includes("onClick={takeMeToTheParty}")) {
  if (!source.includes(mapSectionAnchor)) {
    throw new Error("Radar map section anchor was not found.");
  }
  source = source.replace(mapSectionAnchor, recommendationCta);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar Take Me to the Party flow.");
