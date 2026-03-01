"use client";

type Props = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export default function Rating({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}
