import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const importAnchor = 'import VenueCheckInButton from "@/components/VenueCheckInButton";';
if (!source.includes('import LitButton from "@/components/LitButton";')) {
  if (!source.includes(importAnchor)) throw new Error("Radar check-in import anchor was not found.");
  source = source.replace(importAnchor, `${importAnchor}\nimport LitButton from "@/components/LitButton";`);
}

const existingFooter = `footerAction={
                    <VenueCheckInButton
                      venueId={selectedHotspot.id}
                      compact={false}
                      onCountChange={() => {
                        radarTrace("SafariRadarExperience", "callback:onCountChange", {
                          line: 1049,
                          venueId: selectedHotspot.id,
                        });
                        void liveMetrics.refresh([selectedHotspot.id]);
                        void partyScores.refresh([selectedHotspot.id], true);
                      }}
                      className="rounded-full border border-fuchsia-300/40 bg-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-fuchsia-100"
                    />
                  }`;

const litFooter = `footerAction={
                    <div className="flex flex-wrap items-start justify-center gap-2">
                      <VenueCheckInButton
                        venueId={selectedHotspot.id}
                        compact={false}
                        onCountChange={() => {
                          radarTrace("SafariRadarExperience", "callback:onCountChange", {
                            line: 1049,
                            venueId: selectedHotspot.id,
                          });
                          void liveMetrics.refresh([selectedHotspot.id]);
                          void partyScores.refresh([selectedHotspot.id], true);
                        }}
                        className="rounded-full border border-fuchsia-300/40 bg-fuchsia-500/20 px-4 py-2.5 text-sm font-semibold text-fuchsia-100"
                      />
                      <LitButton
                        venueId={selectedHotspot.id}
                        onLit={() => {
                          void liveMetrics.refresh([selectedHotspot.id]);
                          void partyScores.refresh([selectedHotspot.id], true);
                        }}
                      />
                    </div>
                  }`;

if (source.includes(existingFooter)) {
  source = source.replace(existingFooter, litFooter);
} else if (!source.includes("<LitButton")) {
  throw new Error("Radar footer action was not found for Lit Button integration.");
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar Lit Button integration.");
