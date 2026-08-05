import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const oldBlock = `          {filteredHotspots.length === 0 && !loading && (
            <div className="absolute inset-x-4 top-4 z-[650] rounded-2xl border border-white/20 bg-[#0a0f1f]/85 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-white">Nothing is trending nearby yet.</p>
              <p className="mt-1 text-xs text-white/70">Building tonight&apos;s pulse. We&apos;re collecting live check-ins, stories, events, and venue activity.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={expandSearchRadius}
                  className="rounded-full border border-cyan-300/35 bg-cyan-500/18 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                >
                  Expand Search Radius
                </button>
                <Link href="/events" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">Browse Events</Link>
                <Link href="/profiles" className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Explore Venues</Link>
              </div>
            </div>
          )}`;

const newBlock = `          {filteredHotspots.length === 0 && !loading && (
            <div className="absolute left-3 top-3 z-[650] max-w-[calc(100%-1.5rem)] rounded-full border border-cyan-300/25 bg-[#08101d]/88 px-3 py-2 shadow-lg backdrop-blur-md md:left-4 md:top-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-50">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                  Radar is scanning nearby
                </span>
                <span className="hidden text-white/55 sm:inline">No active hotspots match these filters yet.</span>
                <button
                  type="button"
                  onClick={expandSearchRadius}
                  className="rounded-full border border-cyan-300/30 bg-cyan-400/12 px-2.5 py-1 font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  Expand radius
                </button>
                <Link href="/events" className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-semibold text-white transition hover:bg-white/15">Events</Link>
                <Link href="/profiles" className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-semibold text-white transition hover:bg-white/15">Venues</Link>
              </div>
            </div>
          )}`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes("Radar is scanning nearby")) {
  throw new Error("Safari Radar empty-state block was not found.");
}

await writeFile(target, source, "utf8");
console.log("Applied compact Safari Radar empty state.");
