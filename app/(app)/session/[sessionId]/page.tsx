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

  // Pause state
  const [isPaused, setIsPaused] = useState(false);
  const pausedAtRef = useRef<number | null>(null);
  const pausedOffsetRef = useRef(0);
  const pausedCountRef = useRef(0);
  const [pausedOffsetDisplay, setPausedOffsetDisplay] = useState(0);

  // Elapsed seconds when the user paused (for abandon logic)
  const [elapsedAtPause, setElapsedAtPause] = useState(0);

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

  function handlePause() {
    if (!session || isPaused) return;
    const start = new Date(session.started_at).getTime();
    const elapsedSec = Math.floor((Date.now() - start) / 1000) - pausedOffsetRef.current;
    setElapsedAtPause(elapsedSec);
    pausedAtRef.current = Date.now();
    pausedCountRef.current += 1;
    setIsPaused(true);
  }

  function handleResume() {
    if (!isPaused || pausedAtRef.current === null) return;
    const pausedDuration = Math.floor((Date.now() - pausedAtRef.current) / 1000);
    pausedOffsetRef.current += pausedDuration;
    setPausedOffsetDisplay(pausedOffsetRef.current);
    pausedAtRef.current = null;
    setIsPaused(false);
  }

  /** End the focus session server-side, then transition to the break screen. */
  async function transitionToBreak() {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setEnding(true);

    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          paused_count: pausedCountRef.current,
        }),
      });
    } catch {
      // Non-fatal: break screen still shown even on network hiccup.
    }

    setBreakStartedAt(new Date());
    setPhase("break");
    setEnding(false);
  }

  async function handleAbandon() {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setEnding(true);

    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          paused_count: pausedCountRef.current,
          abandoned: true,
        }),
      });
    } catch {
      // Non-fatal.
    }

    router.push(`/session/${sessionId}/recap?abandoned=true`);
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

  // Show abandon button once the user has paused or 5 minutes have elapsed.
  const showAbandon =
    isPaused ||
    (session !== null &&
      elapsedAtPause === 0 &&
      Math.floor(
        (Date.now() - new Date(session.started_at).getTime()) / 1000
      ) -
        pausedOffsetDisplay >=
        300);

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
          {isPaused ? "Paused" : "Focus"}
        </p>

        <SessionTimer
          focusDurationSec={session.focus_duration_sec}
          startedAt={session.started_at}
          pausedOffset={pausedOffsetDisplay}
          isPaused={isPaused}
          onComplete={transitionToBreak}
        />

        <p className="text-[12px] tabular-nums text-muted/30">
          {session.focus_duration_sec / 60} min session
        </p>

        <div className="flex flex-col items-center gap-3">
          {isPaused ? (
            <button
              onClick={handleResume}
              disabled={ending}
              className="rounded-lg px-5 py-2 text-[13px] font-medium text-primary/70 transition-colors duration-150 hover:text-primary disabled:opacity-50"
            >
              Resume
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={ending}
              className="rounded-lg px-5 py-2 text-[13px] font-medium text-muted/40 transition-colors duration-150 hover:text-muted disabled:opacity-50"
            >
              Pause
            </button>
          )}

          <button
            onClick={transitionToBreak}
            disabled={ending}
            className="rounded-lg px-5 py-2 text-[13px] font-medium text-muted/30 transition-colors duration-150 hover:text-muted/60 disabled:opacity-50"
          >
            End early
          </button>

          {(showAbandon || isPaused) && (
            <button
              onClick={handleAbandon}
              disabled={ending}
              className="rounded-lg px-5 py-2 text-[13px] font-medium text-red-500/40 transition-colors duration-150 hover:text-red-400/70 disabled:opacity-50"
            >
              Abandon session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
