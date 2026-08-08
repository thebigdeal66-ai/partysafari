"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { resolveSafeNextPath } from "@/lib/authRedirect";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function handleLoginNavigation(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const nextPath = resolveSafeNextPath(window.location.search);
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  async function handleSignup() {
    setNotice("");

    if (!email.trim() || !password.trim()) {
      setNotice("Enter a valid email and password.");
      return;
    }

    const normalizedCity = homeCity.trim();
    const normalizedState = homeState.trim().toUpperCase();
    if ((normalizedCity || normalizedState) && (!normalizedCity || !/^[A-Z]{2}$/.test(normalizedState))) {
      setNotice("Enter both your city and a two-letter state code, or leave both blank.");
      return;
    }

    setLoading(true);
    const nextPath = resolveSafeNextPath(window.location.search);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${nextPath}`,
        data: {
          home_city: normalizedCity,
          home_state: normalizedState,
        },
      },
    });
    setLoading(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    if (data.session) {
      router.push(nextPath);
      return;
    }

    setNotice(
      "Account created. Please check your email to confirm your address, then log in."
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[#07070B] text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_0_50px_rgba(99,102,241,0.15)]">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Create your PartySafari account</h1>
          <p className="mt-3 text-white/70">
            Sign up with email and password to manage requests, bookings, and messages.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block text-sm text-white/70">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-black outline-none focus:border-violet-400"
          />

          <label className="block text-sm text-white/70">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a secure password"
            className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-black outline-none focus:border-violet-400"
          />

          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <p className="text-sm font-semibold text-violet-100">Where do you usually go out?</p>
            <p className="mt-1 text-xs text-white/60">
              Optional. This helps PartySafari decide which city to activate next.
            </p>
            <div className="mt-3 grid grid-cols-[1fr_90px] gap-3">
              <input
                type="text"
                value={homeCity}
                onChange={(e) => setHomeCity(e.target.value)}
                placeholder="Ocean City"
                autoComplete="address-level2"
                className="min-w-0 rounded-2xl border border-white/10 bg-white px-4 py-3 text-black outline-none focus:border-violet-400"
              />
              <input
                type="text"
                value={homeState}
                onChange={(e) => setHomeState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="MD"
                autoComplete="address-level1"
                aria-label="State"
                maxLength={2}
                className="min-w-0 rounded-2xl border border-white/10 bg-white px-4 py-3 text-center uppercase text-black outline-none focus:border-violet-400"
              />
            </div>
          </div>

          {notice ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              {notice}
            </div>
          ) : null}

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-base font-semibold text-white shadow-[0_16px_40px_rgba(124,58,237,0.18)] transition hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? "Signing up..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-white/60">
            Already have an account?{" "}
            <Link
              href="/login"
              onClick={handleLoginNavigation}
              className="text-violet-300 hover:text-violet-100"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
