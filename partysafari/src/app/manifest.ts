import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PartySafari.live",
    short_name: "PartySafari",
    description: "Discover what is happening tonight, see live venue energy, and find the party near you.",
    start_url: "/radar",
    display: "standalone",
    background_color: "#07070B",
    theme_color: "#7C3AED",
    orientation: "portrait-primary",
    categories: ["entertainment", "social", "lifestyle"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
