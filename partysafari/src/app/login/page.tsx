"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import { resolveSafeNextPath } from "@/lib/authRedirect";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setNotice("");

    if (!email.trim() || !password.trim()) {
      setNotice("Enter both email and password.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[#07070B] text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_0_50px_rgba(99,102,241,0.15)]">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="mt-3 text-white/70">
            Log in with email and password to manage your PartySafari bookings.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-black outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-black outline-none focus:border-violet-400"
            />
          </div>

          {notice ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              {notice}
            </div>
          ) : null}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-base font-semibold text-white shadow-[0_16px_40px_rgba(124,58,237,0.18)] transition hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>

          <p className="text-center text-sm text-white/60">
            New to PartySafari?{" "}
            <Link href="/signup" className="text-violet-300 hover:text-violet-100">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
