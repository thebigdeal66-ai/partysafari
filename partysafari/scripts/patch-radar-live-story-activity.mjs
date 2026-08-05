import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("const latestVenueStory = useMemo")) {
  const anchor = `  const heatingUp = useMemo(() => {`;
  const addition = `  const latestVenueStory = useMemo(() => {\n    if (venueStoryState.stories.length === 0) {\n      return null;\n    }\n\n    return [...venueStoryState.stories].sort((left, right) =>\n      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()\n    )[0] || null;\n  }, [venueStoryState.stories]);\n\n`;

  if (!source.includes(anchor)) {
    throw new Error("Could not locate heatingUp memo for live story activity patch.");
  }
  source = source.replace(anchor, addition + anchor);
}

const oldButton = `                      <button\n                        type="button"\n                        onClick={() => setStoryViewerOpen(true)}\n                        disabled={venueStoryState.loading || venueStoryState.authorGroups.length === 0}\n                        className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-45"\n                      >\n                        {venueStoryState.loading\n                          ? "Loading Stories"\n                          : venueStoryState.authorGroups.length > 0\n                            ? \`View Stories (\${venueStoryState.stories.length})\`\n                            : "No Live Stories"}\n                      </button>`;

const newButton = `                      <button\n                        type="button"\n                        onClick={() => setStoryViewerOpen(true)}\n                        disabled={venueStoryState.loading || venueStoryState.authorGroups.length === 0}\n                        className="group relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-45"\n                      >\n                        {latestVenueStory?.media_type === "image" ? (\n                          <img\n                            src={latestVenueStory.media_url}\n                            alt="Latest venue story"\n                            className="absolute inset-0 h-full w-full object-cover opacity-25 transition group-hover:opacity-35"\n                          />\n                        ) : null}\n                        <span className="relative z-10 inline-flex items-center justify-center gap-1.5">\n                          {latestVenueStory?.media_type === "video" ? <span aria-hidden="true">▶</span> : <span aria-hidden="true">📸</span>}\n                          {venueStoryState.loading\n                            ? "Loading Stories"\n                            : venueStoryState.authorGroups.length > 0\n                              ? \`View Stories (\${venueStoryState.stories.length})\`\n                              : "No Live Stories"}\n                        </span>\n                      </button>`;

if (!source.includes("Latest venue story")) {
  if (!source.includes(oldButton)) {
    throw new Error("Could not locate Radar View Stories button for live activity patch.");
  }
  source = source.replace(oldButton, newButton);
}

fs.writeFileSync(filePath, source);
console.log("Applied live story activity preview to Safari Radar.");
