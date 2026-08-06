import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  'className="h-[340px] w-full object-cover opacity-45"',
  'className="h-[300px] w-full object-cover opacity-45 sm:h-[360px]"'
);

source = source.replace(
  '<div className="h-[340px] w-full bg-[#120824]" />',
  `<div className="relative h-[300px] w-full overflow-hidden bg-[#120824] sm:h-[360px]">
            <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
            <div className="absolute -right-12 bottom-0 h-52 w-52 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_58%)]" />
            <div className="absolute inset-x-0 top-16 text-center text-6xl opacity-25 sm:text-7xl" aria-hidden="true">🦁</div>
          </div>`
);

source = source.replace(
  'className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-end px-6 pb-8"',
  'className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-end px-4 pb-6 sm:px-6 sm:pb-8"'
);

source = source.replace(
  'className="text-4xl font-bold text-white"',
  'className="text-3xl font-bold leading-tight text-white sm:text-4xl"'
);

fs.writeFileSync(filePath, source);
console.log("Applied venue mobile hero polish.");
