import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const start = source.indexOf("function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {");
const end = source.indexOf("function createClusterIcon(hotspots: RadarHotspot[]) {", start);

if (start === -1 || end === -1) {
  throw new Error("Could not locate final Radar hotspot icon function.");
}

const markerFunction = `function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {
  const style = toTierStyle(hotspot.tier);
  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));
  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));
  return L.divIcon({
    className: "",
    html: \`<button class="\${style.className}\${selected ? " selected" : ""}" style="width:\${radius * 2}px;height:\${radius * 2}px" aria-label="\${hotspot.name}"><span class="radar-hotspot-icon" aria-hidden="true">\${venueCategoryIcon(hotspot.venueType)}</span></button>\`,
    iconSize: [radius * 2, radius * 2],
    iconAnchor: [radius, radius],
  });
}

`;

source = source.slice(0, start) + markerFunction + source.slice(end);

await writeFile(target, source, "utf8");
console.log("Enforced final Safari Radar venue marker identity.");
