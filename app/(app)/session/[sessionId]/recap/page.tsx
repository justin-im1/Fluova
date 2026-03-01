"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Rating from "@/components/Rating";

export default function RecapPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [completed, setCompleted] = useState(true);
  const [rating, setRating] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/focus-blocks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        completed,
        focus_rating: rating,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      setError(data.error?.message ?? "Failed to save");
      setSubmitting(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Session recap
        </h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          How did this focus block go?
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span className="text-zinc-700 dark:text-zinc-300">
              I completed this focus block
            </span>
          </label>
        </div>

        <Rating value={rating} onChange={setRating} disabled={submitting} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Saving…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
