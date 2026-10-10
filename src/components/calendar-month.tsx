"use client";

import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/lib/calendar/types";
import { itemsOnDate, monthGrid } from "@/lib/calendar/merge";

const WEEKDAYS_RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function CalendarMonth({
  year,
  monthIndex,
  selected,
  today,
  items,
  onSelect,
  weekdayLabels = WEEKDAYS_RU,
}: {
  year: number;
  monthIndex: number;
  selected: string;
  today: string;
  items: CalendarItem[];
  onSelect: (iso: string) => void;
  weekdayLabels?: string[];
}) {
  const days = monthGrid(year, monthIndex);
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium tracking-wide text-ink/50 uppercase">
        {weekdayLabels.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-7 gap-1">
        {days.map((iso) => {
          const inMonth = iso.startsWith(monthPrefix);
          const dayItems = itemsOnDate(items, iso);
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={cn(
                "flex min-h-[4.5rem] min-w-0 flex-col overflow-hidden rounded-md border px-1.5 py-1 text-start transition",
                inMonth ? "border-line bg-white" : "border-transparent bg-sand/40 text-ink/40",
                isSelected && "border-copper ring-2 ring-copper/30",
                isToday && !isSelected && "border-copper/50",
              )}
            >
              <span className={cn("text-xs font-medium", isToday && "text-copper")}>{Number(iso.slice(8))}</span>
              <ul className="mt-1 flex flex-col gap-0.5 overflow-hidden">
                {dayItems.slice(0, 3).map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "max-w-full truncate rounded px-1 text-[10px] leading-4",
                      item.source === "order" && "bg-copper/15 text-copper-dark",
                      item.source === "task" && "bg-amber-100 text-amber-900",
                      (item.source === "google" || item.source === "mock") && "bg-ink/5 text-ink/80",
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </li>
                ))}
                {dayItems.length > 3 ? <li className="px-1 text-[10px] text-ink/50">+{dayItems.length - 3}</li> : null}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}