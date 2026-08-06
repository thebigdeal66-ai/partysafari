import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

const oldBlock = `              <div className="grid grid-cols-2 gap-2 text-sm">\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Active Stories</p>\n                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.activeStories || 0}</p>\n                </div>\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Current Events</p>\n                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.currentEvents || 0}</p>\n                </div>\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Friends Here</p>\n                  <p className="mt-1 text-xl font-semibold text-white">{metrics?.friendsHere || 0}</p>\n                </div>\n                <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-orange-200">Party Score</p>\n                  {scoreDisplay.showScore ? (\n                    <p className="mt-1 text-xl font-semibold text-orange-100">{scoreDisplay.score}</p>\n                  ) : (\n                    <p className="mt-1 text-sm font-semibold leading-tight text-orange-100">{scoreDisplay.headline}</p>\n                  )}\n                </div>\n              </div>`;

const newBlock = `              <div className="grid grid-cols-2 gap-2 text-sm">\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Live Stories</p>\n                  <p className="mt-1 text-sm font-semibold leading-tight text-white">\n                    {countLabel(metrics?.activeStories || 0, "story live", "No stories yet")}\n                  </p>\n                </div>\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Tonight</p>\n                  <p className="mt-1 text-sm font-semibold leading-tight text-white">\n                    {countLabel(metrics?.currentEvents || 0, "event", "No events tonight")}\n                  </p>\n                </div>\n                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">Your Crew</p>\n                  <p className="mt-1 text-sm font-semibold leading-tight text-white">\n                    {countLabel(metrics?.friendsHere || 0, "friend here", "No friends here")}\n                  </p>\n                </div>\n                <div className="rounded-xl border border-orange-300/20 bg-orange-500/10 px-3 py-2">\n                  <p className="text-xs uppercase tracking-[0.18em] text-orange-200">Party Now</p>\n                  <p className="mt-1 text-sm font-semibold leading-tight text-orange-100">{scoreDisplay.headline}</p>\n                </div>\n              </div>`;

if (!source.includes("Party Now")) {
  if (!source.includes(oldBlock)) {
    throw new Error("Could not locate venue live sidebar stat grid.");
  }
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(filePath, source);
console.log("Applied conversational venue live sidebar language.");
