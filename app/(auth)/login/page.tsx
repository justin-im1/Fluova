"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    authError ? "error" : "idle"
  );
  const [message, setMessage] = useState(
    authError ? "Authentication failed. Please try again." : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("success");
    setMessage("Check your email for the magic link.");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-4">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(124,110,245,0.07), transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Wordmark */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-[36px] font-bold tracking-tight text-fg">
            Fluova
          </h1>
          <p className="mt-2 text-[14px] text-muted/55">
            Adaptive deep work, built around you.
          </p>
        </div>

        <div className="rounded-2xl border border-edge/60 bg-surface p-8">
          <p className="mb-6 text-[14px] font-medium text-secondary/80">
            Sign in with a magic link
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/50"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="block w-full rounded-xl border border-edge bg-surface-elevated px-4 py-3 text-[14px] text-fg placeholder-muted/30 transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                disabled={status === "loading"}
              />
            </div>

            {message && (
              <p
                className={`text-[13px] ${
                  status === "error" ? "text-red-400" : "text-secondary/70"
                }`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="btn-primary w-full rounded-xl px-4 py-3 text-[13px] font-semibold"
            >
              {status === "loading" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted/30">
          No password needed — we'll email you a one-click sign-in link.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
