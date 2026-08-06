import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("const momentumClass =")) {
  source = source.replace(
    "  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));",
    "  const radius = Math.max(15, Math.min(38, Math.round(15 + score * 0.24)));\n  const momentum = hotspot.partyScore.momentum || 0;\n  const momentumClass = momentum >= 12 ? \" surging\" : momentum >= 4 ? \" rising\" : momentum <= -8 ? \" cooling\" : \" steady\";"
  );

  source = source.replace(
    '    html: `<button class="${style.className}${selected ? " selected" : ""}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span></button>`,',
    '    html: `<button class="${style.className}${selected ? " selected" : ""}${momentumClass}" data-score="${score}" data-momentum="${Math.round(momentum)}" style="width:${radius * 2}px;height:${radius * 2}px"><span>${score}</span></button>`,'
  );
}

if (!source.includes("@keyframes radar-safari-live-rise")) {
  source = source.replace(
    "        @media (prefers-reduced-motion: reduce) {",
    `        .radar-hotspot {\n          transition: width 420ms ease, height 420ms ease, box-shadow 420ms ease, filter 420ms ease;\n          will-change: transform, filter, box-shadow;\n        }\n\n        .radar-hotspot span {\n          transition: transform 320ms ease, opacity 320ms ease;\n        }\n\n        .radar-hotspot.rising {\n          animation: radar-safari-live-rise 2.8s ease-in-out infinite;\n        }\n\n        .radar-hotspot.surging {\n          animation: radar-safari-live-surge 1.65s ease-in-out infinite;\n          filter: saturate(1.18) brightness(1.08);\n        }\n\n        .radar-hotspot.cooling {\n          animation: radar-safari-live-cool 3.4s ease-in-out infinite;\n          filter: saturate(0.82) brightness(0.9);\n        }\n\n        .radar-hotspot.selected.rising,\n        .radar-hotspot.selected.surging {\n          outline-color: rgba(255, 255, 255, 1);\n        }\n\n        @keyframes radar-safari-live-rise {\n          0%, 100% { transform: translateZ(0) scale(1); }\n          50% { transform: translateZ(0) scale(1.055); }\n        }\n\n        @keyframes radar-safari-live-surge {\n          0%, 100% { transform: translateZ(0) scale(1); }\n          45% { transform: translateZ(0) scale(1.11); }\n          70% { transform: translateZ(0) scale(1.035); }\n        }\n\n        @keyframes radar-safari-live-cool {\n          0%, 100% { transform: translateZ(0) scale(1); opacity: 0.92; }\n          50% { transform: translateZ(0) scale(0.96); opacity: 0.78; }\n        }\n\n        @media (prefers-reduced-motion: reduce) {`
  );

  source = source.replace(
    "          .radar-hotspot.legendary {\n            animation: none;\n          }",
    "          .radar-hotspot.legendary,\n          .radar-hotspot.rising,\n          .radar-hotspot.surging,\n          .radar-hotspot.cooling {\n            animation: none;\n          }"
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied Safari Live marker momentum motion.");
