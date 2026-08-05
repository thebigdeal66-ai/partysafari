export type UserGeoPoint = {
  lat: number;
  lng: number;
};

type CachedLocation = UserGeoPoint & {
  accuracy: number;
  savedAt: number;
};

type TrackerState = {
  watchId: number | null;
  listeners: Set<(location: UserGeoPoint) => void>;
  patched: boolean;
  originalGetCurrentPosition: Geolocation["getCurrentPosition"] | null;
};

const CACHE_KEY = "partysafari:last-user-location";
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function getTrackerState(): TrackerState {
  const globalRef = globalThis as typeof globalThis & {
    __partysafariUserLocationTracker__?: TrackerState;
  };

  if (!globalRef.__partysafariUserLocationTracker__) {
    globalRef.__partysafariUserLocationTracker__ = {
      watchId: null,
      listeners: new Set(),
      patched: false,
      originalGetCurrentPosition: null,
    };
  }

  return globalRef.__partysafariUserLocationTracker__;
}

function readCachedPosition(): CachedLocation | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedLocation;
    if (
      !Number.isFinite(cached.lat) ||
      !Number.isFinite(cached.lng) ||
      !Number.isFinite(cached.accuracy) ||
      !Number.isFinite(cached.savedAt) ||
      Date.now() - cached.savedAt > CACHE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

function cachePosition(position: GeolocationPosition) {
  if (typeof window === "undefined") return;

  const cached: CachedLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // GPS remains functional when storage is unavailable.
  }

  const point = { lat: cached.lat, lng: cached.lng };
  for (const listener of getTrackerState().listeners) {
    listener(point);
  }

  window.dispatchEvent(new CustomEvent("partysafari:user-location", { detail: point }));
}

function cachedAsPosition(cached: CachedLocation): GeolocationPosition {
  return {
    coords: {
      latitude: cached.lat,
      longitude: cached.lng,
      accuracy: cached.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
    },
    timestamp: cached.savedAt,
    toJSON() {
      return this;
    },
  };
}

function requestNativePosition(
  success: PositionCallback,
  error: PositionErrorCallback | null | undefined,
  options: PositionOptions | undefined
) {
  const state = getTrackerState();
  const original = state.originalGetCurrentPosition;
  if (!original) return;

  original(
    (position) => {
      cachePosition(position);
      success(position);
    },
    (positionError) => {
      const shouldRetryWithStandardAccuracy =
        options?.enableHighAccuracy === true && positionError.code !== positionError.PERMISSION_DENIED;

      if (!shouldRetryWithStandardAccuracy) {
        error?.(positionError);
        return;
      }

      original(
        (position) => {
          cachePosition(position);
          success(position);
        },
        error || undefined,
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    },
    options
  );
}

function patchGetCurrentPosition() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

  const state = getTrackerState();
  if (state.patched) return;

  state.originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (success, error, options) => {
    const requiresFreshPosition = options?.enableHighAccuracy === true || options?.maximumAge === 0;
    const cached = requiresFreshPosition ? null : readCachedPosition();

    if (cached) {
      success(cachedAsPosition(cached));
      return;
    }

    requestNativePosition(success, error, options);
  };
  state.patched = true;
}

export function startUserLocationTracking() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

  const state = getTrackerState();
  patchGetCurrentPosition();
  if (state.watchId !== null) return;

  state.watchId = navigator.geolocation.watchPosition(
    cachePosition,
    () => {
      // Individual surfaces decide how permission and errors are presented.
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 120000,
    }
  );
}

export function stopUserLocationTracking() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

  const state = getTrackerState();
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

export function getLastUserLocation(): UserGeoPoint | null {
  const cached = readCachedPosition();
  return cached ? { lat: cached.lat, lng: cached.lng } : null;
}

export function subscribeToUserLocation(listener: (location: UserGeoPoint) => void) {
  const state = getTrackerState();
  state.listeners.add(listener);

  const cached = getLastUserLocation();
  if (cached) listener(cached);

  return () => {
    state.listeners.delete(listener);
  };
}
