"use client";

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export default function Rating({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-secondary">
        Focus rating:
      </span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            disabled={disabled}
            className={`h-10 w-10 rounded-lg text-lg font-medium transition-colors ${
              value >= rating
                ? "bg-primary text-white"
                : "bg-surface-elevated text-muted hover:text-secondary"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}
