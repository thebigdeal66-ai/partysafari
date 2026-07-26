"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let cancelled = false;

    const validateSession = async () => {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => {
            globalThis.setTimeout(() => resolve(null), 4000);
          }),
        ]);

        if (cancelled) {
          return;
        }

        if (sessionResult === null) {
          router.replace("/login");
          return;
        }

        const { data } = sessionResult;

        if (!data.session) {
          router.replace("/login");
          return;
        }

        setAuthorized(true);
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-12 text-white/70">
          Checking authentication...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
