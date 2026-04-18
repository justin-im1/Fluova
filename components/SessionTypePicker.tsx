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
      <p className="mb-2.5 text-[12px] font-medium text-muted/50">
        Session type{" "}
        <span className="text-muted/30 font-normal">— optional</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {TYPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(value === key ? null : key)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all duration-150 ${
              value === key
                ? "bg-primary text-white"
                : "border border-edge/40 bg-surface text-muted/60 hover:border-edge/70 hover:text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
