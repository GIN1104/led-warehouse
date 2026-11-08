"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, PageHeader, Panel, controlClass } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import {
  OPERATION_KINDS,
  listOperationsHistory,
  type OperationKind,
} from "@/lib/services/operations-history";

function dayStartMs(isoDate: string): number | null {
  if (!isoDate) return null;
  const ms = Date.parse(`${isoDate}T00:00:00`);
  return Number.isFinite(ms) ? ms : null;
}

function dayEndMs(isoDate: string): number | null {
  if (!isoDate) return null;
  const ms = Date.parse(`${isoDate}T23:59:59.999`);
  return Number.isFinite(ms) ? ms : null;
}

function kindTone(kind: OperationKind): "neutral" | "ok" | "warn" | "alert" {
  if (kind === "stock" || kind === "transfer") return "ok";
  if (kind === "equipment") return "warn";
  if (kind === "order" || kind === "hire") return "neutral";
  if (kind === "alert") return "alert";
  return "neutral";
}

export default function HistoryPage() {
  const { db, revision } = useWarehouse();
  const { t } = useI18n();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<OperationKind | "all">("all");
  void revision;

  const rows = useMemo(
    () =>
      listOperationsHistory(db, {
        fromMs: dayStartMs(fromDate),
        toMs: dayEndMs(toDate),
        query,
        kind,
        limit: 250,
      }),
    [db, fromDate, toDate, query, kind, revision],
  );

  return (
    <div>
      <PageHeader
        eyebrow={t("history.eyebrow")}
        title={t("history.title")}
        description={t("history.description")}
      />

      <Panel className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t("history.from")}>
            <input
              type="date"
              className={controlClass}
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </Field>
          <Field label={t("history.to")}>
            <input
              type="date"
              className={controlClass}
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </Field>
          <Field label={t("history.sku")}>
            <input
              type="search"
              className={controlClass}
              placeholder={t("history.skuPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <Field label={t("history.type")}>
            <select
              className={controlClass}
              value={kind}
              onChange={(event) => setKind(event.target.value as OperationKind | "all")}
            >
              <option value="all">{t("history.kind.all")}</option>
              {OPERATION_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`history.kind.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>

      {rows.length === 0 ? <Empty>{t("history.empty")}</Empty> : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-line bg-sand p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={kindTone(row.kind)}>{t(`history.kind.${row.kind}` as MessageKey)}</Badge>
              {row.kind === "stock" && (row.subtype === "in" || row.subtype === "out" || row.subtype === "adjust" || row.subtype === "move") ? (
                <Badge tone="neutral">{t(`move.${row.subtype}` as MessageKey)}</Badge>
              ) : null}
              <span className="text-xs text-ink/50">{formatDateTime(row.createdAt)}</span>
            </div>
            <p className="text-sm leading-6">{row.summary}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
              {row.skuCode ? (
                <span>
                  {row.skuCode}
                  {row.skuName ? ` · ${row.skuName}` : ""}
                  {row.qty != null ? ` · ×${row.qty}` : ""}
                </span>
              ) : null}
              {row.locationName ? <span>{row.locationName}</span> : null}
              <span>{t("history.actor")}: {row.actor}</span>
              {row.orderId ? (
                <Link href={orderHref(row.orderId)} className="text-copper underline-offset-2 hover:underline">
                  {t("history.openOrder")}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
