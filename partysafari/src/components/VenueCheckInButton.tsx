"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type VenueCheckInButtonProps = {
  venueId: string;
  onCheckedIn?: () => void;
  onCountChange?: (count: number) => void;
  className?: string;
  compact?: boolean;
  showCount?: boolean;
};

type DevicePosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function requestDevicePosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation-unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12_000,
      }
    );
  });
}

export default function VenueCheckInButton({
  venueId,
  onCheckedIn,
  onCountChange,
  className,
  compact = false,
  showCount = false,
}: VenueCheckInButtonProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const refreshActiveCheckIn = useCallback(
    async (nextProfileId?: string | null) => {
      const currentProfileId = nextProfileId ?? profileId;
      if (!currentProfileId) {
        setAlreadyCheckedIn(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("venue_checkins")
        .select("id")
        .eq("venue_id", venueId)
        .eq("profile_id", currentProfileId)
        .gt("expires_at", nowIso)
        .limit(1);

      if (error) {
        setAlreadyCheckedIn(false);
        return;
      }

      setAlreadyCheckedIn(Boolean(data?.length));
    },
    [profileId, supabase, venueId]
  );

  const refreshLiveCount = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_venue_live_counts");
    if (error) {
      return;
    }

    const countByVenueId = new Map<string, number>();
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const id = typeof row.venue_id === "string" ? row.venue_id : typeof row.id === "string" ? row.id : null;
      if (!id) {
        continue;
      }
      const rawCount = row.live_count ?? row.count ?? row.checkins ?? 0;
      countByVenueId.set(id, Number(rawCount));
    }

    const count = countByVenueId.get(venueId) || 0;
    setLiveCount(count);
    onCountChange?.(count);
  }, [supabase, venueId, onCountChange]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      const userId = session?.user?.id ?? null;
      setProfileId(userId);
      setIsAuthenticated(Boolean(userId));
      await refreshActiveCheckIn(userId);
    }

    void initialize();
    void refreshLiveCount();

    return () => {
      mounted = false;
    };
  }, [refreshActiveCheckIn, refreshLiveCount, supabase]);

  useEffect(() => {
    const channel = supabase.channel(`venue-checkins-${venueId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "venue_checkins",
        filter: `venue_id=eq.${venueId}`,
      },
      () => {
        void refreshLiveCount();
      }
    );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, venueId, refreshLiveCount]);

  const handleCheckIn = useCallback(async () => {
    if (!isAuthenticated || !profileId) {
      setMessage("Sign in to check in.");
      return;
    }

    if (checkingIn || checkingOut || alreadyCheckedIn) {
      return;
    }

    setCheckingIn(true);
    setMessage("Verifying your location...");

    let position: DevicePosition;
    try {
      position = await requestDevicePosition();
    } catch (error) {
      setCheckingIn(false);
      const code = typeof error === "object" && error && "code" in error ? Number((error as { code?: unknown }).code) : 0;
      setMessage(
        code === 1
          ? "Location permission is required to check in. Allow location access and try again."
          : "We could not verify your location. Move somewhere with a clearer GPS signal and try again."
      );
      return;
    }

    const { error } = await supabase.rpc("check_in_to_venue", {
      p_venue_id: venueId,
      p_latitude: position.latitude,
      p_longitude: position.longitude,
      p_accuracy_meters: position.accuracy,
    });

    setCheckingIn(false);

    if (error) {
      const rawMessage = (error.message || "").toLowerCase();
      if (rawMessage.includes("outside venue geofence")) {
        setMessage("You need to be at or very close to this venue to check in.");
        return;
      }
      if (rawMessage.includes("valid device location required")) {
        setMessage("We could not verify a valid device location. Try again with location services enabled.");
        return;
      }
      if (rawMessage.includes("already") || rawMessage.includes("duplicate")) {
        setAlreadyCheckedIn(true);
        setMessage("You are already checked in.");
        onCheckedIn?.();
        return;
      }

      setMessage("Could not check you in right now.");
      return;
    }

    setAlreadyCheckedIn(true);
    setMessage("Checked in. You are on the live count.");
    onCheckedIn?.();
    await refreshLiveCount();
  }, [alreadyCheckedIn, checkingIn, checkingOut, isAuthenticated, onCheckedIn, profileId, supabase, venueId, refreshLiveCount]);

  const handleCheckOut = useCallback(async () => {
    if (!isAuthenticated || !profileId) {
      setMessage("Sign in to check out.");
      return;
    }

    if (checkingIn || checkingOut) {
      return;
    }

    setCheckingOut(true);
    setMessage(null);

    const { error } = await supabase.rpc("check_out_of_venue", {
      p_venue_id: venueId,
    });

    setCheckingOut(false);

    if (error) {
      setMessage("Could not check you out right now.");
      return;
    }

    setAlreadyCheckedIn(false);
    setMessage("You are checked out.");
    await refreshLiveCount();
  }, [checkingIn, checkingOut, isAuthenticated, profileId, supabase, venueId, refreshLiveCount]);

  const baseClasses =
    className ||
    (compact
      ? "rounded-full border border-orange-300/40 bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-100 transition hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-full border border-orange-300/40 bg-orange-500/20 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60");

  const isErrorMessage = message?.includes("Could not") || message?.includes("required") || message?.includes("need to be") || message?.includes("could not verify");

  return (
    <div className="flex flex-col gap-2">
      {alreadyCheckedIn ? (
        <button
          type="button"
          onClick={() => void handleCheckOut()}
          disabled={!isAuthenticated || checkingOut || checkingIn}
          className={baseClasses}
        >
          {checkingOut ? "Checking Out..." : "Leave Venue"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleCheckIn()}
          disabled={!isAuthenticated || checkingIn || checkingOut}
          className={baseClasses}
        >
          {!isAuthenticated
            ? "Sign In to Check In"
            : checkingIn
              ? "Verifying Location..."
              : "I'm Here"}
        </button>
      )}
      {message ? <p className={`text-xs ${isErrorMessage ? "text-red-400" : message.includes("checked out") ? "text-blue-300" : "text-green-300"}`}>{message}</p> : null}
      {showCount && <p className="text-xs text-white/60">{liveCount} checked in</p>}
    </div>
  );
}
