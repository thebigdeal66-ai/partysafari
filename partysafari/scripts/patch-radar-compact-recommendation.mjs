import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

if (!source.includes("radar-recommendation-details")) {
  const startMarker = "        {recommendationReason && recommendationReason.venueId === selectedHotspotId ? (";
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error("Radar recommendation panel start was not found.");

  const endMarker = "\n        ) : null}\n      </section>";
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error("Radar recommendation panel end was not found.");

  const replacement = `        {recommendationReason && recommendationReason.venueId === selectedHotspotId ? (
          <>
            <div className="mt-2 rounded-2xl border border-fuchsia-300/20 bg-black/45 px-4 py-3 text-sm text-white/75 backdrop-blur-md md:hidden">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-200">Why this venue</p>
              {recommendationMatch && recommendationMatch.venueId === selectedHotspotId ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-xs font-semibold text-white/65">Match confidence</span>
                  <span className="text-sm font-bold text-cyan-200">{recommendationMatch.confidence}%</span>
                </div>
              ) : null}
              <p className="mt-1 leading-relaxed">{recommendationReason.text}</p>
            </div>

            <details className="radar-recommendation-details mt-2 hidden rounded-xl border border-fuchsia-300/20 bg-black/45 text-sm text-white/75 backdrop-blur-md md:block">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200">Why this venue</span>
                <span className="min-w-0 flex-1 truncate text-xs text-white/65">{recommendationReason.text}</span>
                {recommendationMatch && recommendationMatch.venueId === selectedHotspotId ? (
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-100">
                    {recommendationMatch.confidence}% match
                  </span>
                ) : null}
                <span className="shrink-0 text-[10px] font-semibold text-white/45">Details ▾</span>
              </summary>
              <div className="border-t border-white/10 px-4 py-3">
                <p className="leading-relaxed">{recommendationReason.text}</p>
              </div>
            </details>
          </>
        ) : null}`;

  source = source.slice(0, start) + replacement + source.slice(end + "\n        ) : null}".length);
}

await writeFile(target, source, "utf8");
console.log("Applied compact desktop Radar recommendation panel.");
