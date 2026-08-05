import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const helperAnchor = "function forecastConfidence(hotspot: RadarHotspot) {";
const liveSignalHelper = `function liveSignalCount(hotspot: RadarHotspot) {
  return hotspot.liveCheckins + hotspot.activeStories + hotspot.currentEvents + hotspot.friendsHere;
}

`;
if (!source.includes("function liveSignalCount")) {
  if (!source.includes(helperAnchor)) throw new Error("Forecast confidence helper anchor was not found.");
  source = source.replace(helperAnchor, liveSignalHelper + helperAnchor);
}

const freshnessAnchor = '<p className="mt-1 text-[10px] text-white/40">{forecastSyncing ? "Syncing live signals…" : <>Live update · {forecastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}</p>';
const refreshControl = `<div className="mt-1 flex items-center gap-2">
                              <p className="text-[10px] text-white/40">{forecastSyncing ? "Syncing live signals…" : <>Live update · {forecastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}</p>
                              <button
                                type="button"
                                disabled={forecastSyncing}
                                onClick={() => {
                                  if (!selectedHotspotId) return;
                                  setForecastSyncing(true);
                                  void liveMetrics.refresh([selectedHotspotId]).finally(() => setForecastSyncing(false));
                                }}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-45"
                              >
                                Refresh
                              </button>
                            </div>`;
if (source.includes(freshnessAnchor) && !source.includes("disabled={forecastSyncing}")) {
  source = source.replace(freshnessAnchor, refreshControl);
}

const liveCountersAnchor = `<div className="mb-3 grid grid-cols-4 gap-2">
                          <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">`;
const statusPanel = `<div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={\`h-2 w-2 rounded-full \${liveSignalCount(selectedHotspot) > 0 ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.75)]" : "bg-white/25"}\`} />
                            <span className="text-[10px] font-semibold text-white/65">
                              {liveSignalCount(selectedHotspot) > 0 ? "Live activity detected" : "Waiting for the first live signal"}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/40">{liveSignalCount(selectedHotspot)} total</span>
                        </div>
                        ${liveCountersAnchor}`;
if (source.includes(liveCountersAnchor) && !source.includes("Waiting for the first live signal")) {
  source = source.replace(liveCountersAnchor, statusPanel);
}

await writeFile(target, source, "utf8");
console.log("Applied Sprint 021 Radar live status and manual refresh.");
