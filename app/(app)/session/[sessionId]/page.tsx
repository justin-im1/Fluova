"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SessionTimer from "@/components/SessionTimer";
import BreakTimer from "@/components/BreakTimer";

type SessionData = {
  id: string;
  started_at: string;
  focus_duration_sec: number;
  break_duration_sec: number;
  status: string;
};

type Phase = "focus" | "break";

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("focus");
  const [breakStartedAt, setBreakStartedAt] = useState<Date | null>(null);
  const [ending, setEnding] = useState(false);

  // Guard: only end the session once even if onComplete and handleEnd race.
  const sessionEndedRef = useRef(false);

  useEffect(() => {
    fetch("/api/history?limit=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.sessions) {
          const current = data.data.sessions.find(
            (s: SessionData) => s.id === sessionId && s.status === "active"
          );
          if (current) setSession(current);
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  /** End the focus session server-side, then transition to the break screen. */
  async function transitionToBreak() {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setEnding(true);

    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      // Non-fatal: break screen still shown even on network hiccup.
    }

    setBreakStartedAt(new Date());
    setPhase("break");
    setEnding(false);
  }

  /** Navigate to recap after break completes naturally. */
  function handleBreakDone(breakDurationSec: number) {
    router.push(
      `/session/${sessionId}/recap?break_outcome=completed&break_duration=${breakDurationSec}`
    );
  }

  /** Navigate to recap when user skips the break. */
  function handleBreakSkip(elapsedSec: number) {
    // ≥30 s into the break counts as "shortened"; less counts as "skipped".
    const outcome = elapsedSec >= 30 ? "shortened" : "skipped";
    const actualDuration = elapsedSec >= 30 ? elapsedSec : 0;
    router.push(
      `/session/${sessionId}/recap?break_outcome=${outcome}&break_duration=${actualDuration}`
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-16 w-44 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center space-y-4">
        <p className="text-[13px] text-muted/60">
          Session not found or already ended.
        </p>
        <a
          href="/dashboard"
          className="text-[13px] font-medium text-primary/80 transition-colors duration-150 hover:text-primary"
        >
          Back to dashboard
        </a>
      </div>
    );
  }

  if (phase === "break" && breakStartedAt) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <BreakTimer
          durationSec={session.break_duration_sec}
          startedAt={breakStartedAt}
          onDone={() => handleBreakDone(session.break_duration_sec)}
          onSkip={handleBreakSkip}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center space-y-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted/50">
          Focus
        </p>

        <SessionTimer
          focusDurationSec={session.focus_duration_sec}
          startedAt={session.started_at}
          onComplete={transitionToBreak}
        />

        <p className="text-[12px] tabular-nums text-muted/30">
          {session.focus_duration_sec / 60} min session
        </p>

        <button
          onClick={transitionToBreak}
          disabled={ending}
          className="rounded-lg px-5 py-2 text-[13px] font-medium text-muted/40 transition-colors duration-150 hover:text-muted disabled:opacity-50"
        >
          End early
        </button>
      </div>
    </div>
  );
}
