import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const sheetNeedle = 'className="radar-venue-sheet pointer-events-auto';
if (source.includes(sheetNeedle) && !source.includes('radar-venue-sheet radar-venue-sheet-enter')) {
  source = source.replace(sheetNeedle, 'className="radar-venue-sheet radar-venue-sheet-enter pointer-events-auto');
}

const detailsNeedle = 'className="radar-recommendation-details mt-2 hidden';
if (source.includes(detailsNeedle) && !source.includes('radar-recommendation-details radar-recommendation-enter')) {
  source = source.replace(detailsNeedle, 'className="radar-recommendation-details radar-recommendation-enter mt-2 hidden');
}

const styleAnchor = `        .radar-hotspot-icon {`;
const polishStyles = `        @keyframes radarVenueSheetIn {
          from { opacity: 0; transform: translate3d(0, 14px, 0) scale(.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes radarRecommendationIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes radarLiveBreath {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, .08); }
          50% { box-shadow: 0 0 0 7px rgba(34, 211, 238, 0); }
        }

        .radar-venue-sheet-enter {
          transform-origin: bottom left;
          animation: radarVenueSheetIn 260ms cubic-bezier(.2,.8,.2,1) both;
        }

        .radar-recommendation-enter {
          animation: radarRecommendationIn 200ms ease-out both;
        }

        .radar-recommendation-details[open] > div {
          animation: radarRecommendationIn 160ms ease-out both;
        }

        .radar-venue-sheet:focus-within {
          outline: 1px solid rgba(34, 211, 238, .22);
          outline-offset: -1px;
        }

        .radar-hotspot-icon[aria-current="true"] {
          animation: radarLiveBreath 1.9s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .radar-venue-sheet-enter,
          .radar-recommendation-enter,
          .radar-recommendation-details[open] > div,
          .radar-hotspot-icon[aria-current="true"] {
            animation: none !important;
          }
        }

`;

if (!source.includes("@keyframes radarVenueSheetIn")) {
  if (!source.includes(styleAnchor)) throw new Error("Radar style anchor was not found.");
  source = source.replace(styleAnchor, polishStyles + styleAnchor);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar interaction polish.");
