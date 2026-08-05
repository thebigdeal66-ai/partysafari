"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { getLastUserLocation, subscribeToUserLocation, type UserGeoPoint } from "@/lib/userLocationTracker";

export type PresencePrivacy = "public" | "friends" | "invisible";

export type LivePartyPresence = {
  userId: string;
  lat: number;
  lng: number;
  privacyMode: PresencePrivacy;
  updatedAt: string;
  expiresAt: string;
};

const HEARTBEAT_MS = 60_000;
const PRESENCE_TTL_MS = 5 * 60_000;
const MIN_MOVE_DEGREES = 0.00015;

function mapRow(row: Record<string, unknown>): LivePartyPresence | null {
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  const privacyMode = row.privacy_mode;
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
  const expiresAt = typeof row.expires_at === "string" ? row.expires_at : null;

  if (!userId || !Number.isFinite(lat) || !Number.isFinite(lng) || !updatedAt || !expiresAt) return null;
  if (privacyMode !== "public" && privacyMode !== "friends" && privacyMode !== "invisible") return null;
  if (Date.parse(expiresAt) <= Date.now()) return null;

  return { userId, lat, lng, privacyMode, updatedAt, expiresAt };
}

export function useLivePartyPresence() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [privacyMode, setPrivacyModeState] = useState<PresencePrivacy>("invisible");
  const [presences, setPresences] = useState<LivePartyPresence[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef<{ point: UserGeoPoint; at: number } | null>(null);

  const loadVisiblePresence = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("user_live_presence")
      .select("user_id, latitude, longitude, privacy_mode, updated_at, expires_at")
      .gt("expires_at", new Date().toISOString())
      .limit(500);

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setPresences(((data || []) as Array<Record<string, unknown>>).map(mapRow).filter((item): item is LivePartyPresence => Boolean(item)));
  }, [supabase]);

  const publish = useCallback(async (point: UserGeoPoint, force = false) => {
    if (!userId || privacyMode === "invisible") return;

    const previous = lastSentRef.current;
    const moved = !previous || Math.abs(previous.point.lat - point.lat) + Math.abs(previous.point.lng - point.lng) >= MIN_MOVE_DEGREES;
    const heartbeatDue = !previous || Date.now() - previous.at >= HEARTBEAT_MS;
    if (!force && !moved && !heartbeatDue) return;

    const now = new Date();
    const { error: upsertError } = await supabase.from("user_live_presence").upsert({
      user_id: userId,
      latitude: point.lat,
      longitude: point.lng,
      privacy_mode: privacyMode,
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + PRESENCE_TTL_MS).toISOString(),
    }, { onConflict: "user_id" });

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    lastSentRef.current = { point, at: Date.now() };
    setError(null);
  }, [privacyMode, supabase, userId]);

  const setPrivacyMode = useCallback(async (next: PresencePrivacy) => {
    setPrivacyModeState(next);
    if (!userId) return;

    if (next === "invisible") {
      await supabase.from("user_live_presence").delete().eq("user_id", userId);
      lastSentRef.current = null;
      return;
    }

    const point = getLastUserLocation();
    if (point) {
      const now = new Date();
      await supabase.from("user_live_presence").upsert({
        user_id: userId,
        latitude: point.lat,
        longitude: point.lng,
        privacy_mode: next,
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + PRESENCE_TTL_MS).toISOString(),
      }, { onConflict: "user_id" });
      lastSentRef.current = { point, at: Date.now() };
    }
  }, [supabase, userId]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id || null;
      setUserId(id);
      if (!id) {
        setLoading(false);
        return;
      }

      void supabase.from("user_live_presence")
        .select("privacy_mode")
        .eq("user_id", id)
        .maybeSingle()
        .then(({ data: own }) => {
          if (!active) return;
          const mode = own?.privacy_mode;
          if (mode === "public" || mode === "friends" || mode === "invisible") setPrivacyModeState(mode);
          setLoading(false);
        });
    });

    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void loadVisiblePresence();

    const channel = supabase
      .channel("live-party-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_live_presence" }, () => {
        void loadVisiblePresence();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadVisiblePresence, supabase, userId]);

  useEffect(() => {
    if (!userId || privacyMode === "invisible") return;
    const unsubscribe = subscribeToUserLocation((point) => { void publish(point); });
    const interval = window.setInterval(() => {
      const point = getLastUserLocation();
      if (point) void publish(point, true);
    }, HEARTBEAT_MS);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [privacyMode, publish, userId]);

  return { userId, privacyMode, setPrivacyMode, presences, loading, error, refresh: loadVisiblePresence };
}
