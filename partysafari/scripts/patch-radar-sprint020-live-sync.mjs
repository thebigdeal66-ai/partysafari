import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../src/components/radar/SafariRadarExperience.tsx");
let source = await readFile(target, "utf8");

const stateAnchor = "  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(() => new Date());\n  const [forecastPulseDelta, setForecastPulseDelta] = useState(0);";
if (source.includes(stateAnchor) && !source.includes("forecastSyncing, setForecastSyncing")) {
  source = source.replace(
    stateAnchor,
    stateAnchor + "\n  const [forecastSyncing, setForecastSyncing] = useState(false);\n  const [forecastFlashKey, setForecastFlashKey] = useState(0);"
  );
}

const deltaAnchor = "      setForecastPulseDelta(Math.round(selectedHotspot.crowdPulse.pulseScore - previous.pulse));\n      setForecastUpdatedAt(new Date());";
if (source.includes(deltaAnchor) && !source.includes("setForecastFlashKey((current) => current + 1)")) {
  source = source.replace(
    deltaAnchor,
    deltaAnchor + "\n      setForecastFlashKey((current) => current + 1);"
  );
}

const effectAnchor = "  }, [selectedHotspot]);\n\n  const heatingUp = useMemo(() => {";
const syncEffect = `  }, [selectedHotspot]);

  useEffect(() => {
    if (!selectedHotspotId) return;

    let cancelled = false;
    const syncSelectedVenue = async () => {
      if (cancelled) return;
      setForecastSyncing(true);
      try {
        await liveMetrics.refresh([selectedHotspotId]);
      } finally {
        if (!cancelled) setForecastSyncing(false);
      }
    };

    const interval = window.setInterval(() => {
      void syncSelectedVenue();
    }, 20_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncSelectedVenue();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [liveMetrics, selectedHotspotId]);

  const heatingUp = useMemo(() => {`;
if (source.includes(effectAnchor) && !source.includes("const syncSelectedVenue = async")) {
  source = source.replace(effectAnchor, syncEffect);
}

const forecastCardAnchor = '<div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-3">';
const animatedForecastCard = '<div key={forecastFlashKey} className={`rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-3 transition-all duration-500 ${forecastPulseDelta !== 0 ? "animate-[radarForecastFlash_900ms_ease-out]" : ""}`}>';
if (source.includes(forecastCardAnchor) && !source.includes("radarForecastFlash")) {
  source = source.replace(forecastCardAnchor, animatedForecastCard);
}

const freshnessAnchor = '<p className="mt-1 text-[10px] text-white/40">Live update · {forecastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>';
const syncingFreshness = '<p className="mt-1 text-[10px] text-white/40">{forecastSyncing ? "Syncing live signals…" : <>Live update · {forecastUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}</p>';
if (source.includes(freshnessAnchor)) {
  source = source.replace(freshnessAnchor, syncingFreshness);
}

const styleAnchor = "        @keyframes radar-live-signal {\n          0% { transform: scale(.88); opacity: .9; }\n          100% { transform: scale(1.35); opacity: 0; }\n        }";
const enhancedStyles = `${styleAnchor}

        @keyframes radarForecastFlash {
          0% { box-shadow: 0 0 0 rgba(34,211,238,0); transform: scale(1); }
          35% { box-shadow: 0 0 34px rgba(34,211,238,.34); transform: scale(1.012); }
          100% { box-shadow: 0 0 0 rgba(34,211,238,0); transform: scale(1); }
        }`;
if (source.includes(styleAnchor) && !source.includes("@keyframes radarForecastFlash")) {
  source = source.replace(styleAnchor, enhancedStyles);
}

await writeFile(target, source, "utf8");
console.log("Applied Sprint 020 Radar live sync and pulse animation.");
