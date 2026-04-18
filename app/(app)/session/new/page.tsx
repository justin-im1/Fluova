"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DurationPicker from "@/components/DurationPicker";
import SessionTypePicker from "@/components/SessionTypePicker";
import type { Recommendation, SessionType } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";

function getLocalTimeBucket(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function getBreakForFocus(focusSec: number): number {
  if (focusSec <= 1800) return 300;
  if (focusSec <= 2700) return 480;
  return 600;
}

function buildRecUrl(sessionType: SessionType | null): string {
  const bucket = getLocalTimeBucket();
  const base = `/api/recommendation?bucket=${bucket}`;
  return sessionType ? `${base}&session_type=${sessionType}` : base;
}

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const presetFocus = searchParams.get("focus");
  const presetBreak = searchParams.get("break");

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusSec, setFocusSec] = useState(presetFocus ? parseInt(presetFocus, 10) : 1800);
  const [breakSec, setBreakSec] = useState(presetBreak ? parseInt(presetBreak, 10) : 300);
  const [sessionType, setSessionType] = useState<SessionType | null>(null);

  // True when user has manually chosen a duration — don't auto-override from engine.
  const userOverrideDuration = useRef(!!presetFocus);

  // Re-fetch recommendation whenever session type changes (or on mount with null).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(buildRecUrl(sessionType))
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.data) {
          setRecommendation(data.data);
          if (!userOverrideDuration.current) {
            setFocusSec(data.data.recommended_focus_duration_sec);
            setBreakSec(data.data.recommended_break_duration_sec);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load recommendation");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionType]);

  async function handleStart() {
    setStarting(true);
    setError(null);

    const res = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_duration_sec: focusSec,
        break_duration_sec: breakSec,
        session_type: sessionType ?? undefined,
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

  if (loading && !recommendation) {
    return <div className="h-64 animate-pulse rounded-xl bg-surface" />;
  }

  const typeUsed = recommendation?.session_type_used;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">New focus session</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Choose your session type and focus duration.
        </p>
      </div>

      <SessionTypePicker
        value={sessionType}
        onChange={setSessionType}
      />

      {/* Type-specific recommendation notice */}
      {typeUsed && (
        <p className="text-[12px] text-primary/60">
          Recommendation tailored for your{" "}
          <span className="font-medium">{SESSION_TYPE_LABELS[typeUsed]}</span> sessions.
        </p>
      )}
      {sessionType && !typeUsed && !loading && (
        <p className="text-[12px] text-muted/40">
          Not enough {SESSION_TYPE_LABELS[sessionType].toLowerCase()} sessions yet — using your
          overall history.
        </p>
      )}

      <DurationPicker
        recommendation={recommendation}
        focusSec={focusSec}
        breakSec={breakSec}
        onFocusChange={(sec) => {
          userOverrideDuration.current = true;
          setFocusSec(sec);
          setBreakSec(getBreakForFocus(sec));
        }}
        onBreakChange={setBreakSec}
      />

      {error && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start session"}
      </button>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
      <NewSessionInner />
    </Suspense>
  );
}
