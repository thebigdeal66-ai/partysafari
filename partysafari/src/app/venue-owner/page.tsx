"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { getCrowdLevel, getCrowdLevelColorClass, getCrowdLevelEmoji, getCrowdLevelDescription, formatCheckInCount } from "@/lib/venueCheckInUtils";
import EventsManager from "@/components/venue-owner/EventsManager";
import StoryComposer from "@/components/stories/StoryComposer";
import StoryGrid from "@/components/stories/StoryGrid";
import StoryViewer from "@/components/stories/StoryViewer";
import { useStories } from "@/components/stories/useStories";

type TabKey = "overview" | "events" | "tonight" | "specials" | "gallery" | "analytics" | "settings";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type VenueRecord = Record<string, unknown> & {
  id: string;
  name?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
  verified?: boolean | null;
  current_status?: string | null;
  crowd_level?: string | null;
  description?: string | null;
  phone?: string | null;
  website_url?: string | null;
  address?: string | null;
  music_genres?: string[] | null;
  dress_code?: string | null;
  food_available?: boolean | null;
  vip_available?: boolean | null;
  drink_specials?: string | null;
};

type EventRecord = Record<string, unknown> & {
  id?: string;
  venue_id?: string;
  title?: string | null;
  description?: string | null;
  cover_charge?: string | number | null;
  start_time?: string | null;
  end_time?: string | null;
  ticket_link?: string | null;
  age_min?: number | null;
  visibility?: string | null;
  featured?: boolean | null;
};

type PerformerOption = {
  id: string;
  label: string;
};

type TonightDraft = {
  title: string;
  description: string;
  coverCharge: string;
  startTime: string;
  endTime: string;
  ticketUrl: string;
  ageMinimum: string;
  visibility: string;
  featured: boolean;
};

type SpecialsDraft = {
  drinkSpecials: string;
  foodSpecials: string;
  happyHour: string;
  vipPackage: string;
};

type SettingsDraft = {
  description: string;
  phone: string;
  website: string;
  address: string;
  musicGenres: string;
  dressCode: string;
  foodAvailable: boolean;
  vipAvailable: boolean;
};

// The single ownership relationship the dashboard trusts. Any other signal
// (or a failed lookup) denies access rather than falling back to another venue.
const VENUE_OWNER_COLUMN = "owner_id";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "events", label: "Events" },
  { key: "tonight", label: "Tonight" },
  { key: "specials", label: "Specials" },
  { key: "gallery", label: "Gallery" },
  { key: "analytics", label: "Analytics" },
  { key: "settings", label: "Settings" },
];

