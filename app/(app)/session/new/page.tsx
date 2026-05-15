"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DurationPicker from "@/components/DurationPicker";
import SessionTypePicker from "@/components/SessionTypePicker";
import ContextSlider from "@/components/ContextSlider";
import type { Recommendation, SessionType } from "@/lib/domain/types";
import { SESSION_TYPE_LABELS } from "@/lib/domain/types";
import { getLocalTimeBucket } from "@/lib/domain/time";
import { getBreakDurationForFocus } from "@/lib/recommendation/features";

function buildRecUrl(sessionType: SessionType | null): string {
  const bucket = getLocalTimeBucket();
  const base = `/api/recommendation?bucket=${bucket}`;
  return sessionType ? `${base}&session_type=${sessionType}` : base;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  learning:    "bg-surface-elevated text-muted/60",
  calibrating: "bg-amber-900/25 text-amber-400/80",
  confident:   "bg-emerald-900/25 text-emerald-400/80",
};

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
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [distractionLevel, setDistractionLevel] = useState<number | null>(null);

  const userOverrideDuration = useRef(!!presetFocus);

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

    const recEventId = recommendation?.recommendation_event_id ?? null;
    if (
      recEventId &&
      recommendation &&
      focusSec !== recommendation.recommended_focus_duration_sec
    ) {
      fetch("/api/recommendation/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation_event_id: recEventId,
          chosen_focus_minutes: focusSec / 60,
          chosen_break_minutes: breakSec / 60,
        }),
      }).catch((err) => {
        console.warn("[session/new] Failed to log duration override:", err);
      });
    }

    const res = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_duration_sec: focusSec,
        break_duration_sec: breakSec,
        session_type: sessionType ?? undefined,
        energy_level_pre: energyLevel ?? undefined,
        distraction_level_pre: distractionLevel ?? undefined,
        recommendation_event_id: recEventId ?? undefined,
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
    return <div className="h-64 animate-pulse rounded-2xl bg-surface" />;
  }

  const typeUsed = recommendation?.session_type_used;
  const explanation = recommendation?.explanation_payload;
  const alternates = recommendation?.alternate_options ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-[22px] font-bold text-fg">New focus session</h1>
        <p className="mt-1 text-[13px] text-muted/50">
          Choose your session type and focus duration.
        </p>
      </div>

      <SessionTypePicker value={sessionType} onChange={setSessionType} />

      <div className="rounded-2xl border border-edge/40 bg-surface p-5 space-y-5">
        <ContextSlider
          label="Energy level"
          hint="1 = exhausted · 5 = sharp"
          value={energyLevel}
          onChange={setEnergyLevel}
        />
        <ContextSlider
          label="Distraction level"
          hint="1 = calm · 5 = fragmented"
          value={distractionLevel}
          onChange={setDistractionLevel}
        />
      </div>

      {/* Explanation + confidence */}
      {explanation && (
        <div className="rounded-2xl border border-edge/35 bg-surface px-5 py-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-secondary/80 leading-snug">{explanation.rationale}</p>
            <span
              className={`mt-0.5 flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                CONFIDENCE_BADGE[explanation.confidence_level] ?? CONFIDENCE_BADGE.learning
              }`}
            >
              {explanation.confidence_level}
            </span>
          </div>
          {Object.values(explanation.signals)
            .filter(Boolean)
            .map((signal, i) => (
              <p key={i} className="text-[12px] text-muted/50">
                · {signal}
              </p>
            ))}
          <p className="text-[11px] text-muted/25 pt-0.5">{explanation.confidence_reason}</p>
        </div>
      )}

      {/* Type-specific notice */}
      {typeUsed && (
        <p className="text-[12px] text-primary/55">
          Recommendation tailored for your{" "}
          <span className="font-semibold">{SESSION_TYPE_LABELS[typeUsed]}</span> sessions.
        </p>
      )}
      {sessionType && !typeUsed && !loading && (
        <p className="text-[12px] text-muted/35">
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
          setBreakSec(getBreakDurationForFocus(sec));
        }}
        onBreakChange={setBreakSec}
      />

      {/* Alternate options */}
      {alternates.length > 0 && (
        <div>
          <p className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/35">
            Alternate options
          </p>
          <div className="flex gap-2">
            {alternates.map((opt) => (
              <button
                key={opt.focus_minutes}
                type="button"
                onClick={() => {
                  userOverrideDuration.current = true;
                  setFocusSec(opt.focus_minutes * 60);
                  setBreakSec(opt.break_minutes * 60);
                }}
                className={`flex-1 rounded-xl border px-3 py-3 text-left transition-all duration-150 ${
                  focusSec === opt.focus_minutes * 60
                    ? "border-primary/40 bg-primary/[0.06] text-primary"
                    : "border-edge/40 bg-surface text-muted/60 hover:border-edge/70 hover:text-secondary"
                }`}
              >
                <p className="text-[13px] font-semibold">
                  {opt.focus_minutes} min
                  <span className="ml-1 text-[11px] font-normal opacity-55">
                    / {opt.break_minutes} min break
                  </span>
                </p>
                <p className="text-[11px] opacity-45">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-900/35 bg-red-950/25 px-5 py-3.5 text-[13px] text-red-400/90">
          {error}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={starting}
        className="btn-primary w-full rounded-xl px-4 py-3 text-[14px] font-semibold"
      >
        {starting ? "Starting…" : "Start session"}
      </button>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface" />}>
      <NewSessionInner />
    </Suspense>
  );
}
