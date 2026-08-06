import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

const oldClick = `                        onClick={() => setStoryViewerOpen(true)}\n                        disabled={venueStoryState.loading || venueStoryState.authorGroups.length === 0}`;
const newClick = `                        onClick={() => {\n                          if (venueStoryState.authorGroups.length > 0) {\n                            setStoryViewerOpen(true);\n                            return;\n                          }\n                          window.location.assign(\`/venues/\${selectedHotspot.slug}\`);\n                        }}\n                        disabled={venueStoryState.loading}`;

if (!source.includes("Be First to Post")) {
  if (!source.includes(oldClick)) {
    throw new Error("Could not locate Radar story empty-state button behavior.");
  }

  source = source.replace(oldClick, newClick);
  source = source.replace('                              : "No Live Stories"', '                              : "Be First to Post"');
}

fs.writeFileSync(filePath, source);
console.log("Applied actionable Radar story empty state.");
