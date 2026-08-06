import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('import StoryComposer from "@/components/stories/StoryComposer";')) {
  const anchor = 'import StoryGrid from "@/components/stories/StoryGrid";';
  if (!source.includes(anchor)) throw new Error("Could not locate StoryGrid import.");
  source = source.replace(anchor, `${anchor}\nimport StoryComposer from "@/components/stories/StoryComposer";`);
}

if (!source.includes("const [composerOpen, setComposerOpen]")) {
  const anchor = '  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);';
  if (!source.includes(anchor)) throw new Error("Could not locate venue story viewer state.");
  source = source.replace(anchor, `${anchor}\n  const [composerOpen, setComposerOpen] = useState(false);`);
}

const oldHeader = `            <div className="mb-4">\n              <h2 className="text-xl font-semibold">Live Stories</h2>\n              <p className="mt-1 text-sm text-white/65">Stories tagged at {venue.name}, most recent first.</p>\n            </div>`;
const newHeader = `            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">\n              <div>\n                <h2 className="text-xl font-semibold">Live Stories</h2>\n                <p className="mt-1 text-sm text-white/65">Stories tagged at {venue.name}, most recent first.</p>\n              </div>\n              <button\n                type="button"\n                onClick={() => setComposerOpen(true)}\n                className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"\n              >\n                {venueStories.length === 0 ? "Be the first to post" : "Add Story"}\n              </button>\n            </div>`;

if (!source.includes("Be the first to post")) {
  if (!source.includes(oldHeader)) throw new Error("Could not locate venue Live Stories header.");
  source = source.replace(oldHeader, newHeader);
}

if (!source.includes("<StoryComposer\n        open={composerOpen}")) {
  const anchor = `      {viewerAuthorId ? (\n        <StoryViewer`;
  const composer = `      <StoryComposer\n        open={composerOpen}\n        onClose={() => setComposerOpen(false)}\n        defaultVenueId={venue.id}\n        createStoryRecord={storyState.createStoryRecord}\n      />\n\n`;
  if (!source.includes(anchor)) throw new Error("Could not locate venue StoryViewer block.");
  source = source.replace(anchor, `${composer}${anchor}`);
}

source = source.replace(
  'emptyMessage="No live stories tagged at this venue right now."',
  'emptyMessage="No live stories yet. Be the first to show everyone what is happening."'
);

fs.writeFileSync(filePath, source);
console.log("Applied actionable venue story CTA.");
