import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const originalWrapper = `<div className="pointer-events-none absolute inset-x-3 bottom-3 z-[600] md:inset-x-auto md:left-4 md:w-[440px]">
              <div className="pointer-events-auto">`;

const previousWrapper = `<div className="pointer-events-none absolute inset-x-2 bottom-2 top-2 z-[600] flex items-end md:inset-x-auto md:bottom-3 md:left-4 md:top-auto md:w-[440px]">
              <div className="pointer-events-auto max-h-full w-full overflow-y-auto overscroll-contain rounded-3xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] md:max-h-[calc(70vh-1.5rem)]">`;

const responsiveWrapper = `<div className="pointer-events-none absolute inset-x-2 bottom-3 z-[600] flex items-end md:inset-x-auto md:bottom-4 md:left-4 md:w-[420px]">
              <div key={selectedHotspot.id} className="pointer-events-auto max-h-[56vh] w-full overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#080a13]/95 shadow-2xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] sm:max-h-[60vh] md:max-h-[58vh]">`;

if (source.includes(previousWrapper)) {
  source = source.replace(previousWrapper, responsiveWrapper);
} else if (source.includes(originalWrapper)) {
  source = source.replace(originalWrapper, responsiveWrapper);
} else if (!source.includes("key={selectedHotspot.id} className=\"pointer-events-auto max-h-[56vh]")) {
  throw new Error("Radar selected venue card wrapper was not found.");
}

await writeFile(target, source, "utf8");
console.log("Applied responsive Radar venue sheet patch.");
