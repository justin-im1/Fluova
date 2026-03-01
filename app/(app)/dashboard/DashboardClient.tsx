"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/domain/types";
import type { FocusBlock } from "@/lib/domain/types";

export default function DashboardClient() {
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null
  );
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [recRes, histRes] = await Promise.all([
          fetch("/api/recommendation"),
          fetch("/api/history?limit=10"),
        ]);

        if (recRes.ok) {
          const recData = await recRes.json();
          setRecommendation(recData.data);
        }

        if (histRes.ok) {
          const histData = await histRes.json();
          const blocks = histData.data.focus_blocks ?? [];
          setBlocks(blocks.slice(0, 10));
        }
      } catch (e) {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Recommendation card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Your recommendation
        </h2>
        {recommendation ? (
          <div className="mt-4 space-y-2">
            <p className="text-zinc-600 dark:text-zinc-400">
              {recommendation.recommended_focus_duration_sec / 60} min focus /{" "}
              {recommendation.recommended_break_duration_sec / 60} min break
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              {recommendation.rationale}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Flow likelihood: {Math.round(recommendation.flow_likelihood * 100)}%
            </p>
          </div>
        ) : (
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            No recommendation yet. Complete a session to get started.
          </p>
        )}
        <Link
          href="/session/new"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Start session
        </Link>
      </div>

      {/* Last 10 focus blocks */}
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Recent sessions
        </h2>
        {blocks.length === 0 ? (
          <p className="mt-4 text-zinc-500 dark:text-zinc-400">
            No sessions yet. Start your first focus block!
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {blocks.map((block) => (
              <li
                key={block.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <span className="font-medium">
                    {block.focus_duration_sec / 60} min
                  </span>
                  <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                    {block.completed ? "✓ Completed" : "Incomplete"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500">
                    Rating: {block.focus_rating}/5
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
