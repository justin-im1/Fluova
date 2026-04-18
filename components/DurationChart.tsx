"use client";

import { useState } from "react";
import type { FocusBlock } from "@/lib/domain/types";

const ARMS = [
  { sec: 1500, label: "25m" },
  { sec: 1800, label: "30m" },
  { sec: 2100, label: "35m" },
  { sec: 2400, label: "40m" },
  { sec: 2700, label: "45m" },
  { sec: 3000, label: "50m" },
];

type ArmStats = {
  sec: number;
  label: string;
  count: number;
  avgRating: number;
  completionRate: number;
  score: number;
};

function computeArmStats(blocks: FocusBlock[]): ArmStats[] {
  return ARMS.map(({ sec, label }) => {
    const armBlocks = blocks.filter((b) => b.focus_duration_sec === sec);
    if (armBlocks.length === 0) {
      return { sec, label, count: 0, avgRating: 0, completionRate: 0, score: 0 };
    }
    const completed = armBlocks.filter((b) => b.completed).length;
    const completionRate = completed / armBlocks.length;
    const avgRating =
      armBlocks.reduce((sum, b) => sum + b.focus_rating, 0) / armBlocks.length;
    const score = 0.6 * completionRate + 0.4 * (avgRating / 5);
    return { sec, label, count: armBlocks.length, avgRating, completionRate, score };
  });
}

type Props = {
  blocks: FocusBlock[];
  recommendedDuration: number | null;
};

const BAR_MAX_H = 110;
const BAR_W = 40;
const GAP = 16;
const GRID_LINES = 4;

export default function DurationChart({ blocks, recommendedDuration }: Props) {
  const [hoveredArm, setHoveredArm] = useState<number | null>(null);
  const armStats = computeArmStats(blocks);
  const maxScore = Math.max(...armStats.map((a) => a.score), 0.01);
  const hasAnyData = armStats.some((a) => a.count > 0);

  if (!hasAnyData) return null;

  const chartW = ARMS.length * (BAR_W + GAP) - GAP;
  const hoveredData = hoveredArm !== null
    ? armStats.find((a) => a.sec === hoveredArm) ?? null
    : null;

  return (
    <div className="rounded-2xl border border-edge/40 bg-surface px-6 py-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/60">
        Duration performance
      </h2>

      <div className="relative mt-6 flex justify-center">
        <svg
          width={chartW}
          height={BAR_MAX_H + 36}
          viewBox={`0 0 ${chartW} ${BAR_MAX_H + 36}`}
          className="overflow-visible"
        >
          {/* Grid lines */}
          {Array.from({ length: GRID_LINES + 1 }).map((_, i) => {
            const y = (BAR_MAX_H / GRID_LINES) * i;
            return (
              <line
                key={i}
                x1={-8}
                y1={y}
                x2={chartW + 8}
                y2={y}
                stroke="#262630"
                strokeWidth={0.5}
                strokeOpacity={0.5}
              />
            );
          })}

          {armStats.map((arm, i) => {
            const x = i * (BAR_W + GAP);
            const barH = arm.count > 0 ? Math.max(6, (arm.score / maxScore) * BAR_MAX_H) : 0;
            const y = BAR_MAX_H - barH;
            const isRecommended = arm.sec === recommendedDuration;
            const isHovered = hoveredArm === arm.sec;

            return (
              <g
                key={arm.sec}
                onMouseEnter={() => setHoveredArm(arm.sec)}
                onMouseLeave={() => setHoveredArm(null)}
                className="cursor-default"
              >
                {/* Hit area */}
                <rect
                  x={x - 4}
                  y={0}
                  width={BAR_W + 8}
                  height={BAR_MAX_H + 36}
                  fill="transparent"
                />

                {arm.count > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={5}
                    fill={isRecommended ? "#1818AD" : "#1E1E2A"}
                    opacity={isHovered ? 1 : isRecommended ? 0.9 : 0.7}
                    className="transition-opacity duration-150"
                  />
                ) : (
                  <line
                    x1={x + 6}
                    y1={BAR_MAX_H - 1}
                    x2={x + BAR_W - 6}
                    y2={BAR_MAX_H - 1}
                    stroke="#262630"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeOpacity={0.4}
                  />
                )}

                {/* Score above bar */}
                {arm.count > 0 && (
                  <text
                    x={x + BAR_W / 2}
                    y={y - 8}
                    textAnchor="middle"
                    fill={isHovered ? "#E5E7EB" : "#9CA3AF"}
                    fontSize="10"
                    fontWeight="600"
                    opacity={isHovered ? 1 : 0.6}
                    className="transition-opacity duration-150"
                  >
                    {(arm.score * 100).toFixed(0)}
                  </text>
                )}

                {/* Duration label */}
                <text
                  x={x + BAR_W / 2}
                  y={BAR_MAX_H + 18}
                  textAnchor="middle"
                  fill={isRecommended || isHovered ? "#B4B7C9" : "#9CA3AF"}
                  fontSize="11"
                  fontWeight="500"
                  opacity={isRecommended || isHovered ? 1 : 0.5}
                >
                  {arm.label}
                </text>

                {/* Recommended indicator */}
                {isRecommended && (
                  <circle
                    cx={x + BAR_W / 2}
                    cy={BAR_MAX_H + 30}
                    r={2}
                    fill="#1818AD"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredData && hoveredData.count > 0 && (
          <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-lg border border-edge/60 bg-surface-elevated px-3.5 py-2.5 shadow-lg">
            <p className="text-[12px] font-semibold text-fg">
              {hoveredData.sec / 60} min
            </p>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted">
              <p>Completion: {Math.round(hoveredData.completionRate * 100)}%</p>
              <p>Avg rating: {hoveredData.avgRating.toFixed(1)}/5</p>
              <p>Score: {(hoveredData.score * 100).toFixed(0)}</p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-muted/40">
        Score = 60% completion + 40% rating
        {recommendedDuration && "  ·  Dot = recommended"}
      </p>
    </div>
  );
}
