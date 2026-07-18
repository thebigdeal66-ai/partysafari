"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

const profileTypes = [
  { value: "user", label: "User" },
  { value: "business", label: "Business" },
  { value: "entertainer", label: "Entertainer" },
];

export default function ProfileEditPage() {
  return (
    <AuthGuard>
      <EditProfileForm />
    </AuthGuard>
  );
}

function EditProfileForm() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [profileType, setProfileType] = useState<"user" | "business" | "entertainer">("user");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    async function loadProfile() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setNotice("Unable to check session. Please refresh.");
        setLoading(false);
        return;
      }

      const userId = session?.user?.id;
      if (!userId) {
        setNotice("You must be logged in to edit your profile.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, username, bio, location, profile_type, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        setNotice("Could not load profile data.");
        setLoading(false);
        return;
      }

      // If no profile exists for this user, create a default row preserving any
      // available metadata from the auth session (e.g. display name).
      if (!data) {
        const displayName = session?.user?.user_metadata?.full_name || "";
        const { error: insertError } = await supabase.from("profiles").insert({
          id: userId,
          full_name: displayName,
          username: "",
          bio: "",
          location: "",
          profile_type: "user",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insertError) {
          setNotice("Could not create profile.");
          setLoading(false);
          return;
        }

        setFullName(displayName);
        setUsername("");
        setBio("");
        setLocation("");
        setProfileType("user");
        setAvatarUrl(null);

        setLoading(false);
        return;
      }

      if (data) {
        setFullName(data.full_name || "");
        setUsername(data.username || "");
        setBio(data.bio || "");
        setLocation(data.location || "");
        setProfileType(data.profile_type === "business" || data.profile_type === "entertainer" ? data.profile_type : "user");
        setAvatarUrl(data.avatar_url || null);
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const validExtensions = ["jpg", "jpeg", "png", "webp", "gif"];
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
      setAvatarNotice("Please choose a JPG, PNG, WebP, or GIF image.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setAvatarNotice("Please choose an image smaller than 8 MB.");
      return;
    }

    setAvatarNotice(null);
    setUploadingAvatar(true);

    const supabase = createSupabaseBrowser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      setAvatarNotice("You must be signed in to upload a profile photo.");
      setUploadingAvatar(false);
      return;
    }

    const userId = session.user.id;
    const normalizedExtension = extension || (file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "jpg");
    const filePath = `${userId}/avatars/avatar-${Date.now()}.${normalizedExtension}`;

    const { error: uploadError } = await supabase.storage.from("party-media").upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

    if (uploadError) {
      setAvatarNotice(uploadError.message || "Image upload failed.");
      setUploadingAvatar(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("party-media").getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (updateError) {
      setAvatarNotice(updateError.message || "Could not save your profile photo.");
      setUploadingAvatar(false);
      return;
    }

    setAvatarUrl(publicUrl);
    setAvatarNotice("Profile photo uploaded successfully.");
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setNotice(null);
    setSaving(true);

    const supabase = createSupabaseBrowser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      setNotice("Unable to save profile. Please log in again.");
      setSaving(false);
      return;
    }

    const userId = session.user.id;

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
          username: username.trim(),
          bio,
          location,
          profile_type: profileType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      setNotice(error.message || "Failed to save profile.");
      setSaving(false);
      return;
    }

    setNotice("Profile updated successfully.");
    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">Edit Your Profile</h1>
              <p className="mt-2 text-white/70">
                Update your display name, username, bio, location, and account type.
              </p>
            </div>
            <Link
              href="/profiles"
              className="rounded-full border border-violet-500/30 bg-violet-500/10 px-5 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20"
            >
              Browse Profiles
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
              Loading profile data...
            </div>
          ) : (
            <div className="space-y-6">
              {notice ? (
                <div className="rounded-2xl border border-white/10 bg-violet-500/10 p-4 text-sm text-violet-100">
                  {notice}
                </div>
              ) : null}

              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#07070B]">
                      <img
                        src={avatarUrl || "/api/placeholder/120/120"}
                        alt="Current profile avatar"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Profile Photo</p>
                      <p className="mt-1 text-sm text-white/70">
                        Upload a JPG, PNG, WebP, or GIF up to 8 MB.
                      </p>
                    </div>
                  </div>

                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition ${
                      uploadingAvatar
                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                        : "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAvatarUpload}
                      className="sr-only"
                      disabled={uploadingAvatar}
                    />
                    {uploadingAvatar ? "Uploading..." : "Upload Photo"}
                  </label>
                </div>

                {avatarNotice ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-violet-500/10 p-3 text-sm text-violet-100">
                    {avatarNotice}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-white/70">
                  Display Name
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                    placeholder="Alex Rivera"
                  />
                </label>

                <label className="space-y-2 text-sm text-white/70">
                  Username
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                    placeholder="@alexr"
                  />
                </label>
              </div>

              <div className="space-y-2 text-sm text-white/70">
                <label className="block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full min-h-[140px] rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                  placeholder="Share a little about yourself..."
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-white/70">
                  Location
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                    placeholder="Downtown District"
                  />
                </label>

                <label className="space-y-2 text-sm text-white/70">
                  Profile Type
                  <select
                    value={profileType}
                    onChange={(e) => setProfileType(e.target.value as "user" | "business" | "entertainer")}
                    className="w-full rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                  >
                    {profileTypes.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#07070B] text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Profile"}
                </button>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-violet-400"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
