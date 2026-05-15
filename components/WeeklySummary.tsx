"use client";

type WeekData = {
  count: number;
  completion_rate: number;
  avg_rating: number;
  best_duration_sec: number | null;
};

type Props = {
  thisWeek: WeekData;
  lastWeek: WeekData;
};

function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-muted/25">—</span>;
  const positive = value > 0;
  return (
    <span className="text-[11px] font-bold" style={{ color: positive ? "#34D399" : "#f87171", opacity: 0.8 }}>
      {positive ? "+" : ""}
      {suffix === "%" ? `${Math.round(value * 100)}%` : value.toFixed(suffix === "r" ? 1 : 0)}
    </span>
  );
}

export default function WeeklySummary({ thisWeek, lastWeek }: Props) {
  if (thisWeek.count === 0 && lastWeek.count === 0) return null;

  return (
    <div className="rounded-2xl border border-edge/40 bg-surface px-6 py-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/45">This week</h2>
        {lastWeek.count > 0 && <p className="text-[10px] text-muted/25">vs last week</p>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-6">
        {[
          {
            label: "Sessions",
            value: String(thisWeek.count),
            delta: lastWeek.count > 0 ? thisWeek.count - lastWeek.count : null,
            suffix: "",
          },
          {
            label: "Completion",
            value: thisWeek.count > 0 ? `${Math.round(thisWeek.completion_rate * 100)}%` : "—",
            delta: lastWeek.count > 0 ? thisWeek.completion_rate - lastWeek.completion_rate : null,
            suffix: "%",
          },
          {
            label: "Avg rating",
            value: thisWeek.count > 0 ? thisWeek.avg_rating.toFixed(1) : "—",
            delta: lastWeek.count > 0 ? thisWeek.avg_rating - lastWeek.avg_rating : null,
            suffix: "r",
          },
        ].map(({ label, value, delta, suffix }) => (
          <div key={label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/35">{label}</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <p className="text-[26px] font-bold tabular-nums leading-none text-fg" style={{ letterSpacing: "-0.02em" }}>{value}</p>
              {delta !== null && <Delta value={delta} suffix={suffix} />}
            </div>
          </div>
        ))}
      </div>

      {thisWeek.best_duration_sec && (
        <p className="mt-4 text-[11px] text-muted/35">
          Best duration this week:{" "}
          <span className="font-semibold text-fg/55">{thisWeek.best_duration_sec / 60} min</span>
        </p>
      )}
    </div>
  );
}
