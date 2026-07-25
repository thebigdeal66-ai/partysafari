"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { buildStoryUploadPath, type Story, type StoryMediaType, validateStoryFile } from "@/lib/stories";

type Option = {
  id: string;
  label: string;
};

type StoryComposerProps = {
  open: boolean;
  onClose: () => void;
  defaultVenueId?: string | null;
  defaultEventId?: string | null;
  createStoryRecord: (input: {
    authorId: string;
    mediaUrl: string;
    mediaType: StoryMediaType;
    caption?: string | null;
    venueId?: string | null;
    eventId?: string | null;
  }) => Promise<{ ok: boolean; story: Story | null; error: string | null }>;
  onCreated?: (story: Story) => void;
};

const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

function toPublicOptions(rows: Array<Record<string, unknown>>, key: "name" | "title") {
  return rows
    .map((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const labelValue = row[key];
      const label = typeof labelValue === "string" && labelValue.trim().length > 0 ? labelValue : key === "name" ? "Venue" : "Event";
      return id ? { id, label } : null;
    })
    .filter((entry): entry is Option => Boolean(entry));
}

export default function StoryComposer({
  open,
  onClose,
  defaultVenueId = null,
  defaultEventId = null,
  createStoryRecord,
  onCreated,
}: StoryComposerProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [venueId, setVenueId] = useState<string>(defaultVenueId || "");
  const [eventId, setEventId] = useState<string>(defaultEventId || "");
  const [venues, setVenues] = useState<Option[]>([]);
  const [events, setEvents] = useState<Option[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaType, setMediaType] = useState<StoryMediaType | null>(null);

  const maxFileBytes = Number(process.env.NEXT_PUBLIC_PARTY_MEDIA_MAX_BYTES || DEFAULT_MAX_FILE_BYTES);

  useEffect(() => {
    setVenueId(defaultVenueId || "");
  }, [defaultVenueId]);

  useEffect(() => {
    setEventId(defaultEventId || "");
  }, [defaultEventId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setLoadingOptions(true);

    const loadOptions = async () => {
      const [{ data: venueRows }, { data: eventRows }] = await Promise.all([
        supabase.from("venues").select("id, name").order("name", { ascending: true }).limit(100),
        supabase.from("events").select("id, title, venue_id").order("start_time", { ascending: false }).limit(100),
      ]);

      if (!active) {
        return;
      }

      setVenues(toPublicOptions((venueRows || []) as Array<Record<string, unknown>>, "name"));

      const filteredEventRows = venueId
        ? ((eventRows || []) as Array<Record<string, unknown>>).filter((row) => row.venue_id === venueId || row.id === defaultEventId)
        : ((eventRows || []) as Array<Record<string, unknown>>);
      setEvents(toPublicOptions(filteredEventRows, "title"));
      setLoadingOptions(false);
    };

    void loadOptions();

    return () => {
      active = false;
    };
  }, [defaultEventId, open, supabase, venueId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const resetSelectedMedia = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setMediaType(null);
  };

  const handleFileChange = (nextFile: File | null) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!nextFile) {
      resetSelectedMedia();
      return;
    }

    const validation = validateStoryFile(nextFile, maxFileBytes);
    if (!validation.ok) {
      resetSelectedMedia();
      setErrorMessage(validation.error);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setMediaType(validation.mediaType);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isSubmitting) {
      return;
    }

    if (!file || !previewUrl || !mediaType) {
      setErrorMessage("Choose an image or video before posting.");
      return;
    }

    setIsSubmitting(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      setErrorMessage("You must be signed in to post a story.");
      setIsSubmitting(false);
      return;
    }

    const filePath = buildStoryUploadPath(user.id, file.name);
    const storage = supabase.storage.from("party-media");
    const { error: uploadError } = await storage.upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      setErrorMessage(uploadError.message || "Upload failed.");
      setIsSubmitting(false);
      return;
    }

    const { data: publicUrlData } = storage.getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl;

    const result = await createStoryRecord({
      authorId: user.id,
      mediaUrl: publicUrl,
      mediaType,
      caption: caption.trim() || null,
      venueId: venueId || null,
      eventId: eventId || null,
    });

    if (!result.ok || !result.story) {
      await storage.remove([filePath]);
      setErrorMessage(result.error || "Could not publish story.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Story posted.");
    onCreated?.(result.story);
    resetSelectedMedia();
    setCaption("");
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-black/70"
      style={{
        paddingTop: "calc(1rem + env(safe-area-inset-top))",
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex min-h-full items-end justify-center px-0 sm:items-center sm:px-6">
        <div className="w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[30px] border border-white/10 bg-[#0d0718] text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)] max-h-[calc(100dvh-1rem)] sm:rounded-[30px] sm:max-h-[calc(100dvh-2rem)]">
          <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0d0718]/95 px-5 py-4 backdrop-blur sm:px-6">
            <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Post a Story</h2>
            <p className="text-sm text-white/55">Share a quick image or short video.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Close
          </button>
            </div>
        </div>

        <div className="space-y-5 px-5 pb-6 pt-5 sm:px-6 sm:pt-6">
          {errorMessage ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</p> : null}
          {successMessage ? <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}</p> : null}

          <div className="space-y-3">
            <label className="block text-sm font-medium text-white/80">Media</label>
            {previewUrl ? (
              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-black">
                {mediaType === "image" ? (
                  <img src={previewUrl} alt="Story preview" className="pointer-events-none max-h-[45dvh] w-full object-contain" />
                ) : (
                  <video src={previewUrl} preload="metadata" muted playsInline className="pointer-events-none max-h-[45dvh] w-full object-contain" />
                )}
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/15 bg-white/5 px-5 py-10 text-center text-sm text-white/55">
                Choose one image or one short video.
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer rounded-full border border-violet-400/35 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-300 hover:bg-violet-500/25">
                {previewUrl ? "Replace Media" : "Select Media"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              {previewUrl ? (
                <button
                  type="button"
                  onClick={resetSelectedMedia}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80">Caption</label>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={3}
              maxLength={220}
              placeholder="Add a caption if you want."
              className="mt-2 w-full rounded-[22px] border border-white/10 bg-[#120824] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-violet-400/50"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-white/80">Tag Venue</label>
              <select
                value={venueId}
                onChange={(event) => {
                  setVenueId(event.target.value);
                  if (!defaultEventId) {
                    setEventId("");
                  }
                }}
                className="mt-2 min-h-11 w-full rounded-full border border-white/10 bg-[#120824] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/50"
              >
                <option value="">No venue tag</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{venue.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80">Tag Event</label>
              <select
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-full border border-white/10 bg-[#120824] px-4 py-3 text-sm text-white outline-none focus:border-violet-400/50"
              >
                <option value="">No event tag</option>
                {events.map((eventOption) => (
                  <option key={eventOption.id} value={eventOption.id}>{eventOption.label}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingOptions ? <p className="text-sm text-white/55">Loading venues and events...</p> : null}
        </div>

        <div
          className="sticky bottom-0 z-20 border-t border-white/10 bg-[#0d0718]/95 px-5 py-4 backdrop-blur sm:px-6"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">Supported: JPG, PNG, WebP, GIF, MP4, WebM.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="min-h-11 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Posting..." : "Post Story"}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}