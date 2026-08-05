import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const currentWrapper = `<div className="pointer-events-none absolute inset-x-2 bottom-3 z-[600] flex items-end md:inset-x-auto md:bottom-4 md:left-4 md:w-[420px]">
              <div key={selectedHotspot.id} className="pointer-events-auto max-h-[56vh] w-full overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#080a13]/95 shadow-2xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] sm:max-h-[60vh] md:max-h-[58vh]">`;

const compactDesktopWrapper = `<div className="pointer-events-none absolute inset-x-2 bottom-3 z-[600] flex items-end md:inset-x-auto md:bottom-4 md:left-4 md:w-[400px] lg:w-[420px]">
              <div key={selectedHotspot.id} className="radar-venue-sheet pointer-events-auto max-h-[56vh] w-full overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#080a13]/95 shadow-2xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] sm:max-h-[60vh] md:max-h-[calc(70vh-2rem)]">`;

if (source.includes(currentWrapper)) {
  source = source.replace(currentWrapper, compactDesktopWrapper);
} else if (!source.includes("radar-venue-sheet pointer-events-auto")) {
  throw new Error("Responsive Radar venue card wrapper was not found.");
}

const styleAnchor = `        .radar-hotspot-icon {`;
const sheetStyles = `        @media (min-width: 768px) {
          .radar-venue-sheet {
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,.28) transparent;
          }

          .radar-venue-sheet::-webkit-scrollbar {
            width: 7px;
          }

          .radar-venue-sheet::-webkit-scrollbar-thumb {
            border: 2px solid transparent;
            border-radius: 9999px;
            background: rgba(255,255,255,.28);
            background-clip: padding-box;
          }
        }

`;

if (!source.includes(".radar-venue-sheet::-webkit-scrollbar")) {
  if (!source.includes(styleAnchor)) throw new Error("Radar style anchor was not found.");
  source = source.replace(styleAnchor, sheetStyles + styleAnchor);
}

await writeFile(target, source, "utf8");
console.log("Applied compact desktop Radar venue card patch.");
