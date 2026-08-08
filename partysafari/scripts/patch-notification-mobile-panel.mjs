import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/NotificationCenter.tsx");
let source = fs.readFileSync(filePath, "utf8");

source = source.replace(
  'className="absolute right-0 z-20 mt-3 w-[360px] min-w-[320px] rounded-3xl border border-white/10 bg-[#0c0420] p-4 shadow-[0_20px_70px_rgba(38,12,56,0.45)]"',
  'className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+5.75rem)] z-[100] max-h-[calc(100dvh-7rem)] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0420]/98 p-4 shadow-[0_20px_70px_rgba(38,12,56,0.55)] backdrop-blur-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-[min(360px,calc(100vw-1.5rem))] sm:max-h-[70vh]"'
);

source = source.replace(
  'className="mb-4 flex items-center justify-between gap-4"',
  'className="mb-4 flex flex-wrap items-start justify-between gap-3"'
);

source = source.replace(
  'className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-violet-300 transition hover:bg-white/10"',
  'className="shrink-0 rounded-2xl bg-white/5 px-3 py-2 text-sm text-violet-300 transition hover:bg-white/10"'
);

source = source.replace(
  'className="space-y-3">\n              {notifications.map((notification) => (',
  'className="max-h-[calc(100dvh-14rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[55vh]">\n              {notifications.map((notification) => ('
);

fs.writeFileSync(filePath, source);
console.log("Applied viewport-safe mobile notification panel.");
