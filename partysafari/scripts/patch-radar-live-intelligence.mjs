import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const helpers = `
function momentumGlyph(momentum: number) {
  if (momentum >= 8) return "↑";
  if (momentum >= 2) return "↗";
  if (momentum <= -8) return "↓";
  if (momentum <= -2) return "↘";
  return "•";
}

function hasLiveVenueSignal(hotspot: RadarHotspot) {
  return hotspot.liveCheckins > 0 || hotspot.activeStories > 0 || hotspot.currentEvents > 0 || hotspot.friendsHere > 0;
}
`;

if (!source.includes("function momentumGlyph")) {
  source = source.replace("function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {", `${helpers}\nfunction createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {`);
}

source = source.replace(
  'html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span class="radar-hotspot-icon">${venueCategoryIcon(hotspot.venueType)}</span><span class="radar-hotspot-score">${score}</span></button>`,',
  'html: `<button class="${style.className}${selected ? " selected" : ""}${hasLiveVenueSignal(hotspot) ? " live-signal" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span class="radar-hotspot-momentum">${momentumGlyph(hotspot.partyScore.momentum)}</span><span class="radar-hotspot-icon">${venueCategoryIcon(hotspot.venueType)}</span><span class="radar-hotspot-score">${score}</span></button>`,',
);

source = source.replace(
  '<span className="mt-1 block font-semibold">{hotspot.tier} · Pulse {Math.round(Math.max(hotspot.crowdPulse.pulseScore, baselineVenuePulse(hotspot)))}</span>',
  '<span className="mt-1 block font-semibold">{hotspot.tier} · Pulse {Math.round(Math.max(hotspot.crowdPulse.pulseScore, baselineVenuePulse(hotspot)))} {momentumGlyph(hotspot.partyScore.momentum)}</span><span className="mt-1 block opacity-75">{hotspot.liveCheckins} here · {hotspot.activeStories} stories · {hotspot.currentEvents} events</span>',
);

const styles = `
        .radar-hotspot-momentum {
          position: absolute;
          right: -3px;
          top: -5px;
          display: grid;
          width: 16px;
          height: 16px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.55);
          border-radius: 9999px;
          background: rgba(5,6,13,.9);
          font-size: 10px !important;
          line-height: 1 !important;
        }

        .radar-hotspot.live-signal {
          box-shadow: 0 0 0 3px rgba(34,211,238,.22), 0 0 28px rgba(34,211,238,.5), 0 12px 28px rgba(0,0,0,.45);
        }

        .radar-hotspot.live-signal::before {
          content: "";
          position: absolute;
          inset: -5px;
          border: 2px solid rgba(34,211,238,.55);
          border-radius: inherit;
          animation: radar-live-signal 1.8s ease-out infinite;
        }

        @keyframes radar-live-signal {
          0% { transform: scale(.88); opacity: .9; }
          100% { transform: scale(1.35); opacity: 0; }
        }
`;

if (!source.includes(".radar-hotspot-momentum")) {
  source = source.replace("        .radar-hotspot-icon {", `${styles}\n        .radar-hotspot-icon {`);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar live intelligence patch.");
