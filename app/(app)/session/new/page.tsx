"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DurationPicker from "@/components/DurationPicker";
import type { Recommendation } from "@/lib/domain/types";

function getBreakForFocus(focusSec: number): number {
  if (focusSec <= 1800) return 300;
  if (focusSec <= 2700) return 480;
  return 600;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusSec, setFocusSec] = useState(1800);
  const [breakSec, setBreakSec] = useState(300);

  useEffect(() => {
    fetch("/api/recommendation")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data) {
          setRecommendation(data.data);
          setFocusSec(data.data.recommended_focus_duration_sec);
          setBreakSec(data.data.recommended_break_duration_sec);
        }
      })
      .catch(() => setError("Failed to load recommendation"))
      .finally(() => setLoading(false));
  }, []);

  async function handleStart() {
    setStarting(true);
    setError(null);

    const res = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_duration_sec: focusSec,
        break_duration_sec: breakSec,
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      setError(data.error?.message ?? "Failed to start session");
      setStarting(false);
      return;
    }

    router.push(`/session/${data.data.session.id}`);
  }

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          New focus session
        </h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          Choose your focus and break duration.
        </p>
      </div>

      <DurationPicker
        recommendation={recommendation}
        focusSec={focusSec}
        breakSec={breakSec}
        onFocusChange={(sec) => {
          setFocusSec(sec);
          setBreakSec(getBreakForFocus(sec));
        }}
        onBreakChange={setBreakSec}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {starting ? "Starting…" : "Start"}
      </button>
    </div>
  );
}
