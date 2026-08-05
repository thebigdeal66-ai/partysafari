import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('StoryViewer from "@/components/stories/StoryViewer"')) {
  source = source.replace(
    'import VenueCheckInButton from "@/components/VenueCheckInButton";',
    'import VenueCheckInButton from "@/components/VenueCheckInButton";\nimport StoryViewer from "@/components/stories/StoryViewer";\nimport { useStories } from "@/components/stories/useStories";'
  );
}

if (!source.includes("const [storyViewerOpen, setStoryViewerOpen]")) {
  source = source.replace(
    '  const [mapZoom, setMapZoom] = useState(13);',
    '  const [mapZoom, setMapZoom] = useState(13);\n  const [storyViewerOpen, setStoryViewerOpen] = useState(false);\n  const venueStoryState = useStories({\n    enabled: Boolean(selectedHotspotId),\n    venueId: selectedHotspotId || undefined,\n    limit: 50,\n    includeOwnViewCounts: true,\n    subscribeOwnStoryViewCounts: true,\n  });'
  );
}

source = source.replace(
  '<Link href="/dashboard" className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100">View Stories</Link>',
  `<button\n                        type="button"\n                        onClick={() => setStoryViewerOpen(true)}\n                        disabled={venueStoryState.loading || venueStoryState.authorGroups.length === 0}\n                        className="rounded-2xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-center text-sm font-semibold text-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-45"\n                      >\n                        {venueStoryState.loading\n                          ? "Loading Stories"\n                          : venueStoryState.authorGroups.length > 0\n                            ? \`View Stories (\${venueStoryState.stories.length})\`\n                            : "No Live Stories"}\n                      </button>`
);

if (!source.includes("storyViewerOpen && venueStoryState.authorGroups.length > 0")) {
  source = source.replace(
    '      <style jsx global>{`',
    `      {storyViewerOpen && venueStoryState.authorGroups.length > 0 ? (\n        <StoryViewer\n          groups={venueStoryState.authorGroups}\n          currentUserId={venueStoryState.currentUserId}\n          initialAuthorId={venueStoryState.authorGroups[0]?.authorId || null}\n          onClose={() => setStoryViewerOpen(false)}\n          onRecordView={venueStoryState.recordView}\n          onAddReaction={venueStoryState.addReaction}\n          onDeleteStory={venueStoryState.softDeleteStory}\n        />\n      ) : null}\n\n      <style jsx global>{\``
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied in-Radar venue story viewer.");
