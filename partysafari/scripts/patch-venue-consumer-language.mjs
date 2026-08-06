import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("function formatVenueType")) {
  const anchor = `function formatBoolean(value: boolean | null) {`;
  const helper = `function formatVenueType(value: string | null) {\n  if (!value) return "Venue";\n  const normalized = value.trim().toLowerCase();\n  const labels: Record<string, string> = {\n    live_music_bar: "Live Music Bar",\n    nightclub: "Nightclub",\n    dance_club: "Dance Club",\n    sports_bar: "Sports Bar",\n    cocktail_bar: "Cocktail Bar",\n    rooftop_bar: "Rooftop Bar",\n    beach_bar: "Beach Bar",\n    brewery: "Brewery",\n    restaurant_bar: "Restaurant & Bar",\n  };\n  return labels[normalized] || normalized\n    .replace(/[_-]+/g, " ")\n    .replace(/\\b\\w/g, (letter) => letter.toUpperCase());\n}\n\n`;

  if (!source.includes(anchor)) {
    throw new Error("Could not locate venue page helper anchor.");
  }
  source = source.replace(anchor, helper + anchor);
}

source = source.replace(
  `{(venue.venue_type || "Venue")} • {[venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA"}`,
  `{formatVenueType(venue.venue_type)} • {[venue.city, venue.state].filter(Boolean).join(", ") || "Location TBA"}`
);

source = source.replace(
  `const trendLabel = safePartyScore.trend === "up" ? "Up" : safePartyScore.trend === "down" ? "Down" : "Stable";`,
  `const trendLabel = safePartyScore.trend === "up" ? "Picking up" : safePartyScore.trend === "down" ? "Cooling down" : "Holding steady";`
);

fs.writeFileSync(filePath, source);
console.log("Applied consumer-friendly venue detail language.");
