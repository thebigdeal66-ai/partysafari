import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

const markerSetup = '  const trendBadge = trending ? `<span class="radar-trending-badge">TRENDING</span>` : "";';
if (source.includes(markerSetup) && !source.includes("const crewBadge")) {
  source = source.replace(
    markerSetup,
    `${markerSetup}\n  const crewBadge = hotspot.friendsHere > 0\n    ? \`<span class="radar-crew-badge">🧭 \${hotspot.friendsHere}</span>\`\n    : "";`
  );
}

const markerHtml = '    html: `<button class="${style.className}${selected ? " selected" : ""}${trendClass}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span>${trendBadge}</button>`,';
if (source.includes(markerHtml) && !source.includes("${crewBadge}</button>")) {
  source = source.replace(
    markerHtml,
    '    html: `<button class="${style.className}${selected ? " selected" : ""}${trendClass}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span>${trendBadge}${crewBadge}</button>`,'
  );
}

if (!source.includes(".radar-crew-badge")) {
  const styleAnchor = "        .radar-trending-badge {";
  if (!source.includes(styleAnchor)) {
    throw new Error("Could not locate Radar badge styles for crew cue placement.");
  }

  source = source.replace(
    styleAnchor,
    `        .radar-crew-badge {
          position: absolute;
          right: -10px;
          bottom: -8px;
          min-width: 22px;
          border: 1px solid rgba(240, 171, 252, 0.62);
          border-radius: 9999px;
          background: rgba(88, 28, 135, 0.94);
          padding: 2px 5px;
          color: #fae8ff;
          font-size: 8px !important;
          font-weight: 800;
          line-height: 1.1 !important;
          white-space: nowrap;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          text-shadow: none;
          pointer-events: none;
        }

${styleAnchor}`
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied Radar crew marker cues.");
