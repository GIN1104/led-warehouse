"use client";

import { PROGRESS_STEPS, type ProgressStep } from "@/lib/services/tasks";
import { cn } from "@/lib/utils";

export function TaskProgress({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (step: ProgressStep) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group">
      {PROGRESS_STEPS.map((step) => (
        <button
          key={step}
          type="button"
          disabled={disabled}
          aria-pressed={value === step}
          onClick={() => onChange(step)}
          className={cn(
            "min-h-11 min-w-11 rounded-md border px-2 py-1 text-xs font-medium md:min-h-0 md:min-w-0",
            value === step ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink/70 hover:border-ink/30",
          )}
        >
          {step}%
        </button>
      ))}
    </div>
  );
}
