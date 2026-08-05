import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const helpers = [
  "function estimatedTravelMinutes(distanceMiles: number | null) {",
  "  if (distanceMiles === null || !Number.isFinite(distanceMiles)) return null;",
  "  if (distanceMiles < 0.5) return Math.max(2, Math.round(distanceMiles * 20));",
  "  return Math.max(4, Math.round(3 + distanceMiles * 2.1));",
  "}",
  "",
  "function venueTrendReasons(hotspot: RadarHotspot) {",
  "  const reasons: string[] = [];",
  "  if (hotspot.liveCheckins > 0) reasons.push(`${hotspot.liveCheckins} live check-in${hotspot.liveCheckins === 1 ? \"\" : \"s\"}`);",
  "  if (hotspot.activeStories > 0) reasons.push(`${hotspot.activeStories} active stor${hotspot.activeStories === 1 ? \"y\" : \"ies\"}`);",
  "  if (hotspot.currentEvents > 0) reasons.push(`${hotspot.currentEvents} live event${hotspot.currentEvents === 1 ? \"\" : \"s\"}`);",
  "  if (hotspot.friendsHere > 0) reasons.push(`${hotspot.friendsHere} friend${hotspot.friendsHere === 1 ? \"\" : \"s\"} here`);",
  "  if (hotspot.partyScore.momentum > 0) reasons.push(\"momentum rising\");",
  "  if (reasons.length === 0 && hotspot.openNow) reasons.push(\"open now\");",
  "  if (reasons.length === 0) reasons.push(\"baseline venue activity\");",
  "  return reasons.slice(0, 3);",
  "}",
].join("\n");

if (!source.includes("function estimatedTravelMinutes")) {
  source = source.replace("function formatMiles(distanceMiles: number | null) {", `${helpers}\n\nfunction formatMiles(distanceMiles: number | null) {`);
}

const oldDistance = "                  distanceLabel={formatMiles(selectedHotspot.distanceMiles)}";
const newDistance = "                  distanceLabel={`${formatMiles(selectedHotspot.distanceMiles)}${estimatedTravelMinutes(selectedHotspot.distanceMiles) ? ` · ~${estimatedTravelMinutes(selectedHotspot.distanceMiles)} min` : \"\"}`}";
if (source.includes(oldDistance)) source = source.replace(oldDistance, newDistance);

const oldSupplemental = `                  supplementalContent={
                    <div className="grid grid-cols-3 gap-2">
                      <Link href={\`/venues/\${selectedHotspot.slug}\`} className="rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-center text-sm font-semibold text-white">View Venue</Link>
                      <a
                        href={\`https://www.google.com/maps/dir/?api=1&destination=\${selectedHotspot.latitude},\${selectedHotspot.longitude}\`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-center text-sm font-semibold text-white"
                      >
                        Directions
                      </a>
                      <Link href="/dashboard" className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100">View Stories</Link>
                    </div>
                  }`;

const newSupplemental = `                  supplementalContent={
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-white/15 bg-black/20 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Why it&apos;s trending</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {venueTrendReasons(selectedHotspot).map((reason) => (
                            <span key={reason} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-100">{reason}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Link href={\`/venues/\${selectedHotspot.slug}\`} className="rounded-2xl border border-white/20 bg-white/8 px-3 py-2 text-center text-sm font-semibold text-white">View Venue</Link>
                        <a
                          href={\`https://www.google.com/maps/dir/?api=1&destination=\${selectedHotspot.latitude},\${selectedHotspot.longitude}\`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl border border-orange-300/35 bg-orange-400/18 px-3 py-2 text-center text-sm font-semibold text-orange-100"
                        >
                          Take Me There
                        </a>
                        <Link href="/dashboard" className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100">View Stories</Link>
                      </div>
                    </div>
                  }`;

if (source.includes(oldSupplemental)) source = source.replace(oldSupplemental, newSupplemental);

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar venue intelligence card patch.");
