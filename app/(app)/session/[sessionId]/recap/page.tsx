"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import ContextSlider from "@/components/ContextSlider";
import type { Session, BreakOutcome } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";

/** Compute the user's local time-of-day bucket using the browser clock. */
function getLocalTimeBucket(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

function elapsedSeconds(startedAt: string, endedAt: string): number {
  return Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
}

const BREAK_OUTCOME_LABELS: Record<BreakOutcome, string> = {
  completed: "Completed",
  shortened: "Shortened",
  skipped: "Skipped",
};

function RecapInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;

  // Break outcome passed from session page via URL params
  const breakOutcome = searchParams.get("break_outcome") as BreakOutcome | null;
  const breakDurationActual = searchParams.get("break_duration")
    ? parseInt(searchParams.get("break_duration")!, 10)
    : null;

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [completed, setCompleted] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  const [fatigueRating, setFatigueRating] = useState<number | null>(null);
  const [recommendationFit, setRecommendationFit] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [distractionCount, setDistractionCount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/history?limit=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.sessions) {
          const found = data.data.sessions.find(
            (s: Session) => s.id === sessionId
          );
          if (found) setSession(found);
        }
      })
      .catch(() => {/* non-critical */})
      .finally(() => setLoadingSession(false));
  }, [sessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (rating === null) {
      setError("Please select a focus rating before saving.");
      setSubmitting(false);
      return;
    }

    try {
      const parsedDistractionCount = distractionCount.trim() !== ""
        ? parseInt(distractionCount, 10)
        : undefined;

      const res = await fetch("/api/focus-blocks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          completed,
          focus_rating: rating,
          time_bucket: getLocalTimeBucket(),
          break_outcome: breakOutcome ?? undefined,
          break_duration_sec_actual:
            breakDurationActual !== null ? breakDurationActual : undefined,
          fatigue_rating: fatigueRating ?? undefined,
          recommendation_fit: recommendationFit ?? undefined,
          note: note.trim() || undefined,
          distraction_count: !isNaN(parsedDistractionCount as number) ? parsedDistractionCount : undefined,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error?.message ?? "Failed to save. Please try again.");
        setSubmitting(false);
        return;
      }

      setSaved(true);
      router.push("/dashboard?toast=saved");
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const actualSec =
    session?.started_at && session.ended_at
      ? elapsedSeconds(session.started_at, session.ended_at)
      : null;

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4">

      {/* Session summary */}
      {!loadingSession && session && (
        <div className="rounded-2xl border border-edge/40 bg-surface px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/50">
            Session summary
          </p>
          <div className="mt-3 space-y-2">
            <SummaryRow
              label="Duration"
              value={`${session.focus_duration_sec / 60} min`}
              sub={
                actualSec !== null &&
                Math.abs(actualSec - session.focus_duration_sec) > 30
                  ? `actual: ${formatDuration(actualSec)}`
                  : undefined
              }
            />
            {session.started_at && (
              <SummaryRow label="Started" value={formatTime(session.started_at)} />
            )}
            {session.ended_at && (
              <SummaryRow label="Ended" value={formatTime(session.ended_at)} />
            )}
            {session.session_type && (
              <SummaryRow
                label="Type"
                value={SESSION_TYPE_LABELS[session.session_type]}
              />
            )}
            {breakOutcome && (
              <SummaryRow
                label="Break"
                value={BREAK_OUTCOME_LABELS[breakOutcome]}
                sub={
                  breakOutcome !== "skipped" && breakDurationActual
                    ? formatDuration(breakDurationActual)
                    : undefined
                }
              />
            )}
          </div>
        </div>
      )}

      {loadingSession && (
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      )}

      <div>
        <h1 className="text-lg font-semibold text-fg">How did it go?</h1>
        <p className="mt-0.5 text-[13px] text-muted/60">
          Your feedback shapes the next recommendation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Completion toggle */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <button
            type="button"
            onClick={() => setCompleted(!completed)}
            className="flex w-full items-center gap-3"
          >
            <div
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                completed
                  ? "border-primary bg-primary"
                  : "border-edge bg-surface-elevated"
              }`}
            >
              {completed && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 4"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span className="text-[13px] font-medium text-secondary">
              I completed this focus block
            </span>
          </button>
        </div>

        {/* Rating selector */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-secondary">Focus quality</p>
            {rating === null && (
              <p className="text-[11px] text-muted/40">Select how focused you felt</p>
            )}
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                disabled={submitting}
                className={`flex h-11 w-11 items-center justify-center rounded-lg text-[15px] font-semibold transition-all ${
                  rating === n
                    ? "bg-primary text-white"
                    : "bg-surface-elevated text-muted hover:text-secondary"
                } ${submitting ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted/50">
            <span>Distracted</span>
            <span>Deep flow</span>
          </div>
        </div>

        {/* Fatigue rating — soft required */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <ContextSlider
            label="Fatigue level"
            hint="1 = fresh · 5 = worn out"
            value={fatigueRating}
            onChange={setFatigueRating}
            disabled={submitting}
          />
          {fatigueRating === null && (
            <p className="mt-2 text-[11px] text-amber-500/70">
              Fatigue helps improve future recommendations — try to fill this in.
            </p>
          )}
        </div>

        {/* Recommendation fit toggle */}
        <div className="rounded-xl border border-edge bg-surface p-4">
          <p className="mb-3 text-[13px] font-medium text-secondary">
            Recommendation fit
          </p>
          <div className="flex gap-2">
            {[
              { label: "Good fit", value: true },
              { label: "Not quite", value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                type="button"
                onClick={() => setRecommendationFit(value)}
                disabled={submitting}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${
                  recommendationFit === value
                    ? "bg-primary text-white"
                    : "bg-surface-elevated text-muted hover:text-secondary"
                } ${submitting ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional fields */}
        <div className="rounded-xl border border-edge bg-surface p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-secondary">
              Distraction count
              <span className="ml-1 text-[11px] font-normal text-muted/40">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              value={distractionCount}
              onChange={(e) => setDistractionCount(e.target.value)}
              disabled={submitting}
              placeholder="0"
              className="w-full rounded-lg border border-edge bg-surface-elevated px-3 py-2 text-[13px] text-fg placeholder:text-muted/30 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-secondary">
              Note
              <span className="ml-1 text-[11px] font-normal text-muted/40">(optional · 280 chars)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              disabled={submitting}
              placeholder="Anything worth remembering about this session…"
              rows={2}
              className="w-full resize-none rounded-lg border border-edge bg-surface-elevated px-3 py-2 text-[13px] text-fg placeholder:text-muted/30 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <p className="mt-1 text-right text-[11px] text-muted/30">{note.length}/280</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || saved || rating === null}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Saving…" : saved ? "Saved" : "Save & update recommendation"}
        </button>
      </form>
    </div>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface" />}>
      <RecapInner />
    </Suspense>
  );
}

function SummaryRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-[12px] text-muted/50">{label}</p>
      <div className="text-right">
        <p className="text-[13px] font-medium text-fg">{value}</p>
        {sub && <p className="text-[11px] text-muted/40">{sub}</p>}
      </div>
    </div>
  );
}
