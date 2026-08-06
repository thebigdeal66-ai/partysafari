import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  '  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));\n  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));',
  '  const score = Math.max(0, Math.min(100, Math.round(hotspot.crowdPulse.pulseScore)));\n  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));\n  const trending = hotspot.partyScore.momentum >= 12 || (hotspot.partyScore.trend === "up" && hotspot.activeStories >= 2);\n  const trendClass = trending ? " radar-trending-now" : "";\n  const trendBadge = trending ? `<span class="radar-trending-badge">TRENDING</span>` : "";'
);

source = source.replace(
  '    html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span></button>`,',
  '    html: `<button class="${style.className}${selected ? " selected" : ""}${trendClass}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span>${trendBadge}</button>`,'
);

if (!source.includes(".radar-trending-badge")) {
  source = source.replace(
    '        .radar-hotspot.selected {\n          outline: 2px solid rgba(255, 255, 255, 0.95);\n          outline-offset: 2px;\n        }',
    `        .radar-hotspot.selected {\n          outline: 2px solid rgba(255, 255, 255, 0.95);\n          outline-offset: 2px;\n        }\n\n        .radar-hotspot.radar-trending-now {\n          isolation: isolate;\n        }\n\n        .radar-hotspot.radar-trending-now::before {\n          content: \"\";\n          position: absolute;\n          inset: -14px;\n          z-index: -1;\n          border-radius: inherit;\n          background: radial-gradient(circle, rgba(244, 63, 94, 0.34), rgba(168, 85, 247, 0.12) 58%, transparent 72%);\n          animation: radar-trending-wave 1.9s ease-out infinite;\n          pointer-events: none;\n        }\n\n        .radar-trending-badge {\n          position: absolute;\n          left: 50%;\n          top: -20px;\n          transform: translateX(-50%);\n          border: 1px solid rgba(253, 164, 175, 0.65);\n          border-radius: 9999px;\n          background: rgba(76, 5, 25, 0.9);\n          padding: 2px 6px;\n          color: #ffe4e6;\n          font-size: 8px !important;\n          font-weight: 800;\n          letter-spacing: 0.08em;\n          line-height: 1.1 !important;\n          white-space: nowrap;\n          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.38);\n          text-shadow: none;\n          pointer-events: none;\n        }\n\n        @keyframes radar-trending-wave {\n          0% { transform: scale(0.82); opacity: 0.82; }\n          72% { transform: scale(1.3); opacity: 0; }\n          100% { transform: scale(1.3); opacity: 0; }\n        }`
  );

  source = source.replace(
    '          .radar-hotspot::after,\n          .radar-hotspot.legendary {\n            animation: none;\n          }',
    '          .radar-hotspot::after,\n          .radar-hotspot.legendary,\n          .radar-hotspot.radar-trending-now::before {\n            animation: none;\n          }'
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied Safari Live trending-now marker layer.");
