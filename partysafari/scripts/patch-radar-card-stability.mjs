import fs from "node:fs";
import path from "node:path";

const radarPath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
const timelinePath = path.resolve("src/components/radar/VenueActivityTimeline.tsx");

let radar = fs.readFileSync(radarPath, "utf8");
let timeline = fs.readFileSync(timelinePath, "utf8");

// Prevent the selected venue sheet from re-entering or being scroll-anchored
// whenever live children refresh.
radar = radar.replace(
  ".radar-venue-sheet-enter {\n          transform-origin: bottom left;\n          animation: radarVenueSheetIn 260ms cubic-bezier(.2,.8,.2,1) both;\n        }",
  ".radar-venue-sheet-enter {\n          transform-origin: bottom left;\n          animation: none;\n          overflow-anchor: none;\n          contain: layout paint;\n        }"
);

// Keep live forecast refreshes visual-only. Re-keying and scaling this block
// changes the sheet height/scroll position and produces the visible jump.
radar = radar.replace(
  '<div key={forecastFlashKey} className={`rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-3 transition-all duration-500 ${forecastPulseDelta !== 0 ? "animate-[radarForecastFlash_900ms_ease-out]" : ""}`}>',
  '<div className={`rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-3 transition-shadow duration-500 ${forecastPulseDelta !== 0 ? "animate-[radarForecastFlash_900ms_ease-out]" : ""}`}>'
);
radar = radar.replace(
  "0% { box-shadow: 0 0 0 rgba(34,211,238,0); transform: scale(1); }\n          35% { box-shadow: 0 0 34px rgba(34,211,238,.34); transform: scale(1.012); }\n          100% { box-shadow: 0 0 0 rgba(34,211,238,0); transform: scale(1); }",
  "0% { box-shadow: 0 0 0 rgba(34,211,238,0); }\n          35% { box-shadow: 0 0 34px rgba(34,211,238,.34); }\n          100% { box-shadow: 0 0 0 rgba(34,211,238,0); }"
);

// Do not collapse the timeline back to a one-line loading state after the
// first load. Preserve its existing height while realtime data refreshes.
timeline = timeline.replace(
  'import { useCallback, useEffect, useMemo, useState } from "react";',
  'import { useCallback, useEffect, useMemo, useRef, useState } from "react";'
);
timeline = timeline.replace(
  "  const [expanded, setExpanded] = useState(false);",
  "  const [expanded, setExpanded] = useState(false);\n  const hasLoadedRef = useRef(false);"
);
timeline = timeline.replace(
  "    setLoading(true);",
  "    if (!hasLoadedRef.current) setLoading(true);"
);
timeline = timeline.replace(
  "    setItems(next.slice(0, 24));\n    setLoading(false);",
  "    setItems(next.slice(0, 24));\n    hasLoadedRef.current = true;\n    setLoading(false);"
);
timeline = timeline.replace(
  '<section className="rounded-2xl border border-white/10 bg-black/20 p-3"',
  '<section className="min-h-[132px] rounded-2xl border border-white/10 bg-black/20 p-3 [overflow-anchor:none]"'
);

fs.writeFileSync(radarPath, radar);
fs.writeFileSync(timelinePath, timeline);
console.log("Applied Safari Radar venue-card stability fixes.");
