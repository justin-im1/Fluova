"use client";

type Props = {
  scores: number[]; // oldest → newest, values 0..1
};

const W = 120;
const H = 32;
const PAD = 2;

export default function TrendSparkline({ scores }: Props) {
  if (scores.length < 2) return null;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 0.01;

  const xStep = (W - PAD * 2) / (scores.length - 1);

  const points = scores.map((s, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (1 - (s - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(" ");

  // Determine trend direction
  const first = scores[0]!;
  const last = scores[scores.length - 1]!;
  const delta = last - first;
  const trendColor =
    delta > 0.05 ? "#4ade80" : delta < -0.05 ? "#f87171" : "#6366f1";
  const trendLabel =
    delta > 0.05 ? "Improving" : delta < -0.05 ? "Declining" : "Steady";

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/50">
          Performance trend
        </p>
        <p
          className="text-[10px] font-medium"
          style={{ color: trendColor, opacity: 0.8 }}
        >
          {trendLabel}
        </p>
      </div>
      <div className="mt-2.5">
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          {/* Zero line */}
          <line
            x1={PAD}
            y1={H - PAD}
            x2={W - PAD}
            y2={H - PAD}
            stroke="#262630"
            strokeWidth={0.5}
            strokeOpacity={0.6}
          />
          {/* Area fill */}
          <polyline
            points={`${PAD},${H - PAD} ${polyline} ${PAD + (scores.length - 1) * xStep},${H - PAD}`}
            fill={trendColor}
            fillOpacity={0.06}
            stroke="none"
          />
          {/* Line */}
          <polyline
            points={polyline}
            fill="none"
            stroke={trendColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.6}
          />
          {/* Last point dot */}
          <circle
            cx={PAD + (scores.length - 1) * xStep}
            cy={parseFloat(points[points.length - 1]!.split(",")[1]!)}
            r={2.5}
            fill={trendColor}
            fillOpacity={0.9}
          />
        </svg>
        <p className="mt-1 text-[10px] text-muted/30">
          Last {scores.length} sessions
        </p>
      </div>
    </div>
  );
}
