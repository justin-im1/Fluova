"use client";

import { useEffect, useState } from "react";

type Props = {
  message: string;
  duration?: number;
  onDone?: () => void;
};

export default function Toast({ message, duration = 3000, onDone }: Props) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDone?.(), 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className={`rounded-lg border border-edge bg-surface-elevated px-4 py-2.5 shadow-lg ${
          exiting ? "toast-exit" : "toast-enter"
        }`}
      >
        <p className="text-[13px] font-medium text-fg">{message}</p>
      </div>
    </div>
  );
}
