import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("Return to Safari Radar")) {
  const errorBlockPattern = /  if \(!venue \|\| errorMessage\) \{[\s\S]*?\n  \}\n\n  const heroImage/;
  const replacement = `  if (!venue || errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07070B] px-4 py-10 text-white sm:px-6">
        <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#180b2d] via-[#10061f] to-[#2b0d18] p-6 text-center shadow-2xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-3xl shadow-[0_0_35px_rgba(139,92,246,0.25)]" aria-hidden="true">
            🦁
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-violet-200/80">Safari Radar</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">We could not open this venue</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65 sm:text-base">
            {errorMessage || "This venue may have moved, been removed, or is temporarily unavailable."}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="/radar"
              className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
            >
              Return to Safari Radar
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/90 active:scale-[0.98]"
            >
              Try Again
            </button>
          </div>
        </section>
      </main>
    );
  }

  const heroImage`;

  if (!errorBlockPattern.test(source)) {
    throw new Error("Could not locate venue error-state block.");
  }

  source = source.replace(errorBlockPattern, replacement);
}

fs.writeFileSync(filePath, source);
console.log("Applied venue error recovery state.");
