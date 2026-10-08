"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { newId } from "@/lib/db/sql";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { ingestScan } from "@/lib/services/ledger";
import { listLocations, listScanEvents } from "@/lib/services/queries";

export default function ScanPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "scan.write");
  const locations = listLocations(db);
  const events = listScanEvents(db);
  const warehouse = users.find((user) => user.role === "warehouse")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const direction = String(form.get("direction") ?? "in");
    try {
      assertCan(session.role, "scan.write");
      if (direction !== "in" && direction !== "out" && direction !== "move") {
        throw new Error("direction");
      }
      const result = ingestScan(
        db,
        {
          eventId: newId(),
          source: "ui",
          code: String(form.get("code") ?? ""),
          direction,
          qty: Number(form.get("qty") ?? 1),
          locationId: String(form.get("locationId") ?? "") || undefined,
          fromLocationId: String(form.get("fromLocationId") ?? "") || undefined,
          meta: String(form.get("externalId") ?? "").trim()
            ? { externalId: String(form.get("externalId") ?? "").trim() }
            : undefined,
        },
        session.id,
      );
      refresh();
      if (result.status === "rejected") {
        setFlash({ error: result.reason ? translateError(lang, new Error(result.reason)) : t("scan.rejected") });
        return;
      }
      setFlash({ ok: t("scan.accepted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("scan.eyebrow")} title={t("scan.title")} description={t("scan.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("scan.manual")}</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label={t("scan.code")}>
                <input name="code" required className={controlClass} placeholder="CAB-P25" />
              </Field>
              <Field label={t("scan.direction")}>
                <select name="direction" className={controlClass} defaultValue="in">
                  <option value="in">{t("move.in")}</option>
                  <option value="out">{t("move.out")}</option>
                  <option value="move">{t("move.move")}</option>
                </select>
              </Field>
              <Field label={t("scan.qty")}>
                <input name="qty" type="number" min={1} defaultValue={1} className={controlClass} />
              </Field>
              <Field label={t("scan.order")}>
                <input name="externalId" className={controlClass} placeholder="mapper-demo-1" />
              </Field>
              <Field label={t("scan.location")}>
                <select name="locationId" className={controlClass} defaultValue="">
                  <option value="">{t("scan.autoLocation")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("scan.from")}>
                <select name="fromLocationId" className={controlClass} defaultValue="">
                  <option value="">{t("common.notNeeded")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("scan.submit")}
              </button>
              <p className="text-xs text-ink/50">{t("scan.outHint")}</p>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("scan.switch", { name: warehouse })}</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-medium">{t("scan.log")}</h2>
          <ul className="flex flex-col gap-3">
            {events.map((event) => {
              const result = JSON.parse(event.result) as { status?: string; reason?: string };
              return (
                <li key={event.id} className="border-b border-line pb-3 text-sm last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{event.code}</span>
                    <Badge tone={result.status === "accepted" ? "ok" : "alert"}>
                      {result.status === "accepted" ? t("scan.ok") : t("scan.bad")}
                    </Badge>
                    <span className="text-ink/50">{event.source}</span>
                  </div>
                  <p className="mt-1 text-ink/70">
                    {t(`move.${event.direction}` as MessageKey)} · {event.qty} · {formatDateTime(event.createdAt)}
                    {result.reason ? ` · ${translateError(lang, new Error(result.reason))}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
