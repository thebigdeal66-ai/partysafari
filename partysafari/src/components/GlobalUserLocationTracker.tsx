"use client";

import { useEffect } from "react";
import { startUserLocationTracking, stopUserLocationTracking } from "@/lib/userLocationTracker";

export default function GlobalUserLocationTracker() {
  useEffect(() => {
    startUserLocationTracking();
    return () => {
      stopUserLocationTracking();
    };
  }, []);

  return null;
}
