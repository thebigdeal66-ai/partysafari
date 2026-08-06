import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

// This page previously used a Next Link pointed at an obsolete route. On mobile,
// client-side routing also proved unreliable inside the layered hero section.
// Use a native button with a hard same-origin navigation so the control always
// returns to Safari Radar.
source = source.replace('import Link from "next/link";\n', "");

source = source.replace(
  /<Link\s+href="\/(?:map|radar)"[^>]*>\s*Back to Map\s*<\/Link>/m,
  `<button
            type="button"
            onClick={() => window.location.assign("/radar")}
            className="relative z-50 mb-4 inline-flex min-h-12 w-fit touch-manipulation items-center rounded-full border border-white/25 bg-black/70 px-5 py-3 text-sm font-semibold text-white shadow-lg active:scale-[0.98]"
            aria-label="Return to Safari Radar"
          >
            Back to Map
          </button>`
);

fs.writeFileSync(filePath, source);
console.log("Applied forced venue Back to Radar navigation.");
