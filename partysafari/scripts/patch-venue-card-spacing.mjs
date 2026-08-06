import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

// Normalize the main venue content rhythm without changing behavior.
source = source
  .replace(/className="mx-auto grid max-w-6xl gap-6 px-6 py-8/g, 'className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8')
  .replace(/className="space-y-6"/g, 'className="space-y-5 sm:space-y-6"')
  .replace(/className="rounded-3xl border border-white\/10 bg-\[#10061f\] p-6"/g, 'className="rounded-3xl border border-white/10 bg-[#10061f] p-5 sm:p-6"')
  .replace(/className="rounded-3xl border border-white\/10 bg-white\/5 p-6"/g, 'className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6"')
  .replace(/className="text-2xl font-bold"/g, 'className="text-xl font-bold sm:text-2xl"')
  .replace(/className="mb-4 text-xl font-bold"/g, 'className="mb-3 text-lg font-bold sm:mb-4 sm:text-xl"');

fs.writeFileSync(filePath, source);
console.log("Applied venue detail spacing normalization.");
