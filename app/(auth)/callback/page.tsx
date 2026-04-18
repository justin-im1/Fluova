"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchangeSession() {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      const supabase = createClient();

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace("/dashboard");
          return;
        }
        setError("Authentication failed. Please try again.");
        return;
      }

      if (tokenHash && (type === "email" || type === "magiclink")) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "email" | "magiclink",
        });
        if (!error) {
          router.replace("/dashboard");
          return;
        }
        setError("Authentication failed. Please try again.");
        return;
      }

      const apiUrl = `/api/auth/callback?${searchParams.toString()}`;
      router.replace(apiUrl);
    }

    exchangeSession();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-edge bg-surface p-8">
          <p className="text-center text-sm text-red-400">
            {error}
          </p>
          <a
            href="/login"
            className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="text-center space-y-2">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-edge border-t-primary" />
        <p className="text-sm text-muted">
          Signing you in…
        </p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-primary" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
