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
  if (value === 0) return <span className="text-muted/30">—</span>;
  const positive = value > 0;
  return (
    <span
      className="text-[10px] font-medium"
      style={{ color: positive ? "#4ade80" : "#f87171", opacity: 0.8 }}
    >
      {positive ? "+" : ""}
      {suffix === "%" ? `${Math.round(value * 100)}%` : value.toFixed(suffix === "r" ? 1 : 0)}
    </span>
  );
}

export default function WeeklySummary({ thisWeek, lastWeek }: Props) {
  // Only render if there's at least some data
  if (thisWeek.count === 0 && lastWeek.count === 0) return null;

  const sessionsDelta = thisWeek.count - lastWeek.count;
  const completionDelta = thisWeek.completion_rate - lastWeek.completion_rate;
  const ratingDelta = thisWeek.avg_rating - lastWeek.avg_rating;

  return (
    <div className="rounded-2xl border border-edge/40 bg-surface px-6 py-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/60">
          This week
        </h2>
        {lastWeek.count > 0 && (
          <p className="text-[10px] text-muted/30">vs last week</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {/* Sessions */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">
            Sessions
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="text-[22px] font-semibold tabular-nums leading-none text-fg">
              {thisWeek.count}
            </p>
            {lastWeek.count > 0 && <Delta value={sessionsDelta} />}
          </div>
        </div>

        {/* Completion */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">
            Completion
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="text-[22px] font-semibold tabular-nums leading-none text-fg">
              {thisWeek.count > 0
                ? `${Math.round(thisWeek.completion_rate * 100)}%`
                : "—"}
            </p>
            {lastWeek.count > 0 && <Delta value={completionDelta} suffix="%" />}
          </div>
        </div>

        {/* Avg rating */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/40">
            Avg rating
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <p className="text-[22px] font-semibold tabular-nums leading-none text-fg">
              {thisWeek.count > 0 ? thisWeek.avg_rating.toFixed(1) : "—"}
            </p>
            {lastWeek.count > 0 && <Delta value={ratingDelta} suffix="r" />}
          </div>
        </div>
      </div>

      {/* Best duration this week */}
      {thisWeek.best_duration_sec && (
        <p className="mt-3 text-[11px] text-muted/40">
          Best duration:{" "}
          <span className="font-medium text-fg/60">
            {thisWeek.best_duration_sec / 60} min
          </span>
        </p>
      )}
    </div>
  );
}
