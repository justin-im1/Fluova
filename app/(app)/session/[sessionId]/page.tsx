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

  const [isPaused, setIsPaused] = useState(false);
  const pausedAtRef = useRef<number | null>(null);
  const pausedOffsetRef = useRef(0);
  const pausedCountRef = useRef(0);
  const [pausedOffsetDisplay, setPausedOffsetDisplay] = useState(0);

  const [elapsedAtPause, setElapsedAtPause] = useState(0);

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
      // Non-fatal
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
      // Non-fatal
    }

    router.push(`/session/${sessionId}/recap?abandoned=true`);
  }

  function handleBreakDone(breakDurationSec: number) {
    router.push(
      `/session/${sessionId}/recap?break_outcome=completed&break_duration=${breakDurationSec}`
    );
  }

  function handleBreakSkip(elapsedSec: number) {
    const outcome = elapsedSec >= 30 ? "shortened" : "skipped";
    const actualDuration = elapsedSec >= 30 ? elapsedSec : 0;
    router.push(
      `/session/${sessionId}/recap?break_outcome=${outcome}&break_duration=${actualDuration}`
    );
  }

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
        <p className="text-[13px] text-muted/50">
          Session not found or already ended.
        </p>
        <a
          href="/dashboard"
          className="text-[13px] font-medium text-primary/70 transition-colors hover:text-primary"
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
      <div className="relative flex flex-col items-center space-y-10">
        {/* Ambient glow behind timer */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background: isPaused
              ? "radial-gradient(circle, rgba(83,82,121,0.08), transparent)"
              : "radial-gradient(circle, rgba(124,110,245,0.07), transparent)",
            transition: "background 0.8s ease",
          }}
        />

        <p
          className={`font-display text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors duration-300 ${
            isPaused ? "text-muted/35" : "text-muted/45"
          }`}
        >
          {isPaused ? "Paused" : "Focus"}
        </p>

        <SessionTimer
          focusDurationSec={session.focus_duration_sec}
          startedAt={session.started_at}
          pausedOffset={pausedOffsetDisplay}
          isPaused={isPaused}
          onComplete={transitionToBreak}
        />

        <p className="text-[12px] tabular-nums text-muted/25">
          {session.focus_duration_sec / 60} min session
        </p>

        <div className="flex flex-col items-center gap-3">
          {isPaused ? (
            <button
              onClick={handleResume}
              disabled={ending}
              className="rounded-xl px-6 py-2.5 text-[13px] font-semibold text-primary/70 transition-all duration-150 hover:text-primary disabled:opacity-40"
            >
              Resume
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={ending}
              className="rounded-xl px-6 py-2.5 text-[13px] font-medium text-muted/35 transition-colors duration-150 hover:text-muted/70 disabled:opacity-40"
            >
              Pause
            </button>
          )}

          <button
            onClick={transitionToBreak}
            disabled={ending}
            className="rounded-xl px-6 py-2.5 text-[13px] font-medium text-muted/25 transition-colors duration-150 hover:text-muted/55 disabled:opacity-40"
          >
            End early
          </button>

          {(showAbandon || isPaused) && (
            <button
              onClick={handleAbandon}
              disabled={ending}
              className="rounded-xl px-6 py-2.5 text-[13px] font-medium text-red-500/35 transition-colors duration-150 hover:text-red-400/65 disabled:opacity-40"
            >
              Abandon session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
