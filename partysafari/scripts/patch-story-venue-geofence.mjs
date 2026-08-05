import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/stories/StoryComposer.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("function resolveStoryPublishError")) {
  source = source.replace(
    "const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;",
    `const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;\n\nfunction resolveStoryPublishError(error) {\n  const message = String(error || \"\").toLowerCase();\n  if (message.includes(\"active venue check-in required\") || message.includes(\"check in at the venue\")) {\n    return \"You must be checked in at this venue before posting a venue story. Check-in is only available while you are physically nearby.\";\n  }\n  return error || \"Could not publish story.\";\n}`
  );
}

source = source.replace(
  'setErrorMessage(result.error || "Could not publish story.");',
  'setErrorMessage(resolveStoryPublishError(result.error));'
);

const venueSelectClose = `              </select>\n            </div>`;
if (!source.includes("Venue stories require an active on-site check-in")) {
  source = source.replace(
    venueSelectClose,
    `              </select>\n              {venueId ? (\n                <p className=\"mt-2 text-xs leading-relaxed text-cyan-100/70\">\n                  Venue stories require an active on-site check-in. PartySafari verifies proximity when you check in.\n                </p>\n              ) : null}\n            </div>`
  );
}

fs.writeFileSync(filePath, source);
console.log("Applied venue story geofence messaging patch.");
