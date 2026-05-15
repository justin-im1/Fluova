"use client";

import type { SessionType } from "@/lib/domain/types";

const TYPES: { key: SessionType; label: string }[] = [
  { key: "coding",    label: "Coding" },
  { key: "reading",   label: "Reading" },
  { key: "writing",   label: "Writing" },
  { key: "studying",  label: "Studying" },
  { key: "admin",     label: "Admin" },
  { key: "deep_work", label: "Deep Work" },
  { key: "other",     label: "Other" },
];

type Props = {
  value: SessionType | null;
  onChange: (type: SessionType | null) => void;
};

export default function SessionTypePicker({ value, onChange }: Props) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/40">
        Session type{" "}
        <span className="font-normal normal-case tracking-normal text-muted/30">— optional</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {TYPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(value === key ? null : key)}
            className={`rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-150 ${
              value === key
                ? "btn-primary"
                : "border border-edge/50 bg-surface text-muted/60 hover:border-edge/80 hover:text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
