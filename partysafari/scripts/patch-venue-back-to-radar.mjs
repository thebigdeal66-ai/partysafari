import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

source = source.replace('import Link from "next/link";\n', "");

const control = `<a
            href="/radar"
            target="_self"
            onPointerDown={(event) => {
              event.stopPropagation();
              window.location.href = "/radar";
            }}
            onClick={(event) => {
              event.stopPropagation();
              window.location.href = "/radar";
            }}
            className="relative z-[9999] mb-4 inline-flex min-h-12 w-fit touch-manipulation select-none items-center rounded-full border border-white/25 bg-black/70 px-5 py-3 text-sm font-semibold text-white shadow-lg pointer-events-auto active:scale-[0.98]"
            aria-label="Return to Safari Radar"
          >
            Back to Map
          </a>`;

source = source.replace(
  /<(?:Link|button|a)\b[^>]*(?:href="\/(?:map|radar)"|aria-label="Return to Safari Radar")[\s\S]*?>\s*Back to Map\s*<\/(?:Link|button|a)>/m,
  control
);

fs.writeFileSync(filePath, source);
console.log("Applied native Back to Radar anchor with pointer fallback.");
