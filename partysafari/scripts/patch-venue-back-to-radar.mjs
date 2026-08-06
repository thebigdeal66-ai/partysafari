import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  '<Link href="/map" className="mb-4 inline-flex w-fit rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm text-white/90">',
  '<Link href="/radar" prefetch={false} className="relative z-20 mb-4 inline-flex min-h-11 w-fit items-center rounded-full border border-white/20 bg-black/55 px-4 py-2 text-sm font-medium text-white/95 touch-manipulation">'
);

fs.writeFileSync(filePath, source);
console.log("Applied reliable venue Back to Radar navigation.");
