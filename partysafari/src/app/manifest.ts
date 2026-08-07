import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PartySafari.live",
    short_name: "PartySafari",
    description:
      "Discover what is happening tonight, see live venue energy, and find the party near you.",
    start_url: "/radar",
    scope: "/",
    display: "standalone",
    background_color: "#07070B",
    theme_color: "#7C3AED",
    orientation: "portrait-primary",
    categories: ["entertainment", "social", "lifestyle"],
    icons: [
      {
        src: "/icons/partysafari-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/partysafari-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/partysafari-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/partysafari-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
