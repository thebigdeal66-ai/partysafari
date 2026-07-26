"use client";

import { useEffect } from "react";
import { TEMP_KILL_SWITCH } from "@/lib/runtimeKillSwitch";

export default function GlobalRuntimeKillSwitch() {
  useEffect(() => {
    const originalSetInterval = window.setInterval.bind(window);
    const originalRequestAnimationFrame = window.requestAnimationFrame?.bind(window);
    const originalWatchPosition = navigator.geolocation?.watchPosition?.bind(navigator.geolocation);

    if (TEMP_KILL_SWITCH.disableSetInterval) {
      window.setInterval = ((..._args: Parameters<typeof window.setInterval>) => {
        return -1 as unknown as number;
      }) as typeof window.setInterval;
    }

    if (TEMP_KILL_SWITCH.disableRequestAnimationFrame && window.requestAnimationFrame) {
      window.requestAnimationFrame = ((_callback: FrameRequestCallback) => {
        return -1;
      }) as typeof window.requestAnimationFrame;
    }

    if (TEMP_KILL_SWITCH.disableGeolocationWatchPosition && navigator.geolocation?.watchPosition) {
      navigator.geolocation.watchPosition = ((
        _success: PositionCallback,
        _error?: PositionErrorCallback | null,
        _options?: PositionOptions
      ) => {
        return -1;
      }) as typeof navigator.geolocation.watchPosition;
    }

    return () => {
      window.setInterval = originalSetInterval;

      if (originalRequestAnimationFrame) {
        window.requestAnimationFrame = originalRequestAnimationFrame;
      }

      if (navigator.geolocation && originalWatchPosition) {
        navigator.geolocation.watchPosition = originalWatchPosition;
      }
    };
  }, []);

  return null;
}
