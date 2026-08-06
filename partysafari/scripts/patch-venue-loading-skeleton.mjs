import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

const oldLoading = `  if (loading) {\n    return (\n      <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">\n        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#10061f] p-8 text-white/70">\n          Loading venue details...\n        </div>\n      </main>\n    );\n  }`;

const newLoading = `  if (loading) {\n    return (\n      <main className="min-h-screen bg-[#07070B] text-white" aria-busy="true" aria-label="Loading venue details">\n        <section className="relative h-[280px] overflow-hidden border-b border-white/10 sm:h-[340px]">\n          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-violet-950 via-[#170d28] to-orange-950/70" />\n          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-6 sm:px-6 sm:pb-8">\n            <div className="mb-4 h-12 w-36 rounded-full bg-white/10" />\n            <div className="h-10 w-2/3 max-w-xl rounded-2xl bg-white/15 sm:h-12" />\n            <div className="mt-3 h-5 w-52 rounded-full bg-white/10" />\n            <div className="mt-4 flex gap-2">\n              <div className="h-8 w-24 rounded-full bg-white/10" />\n              <div className="h-8 w-32 rounded-full bg-white/10" />\n            </div>\n          </div>\n        </section>\n        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">\n          <div className="space-y-6">\n            {[0, 1, 2].map((item) => (\n              <div key={item} className="min-h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-5">\n                <div className="h-6 w-40 rounded-full bg-white/10" />\n                <div className="mt-5 h-4 w-full rounded-full bg-white/10" />\n                <div className="mt-3 h-4 w-4/5 rounded-full bg-white/10" />\n                <div className="mt-6 h-12 w-36 rounded-full bg-white/10" />\n              </div>\n            ))}\n          </div>\n          <div className="min-h-72 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-5">\n            <div className="h-6 w-32 rounded-full bg-white/10" />\n            <div className="mt-6 space-y-4">\n              <div className="h-14 rounded-2xl bg-white/10" />\n              <div className="h-14 rounded-2xl bg-white/10" />\n              <div className="h-14 rounded-2xl bg-white/10" />\n            </div>\n          </div>\n        </div>\n      </main>\n    );\n  }`;

if (!source.includes("aria-label=\"Loading venue details\"")) {
  if (!source.includes(oldLoading)) {
    throw new Error("Could not locate venue loading state.");
  }
  source = source.replace(oldLoading, newLoading);
}

fs.writeFileSync(filePath, source);
console.log("Applied stable venue loading skeleton.");
