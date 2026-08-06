import fs from "node:fs";
import path from "node:path";

const cardPath = path.resolve("src/components/crowd-pulse/CrowdPulseCard.tsx");
let cardSource = fs.readFileSync(cardPath, "utf8");

if (!cardSource.includes("highlightLabel?: string | null;")) {
  const typeAnchor = "  supplementalContent?: ReactNode;\n  compact?: boolean;";
  if (!cardSource.includes(typeAnchor)) {
    throw new Error("Could not locate CrowdPulseCard props anchor.");
  }
  cardSource = cardSource.replace(
    typeAnchor,
    "  supplementalContent?: ReactNode;\n  highlightLabel?: string | null;\n  compact?: boolean;"
  );
}

if (!cardSource.includes("highlightLabel = null,")) {
  const destructureAnchor = "  supplementalContent = null,\n  compact = false,";
  if (!cardSource.includes(destructureAnchor)) {
    throw new Error("Could not locate CrowdPulseCard destructuring anchor.");
  }
  cardSource = cardSource.replace(
    destructureAnchor,
    "  supplementalContent = null,\n  highlightLabel = null,\n  compact = false,"
  );
}

if (!cardSource.includes("aria-label=\"Radar recommendation\"")) {
  const renderAnchor = "        <CrowdPulseMeter score={pulse.pulseScore} compact={compact} />";
  if (!cardSource.includes(renderAnchor)) {
    throw new Error("Could not locate CrowdPulseMeter render anchor.");
  }
  const badge = `        {highlightLabel ? (\n          <div\n            aria-label="Radar recommendation"\n            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-fuchsia-300/35 bg-fuchsia-500/12 px-3 py-1.5 text-xs font-semibold text-fuchsia-100 shadow-[0_0_24px_rgba(217,70,239,0.16)]"\n          >\n            <span aria-hidden="true">🔥</span>\n            {highlightLabel}\n          </div>\n        ) : null}\n\n`;
  cardSource = cardSource.replace(renderAnchor, badge + renderAnchor);
}

fs.writeFileSync(cardPath, cardSource);

const radarPath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let radarSource = fs.readFileSync(radarPath, "utf8");

if (!radarSource.includes("highlightLabel={recommendationReason?.venueId")) {
  const propAnchor = "                  venueName={selectedHotspot.name}\n";
  if (!radarSource.includes(propAnchor)) {
    throw new Error("Could not locate selected Radar venue name prop.");
  }
  radarSource = radarSource.replace(
    propAnchor,
    `${propAnchor}                  highlightLabel={recommendationReason?.venueId === selectedHotspot.id ? "Radar Pick Tonight" : null}\n`
  );
}

fs.writeFileSync(radarPath, radarSource);
console.log("Applied Radar Pick recommendation badge.");
