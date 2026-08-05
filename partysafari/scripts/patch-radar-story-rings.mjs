import fs from "node:fs";
import path from "node:path";

const radarPath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
const cssPath = path.resolve("src/app/globals.css");
let source = fs.readFileSync(radarPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

if (!source.includes("storyRingClass")) {
  const start = source.indexOf("function createHotspotIcon(");
  const end = source.indexOf("\nfunction createClusterIcon", start);

  if (start < 0 || end < 0) {
    throw new Error("Could not locate createHotspotIcon for story-ring patch.");
  }

  const replacement = [
    "function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {",
    "  const style = toTierStyle(hotspot.tier);",
    "  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));",
    "  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));",
    "  const storyCount = Math.max(0, Math.round(hotspot.activeStories));",
    "  const storyRingClass = storyCount >= 8",
    "    ? \" story-ring story-ring-trending\"",
    "    : storyCount >= 3",
    "      ? \" story-ring story-ring-active\"",
    "      : storyCount > 0",
    "        ? \" story-ring story-ring-recent\"",
    "        : \"\";",
    "  const storyBadge = storyCount > 0",
    "    ? '<span class=\"radar-story-count\" aria-label=\"' + storyCount + ' active stories\">' + (storyCount > 99 ? \"99+\" : storyCount) + \"</span>\"",
    "    : \"\";",
    "  const size = radius * 2;",
    "  const html = '<button class=\"' + style.className + (selected ? \" selected\" : \"\") + storyRingClass + '\" style=\"width:' + size + 'px;height:' + size + 'px\"><span>' + score + \"</span>\" + storyBadge + \"</button>\";",
    "  return L.divIcon({",
    "    className: \"\",",
    "    html,",
    "    iconSize: [size + (storyCount > 0 ? 8 : 0), size + (storyCount > 0 ? 8 : 0)],",
    "    iconAnchor: [radius, radius],",
    "  });",
    "}",
  ].join("\n");

  source = source.slice(0, start) + replacement + source.slice(end);
  fs.writeFileSync(radarPath, source);
}

if (!css.includes("/* Radar venue story rings */")) {
  css += `

/* Radar venue story rings */
.radar-hotspot.story-ring {
  position: relative;
  isolation: isolate;
}

.radar-hotspot.story-ring::before {
  content: "";
  position: absolute;
  inset: -5px;
  z-index: -1;
  border-radius: 999px;
  border: 3px solid var(--story-ring-color, #38bdf8);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.55);
}

.radar-hotspot.story-ring-recent { --story-ring-color: #38bdf8; }
.radar-hotspot.story-ring-active { --story-ring-color: #f97316; }
.radar-hotspot.story-ring-trending { --story-ring-color: #d946ef; }

.radar-hotspot.story-ring-active::before,
.radar-hotspot.story-ring-trending::before {
  animation: radar-story-ring-pulse 2.2s ease-in-out infinite;
}

.radar-story-count {
  position: absolute;
  top: -9px;
  right: -9px;
  display: grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border: 2px solid #080812;
  border-radius: 999px;
  background: #d946ef;
  padding: 0 4px;
  color: white;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 0 14px rgba(217, 70, 239, 0.6);
}

@keyframes radar-story-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.78; }
  50% { transform: scale(1.08); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .radar-hotspot.story-ring-active::before,
  .radar-hotspot.story-ring-trending::before { animation: none; }
}
`;
  fs.writeFileSync(cssPath, css);
}

console.log("Applied live venue story rings to Safari Radar markers.");
