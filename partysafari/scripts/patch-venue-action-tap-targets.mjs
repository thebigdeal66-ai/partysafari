import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

const labels = ["Directions", "Get Tickets", "Add Story", "Be the first to post"];
const requiredClasses = [
  "min-h-12",
  "touch-manipulation",
  "items-center",
  "justify-center",
  "active:scale-[0.98]",
];

for (const label of labels) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(<(?:a|button)\\b[^>]*?className=")([^"]*)("[^>]*>\\s*${escapedLabel}\\s*<\\/(?:a|button)>)`,
    "m"
  );

  source = source.replace(pattern, (_match, prefix, className, suffix) => {
    const classes = className.split(/\s+/).filter(Boolean);
    for (const requiredClass of requiredClasses) {
      if (!classes.includes(requiredClass)) classes.push(requiredClass);
    }
    return `${prefix}${classes.join(" ")}${suffix}`;
  });
}

fs.writeFileSync(filePath, source);
console.log("Applied consistent venue mobile action tap targets.");
