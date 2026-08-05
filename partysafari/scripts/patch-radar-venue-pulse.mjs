import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

source = source.replace(
  "  const [minScore, setMinScore] = useState(25);",
  "  const [minScore, setMinScore] = useState(0);",
);
source = source.replace(
  "  const [maxDistanceMiles, setMaxDistanceMiles] = useState(20);",
  "  const [maxDistanceMiles, setMaxDistanceMiles] = useState(30);",
);

source = source.replace(
  'return { className: "radar-hotspot legendary", radius: 34, glowRadius: 300, haloColor: "#ef4444" };',
  'return { className: "radar-hotspot legendary", radius: 34, glowRadius: 300, haloColor: "#a855f7" };',
);

source = source.replace(
  'background: radial-gradient(circle at 28% 24%, #fb7185, #dc2626 66%);\n          box-shadow: 0 0 36px rgba(239, 68, 68, 0.62), 0 12px 28px rgba(0, 0, 0, 0.45);',
  'background: radial-gradient(circle at 28% 24%, #e879f9, #7e22ce 66%);\n          box-shadow: 0 0 36px rgba(168, 85, 247, 0.66), 0 12px 28px rgba(0, 0, 0, 0.45);',
);

const legend = `
      <section className="relative z-20 mx-auto w-full max-w-7xl px-4 pb-2 md:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
          <span className="text-white/35">Party Pulse</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.55)]" />Quiet</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-yellow-300 shadow-[0_0_8px_rgba(253,224,71,0.55)]" />Picking up</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.55)]" />Busy</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />Hot</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-fuchsia-500 shadow-[0_0_9px_rgba(217,70,239,0.7)]" />Legendary</span>
        </div>
      </section>
`;

if (!source.includes("Party Pulse</span>")) {
  source = source.replace(
    '      <section className="relative z-10 mx-auto w-full max-w-7xl px-2 md:px-4">',
    `${legend}\n      <section className="relative z-10 mx-auto w-full max-w-7xl px-2 md:px-4">`,
  );
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar baseline venue and Party Pulse patch.");
