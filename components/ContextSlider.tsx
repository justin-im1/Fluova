"use client";

type Props = {
  label: string;
  hint: string;
  value: number | null;
  onChange: (n: number) => void;
  disabled?: boolean;
};

export default function ContextSlider({ label, hint, value, onChange, disabled }: Props) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-secondary">{label}</p>
        <p className="text-[11px] text-muted/40">{hint}</p>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            className={`flex h-11 w-11 items-center justify-center rounded-xl text-[15px] font-semibold transition-all duration-150 ${
              value === n
                ? "btn-primary"
                : "bg-surface-elevated text-muted/60 hover:text-secondary"
            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
