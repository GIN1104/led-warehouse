"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { listSkuSummaries, listLocations } from "@/lib/services/queries";
import {
  cancelTransfer,
  countTransfersByStatus,
  isSiteToSite,
  listTransfers,
  planTransfer,
  receiveTransfer,
  shipTransfer,
  type TransferStatus,
} from "@/lib/services/transfers";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | TransferStatus;

const STATUS_FLOW: TransferStatus[] = ["planned", "in_transit", "received", "cancelled"];

function parseStatus(raw: string | null): StatusFilter {
  if (raw === "planned" || raw === "in_transit" || raw === "received" || raw === "cancelled") return raw;
  return "all";
}

function TransfersFallback() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader eyebrow={t("transfers.eyebrow")} title={t("transfers.title")} description={t("transfers.description")} />
      <p className="text-sm text-ink/60">{t("loading")}</p>
    </div>
  );
}

function TransfersPageInner() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const allowed = can(session.role, "transfer.write");
  const rows = listTransfers(db);
  const counts = countTransfersByStatus(db);
  const skus = listSkuSummaries(db);
  const locations = listLocations(db);
  const siteLocations = locations.filter((loc) => loc.kind === "site");
  const drivers = users.filter((user) => user.role === "driver" || user.role === "logistics" || user.role === "warehouse");
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [preferSites, setPreferSites] = useState(true);
  const statusFilter = parseStatus(params.get("status"));
  void revision;

  const locationOptions = preferSites && siteLocations.length >= 2 ? siteLocations : locations;
  const defaultFrom = locationOptions.find((loc) => loc.kind === "site")?.id ?? locationOptions[0]?.id ?? "";
  const defaultTo =
    locationOptions.find((loc) => loc.kind === "site" && loc.id !== defaultFrom)?.id ??
    locationOptions.find((loc) => loc.id !== defaultFrom)?.id ??
    "";

  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter)),
    [rows, statusFilter],
  );

  useEffect(() => {
    if (params.get("new") !== "1") return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [params]);

  function setStatusFilter(next: StatusFilter) {
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", next);
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  }

  async function onPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      assertCan(session.role, "transfer.write");
      planTransfer(
        db,
        {
          skuId: String(data.get("skuId") ?? ""),
          qty: Number(data.get("qty") ?? 0),
          fromLocationId: String(data.get("fromLocationId") ?? ""),
          toLocationId: String(data.get("toLocationId") ?? ""),
          driverUserId: String(data.get("driverUserId") ?? "") || null,
          note: String(data.get("note") ?? ""),
        },
        session.id,
      );
      form.reset();
      await refresh();
      setFlash({ ok: t("transfers.planned") });
      setStatusFilter("planned");
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function act(id: string, kind: "ship" | "receive" | "cancel") {
    try {
      assertCan(session.role, "transfer.write");
      if (kind === "ship") shipTransfer(db, id, session.id);
      else if (kind === "receive") receiveTransfer(db, id, session.id);
      else cancelTransfer(db, id, session.id);
      await refresh();
      setFlash({ ok: t(`transfers.${kind}Ok` as MessageKey) });
      if (kind === "ship") setStatusFilter("in_transit");
      else if (kind === "receive") setStatusFilter("received");
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("transfers.eyebrow")} title={t("transfers.title")} description={t("transfers.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      {!allowed ? <p className="mb-4 text-sm text-ink/70">{t("transfers.forbidden")}</p> : null}

      <Panel className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{t("transfers.pipeline")}</h2>
          {counts.in_transit > 0 ? (
            <button type="button" className="text-sm text-copper hover:underline" onClick={() => setStatusFilter("in_transit")}>
              {t("transfers.inTransitBanner", { count: counts.in_transit })}
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-sm text-ink/60">{t("transfers.pipelineHelp")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(buttonClass(statusFilter === "all" ? "primary" : "ghost"), "text-xs")}
            onClick={() => setStatusFilter("all")}
          >
            {t("transfers.filter.all")} ({rows.length})
          </button>
          {STATUS_FLOW.map((status) => (
            <button
              key={status}
              type="button"
              className={cn(buttonClass(statusFilter === status ? "primary" : "ghost"), "text-xs")}
              onClick={() => setStatusFilter(status)}
            >
              {t(`transfers.status.${status}` as MessageKey)} ({counts[status]})
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs tracking-wide text-ink/45" dir="ltr">
          {t("transfers.status.planned")} → {t("transfers.status.in_transit")} → {t("transfers.status.received")} /{" "}
          {t("transfers.status.cancelled")}
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("transfers.list")}</h2>
          {filtered.length === 0 ? (
            <Empty>{rows.length === 0 ? t("transfers.empty") : t("transfers.emptyFilter")}</Empty>
          ) : null}
          <ul className="flex flex-col gap-3">
            {filtered.map((row) => (
              <li key={row.id} className="rounded-md border border-line bg-white p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      row.status === "received"
                        ? "ok"
                        : row.status === "cancelled"
                          ? "neutral"
                          : row.status === "in_transit"
                            ? "warn"
                            : "neutral"
                    }
                  >
                    {t(`transfers.status.${row.status}` as MessageKey)}
                  </Badge>
                  {isSiteToSite(row) ? <Badge tone="ok">{t("transfers.siteToSite")}</Badge> : null}
                  <span className="font-medium">
                    {row.skuCode} × {row.qty} {row.unit}
                  </span>
                  <span className="text-xs text-ink/45">{formatDateTime(row.createdAt)}</span>
                </div>
                <p>
                  {row.fromLocationName}{" "}
                  <span className="text-ink/45">({t(`loc.${row.fromLocationKind}` as MessageKey)})</span>
                  {" → "}
                  {row.toLocationName}{" "}
                  <span className="text-ink/45">({t(`loc.${row.toLocationKind}` as MessageKey)})</span>
                </p>
                <p className="text-ink/60">
                  {t("transfers.driver")}: {row.driverName ?? t("transfers.noDriver")}
                </p>
                {row.note ? <p className="text-ink/60">{row.note}</p> : null}
                {allowed ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.status === "planned" ? (
                      <button type="button" className={buttonClass("primary")} onClick={() => void act(row.id, "ship")}>
                        {t("transfers.ship")}
                      </button>
                    ) : null}
                    {row.status === "in_transit" ? (
                      <button type="button" className={buttonClass("primary")} onClick={() => void act(row.id, "receive")}>
                        {t("transfers.receive")}
                      </button>
                    ) : null}
                    {row.status === "planned" || row.status === "in_transit" ? (
                      <button type="button" className={buttonClass("danger")} onClick={() => void act(row.id, "cancel")}>
                        {t("transfers.cancel")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        {allowed ? (
          <Panel>
            <h2 id="transfer-new" className="mb-1 font-medium">
              {t("transfers.new")}
            </h2>
            <p className="mb-3 text-sm text-ink/60">{t("transfers.siteToSiteHelp")}</p>
            <form ref={formRef} onSubmit={(event) => void onPlan(event)} className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  checked={preferSites}
                  onChange={(event) => setPreferSites(event.target.checked)}
                  className="size-4 rounded border-line text-copper focus:ring-copper"
                />
                {t("transfers.preferSites")}
              </label>
              <Field label={t("transfers.sku")}>
                <select name="skuId" required className={controlClass} defaultValue={skus[0]?.id ?? ""}>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.qty")}>
                <input name="qty" type="number" min={1} required defaultValue={1} className={controlClass} />
              </Field>
              <Field label={t("transfers.from")}>
                <select name="fromLocationId" required className={controlClass} key={`from-${preferSites}-${defaultFrom}`} defaultValue={defaultFrom}>
                  {locationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({t(`loc.${loc.kind}` as MessageKey)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.to")}>
                <select name="toLocationId" required className={controlClass} key={`to-${preferSites}-${defaultTo}`} defaultValue={defaultTo}>
                  {locationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({t(`loc.${loc.kind}` as MessageKey)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.driver")}>
                <select name="driverUserId" className={controlClass} defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {drivers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({t(`role.${user.role}` as MessageKey)})
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-ink/50">{t("transfers.driverHint")}</p>
              <Field label={t("transfers.note")}>
                <input name="note" className={controlClass} maxLength={500} />
              </Field>
              <button type="submit" className={buttonClass("primary", "self-start")}>
                {t("transfers.plan")}
              </button>
            </form>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<TransfersFallback />}>
      <TransfersPageInner />
    </Suspense>
  );
}
