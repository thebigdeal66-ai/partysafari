import fs from "node:fs";
import path from "node:path";

const radarPath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
const cssPath = path.resolve("src/app/globals.css");
let source = fs.readFileSync(radarPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

if (!source.includes("storyRingClass")) {
  const replacement = `function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {\n  const style = toTierStyle(hotspot.tier);\n  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));\n  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));\n  const storyCount = Math.max(0, Math.round(hotspot.activeStories));\n  const storyRingClass = storyCount >= 8\n    ? " story-ring story-ring-trending"\n    : storyCount >= 3\n      ? " story-ring story-ring-active"\n      : storyCount > 0\n        ? " story-ring story-ring-recent"\n        : "";\n  const storyBadge = storyCount > 0\n    ? \`<span class="radar-story-count" aria-label="\${storyCount} active stories">\${storyCount > 99 ? "99+" : storyCount}</span>\`\n    : "";\n  return L.divIcon({\n    className: "",\n    html: \`<button class="\${style.className}\${selected ? " selected" : ""}\${storyRingClass}" style="width:\${radius * 2}px;height:\${radius * 2}px"><span>\${score}</span>\${storyBadge}</button>\`,\n    iconSize: [radius * 2 + (storyCount > 0 ? 8 : 0), radius * 2 + (storyCount > 0 ? 8 : 0)],\n    iconAnchor: [radius, radius],\n  });\n}`;

  const hotspotFunctionPattern = /function createHotspotIcon\(hotspot: RadarHotspot, selected: boolean\) \{[\s\S]*?\n\}\n\nfunction createClusterIcon/;
  if (!hotspotFunctionPattern.test(source)) {
    throw new Error("Could not locate createHotspotIcon for story-ring patch.");
  }
  source = source.replace(hotspotFunctionPattern, `${replacement}\n\nfunction createClusterIcon`);
  fs.writeFileSync(radarPath, source);
}

if (!css.includes("/* Radar venue story rings */")) {
  css += `\n\n/* Radar venue story rings */\n.radar-hotspot.story-ring {\n  position: relative;\n  isolation: isolate;\n}\n\n.radar-hotspot.story-ring::before {\n  content: "";\n  position: absolute;\n  inset: -5px;\n  z-index: -1;\n  border-radius: 999px;\n  border: 3px solid var(--story-ring-color, #38bdf8);\n  box-shadow: 0 0 18px color-mix(in srgb, var(--story-ring-color, #38bdf8) 72%, transparent);\n}\n\n.radar-hotspot.story-ring-recent { --story-ring-color: #38bdf8; }\n.radar-hotspot.story-ring-active { --story-ring-color: #f97316; }\n.radar-hotspot.story-ring-trending { --story-ring-color: #d946ef; }\n\n.radar-hotspot.story-ring-active::before,\n.radar-hotspot.story-ring-trending::before {\n  animation: radar-story-ring-pulse 2.2s ease-in-out infinite;\n}\n\n.radar-story-count {\n  position: absolute;\n  top: -9px;\n  right: -9px;\n  display: grid;\n  min-width: 20px;\n  height: 20px;\n  place-items: center;\n  border: 2px solid #080812;\n  border-radius: 999px;\n  background: #d946ef;\n  padding: 0 4px;\n  color: white;\n  font-size: 10px;\n  font-weight: 800;\n  line-height: 1;\n  box-shadow: 0 0 14px rgba(217, 70, 239, 0.6);\n}\n\n@keyframes radar-story-ring-pulse {\n  0%, 100% { transform: scale(1); opacity: 0.78; }\n  50% { transform: scale(1.08); opacity: 1; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .radar-hotspot.story-ring-active::before,\n  .radar-hotspot.story-ring-trending::before { animation: none; }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log("Applied live venue story rings to Safari Radar markers.");
