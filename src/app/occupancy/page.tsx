"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { addDays, formatDate, todayIso } from "@/lib/dates";
import { orderHref } from "@/lib/paths";
import { listSkuOccupancy } from "@/lib/services/occupancy";
import { cn } from "@/lib/utils";

function cellClass(shortage: number, load: number): string {
  if (shortage > 0) return "bg-rose-500/85 text-white";
  if (load >= 0.85) return "bg-amber-400/90 text-ink";
  if (load >= 0.4) return "bg-copper/55 text-white";
  if (load > 0) return "bg-moss/35 text-ink";
  return "bg-ink/5 text-ink/40";
}

export default function OccupancyPage() {
  const { db, revision } = useWarehouse();
  const { t } = useI18n();
  const today = todayIso();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => addDays(today, 13));
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [selected, setSelected] = useState<{ skuId: string; date: string } | null>(null);
  void revision;

  const range = useMemo(() => {
    void revision;
    const safeEnd = endDate < startDate ? startDate : endDate;
    return listSkuOccupancy(db, { startDate, endDate: safeEnd });
  }, [db, revision, startDate, endDate]);

  const rows = onlyShortage ? range.rows.filter((row) => row.hasShortage) : range.rows;
  const selectedCell = selected
    ? rows.find((row) => row.skuId === selected.skuId)?.days.find((day) => day.date === selected.date)
    : null;
  const selectedSku = selected ? rows.find((row) => row.skuId === selected.skuId) : null;

  return (
    <div>
      <PageHeader eyebrow={t("occupancy.eyebrow")} title={t("occupancy.title")} description={t("occupancy.description")} />

      <Panel className="mb-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setStartDate(String(data.get("from") ?? today));
            setEndDate(String(data.get("to") ?? addDays(today, 13)));
          }}
        >
          <Field label={t("occupancy.from")}>
            <input name="from" type="date" defaultValue={startDate} className={controlClass} required />
          </Field>
          <Field label={t("occupancy.to")}>
            <input name="to" type="date" defaultValue={endDate} className={controlClass} required />
          </Field>
          <button type="submit" className={buttonClass("primary")}>
            {t("occupancy.apply")}
          </button>
          <label className="inline-flex items-center gap-2 text-sm text-ink/70 sm:ms-2 sm:pb-2">
            <input
              type="checkbox"
              checked={onlyShortage}
              onChange={(event) => setOnlyShortage(event.target.checked)}
            />
            {t("occupancy.onlyShortage")}
          </label>
        </form>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-ink/5" /> {t("occupancy.legendFree")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-copper/55" /> {t("occupancy.legendBusy")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-rose-500/85" /> {t("occupancy.legendShort")}
          </span>
        </div>
      </Panel>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">{t("occupancy.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[640px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink/50">
                <th className="sticky start-0 z-10 bg-sand px-3 py-2 font-medium">{t("stock.code")}</th>
                <th className="bg-sand px-2 py-2 font-medium">{t("occupancy.onHand")}</th>
                {range.days.map((day) => (
                  <th key={day} className="bg-sand px-1 py-2 text-center font-medium tabular-nums">
                    {formatDate(day).slice(0, 5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.skuId} className="border-t border-line align-middle">
                  <td className="sticky start-0 z-10 bg-sand px-3 py-2">
                    <div className="flex min-w-[9rem] flex-col gap-0.5">
                      <span className="font-mono text-xs">{row.skuCode}</span>
                      <span className="truncate text-xs text-ink/60">{row.skuName}</span>
                      {row.hasShortage ? <Badge tone="alert">{t("occupancy.legendShort")}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{row.onHand}</td>
                  {row.days.map((cell) => (
                    <td key={cell.date} className="px-0.5 py-1">
                      <button
                        type="button"
                        title={t("occupancy.dayHint", {
                          date: formatDate(cell.date),
                          reserved: cell.reserved,
                          shortage: cell.shortage,
                          available: cell.available,
                        })}
                        className={cn(
                          "flex h-9 w-full min-w-[2.25rem] items-center justify-center rounded-sm text-[10px] tabular-nums",
                          cellClass(cell.shortage, cell.load),
                          selected?.skuId === row.skuId && selected.date === cell.date ? "ring-2 ring-ink" : "",
                        )}
                        onClick={() => setSelected({ skuId: row.skuId, date: cell.date })}
                      >
                        {cell.shortage > 0 ? `−${cell.shortage}` : cell.reserved > 0 ? cell.reserved : "·"}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && selectedSku && selectedCell ? (
        <Panel className="mt-4">
          <h2 className="font-medium">
            {selectedSku.skuCode} · {formatDate(selected.date)}
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            {t("occupancy.dayHint", {
              date: formatDate(selected.date),
              reserved: selectedCell.reserved,
              shortage: selectedCell.shortage,
              available: selectedCell.available,
            })}
          </p>
          {selectedCell.orders.length === 0 ? (
            <p className="mt-2 text-sm text-ink/50">—</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {selectedCell.orders.map((order) => (
                <li key={`${order.orderId}-${order.customerName}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={orderHref(order.orderId)} className="font-medium text-copper hover:underline">
                    {order.customerName}
                  </Link>
                  <span className="tabular-nums text-ink/70">
                    {order.qty} {selectedSku.unit}
                  </span>
                  {order.short > 0 ? <Badge tone="alert">−{order.short}</Badge> : null}
                  <Link href={orderHref(order.orderId)} className="text-xs text-ink/50 hover:text-copper">
                    {t("occupancy.openOrder")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
