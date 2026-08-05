import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (source.includes("memo:crowdPulseCells")) {
  console.log("Crowd Pulse v1 patch already applied.");
  process.exit(0);
}

source = source.replace(
  `type OverlayState = {\n  friends: boolean;`,
  `type OverlayState = {\n  crowdPulse: boolean;\n  friends: boolean;`
);

source = source.replace(
  `  const [overlays, setOverlays] = useState<OverlayState>({\n    friends: false,`,
  `  const [overlays, setOverlays] = useState<OverlayState>({\n    crowdPulse: true,\n    friends: false,`
);

const clusterMemo = `  const clusteredHotspots = useMemo(() => {\n    radarTrace("SafariRadarExperience", "memo:clusteredHotspots", {\n      line: 813,\n      filteredLength: filteredHotspots.length,\n      mapZoom,\n    });\n    return clusterHotspots(filteredHotspots, mapZoom);\n  }, [filteredHotspots, mapZoom]);`;

const pulseMemo = `${clusterMemo}\n\n  const crowdPulseCells = useMemo(() => {\n    radarTrace("SafariRadarExperience", "memo:crowdPulseCells", {\n      hotspotCount: filteredHotspots.length,\n    });\n\n    const cellSize = mapZoom >= 15 ? 0.0028 : mapZoom >= 13 ? 0.0055 : 0.009;\n    const cells = new Map<string, {\n      latTotal: number;\n      lngTotal: number;\n      venueCount: number;\n      contributors: number;\n      scoreTotal: number;\n      momentumTotal: number;\n    }>();\n\n    for (const hotspot of filteredHotspots) {\n      const contributors = Math.max(0, hotspot.liveCheckins) + Math.max(0, hotspot.friendsHere);\n      if (contributors <= 0) {\n        continue;\n      }\n\n      const latBin = Math.floor(hotspot.latitude / cellSize);\n      const lngBin = Math.floor(hotspot.longitude / cellSize);\n      const key = \`\${latBin}:\${lngBin}\`;\n      const current = cells.get(key) || {\n        latTotal: 0,\n        lngTotal: 0,\n        venueCount: 0,\n        contributors: 0,\n        scoreTotal: 0,\n        momentumTotal: 0,\n      };\n\n      current.latTotal += hotspot.latitude;\n      current.lngTotal += hotspot.longitude;\n      current.venueCount += 1;\n      current.contributors += contributors;\n      current.scoreTotal += hotspot.partyScore.score * Math.max(1, contributors);\n      current.momentumTotal += hotspot.partyScore.momentum;\n      cells.set(key, current);\n    }\n\n    return Array.from(cells.entries())\n      .filter(([, cell]) => cell.contributors >= 3)\n      .map(([id, cell]) => {\n        const score = Math.round(cell.scoreTotal / Math.max(1, cell.contributors));\n        const radius = Math.min(520, 170 + cell.contributors * 36 + Math.max(0, cell.momentumTotal) * 8);\n        const color = score >= 75 ? "#d946ef" : score >= 55 ? "#f43f5e" : score >= 35 ? "#f97316" : "#22d3ee";\n        return {\n          id,\n          lat: cell.latTotal / cell.venueCount,\n          lng: cell.lngTotal / cell.venueCount,\n          contributors: cell.contributors,\n          score,\n          radius,\n          color,\n        };\n      });\n  }, [filteredHotspots, mapZoom]);`;

if (!source.includes(clusterMemo)) {
  throw new Error("Could not locate clusteredHotspots memo for Crowd Pulse patch.");
}
source = source.replace(clusterMemo, pulseMemo);

const tileLayer = `            <TileLayer\n              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'\n              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"\n            />`;

const pulseLayer = `${tileLayer}\n\n            {overlays.crowdPulse && crowdPulseCells.map((cell) => (\n              <Circle\n                key={\`pulse-cell:\${cell.id}\`}\n                center={[cell.lat, cell.lng]}\n                radius={cell.radius}\n                interactive={false}\n                pathOptions={{\n                  color: cell.color,\n                  weight: 1,\n                  opacity: 0.34,\n                  fillColor: cell.color,\n                  fillOpacity: Math.min(0.28, 0.1 + cell.score / 650),\n                }}\n              />\n            ))}`;

if (!source.includes(tileLayer)) {
  throw new Error("Could not locate Radar TileLayer for Crowd Pulse patch.");
}
source = source.replace(tileLayer, pulseLayer);

source = source.replace(
  `          {([\n            ["friends", "Friends"],`,
  `          {([\n            ["crowdPulse", "Crowd Pulse"],\n            ["friends", "Friends"],`
);

fs.writeFileSync(filePath, source);
console.log("Applied Crowd Pulse v1 privacy-safe heat layer.");
