"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SessionTimer from "@/components/SessionTimer";

type Session = {
  id: string;
  started_at: string;
  focus_duration_sec: number;
  status: string;
};

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    fetch("/api/history?limit=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.sessions) {
          const current = data.data.sessions.find(
            (s: Session) => s.id === sessionId && s.status === "active"
          );
          if (current) {
            setSession(current);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleEndEarly() {
    setEnding(true);
    const res = await fetch("/api/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });

    const data = await res.json();
    if (data.ok) {
      router.push(`/session/${sessionId}/recap`);
    } else {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-24 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Session not found or already ended.
        <a href="/dashboard" className="ml-2 underline">
          Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-16">
      <h1 className="text-xl font-medium text-zinc-900 dark:text-zinc-50">
        Focus session
      </h1>

      <SessionTimer
        focusDurationSec={session.focus_duration_sec}
        startedAt={session.started_at}
        onComplete={() => {
          fetch("/api/sessions/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          }).then((res) => {
            if (res.ok) router.push(`/session/${sessionId}/recap`);
          });
        }}
      />

      <button
        onClick={handleEndEarly}
        disabled={ending}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        End early
      </button>
    </div>
  );
}
