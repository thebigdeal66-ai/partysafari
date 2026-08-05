import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const callbackAnchor = `  const expandSearchRadius = useCallback(() => {\n    setMaxDistanceMiles((current) => Math.min(50, current + 10));\n    setMinScore((current) => Math.max(0, current - 8));\n  }, []);`;

const callbackBlock = `${callbackAnchor}\n\n  const goToSelectedCity = useCallback(() => {\n    const destination = selectedCity === "nearby" ? userLocation : cityCenter;\n    if (!destination) {\n      setGeoError(selectedCity === "nearby"\n        ? "Choose Locate Me first so Radar can return to your area."\n        : "That city does not have a mapped venue center yet.");\n      return;\n    }\n\n    setSelectedHotspotId(null);\n    setViewMode("map");\n    setMapCenter(destination);\n    setFocusTarget({ lat: destination.lat, lng: destination.lng, zoom: selectedCity === "nearby" ? 14 : 13 });\n    setGeoError(null);\n  }, [cityCenter, selectedCity, userLocation]);`;

if (!source.includes("const goToSelectedCity = useCallback")) {
  if (!source.includes(callbackAnchor)) {
    throw new Error("Radar expandSearchRadius callback was not found.");
  }
  source = source.replace(callbackAnchor, callbackBlock);
}

const oldCityControl = `        <label className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">\n          <span className="mr-2 text-white/65">City</span>\n          <select\n            value={selectedCity}\n            onChange={(event) => setSelectedCity(event.target.value)}\n            className="bg-transparent text-white outline-none"\n          >\n            <option value="nearby" className="bg-[#0a0b14]">Near Me</option>\n            {cityOptions.filter((option) => option !== "nearby").map((option) => (\n              <option key={option} value={option} className="bg-[#0a0b14]">{option}</option>\n            ))}\n          </select>\n        </label>`;

const newCityControl = `        <div className="flex min-w-0 items-center gap-2">\n          <label className="min-w-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">\n            <span className="mr-2 text-white/65">City</span>\n            <select\n              value={selectedCity}\n              onChange={(event) => setSelectedCity(event.target.value)}\n              onKeyDown={(event) => {\n                if (event.key === "Enter") {\n                  event.preventDefault();\n                  goToSelectedCity();\n                }\n              }}\n              className="max-w-[150px] bg-transparent text-white outline-none sm:max-w-[220px]"\n            >\n              <option value="nearby" className="bg-[#0a0b14]">Near Me</option>\n              {cityOptions.filter((option) => option !== "nearby").map((option) => (\n                <option key={option} value={option} className="bg-[#0a0b14]">{option}</option>\n              ))}\n            </select>\n          </label>\n          <button\n            type="button"\n            onClick={goToSelectedCity}\n            className="shrink-0 rounded-full border border-cyan-300/40 bg-cyan-400/18 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/28"\n          >\n            Go\n          </button>\n        </div>`;

if (!source.includes('onClick={goToSelectedCity}')) {
  if (!source.includes(oldCityControl)) {
    throw new Error("Radar city selector block was not found.");
  }
  source = source.replace(oldCityControl, newCityControl);
}

await writeFile(target, source, "utf8");
console.log("Applied Safari Radar city Go control patch.");
