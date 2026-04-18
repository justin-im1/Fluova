"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CallbackClient({ next }: { next: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // Default magic link flow: Supabase redirects with session in URL hash.
    // createBrowserClient has detectSessionInUrl: true, so it auto-recovers on init.
    // Wait briefly for the auth client to process the URL, then check session.
    const checkSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace(next.startsWith("/") ? next : `/${next}`);
        }
      });
    };

    checkSession();
    // Retry after 500ms in case URL processing is async
    const t = setTimeout(checkSession, 500);
    const t2 = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          router.replace("/login?error=auth");
        }
      });
    }, 2000);

    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [router, next]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p className="text-zinc-500">Completing sign in…</p>
    </div>
  );
}
