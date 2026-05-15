"use client";

import { useState } from "react";

type TimeBucket = "morning" | "afternoon" | "evening" | "night";

type Props = {
  scores: Record<TimeBucket, number | null>;
  best: TimeBucket | null;
};

const BUCKETS: { key: TimeBucket; label: string; hours: string }[] = [
  { key: "morning",   label: "Morning",   hours: "6–12" },
  { key: "afternoon", label: "Afternoon", hours: "12–17" },
  { key: "evening",   label: "Evening",   hours: "17–21" },
  { key: "night",     label: "Night",     hours: "21–6" },
];

const BAR_MAX_H = 80;
const BAR_W = 44;
const GAP = 20;

export default function TimeOfDayChart({ scores, best }: Props) {
  const [hovered, setHovered] = useState<TimeBucket | null>(null);

  const validScores = BUCKETS.map((b) => scores[b.key]).filter(
    (s): s is number => s !== null
  );
  if (validScores.length === 0) return null;

  const maxScore = Math.max(...validScores, 0.01);
  const chartW = BUCKETS.length * (BAR_W + GAP) - GAP;

  return (
    <div className="rounded-2xl border border-edge/40 bg-surface px-6 py-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/50">
          Time of day
        </h2>
        {best && (
          <p className="text-[11px] text-muted/45">
            Peak:{" "}
            <span className="font-medium text-fg/60">
              {BUCKETS.find((b) => b.key === best)?.label}
            </span>
          </p>
        )}
      </div>

      <div className="relative mt-6 flex justify-center">
        <svg
          width={chartW}
          height={BAR_MAX_H + 44}
          viewBox={`0 0 ${chartW} ${BAR_MAX_H + 44}`}
          className="overflow-visible"
        >
          {/* Grid lines */}
          {[0, 0.5, 1].map((pct, i) => {
            const y = BAR_MAX_H * (1 - pct);
            return (
              <line
                key={i}
                x1={-8}
                y1={y}
                x2={chartW + 8}
                y2={y}
                stroke="#1E1E38"
                strokeWidth={0.5}
                strokeOpacity={0.6}
              />
            );
          })}

          {BUCKETS.map((bucket, i) => {
            const score = scores[bucket.key];
            const x = i * (BAR_W + GAP);
            const barH =
              score !== null
                ? Math.max(5, (score / maxScore) * BAR_MAX_H)
                : 0;
            const y = BAR_MAX_H - barH;
            const isBest = bucket.key === best;
            const isHovered = hovered === bucket.key;

            return (
              <g
                key={bucket.key}
                onMouseEnter={() => setHovered(bucket.key)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-default"
              >
                {/* Hit area */}
                <rect
                  x={x - 4}
                  y={0}
                  width={BAR_W + 8}
                  height={BAR_MAX_H + 44}
                  fill="transparent"
                />

                {score !== null ? (
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={6}
                    fill={isBest ? "#7C6EF5" : "#0F0F28"}
                    opacity={isHovered ? 1 : isBest ? 0.9 : 0.65}
                    className="transition-opacity duration-150"
                  />
                ) : (
                  <line
                    x1={x + 6}
                    y1={BAR_MAX_H - 1}
                    x2={x + BAR_W - 6}
                    y2={BAR_MAX_H - 1}
                    stroke="#1E1E38"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeOpacity={0.4}
                  />
                )}

                {/* Score above bar */}
                {score !== null && (
                  <text
                    x={x + BAR_W / 2}
                    y={y - 7}
                    textAnchor="middle"
                    fill={isHovered || isBest ? "#EAEAFC" : "#8282B0"}
                    fontSize="10"
                    fontWeight="600"
                    opacity={isHovered ? 1 : isBest ? 0.85 : 0.5}
                    className="transition-opacity duration-150"
                  >
                    {(score * 100).toFixed(0)}
                  </text>
                )}

                {/* Label */}
                <text
                  x={x + BAR_W / 2}
                  y={BAR_MAX_H + 18}
                  textAnchor="middle"
                  fill={isBest || isHovered ? "#8282B0" : "#535278"}
                  fontSize="11"
                  fontWeight="500"
                  opacity={isBest || isHovered ? 1 : 0.5}
                >
                  {bucket.label}
                </text>

                {/* Hours sub-label */}
                <text
                  x={x + BAR_W / 2}
                  y={BAR_MAX_H + 32}
                  textAnchor="middle"
                  fill="#535278"
                  fontSize="9"
                  opacity={isHovered ? 0.6 : 0.3}
                >
                  {bucket.hours}
                </text>

                {/* Best indicator dot */}
                {isBest && (
                  <circle
                    cx={x + BAR_W / 2}
                    cy={BAR_MAX_H + 42}
                    r={2.5}
                    fill="#7C6EF5"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && scores[hovered] !== null && (
          <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-xl border border-edge/60 bg-surface-elevated px-3 py-2 shadow-lg">
            <p className="text-[12px] font-semibold text-fg">
              {BUCKETS.find((b) => b.key === hovered)?.label}
            </p>
            <p className="mt-0.5 text-[11px] text-muted/70">
              Score: {((scores[hovered] ?? 0) * 100).toFixed(0)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