function toInputDateTime(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = parsed.getFullYear();
  const month = pad(parsed.getMonth() + 1);
  const day = pad(parsed.getDate());
  const hours = pad(parsed.getHours());
  const minutes = pad(parsed.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoString(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeTextArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [] as string[];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return false;
}

function readGalleryUrls(venue: VenueRecord | null) {
  if (!venue) {
    return [] as string[];
  }

  const values = [venue.gallery_images, venue.gallery_urls, venue.photos];
  for (const value of values) {
    if (Array.isArray(value)) {
      const urls = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (urls.length > 0) {
        return urls;
      }
    }
  }

  const fallbackHero = [venue.image_url, venue.photo_url].filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return fallbackHero;
}

export default function VenueOwnerPage() {
  return (
    <AuthGuard>
      <VenueOwnerDashboard />
    </AuthGuard>
  );
}

function VenueOwnerDashboard() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [savingTonight, setSavingTonight] = useState(false);
  const [savingSpecials, setSavingSpecials] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [venue, setVenue] = useState<VenueRecord | null>(null);
  const [tonightEvent, setTonightEvent] = useState<EventRecord | null>(null);
  const [performers, setPerformers] = useState<PerformerOption[]>([]);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>([]);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  const [liveCheckIns, setLiveCheckIns] = useState(0);
  const [upcomingEventCount, setUpcomingEventCount] = useState(0);
  const [followerCountPlaceholder] = useState(0);

  const [tonightDraft, setTonightDraft] = useState<TonightDraft>({
    title: "",
    description: "",
    coverCharge: "",
    startTime: "",
    endTime: "",
    ticketUrl: "",
    ageMinimum: "21",
    visibility: "public",
    featured: false,
  });

  const [specialsDraft, setSpecialsDraft] = useState<SpecialsDraft>({
    drinkSpecials: "",
    foodSpecials: "",
    happyHour: "",
    vipPackage: "",
  });

  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    description: "",
    phone: "",
    website: "",
    address: "",
    musicGenres: "",
    dressCode: "",
    foodAvailable: false,
    vipAvailable: false,
  });
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);

  const pushToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2600);
  }, []);
  const storyState = useStories({
    enabled: Boolean(venue?.id),
    venueId: venue?.id || undefined,
    includeOwnViewCounts: true,
    subscribeOwnStoryViewCounts: true,
  });

  const resolveOwnedVenue = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq(VENUE_OWNER_COLUMN, userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as VenueRecord;
    },
    [supabase]
  );

  const loadPerformers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username")
      .eq("profile_type", "performer")
      .order("full_name", { ascending: true });

    if (error) {
      setPerformers([]);
      return;
    }

    const options: PerformerOption[] = (data || []).map((profile: Record<string, unknown>) => {
      const id = String(profile.id || "");
      const fullName = typeof profile.full_name === "string" ? profile.full_name : "";
      const username = typeof profile.username === "string" ? profile.username : "";
      const label = fullName || (username ? `@${username}` : "Performer");
      return { id, label };
    });

    setPerformers(options.filter((option) => option.id));
  }, [supabase]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setVenue(null);
    setTonightEvent(null);
    setGalleryUrls([]);
    setPerformers([]);
    setSelectedPerformerIds([]);

    // getUser() validates the token against the auth server; getSession() only
    // reads locally stored state and must not gate an authorization decision.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (userError || !userId) {
      setLoading(false);
      return;
    }

    const venueRow = await resolveOwnedVenue(userId);
    if (!venueRow?.id) {
      setLoading(false);
      return;
    }

    setVenue(venueRow);
    setGalleryUrls(readGalleryUrls(venueRow));

    setSpecialsDraft({
      drinkSpecials: firstString(venueRow.drink_specials),
      foodSpecials: firstString(venueRow.food_specials),
      happyHour: firstString(venueRow.happy_hour),
      vipPackage: firstString(venueRow.vip_package),
    });

    setSettingsDraft({
      description: firstString(venueRow.description),
      phone: firstString(venueRow.phone),
      website: firstString(venueRow.website_url),
      address: firstString(venueRow.address),
      musicGenres: normalizeTextArray(venueRow.music_genres).join(", "),
      dressCode: firstString(venueRow.dress_code),
      foodAvailable: firstBoolean(venueRow.food_available),
      vipAvailable: firstBoolean(venueRow.vip_available),
    });

    const nowIso = new Date().toISOString();
    const { count: liveCount } = await supabase
      .from("venue_checkins")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueRow.id)
      .gt("expires_at", nowIso);

    setLiveCheckIns(liveCount || 0);

    const { count: eventsCount } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueRow.id)
      .gte("start_time", nowIso);
    setUpcomingEventCount(eventsCount || 0);

    const { data: events } = await supabase
      .from("events")
      .select("*")
      .eq("venue_id", venueRow.id)
      .order("start_time", { ascending: true })
      .limit(30);

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const tonight = (events || []).find((event: Record<string, unknown>) => {
      const raw = event.start_time || event.event_date;
      if (typeof raw !== "string") {
        return false;
      }

      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        return false;
      }

      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return dateKey === todayKey;
    }) as EventRecord | undefined;

    const firstUpcoming = ((events || [])[0] as EventRecord | undefined) ?? null;
    const activeTonight = tonight || firstUpcoming;
    setTonightEvent(activeTonight);

    setTonightDraft({
      title: firstString(activeTonight?.title),
      description: firstString(activeTonight?.description),
      coverCharge: firstString(activeTonight?.cover_charge, activeTonight?.cover, activeTonight?.cover_price),
      startTime: toInputDateTime(activeTonight?.start_time),
      endTime: toInputDateTime(activeTonight?.end_time),
      ticketUrl: firstString(activeTonight?.ticket_link, activeTonight?.ticket_url, activeTonight?.tickets_url),
      ageMinimum: firstString(activeTonight?.age_min, activeTonight?.age_minimum, "21"),
      visibility: firstString(activeTonight?.visibility, "public"),
      featured: firstBoolean(activeTonight?.featured, activeTonight?.is_featured),
    });

    if (activeTonight?.id) {
      const { data: performerRows } = await supabase
        .from("event_performers")
        .select("*")
        .eq("event_id", activeTonight.id);

      const performerIds = (performerRows || [])
        .map((row: Record<string, unknown>) => {
          const performerId = row.performer_id;
          if (typeof performerId === "string") {
            return performerId;
          }

          const profileId = row.profile_id;
          return typeof profileId === "string" ? profileId : "";
        })
        .filter(Boolean);

      setSelectedPerformerIds(performerIds);
    } else {
      setSelectedPerformerIds([]);
    }

    await loadPerformers();

    setLoading(false);
  }, [loadPerformers, resolveOwnedVenue, supabase]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const heroImage = venue?.image_url || venue?.photo_url || galleryUrls[0] || null;

  const updateVenueWithFallback = useCallback(
    async (payloads: Array<Record<string, unknown>>) => {
      if (!venue?.id) {
        return false;
      }

      for (const payload of payloads) {
        const { error } = await supabase.from("venues").update(payload).eq("id", venue.id);
        if (!error) {
          return true;
        }
      }

      return false;
    },
    [supabase, venue?.id]
  );

  const saveTonight = useCallback(async () => {
    if (!venue?.id) {
      return;
    }

    setSavingTonight(true);

    const optimisticEvent: EventRecord = {
      ...(tonightEvent || {}),
      title: tonightDraft.title,
      description: tonightDraft.description,
      cover_charge: tonightDraft.coverCharge,
      start_time: toIsoString(tonightDraft.startTime),
      end_time: toIsoString(tonightDraft.endTime),
      ticket_link: tonightDraft.ticketUrl,
      age_min: Number(tonightDraft.ageMinimum || "21"),
      visibility: tonightDraft.visibility,
      featured: tonightDraft.featured,
    };

    setTonightEvent(optimisticEvent);

    const basePayload = {
      venue_id: venue.id,
      title: tonightDraft.title || "Tonight at the venue",
      description: tonightDraft.description || null,
      cover_charge: tonightDraft.coverCharge || null,
      start_time: toIsoString(tonightDraft.startTime),
      end_time: toIsoString(tonightDraft.endTime),
      ticket_link: tonightDraft.ticketUrl || null,
      age_min: Number(tonightDraft.ageMinimum || "21"),
      visibility: tonightDraft.visibility || "public",
      featured: tonightDraft.featured,
      is_featured: tonightDraft.featured,
    } as Record<string, unknown>;

    let eventId = tonightEvent?.id || "";
    if (eventId) {
      const { error } = await supabase.from("events").update(basePayload).eq("id", eventId);
      if (error) {
        const fallbackPayload = {
          title: basePayload.title,
          description: basePayload.description,
          cover_charge: basePayload.cover_charge,
          start_time: basePayload.start_time,
          ticket_link: basePayload.ticket_link,
          age_min: basePayload.age_min,
        };
        const { error: fallbackError } = await supabase.from("events").update(fallbackPayload).eq("id", eventId);
        if (fallbackError) {
          pushToast("Could not save tonight details.", "error");
          setSavingTonight(false);
          return;
        }
      }
    } else {
      const { data, error } = await supabase.from("events").insert(basePayload).select("id").single();
      if (error || !data?.id) {
        const insertFallback = {
          venue_id: venue.id,
          title: tonightDraft.title || "Tonight at the venue",
          description: tonightDraft.description || null,
          start_time: toIsoString(tonightDraft.startTime),
        };
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("events")
          .insert(insertFallback)
          .select("id")
          .single();

        if (fallbackError || !fallbackData?.id) {
          pushToast("Could not create tonight event.", "error");
          setSavingTonight(false);
          return;
        }

        eventId = fallbackData.id;
      } else {
        eventId = data.id;
      }
    }

    if (eventId) {
      await supabase.from("event_performers").delete().eq("event_id", eventId);

      if (selectedPerformerIds.length > 0) {
        const performerRows = selectedPerformerIds.map((performerId) => ({
          event_id: eventId,
          performer_id: performerId,
        }));

        const { error: performerInsertError } = await supabase.from("event_performers").insert(performerRows);
        if (performerInsertError) {
          const profileRows = selectedPerformerIds.map((performerId) => ({
            event_id: eventId,
            profile_id: performerId,
          }));
          await supabase.from("event_performers").insert(profileRows);
        }
      }

      setTonightEvent((current) => ({ ...(current || {}), id: eventId }));
    }

    pushToast("Tonight section updated.", "success");
    setSavingTonight(false);
  }, [pushToast, selectedPerformerIds, supabase, tonightDraft, tonightEvent, venue?.id]);

  const saveSpecials = useCallback(async () => {
    if (!venue) {
      return;
    }

    setSavingSpecials(true);

    setVenue((current) =>
      current
        ? {
            ...current,
            drink_specials: specialsDraft.drinkSpecials,
            food_specials: specialsDraft.foodSpecials,
            happy_hour: specialsDraft.happyHour,
            vip_package: specialsDraft.vipPackage,
          }
        : current
    );

    const success = await updateVenueWithFallback([
      {
        drink_specials: specialsDraft.drinkSpecials || null,
        food_specials: specialsDraft.foodSpecials || null,
        happy_hour: specialsDraft.happyHour || null,
        vip_package: specialsDraft.vipPackage || null,
      },
      {
        drink_specials: specialsDraft.drinkSpecials || null,
      },
    ]);

    if (!success) {
      pushToast("Unable to save specials for this venue schema.", "error");
      setSavingSpecials(false);
      return;
    }

    pushToast("Specials saved.", "success");
    setSavingSpecials(false);
  }, [specialsDraft, updateVenueWithFallback, venue, pushToast]);

  const saveSettings = useCallback(async () => {
    if (!venue) {
      return;
    }

    setSavingSettings(true);

    setVenue((current) =>
      current
        ? {
            ...current,
            description: settingsDraft.description,
            phone: settingsDraft.phone,
            website_url: settingsDraft.website,
            address: settingsDraft.address,
            music_genres: normalizeTextArray(settingsDraft.musicGenres),
            dress_code: settingsDraft.dressCode,
            food_available: settingsDraft.foodAvailable,
            vip_available: settingsDraft.vipAvailable,
          }
        : current
    );

    const success = await updateVenueWithFallback([
      {
        description: settingsDraft.description || null,
        phone: settingsDraft.phone || null,
        website_url: settingsDraft.website || null,
        address: settingsDraft.address || null,
        music_genres: normalizeTextArray(settingsDraft.musicGenres),
        dress_code: settingsDraft.dressCode || null,
        food_available: settingsDraft.foodAvailable,
        vip_available: settingsDraft.vipAvailable,
      },
      {
        description: settingsDraft.description || null,
        phone: settingsDraft.phone || null,
        website_url: settingsDraft.website || null,
        address: settingsDraft.address || null,
      },
    ]);

    if (!success) {
      pushToast("Unable to save settings for this venue schema.", "error");
      setSavingSettings(false);
      return;
    }

    pushToast("Settings updated.", "success");
    setSavingSettings(false);
  }, [settingsDraft, updateVenueWithFallback, venue, pushToast]);

  const uploadGallery = useCallback(
    async (files: FileList | null) => {
      if (!files || !venue?.id) {
        return;
      }

      const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (selected.length === 0) {
        pushToast("Select at least one image file.", "info");
        return;
      }

      setUploadingGallery(true);

      const uploadedUrls: string[] = [];
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        const extension = file.name.split(".").pop() || "jpg";
        const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "");
        const filePath = `${venue.id}/gallery/${Date.now()}-${index}.${safeExtension}`;

        const { error: uploadError } = await supabase.storage.from("party-media").upload(filePath, file, {
          contentType: file.type,
          upsert: true,
        });

        if (uploadError) {
          pushToast(uploadError.message || "Image upload failed.", "error");
          continue;
        }

        const { data } = supabase.storage.from("party-media").getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const nextGallery = [...galleryUrls, ...uploadedUrls];
        setGalleryUrls(nextGallery);

        const saved = await updateVenueWithFallback([
          {
            gallery_images: nextGallery,
            image_url: nextGallery[0] || null,
          },
          {
            gallery_urls: nextGallery,
            image_url: nextGallery[0] || null,
          },
          {
            image_url: nextGallery[0] || null,
          },
        ]);

        if (!saved) {
          pushToast("Images uploaded, but gallery persistence is limited by schema.", "info");
        } else {
          pushToast("Gallery updated.", "success");
        }
      }

      setUploadingGallery(false);
    },
    [galleryUrls, pushToast, supabase, updateVenueWithFallback, venue?.id]
  );

  const togglePerformer = (performerId: string) => {
    setSelectedPerformerIds((current) => {
      if (current.includes(performerId)) {
        return current.filter((id) => id !== performerId);
      }
      return [...current, performerId];
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#10061f] p-6 text-white/70">
          Loading venue owner dashboard...
        </div>
      </main>
    );
  }

  if (!venue) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <h1 className="text-3xl font-bold">Venue Owner Dashboard</h1>
          <p className="mt-3 text-white/70">No venue is connected to this account.</p>
          <p className="mt-2 text-sm text-white/50">
            If you manage a venue and expect to see it here, contact support to have it linked to your account.
          </p>
        </div>
      </main>
    );
  }

  const venueStories = [...storyState.stories].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return (
    <main className="min-h-screen bg-[#07070B] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#10061f]">
          <div className="relative h-52 md:h-64">
            {heroImage ? (
              <img src={heroImage} alt={venue.name || "Venue"} className="h-full w-full object-cover opacity-50" />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-violet-900/40 to-orange-800/30" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#10061f] via-[#10061f]/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold sm:text-4xl">{venue.name || "Venue"}</h1>
                {venue.verified ? (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                    Verified
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/75">Manage tonight, specials, gallery, and venue settings.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#10061f] p-2">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-violet-600 text-white"
                    : "border border-white/10 bg-white/5 text-white/75 hover:border-violet-300/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Current Status" value={firstString(venue.current_status, "Open")} />
              <StatCard 
                label="Crowd Level" 
                value={getCrowdLevel(liveCheckIns)}
                emoji={getCrowdLevelEmoji(getCrowdLevel(liveCheckIns))}
                colorClass={getCrowdLevelColorClass(getCrowdLevel(liveCheckIns))}
              />
              <StatCard 
                label="Live Check-ins" 
                value={formatCheckInCount(liveCheckIns)}
                description={getCrowdLevelDescription(getCrowdLevel(liveCheckIns))}
              />
              <StatCard label="Followers" value={`${followerCountPlaceholder} (placeholder)`} />
              <StatCard label="Upcoming Events" value={String(upcomingEventCount)} />
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Venue Story</h2>
                  <p className="mt-1 text-sm text-white/65">Post a live story pre-tagged to this venue.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStoryComposerOpen(true)}
                  className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
                >
                  Add Venue Story
                </button>
              </div>
              <StoryGrid
                stories={venueStories}
                emptyMessage="No active venue stories yet."
                showAuthor={true}
                onOpenStory={(story) => setViewerAuthorId(story.author_id)}
              />
            </section>
          </>
        ) : null}

        {activeTab === "tonight" ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-2xl font-semibold">Tonight</h2>
            <p className="mt-1 text-sm text-white/70">Edit tonight&apos;s event details and performers.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-white/75">
                Event Title
                <input
                  value={tonightDraft.title}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, title: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Cover Charge
                <input
                  value={tonightDraft.coverCharge}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, coverCharge: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                  placeholder="e.g. 20"
                />
              </label>

              <label className="text-sm text-white/75 md:col-span-2">
                Description
                <textarea
                  value={tonightDraft.description}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, description: e.target.value }))}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Start Time
                <input
                  type="datetime-local"
                  value={tonightDraft.startTime}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, startTime: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                End Time
                <input
                  type="datetime-local"
                  value={tonightDraft.endTime}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, endTime: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Ticket URL
                <input
                  value={tonightDraft.ticketUrl}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, ticketUrl: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                  placeholder="https://"
                />
              </label>

              <label className="text-sm text-white/75">
                Age Minimum
                <input
                  type="number"
                  min={0}
                  value={tonightDraft.ageMinimum}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, ageMinimum: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Visibility
                <select
                  value={tonightDraft.visibility}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, visibility: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm text-white/80 md:items-end md:pb-2">
                <input
                  type="checkbox"
                  checked={tonightDraft.featured}
                  onChange={(e) => setTonightDraft((current) => ({ ...current, featured: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/30 bg-[#07070B]"
                />
                Featured Event
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-[#07070B] p-4">
              <h3 className="text-lg font-semibold">Performer Picker</h3>
              <p className="mt-1 text-sm text-white/65">Profiles where profile_type is performer.</p>
              {performers.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">No performers found.</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {performers.map((performer) => (
                    <label
                      key={performer.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPerformerIds.includes(performer.id)}
                        onChange={() => togglePerformer(performer.id)}
                      />
                      {performer.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                type="button"
                disabled={savingTonight}
                onClick={() => void saveTonight()}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
              >
                {savingTonight ? "Saving Tonight..." : "Save Tonight"}
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "events" ? (
          <EventsManager venueId={venue.id} pushToast={pushToast} />
        ) : null}

        {activeTab === "specials" ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-2xl font-semibold">Specials</h2>
            <p className="mt-1 text-sm text-white/70">Keep tonight&apos;s offers current.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SpecialCard
                title="Drink Specials"
                value={specialsDraft.drinkSpecials}
                onChange={(value) => setSpecialsDraft((current) => ({ ...current, drinkSpecials: value }))}
              />
              <SpecialCard
                title="Food Specials"
                value={specialsDraft.foodSpecials}
                onChange={(value) => setSpecialsDraft((current) => ({ ...current, foodSpecials: value }))}
              />
              <SpecialCard
                title="Happy Hour"
                value={specialsDraft.happyHour}
                onChange={(value) => setSpecialsDraft((current) => ({ ...current, happyHour: value }))}
              />
              <SpecialCard
                title="VIP Package"
                value={specialsDraft.vipPackage}
                onChange={(value) => setSpecialsDraft((current) => ({ ...current, vipPackage: value }))}
              />
            </div>

            <div className="mt-6">
              <button
                type="button"
                disabled={savingSpecials}
                onClick={() => void saveSpecials()}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
              >
                {savingSpecials ? "Saving Specials..." : "Save Specials"}
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "gallery" ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-2xl font-semibold">Gallery</h2>
            <p className="mt-1 text-sm text-white/70">Upload venue images to the party-media bucket.</p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void uploadGallery(e.target.files)}
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-sm text-white"
              />
              {uploadingGallery ? <span className="text-sm text-white/65">Uploading...</span> : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {galleryUrls.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-white/10 bg-[#07070B] p-5 text-sm text-white/65">
                  No images uploaded yet.
                </div>
              ) : (
                galleryUrls.map((url) => (
                  <div key={url} className="overflow-hidden rounded-2xl border border-white/10 bg-[#07070B]">
                    <img src={url} alt="Venue gallery" className="h-40 w-full object-cover" />
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "analytics" ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-2xl font-semibold">Analytics</h2>
            <p className="mt-1 text-sm text-white/70">Placeholder charts for engagement metrics.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <PlaceholderChart title="Views" value={1240} colorClass="bg-violet-500" />
              <PlaceholderChart title="RSVPs" value={420} colorClass="bg-pink-500" />
              <PlaceholderChart title="Check-ins" value={liveCheckIns} colorClass="bg-orange-500" />
              <PlaceholderChart title="Ticket Clicks" value={210} colorClass="bg-emerald-500" />
              <PlaceholderChart title="Directions Clicks" value={185} colorClass="bg-sky-500" />
            </div>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
            <h2 className="text-2xl font-semibold">Settings</h2>
            <p className="mt-1 text-sm text-white/70">Edit venue metadata and operational details.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-white/75 md:col-span-2">
                Venue Description
                <textarea
                  value={settingsDraft.description}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, description: e.target.value }))}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Phone
                <input
                  value={settingsDraft.phone}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, phone: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75">
                Website
                <input
                  value={settingsDraft.website}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, website: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75 md:col-span-2">
                Address
                <input
                  value={settingsDraft.address}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, address: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="text-sm text-white/75 md:col-span-2">
                Music Genres
                <input
                  value={settingsDraft.musicGenres}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, musicGenres: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                  placeholder="House, Techno, Open format"
                />
              </label>

              <label className="text-sm text-white/75">
                Dress Code
                <input
                  value={settingsDraft.dressCode}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, dressCode: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white"
                />
              </label>

              <label className="flex items-center gap-3 text-sm text-white/80 md:items-end md:pb-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.foodAvailable}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, foodAvailable: e.target.checked }))}
                />
                Food Available
              </label>

              <label className="flex items-center gap-3 text-sm text-white/80 md:items-end md:pb-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.vipAvailable}
                  onChange={(e) => setSettingsDraft((current) => ({ ...current, vipAvailable: e.target.checked }))}
                />
                VIP Available
              </label>
            </div>

            <div className="mt-6">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => void saveSettings()}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
              >
                {savingSettings ? "Saving Settings..." : "Save Settings"}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <StoryComposer
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
        defaultVenueId={venue.id}
        createStoryRecord={storyState.createStoryRecord}
      />

      {viewerAuthorId ? (
        <StoryViewer
          groups={storyState.authorGroups}
          currentUserId={storyState.currentUserId}
          initialAuthorId={viewerAuthorId}
          onClose={() => setViewerAuthorId(null)}
          onRecordView={storyState.recordView}
          onAddReaction={storyState.addReaction}
          onDeleteStory={storyState.softDeleteStory}
        />
      ) : null}

      <div className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-100"
                : toast.type === "error"
                ? "border-rose-400/30 bg-rose-500/20 text-rose-100"
                : "border-white/20 bg-white/10 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}

function StatCard({ 
  label, 
  value,
  emoji,
  colorClass,
  description,
}: { 
  label: string; 
  value: string;
  emoji?: string;
  colorClass?: string;
  description?: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-[#10061f] p-5 ${colorClass ? "bg-opacity-50" : ""}`}>
      <p className="text-xs uppercase tracking-[0.24em] text-violet-300">{label}</p>
      <div className="mt-3 flex items-baseline gap-2">
        {emoji && <span className="text-2xl">{emoji}</span>}
        <p className="text-2xl font-semibold text-white">{value}</p>
      </div>
      {colorClass && <p className={`mt-2 text-xs rounded-full px-2 py-1 inline-block font-semibold ${colorClass}`}>{value}</p>}
      {description && <p className="mt-2 text-xs text-white/60">{description}</p>}
    </div>
  );
}

function SpecialCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#07070B] p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-[#10061f] px-3 py-2 text-sm text-white"
        placeholder={`Edit ${title.toLowerCase()}`}
      />
    </article>
  );
}

function PlaceholderChart({
  title,
  value,
  colorClass,
}: {
  title: string;
  value: number;
  colorClass: string;
}) {
  const widthPercent = Math.max(8, Math.min(100, value % 101));

  return (
    <article className="rounded-2xl border border-white/10 bg-[#07070B] p-4">
      <div className="flex items-end justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xl font-bold">{value}</p>
      </div>
      <div className="mt-4 h-3 w-full rounded-full bg-white/10">
        <div className={`h-3 rounded-full ${colorClass}`} style={{ width: `${widthPercent}%` }} />
      </div>
    </article>
  );
}