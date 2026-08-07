"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type PerformerRow = {
  id: string;
  slug: string;
  stage_name: string;
  performer_type: string;
  photo_url: string | null;
  instagram: string | null;
  bio: string | null;
  genres: string[] | null;
};

const performerTypes = ["DJ", "Band", "Artist"] as const;

function normalizeGenres(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function EditTalentProfilePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [performer, setPerformer] = useState<PerformerRow | null>(null);
  const [stageName, setStageName] = useState("");
  const [performerType, setPerformerType] = useState("DJ");
  const [photoUrl, setPhotoUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        setError("Sign in with the PartySafari account that owns this profile.");
        setLoading(false);
        return;
      }

      const { data: performerData, error: performerError } = await supabase
        .from("performers")
        .select("id, slug, stage_name, performer_type, photo_url, instagram, bio, genres")
        .eq("slug", slug)
        .maybeSingle();

      if (!mounted) return;

      if (performerError || !performerData) {
        setError(performerError ? "Unable to load this performer right now." : "Performer not found.");
        setLoading(false);
        return;
      }

      const row = performerData as PerformerRow;
      const { data: ownership, error: ownershipError } = await supabase
        .from("performer_owners")
        .select("performer_id")
        .eq("performer_id", row.id)
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (ownershipError || !ownership) {
        setError("Only an approved owner can manage this Talent profile.");
        setLoading(false);
        return;
      }

      setPerformer(row);
      setStageName(row.stage_name);
      setPerformerType(row.performer_type);
      setPhotoUrl(row.photo_url ?? "");
      setInstagram(row.instagram ?? "");
      setBio(row.bio ?? "");
      setGenres((row.genres ?? []).join(", "));
      setAuthorized(true);
      setLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug, supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!performer || !authorized || saving) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const cleanStageName = stageName.trim();
    if (cleanStageName.length < 2 || cleanStageName.length > 100) {
      setError("Stage name must be between 2 and 100 characters.");
      setSaving(false);
      return;
    }

    if (!performerTypes.includes(performerType as (typeof performerTypes)[number])) {
      setError("Choose a valid performer type.");
      setSaving(false);
      return;
    }

    if (bio.trim().length > 1200) {
      setError("Bio must be 1,200 characters or fewer.");
      setSaving(false);
      return;
    }

    const cleanPhotoUrl = normalizeOptionalUrl(photoUrl);
    if (photoUrl.trim() && !cleanPhotoUrl) {
      setError("Enter a valid http(s) photo URL.");
      setSaving(false);
      return;
    }

    const { data, error: updateError } = await supabase
      .from("performers")
      .update({
        stage_name: cleanStageName,
        performer_type: performerType,
        photo_url: cleanPhotoUrl,
        instagram: instagram.trim() || null,
        bio: bio.trim() || null,
        genres: normalizeGenres(genres),
      })
      .eq("id", performer.id)
      .select("id")
      .maybeSingle();

    if (updateError || !data) {
      if (process.env.NODE_ENV === "development" && updateError) {
        console.error("[talent-profile-edit] Update failed:", updateError);
      }
      setError("We couldn't save those profile changes. Please try again.");
      setSaving(false);
      return;
    }

    setNotice("Profile updated.");
    setSaving(false);
    router.refresh();
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="h-96 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
        </div>
      </main>
    );
  }

  if (error && !authorized) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-12 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6">
          <h1 className="text-2xl font-bold">Profile management unavailable</h1>
          <p className="mt-2 text-sm text-rose-100">{error}</p>
          <Link href={slug ? `/talent/${slug}` : "/talent"} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-semibold">
            Back to Talent profile
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href={`/talent/${slug}`} className="text-sm font-semibold text-violet-200 hover:text-white">
          ← Back to profile
        </Link>

        <div className="mt-6 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.24),_transparent_38%),rgba(255,255,255,0.035)] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Talent owner tools</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Manage {performer?.stage_name}</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Keep your public PartySafari profile accurate. Your ownership and claim records cannot be changed here.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-semibold">Stage name</span>
              <input
                value={stageName}
                onChange={(event) => setStageName(event.target.value)}
                maxLength={100}
                required
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-violet-400 transition focus:ring-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold">Talent type</span>
              <select
                value={performerType}
                onChange={(event) => setPerformerType(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#111019] px-4 text-white outline-none ring-violet-400 transition focus:ring-2"
              >
                {performerTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold">Bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={1200}
                rows={6}
                placeholder="Tell PartySafari users what you sound like, where you're based, and what you bring to a night out."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-violet-400 transition focus:ring-2"
              />
              <span className="mt-1 block text-xs text-white/40">{bio.length}/1200</span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold">Genres</span>
              <input
                value={genres}
                onChange={(event) => setGenres(event.target.value)}
                placeholder="House, Hip-Hop, Open Format"
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-violet-400 transition focus:ring-2"
              />
              <span className="mt-1 block text-xs text-white/40">Comma-separated, up to 8 genres.</span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold">Instagram</span>
              <input
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
                maxLength={200}
                placeholder="@yourhandle"
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-violet-400 transition focus:ring-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold">Profile photo URL</span>
              <input
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                type="url"
                inputMode="url"
                placeholder="https://..."
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-violet-400 transition focus:ring-2"
              />
              <span className="mt-1 block text-xs text-white/40">Use a direct http(s) image URL for now.</span>
            </label>

            {error ? (
              <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {notice ? (
              <div role="status" className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 items-center rounded-full bg-gradient-to-r from-violet-600 to-orange-500 px-6 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <Link href={`/talent/${slug}`} className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/75">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
