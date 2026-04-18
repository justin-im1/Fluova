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
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-8 rounded-xl border border-edge bg-surface p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Fluova
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sign in with your email
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-secondary"
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
              className="mt-1 block w-full rounded-lg border border-edge bg-surface-elevated px-3 py-2 text-fg placeholder-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={status === "loading"}
            />
          </div>

          {message && (
            <p
              className={`text-sm ${
                status === "error"
                  ? "text-red-400"
                  : "text-secondary"
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {status === "loading" ? "Sending…" : "Send link"}
          </button>
        </form>
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
