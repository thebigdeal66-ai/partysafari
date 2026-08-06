import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/radar/SafariRadarExperience.tsx");
let source = fs.readFileSync(filePath, "utf8");

const hotspotAnchor = `function createHotspotIcon(hotspot: RadarHotspot, selected: boolean) {\n`;

if (!source.includes("const radarHotspotIconCache")) {
  if (!source.includes(hotspotAnchor)) {
    throw new Error("Could not locate Radar hotspot icon helper.");
  }

  source = source.replace(
    hotspotAnchor,
    `const radarHotspotIconCache = new Map<string, L.DivIcon>();\nconst radarClusterIconCache = new Map<string, L.DivIcon>();\nconst RADAR_ICON_CACHE_LIMIT = 240;\n\nfunction rememberRadarIcon(cache: Map<string, L.DivIcon>, key: string, icon: L.DivIcon) {\n  if (cache.size >= RADAR_ICON_CACHE_LIMIT) {\n    const oldestKey = cache.keys().next().value;\n    if (typeof oldestKey === "string") cache.delete(oldestKey);\n  }\n  cache.set(key, icon);\n  return icon;\n}\n\n${hotspotAnchor}`
  );
}

const oldHotspotReturn = `  return L.divIcon({\n    className: "",\n    html: \`<button class="\${style.className}\${selected ? " selected" : ""}" style="width:\${radius * 2}px;height:\${radius * 2}px"><span>\${score}</span></button>\`,\n    iconSize: [radius * 2, radius * 2],\n    iconAnchor: [radius, radius],\n  });`;

const newHotspotReturn = `  const cacheKey = \`${hotspot.tier}:\${score}:\${radius}:\${selected ? 1 : 0}\`;\n  const cachedIcon = radarHotspotIconCache.get(cacheKey);\n  if (cachedIcon) return cachedIcon;\n\n  return rememberRadarIcon(radarHotspotIconCache, cacheKey, L.divIcon({\n    className: "",\n    html: \`<button class="\${style.className}\${selected ? " selected" : ""}" style="width:\${radius * 2}px;height:\${radius * 2}px"><span>\${score}</span></button>\`,\n    iconSize: [radius * 2, radius * 2],\n    iconAnchor: [radius, radius],\n  }));`;

if (!source.includes("radarHotspotIconCache.get(cacheKey)")) {
  if (!source.includes(oldHotspotReturn)) {
    throw new Error("Could not locate Radar hotspot icon return block.");
  }
  source = source.replace(oldHotspotReturn, newHotspotReturn);
}

const oldClusterReturn = `  return L.divIcon({\n    className: "",\n    html: \`<button class="radar-cluster \${style.className}"><span>\${hotspots.length}</span></button>\`,\n    iconSize: [style.radius * 2, style.radius * 2],\n    iconAnchor: [style.radius, style.radius],\n  });`;

const newClusterReturn = `  const cacheKey = \`${tier}:\${hotspots.length}:\${style.radius}\`;\n  const cachedIcon = radarClusterIconCache.get(cacheKey);\n  if (cachedIcon) return cachedIcon;\n\n  return rememberRadarIcon(radarClusterIconCache, cacheKey, L.divIcon({\n    className: "",\n    html: \`<button class="radar-cluster \${style.className}"><span>\${hotspots.length}</span></button>\`,\n    iconSize: [style.radius * 2, style.radius * 2],\n    iconAnchor: [style.radius, style.radius],\n  }));`;

if (!source.includes("radarClusterIconCache.get(cacheKey)")) {
  if (!source.includes(oldClusterReturn)) {
    throw new Error("Could not locate Radar cluster icon return block.");
  }
  source = source.replace(oldClusterReturn, newClusterReturn);
}

fs.writeFileSync(filePath, source);
console.log("Applied bounded Radar marker icon cache.");
