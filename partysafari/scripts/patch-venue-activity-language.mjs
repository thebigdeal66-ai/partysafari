import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/venues/[slug]/page.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("function describeVenueMomentum")) {
  const anchor = `function formatBoolean(value: boolean | null) {\n  return value ? "Yes" : "No";\n}\n`;
  const helpers = `${anchor}\nfunction describeVenueMomentum(momentum: number) {\n  if (momentum >= 12) return "Surging now";\n  if (momentum >= 4) return "Building momentum";\n  if (momentum <= -8) return "Cooling down";\n  return "Holding steady";\n}\n\nfunction countLabel(count: number, singular: string, empty: string) {\n  if (count <= 0) return empty;\n  return \`${count} \${count === 1 ? singular : \`${singular}s\`}\`;\n}\n`;

  if (!source.includes(anchor)) {
    throw new Error("Could not locate venue formatting helpers.");
  }
  source = source.replace(anchor, helpers);
}

const oldBlock = `            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Stories: {metrics?.activeStories || 0}</span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Events: {metrics?.currentEvents || 0}</span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Friends: {metrics?.friendsHere || 0}</span>\n            <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm text-orange-100">\n              {scoreDisplay.showScore ? \`Party Score: \${scoreDisplay.score}\` : scoreDisplay.headline}\n            </span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Trend: {trendLabel}</span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">Momentum: {safePartyScore.momentum ?? 0}</span>`;

const newBlock = `            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">\n              📸 {countLabel(metrics?.activeStories || 0, "live story", "No live stories yet")}\n            </span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">\n              🎉 {countLabel(metrics?.currentEvents || 0, "event tonight", "No events tonight")}\n            </span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">\n              👥 {countLabel(metrics?.friendsHere || 0, "friend here", "No friends here yet")}\n            </span>\n            <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm text-orange-100">\n              🔥 {scoreDisplay.showScore ? scoreDisplay.headline : scoreDisplay.headline}\n            </span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">📈 {trendLabel}</span>\n            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">⚡ {describeVenueMomentum(safePartyScore.momentum ?? 0)}</span>`;

if (!source.includes("No live stories yet")) {
  if (!source.includes(oldBlock)) {
    throw new Error("Could not locate venue activity stat pills.");
  }
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(filePath, source);
console.log("Applied conversational venue activity language.");
