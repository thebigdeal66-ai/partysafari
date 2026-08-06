import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

const focusClasses = " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070B]";

const targets = [
  "transition active:scale-[0.98]",
  "transition hover:bg-white/10",
  "transition hover:bg-white/15",
  "transition hover:border-white/30",
  "transition hover:brightness-110",
];

for (const target of targets) {
  source = source.replaceAll(target, target + focusClasses);
}

source = source.replaceAll(
  'className="mb-4 inline-flex w-fit rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm text-white/90"',
  'className="mb-4 inline-flex w-fit rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070B]"'
);

fs.writeFileSync(filePath, source);
console.log("Applied venue focus-state polish.");
